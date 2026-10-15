import { clerkClient } from "@clerk/nextjs/server";
import { getAccess } from "@/lib/access";
import { livePrice } from "@/lib/binance-server";
import { DCA_COINS, EMPTY_DCA, pack, record, unpack } from "@/lib/dca";

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
  return Response.json(unpack(u.privateMetadata.dca));
}

// Records this week's DCA buys at the live Binance price, or resets the core holding.
export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await request.json().catch(() => null);
  const client = await clerkClient();

  if (body?.action === "reset") {
    await client.users.updateUserMetadata(user.userId, { privateMetadata: { dca: pack(EMPTY_DCA) } });
    return Response.json(EMPTY_DCA);
  }

  const wanted: { symbol: string; usdt: number }[] = (Array.isArray(body?.buys) ? body.buys : []).filter(
    (b: { symbol?: unknown; usdt?: unknown }) =>
      (DCA_COINS as readonly unknown[]).includes(b?.symbol) && typeof b?.usdt === "number" && b.usdt > 0 && b.usdt < 1e7,
  );
  if (wanted.length === 0) return Response.json({ error: "Tidak ada pembelian untuk dicatat" }, { status: 400 });

  const priced = [];
  for (const b of wanted) {
    const price = await livePrice(b.symbol);
    if (price === null) return Response.json({ error: "Harga live tidak tersedia" }, { status: 502 });
    priced.push({ ...b, price });
  }
  const u = await client.users.getUser(user.userId);
  const next = record(unpack(u.privateMetadata.dca), priced, Date.now());
  await client.users.updateUserMetadata(user.userId, { privateMetadata: { dca: pack(next) } });
  return Response.json(next);
}
