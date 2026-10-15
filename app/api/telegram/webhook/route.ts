import { clerkClient } from "@clerk/nextjs/server";
import { sendMessage, userFromCode, webhookAuthorized } from "@/lib/telegram";

// Messages sent to the bot. "/start <code>" links the chat to the app user the code was made for.
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
      await sendMessage(chatId, "Kode tidak valid. Buka KriptoScope → Pengaturan → Telegram, lalu tekan tombol hubungkan lagi.");
      return Response.json({ ok: true });
    }
    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, { privateMetadata: { telegram: { chatId }, tgState: null } });
    await sendMessage(
      chatId,
      "✅ <b>KriptoScope terhubung.</b>\nAnda akan menerima pesan saat koin layak BELI, saat posisi waktunya JUAL atau AMANKAN, dan pengingat DCA. Putuskan kapan saja dari Pengaturan di aplikasi.",
    );
  } else {
    await sendMessage(chatId, "Bot ini hanya mengirim pemberitahuan KriptoScope. Hubungkan dari menu Pengaturan di aplikasi.");
  }
  return Response.json({ ok: true });
}
