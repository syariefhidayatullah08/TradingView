import { clerkClient } from "@clerk/nextjs/server";
import { getAccess } from "@/lib/access";
import { sanitizeSantai } from "@/lib/santai";

// Mode Santai settings, kept per user in Clerk private metadata so they follow the account across devices.
async function requireUser(): Promise<{ userId: string } | Response> {
  const access = await getAccess();
  if (!access?.allowed) {
    return Response.json({ error: "Akun belum disetujui pemilik aplikasi" }, { status: 403 });
  }
  return { userId: access.userId };
}

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const client = await clerkClient();
  const u = await client.users.getUser(user.userId);
  return Response.json(sanitizeSantai(u.privateMetadata.santai));
}

export async function PUT(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const settings = sanitizeSantai(await request.json().catch(() => null));
  const client = await clerkClient();
  await client.users.updateUserMetadata(user.userId, { privateMetadata: { santai: settings } });
  return Response.json(settings);
}
