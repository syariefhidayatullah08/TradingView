import { clerkClient } from "@clerk/nextjs/server";
import { getAccess } from "@/lib/access";
import { livePrice } from "@/lib/binance-server";
import { isStockSymbol, MAX_ALERTS, packAlerts, unpackAlerts, validAlertSymbol, type PriceAlert } from "@/lib/price-alerts";
import { getSahamChart } from "@/lib/saham-server";

async function requireUser(): Promise<{ userId: string } | Response> {
  const access = await getAccess();
  if (!access?.allowed) {
    return Response.json({ error: "Akun belum disetujui pemilik aplikasi" }, { status: 403 });
  }
  return { userId: access.userId };
}

async function load(userId: string): Promise<PriceAlert[]> {
  const client = await clerkClient();
  const u = await client.users.getUser(userId);
  return unpackAlerts(u.privateMetadata.priceAlerts);
}

async function save(userId: string, list: PriceAlert[]) {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, { privateMetadata: { priceAlerts: packAlerts(list) } });
}

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return Response.json(await load(user.userId));
}

// Adds an alarm. Its direction comes from the live price: above it, alert on the way up.
export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await request.json().catch(() => null);
  const symbol = body?.symbol;
  const price = Number(body?.price);
  if (!validAlertSymbol(symbol) || !(price > 0) || !Number.isFinite(price)) {
    return Response.json({ error: "Koin/saham atau harga tidak valid" }, { status: 400 });
  }
  const list = await load(user.userId);
  if (list.length >= MAX_ALERTS) {
    return Response.json({ error: `Maksimal ${MAX_ALERTS} alarm; hapus yang lama dulu` }, { status: 400 });
  }
  const now = isStockSymbol(symbol)
    ? await getSahamChart(symbol, "1d")
        .then((c) => c.price)
        .catch(() => null)
    : await livePrice(symbol);
  if (now === null) return Response.json({ error: "Harga live tidak tersedia, coba lagi" }, { status: 502 });
  if (Math.abs(price - now) / now < 0.001) {
    return Response.json({ error: "Harga alarm terlalu dekat dengan harga sekarang" }, { status: 400 });
  }
  const next = [...list, { id: crypto.randomUUID().slice(0, 8), symbol, price, dir: price > now ? 1 : -1, created: Date.now() } as PriceAlert];
  await save(user.userId, next);
  return Response.json(next);
}

export async function DELETE(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const id = new URL(request.url).searchParams.get("id");
  const next = (await load(user.userId)).filter((a) => a.id !== id);
  await save(user.userId, next);
  return Response.json(next);
}
