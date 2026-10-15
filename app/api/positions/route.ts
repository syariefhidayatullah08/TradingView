import { clerkClient } from "@clerk/nextjs/server";
import { getAccess } from "@/lib/access";
import { compact, expand, sanitizePositions, sanitizeTrades } from "@/lib/positions-store";

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
  return Response.json({
    positions: sanitizePositions(u.privateMetadata.positions),
    trades: expand(u.privateMetadata.trades),
  });
}

export async function PUT(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await request.json().catch(() => null);
  const positions = sanitizePositions(body?.positions);
  const trades = sanitizeTrades(body?.trades);
  const client = await clerkClient();
  await client.users.updateUserMetadata(user.userId, {
    privateMetadata: { positions, trades: trades.map(compact) },
  });
  return Response.json({ positions, trades });
}
