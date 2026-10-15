import { clerkClient } from "@clerk/nextjs/server";
import { getAccess } from "@/lib/access";
import { buy, freshAccount, pack, sell, unpack, validSymbol, type DemoAccount } from "@/lib/demo";
import { livePrice } from "@/lib/binance-server";

async function requireUser(): Promise<{ userId: string } | Response> {
  const access = await getAccess();
  if (!access?.allowed) {
    return Response.json({ error: "Akun belum disetujui pemilik aplikasi" }, { status: 403 });
  }
  return { userId: access.userId };
}

async function load(userId: string): Promise<DemoAccount> {
  const client = await clerkClient();
  const u = await client.users.getUser(userId);
  return unpack(u.privateMetadata.demo, Date.now());
}

async function store(userId: string, account: DemoAccount) {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, { privateMetadata: { demo: pack(account) } });
}

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return Response.json(await load(user.userId));
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await request.json().catch(() => null);

  if (body?.action === "reset") {
    const account = freshAccount(Date.now());
    await store(user.userId, account);
    return Response.json({ account });
  }

  const symbol = body?.symbol;
  if (!validSymbol(symbol)) return Response.json({ error: "Koin tidak valid" }, { status: 400 });
  const side = body?.side;
  if (side !== "beli" && side !== "jual") return Response.json({ error: "Pilih beli atau jual" }, { status: 400 });
  const price = await livePrice(symbol);
  if (price === null) {
    return Response.json({ error: "Harga live tidak tersedia untuk koin ini" }, { status: 502 });
  }

  const account = await load(user.userId);
  const now = Date.now();
  const result =
    side === "beli"
      ? buy(account, symbol, Number(body.usdt), price, now)
      : sell(account, symbol, Number(body.qty), price, now);
  if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
  await store(user.userId, result.account);
  return Response.json(result);
}
