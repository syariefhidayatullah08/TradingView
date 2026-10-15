import { clerkClient } from "@clerk/nextjs/server";
import { getAccess } from "@/lib/access";
import { botUsername, linkCode, telegramConfigured } from "@/lib/telegram";

// Telegram link status for the signed-in user, and the deep link that connects their chat.
export async function GET() {
  const access = await getAccess();
  if (!access?.allowed) return Response.json({ error: "Akun belum disetujui" }, { status: 403 });
  if (!telegramConfigured()) return Response.json({ configured: false, linked: false, url: null });
  const client = await clerkClient();
  const u = await client.users.getUser(access.userId);
  const linked = typeof (u.privateMetadata.telegram as { chatId?: unknown } | undefined)?.chatId === "number";
  const bot = await botUsername();
  return Response.json({
    configured: true,
    linked,
    url: bot ? `https://t.me/${bot}?start=${linkCode(access.userId)}` : null,
    isOwner: access.isOwner,
  });
}

export async function DELETE() {
  const access = await getAccess();
  if (!access?.allowed) return Response.json({ error: "Akun belum disetujui" }, { status: 403 });
  const client = await clerkClient();
  await client.users.updateUserMetadata(access.userId, { privateMetadata: { telegram: null, tgState: null } });
  return Response.json({ linked: false });
}
