import { clerkClient } from "@clerk/nextjs/server";
import { getAccess } from "@/lib/access";
import {
  buySaham,
  freshSahamAccount,
  packSaham,
  sellSaham,
  unpackSaham,
  validCode,
  type Advice,
  type SahamAccount,
} from "@/lib/demo-saham";
import { getSahamChart, getSahamReport } from "@/lib/saham-server";

async function requireUser(): Promise<{ userId: string } | Response> {
  const access = await getAccess();
  if (!access?.allowed) {
    return Response.json({ error: "Akun belum disetujui pemilik aplikasi" }, { status: 403 });
  }
  return { userId: access.userId };
}

async function load(userId: string): Promise<SahamAccount> {
  const client = await clerkClient();
  const u = await client.users.getUser(userId);
  return unpackSaham(u.privateMetadata.demoSaham, Date.now());
}

async function store(userId: string, account: SahamAccount) {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, { privateMetadata: { demoSaham: packSaham(account) } });
}

// Last price (delayed ±10 minutes) of a Yahoo symbol; null when it cannot be fetched.
async function lastPrice(symbol: string): Promise<number | null> {
  try {
    const p = (await getSahamChart(symbol, "1d")).price;
    return p > 0 ? p : null;
  } catch {
    return null;
  }
}

const ACTION_ADVICE: Record<string, Advice> = { beli: 0, tunggu: 1, jangan: 2 };

// The app's daily-candle advice for the stock right now; null for stocks outside its list.
async function adviceNow(code: string): Promise<Advice | null> {
  try {
    const action = (await getSahamReport()).stocks.find((s) => s.code === code)?.decision?.action;
    return action ? (ACTION_ADVICE[action] ?? null) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const account = await load(user.userId);
  // Accounts without an IHSG start level get the current level once; close enough for new accounts.
  if (account.ihsgStart === null) {
    const ihsg = await lastPrice("^JKSE");
    if (ihsg !== null) {
      account.ihsgStart = ihsg;
      await store(user.userId, account);
    }
  }
  return Response.json(account);
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await request.json().catch(() => null);

  if (body?.action === "reset") {
    const account = freshSahamAccount(Date.now(), await lastPrice("^JKSE"));
    await store(user.userId, account);
    return Response.json({ account });
  }

  const code = typeof body?.code === "string" ? body.code.toUpperCase() : null;
  if (!validCode(code)) return Response.json({ error: "Kode saham harus 4 huruf" }, { status: 400 });
  const side = body?.side;
  if (side !== "beli" && side !== "jual")
    return Response.json({ error: "Pilih beli atau jual" }, { status: 400 });
  const lots = Number(body?.lots);
  if (!Number.isInteger(lots) || lots < 1) {
    return Response.json(
      { error: "Jumlah lot tidak valid (minimal 1 lot, bilangan bulat)" },
      { status: 400 },
    );
  }
  const price = await lastPrice(`${code}.JK`);
  if (price === null)
    return Response.json({ error: "Harga tidak tersedia untuk saham ini" }, { status: 502 });

  const account = await load(user.userId);
  const now = Date.now();
  const result =
    side === "beli"
      ? buySaham(account, code, lots, price, now, await adviceNow(code))
      : sellSaham(account, code, lots, price, now);
  if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
  await store(user.userId, result.account);
  return Response.json(result);
}
