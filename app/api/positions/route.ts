import { clerkClient } from "@clerk/nextjs/server";
import { getAccess } from "@/lib/access";
import type { Position } from "@/lib/positions";
import { COINS } from "@/lib/symbols";

const MAX_POSITIONS = 50;

async function requireUser(): Promise<{ userId: string } | Response> {
  const access = await getAccess();
  if (!access?.allowed) {
    return Response.json({ error: "Akun belum disetujui pemilik aplikasi" }, { status: 403 });
  }
  return { userId: access.userId };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function sanitize(raw: unknown): Position[] {
  if (!Array.isArray(raw)) return [];
  const out: Position[] = [];
  for (const p of raw.slice(0, MAX_POSITIONS)) {
    const symbol = typeof p?.symbol === "string" ? p.symbol : "";
    const entryPrice = num(p?.entryPrice);
    const stop = num(p?.stop);
    const target1 = num(p?.target1);
    const target2 = num(p?.target2);
    const entryTime = num(p?.entryTime);
    if (!COINS.some((c) => c.symbol === symbol)) continue;
    if (entryPrice === null || entryPrice <= 0 || stop === null || target1 === null || target2 === null) continue;
    out.push({
      id: typeof p.id === "string" ? p.id.slice(0, 40) : crypto.randomUUID(),
      symbol,
      interval: typeof p.interval === "string" ? p.interval.slice(0, 4) : "1h",
      entryPrice,
      entryTime: entryTime ?? Date.now(),
      amount: num(p.amount),
      stop,
      target1,
      target2,
    });
  }
  return out;
}

// Positions live in the user's private Clerk metadata, so they follow the account across devices.
export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const client = await clerkClient();
  const u = await client.users.getUser(user.userId);
  return Response.json({ positions: sanitize(u.privateMetadata.positions) });
}

export async function PUT(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await request.json().catch(() => null);
  const positions = sanitize(body?.positions);
  const client = await clerkClient();
  await client.users.updateUserMetadata(user.userId, { privateMetadata: { positions } });
  return Response.json({ positions });
}
