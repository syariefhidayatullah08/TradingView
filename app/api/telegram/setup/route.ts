import { getAccess } from "@/lib/access";
import { setWebhook, telegramConfigured } from "@/lib/telegram";

// Points the bot's webhook at this deployment. Owner only; run once after setting the env vars.
export async function POST(request: Request) {
  const access = await getAccess();
  if (!access?.isOwner) return Response.json({ error: "Hanya pemilik aplikasi" }, { status: 403 });
  if (!telegramConfigured()) return Response.json({ error: "TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET belum diisi" }, { status: 400 });
  const url = `${new URL(request.url).origin}/api/telegram/webhook`;
  const ok = await setWebhook(url);
  return ok ? Response.json({ ok, url }) : Response.json({ error: "Telegram menolak webhook" }, { status: 502 });
}
