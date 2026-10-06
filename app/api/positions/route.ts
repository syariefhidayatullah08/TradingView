import { clerkClient } from "@clerk/nextjs/server";
import { getAccess } from "@/lib/access";
import type { ClosedTrade, Position } from "@/lib/positions";
import { COINS } from "@/lib/symbols";

// Clerk metadata is capped at 8 KB per user, so both lists are bounded and
// closed trades are stored as compact arrays.
const MAX_POSITIONS = 15;
const MAX_TRADES = 50;

type CompactTrade = [string, string, number, number, number | null, number, number, string];

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

function validSymbol(v: unknown): v is string {
  return typeof v === "string" && COINS.some((c) => c.symbol === v);
}

function id(v: unknown): string {
  return typeof v === "string" && v ? v.slice(0, 40) : crypto.randomUUID();
}

function sanitizePositions(raw: unknown): Position[] {
  if (!Array.isArray(raw)) return [];
  const out: Position[] = [];
  for (const p of raw.slice(0, MAX_POSITIONS)) {
    const entryPrice = num(p?.entryPrice);
    const stop = num(p?.stop);
    const target1 = num(p?.target1);
    const target2 = num(p?.target2);
    if (!validSymbol(p?.symbol)) continue;
    if (entryPrice === null || entryPrice <= 0 || stop === null || target1 === null || target2 === null) continue;
    out.push({
      id: id(p.id),
      symbol: p.symbol,
      mode: p.mode === "stoploss" ? "stoploss" : "untung",
      interval: typeof p.interval === "string" ? p.interval.slice(0, 4) : "1h",
      entryPrice,
      entryTime: num(p.entryTime) ?? Date.now(),
      amount: num(p.amount),
      stop,
      target1,
      target2,
    });
  }
  return out;
}

function sanitizeTrades(raw: unknown): ClosedTrade[] {
  if (!Array.isArray(raw)) return [];
  const out: ClosedTrade[] = [];
  for (const t of raw) {
    const entryPrice = num(t?.entryPrice);
    const exitPrice = num(t?.exitPrice);
    if (!validSymbol(t?.symbol) || entryPrice === null || entryPrice <= 0 || exitPrice === null || exitPrice <= 0) continue;
    out.push({
      id: id(t.id),
      symbol: t.symbol,
      interval: typeof t.interval === "string" ? t.interval.slice(0, 4) : "1h",
      entryPrice,
      entryTime: num(t.entryTime) ?? 0,
      amount: num(t.amount),
      exitPrice,
      exitTime: num(t.exitTime) ?? Date.now(),
    });
  }
  // Keep the most recent trades when the list overflows.
  return out.sort((a, b) => b.exitTime - a.exitTime).slice(0, MAX_TRADES);
}

function compact(t: ClosedTrade): CompactTrade {
  return [t.symbol, t.interval, t.entryPrice, t.entryTime, t.amount, t.exitPrice, t.exitTime, t.id];
}

function expand(raw: unknown): ClosedTrade[] {
  if (!Array.isArray(raw)) return [];
  return sanitizeTrades(
    raw.map((r) =>
      Array.isArray(r)
        ? { symbol: r[0], interval: r[1], entryPrice: r[2], entryTime: r[3], amount: r[4], exitPrice: r[5], exitTime: r[6], id: r[7] }
        : null,
    ),
  );
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
