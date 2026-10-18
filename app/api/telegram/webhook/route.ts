import { clerkClient } from "@clerk/nextjs/server";
import { isOwnerEmail } from "@/lib/access";
import { MARKET_INTERVAL, MARKET_SYMBOL } from "@/lib/advice";
import { adviceCount, readState } from "@/lib/alerts-server";
import { fetchCandles } from "@/lib/candles";
import { sanitizeSantai } from "@/lib/santai";
import { sendMessage, userFromCode, webhookAuthorized } from "@/lib/telegram";
import { weeklyReport } from "@/lib/weekly-report";

// The weekly report on demand, for the allowed app user linked to this chat.
async function reportFor(chatId: number): Promise<string> {
  const client = await clerkClient();
  const { data: users } = await client.users.getUserList({ limit: 200 });
  const user = users.find((u) => (u.privateMetadata.telegram as { chatId?: unknown } | undefined)?.chatId === chatId);
  if (!user) return "Chat ini belum terhubung. Hubungkan dari menu Pengaturan di aplikasi MarketScope.";
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const allowed = isOwnerEmail(email) || (user.publicMetadata.approved === true && user.publicMetadata.rejected !== true);
  if (!allowed) return "Akun Anda belum disetujui untuk memakai MarketScope.";
  const meta = user.privateMetadata;
  const state = readState(meta.tgState);
  const btc = await fetchCandles(MARKET_SYMBOL, MARKET_INTERVAL, 300).catch(() => null);
  const { text } = await weeklyReport(meta, btc, adviceCount(state, sanitizeSantai(meta.santai)), state.e ?? null, Date.now());
  return text;
}

// Messages sent to the bot. "/start <code>" links the chat to the app user the code was made for;
// "/laporan" sends the weekly report now.
export async function POST(request: Request) {
  if (!webhookAuthorized(request)) return new Response("forbidden", { status: 403 });
  const update = await request.json().catch(() => null);
  const chatId = update?.message?.chat?.id;
  const text: string = update?.message?.text ?? "";
  if (typeof chatId !== "number") return Response.json({ ok: true });

  const [command, code] = text.trim().split(/\s+/);
  if (command === "/start" && code) {
    const userId = userFromCode(code);
    if (!userId) {
      await sendMessage(chatId, "Kode tidak valid. Buka MarketScope → Pengaturan → Telegram, lalu tekan tombol hubungkan lagi.");
      return Response.json({ ok: true });
    }
    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, { privateMetadata: { telegram: { chatId }, tgState: null } });
    await sendMessage(
      chatId,
      "✅ <b>MarketScope terhubung.</b>\nAnda akan menerima pesan saat koin layak BELI, saat posisi waktunya JUAL atau AMANKAN, pengingat DCA, dan laporan mingguan setiap Senin pagi. Ketik /laporan untuk laporan sekarang. Putuskan kapan saja dari Pengaturan di aplikasi.",
    );
  } else if (command === "/laporan" || command?.startsWith("/laporan@")) {
    await sendMessage(chatId, await reportFor(chatId).catch(() => "Laporan gagal dibuat, coba lagi sebentar."));
  } else {
    await sendMessage(
      chatId,
      "Ketik /laporan untuk ringkasan pasar, Akun Demo, dan catatan trading Anda. Selain itu bot ini mengirim pemberitahuan MarketScope secara otomatis; hubungkan dari menu Pengaturan di aplikasi.",
    );
  }
  return Response.json({ ok: true });
}
