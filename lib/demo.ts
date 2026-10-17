// Demo (paper trading) account: virtual USDT, real Binance prices. The server fills every order
// at the live price it fetches itself, so the demo matches the realtime chart.
//
// Stored in the user's Clerk private metadata next to positions and Mode Santai, which share an
// 8 KB limit; history is kept short and compact for that reason.

export const DEMO_START_USDT = 50_000;
export const DEMO_FEE_PCT = 0.1;
const MAX_HOLDINGS = 30;
const MAX_TRADES = 30;
const MIN_ORDER_USDT = 1;

export type Side = "beli" | "jual";

// The app's advice for the coin when it was bought: 0 BELI, 1 TUNGGU, 2 JANGAN.
export type Advice = 0 | 1 | 2;
export const ADVICE_LABEL: Record<Advice, string> = { 0: "BELI", 1: "TUNGGU", 2: "JANGAN" };

// Results of finished sales, grouped by whether the coin was bought on the app's BELI advice.
export type Bucket = { n: number; wins: number; pnl: number };
const EMPTY_BUCKET: Bucket = { n: 0, wins: 0, pnl: 0 };

export type Holding = {
  symbol: string;
  qty: number;
  // USDT paid for the coins still held, fees included; cost / qty is the average buy price.
  cost: number;
  // Advice at purchase; null when unknown or when buys with different advice were combined.
  tag: Advice | null;
};

export type DemoTrade = {
  time: number;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  fee: number;
  // Realized profit of a sale after fees; null for buys.
  pnl: number | null;
  // Advice when a buy was made; null for sales and unknown coins.
  advice: Advice | null;
};

export type DemoAccount = {
  cash: number;
  holdings: Holding[];
  trades: DemoTrade[];
  startedAt: number;
  // Realized profit since the last reset, kept even after old trades drop off the history.
  realized: number;
  // Sales of coins bought on BELI advice, and of all other coins.
  followed: Bucket;
  other: Bucket;
  // BTC price when the account started, to compare with simply holding BTC.
  btcStart: number | null;
};

export function freshAccount(now: number, btcStart: number | null = null): DemoAccount {
  return {
    cash: DEMO_START_USDT,
    holdings: [],
    trades: [],
    startedAt: now,
    realized: 0,
    followed: EMPTY_BUCKET,
    other: EMPTY_BUCKET,
    btcStart,
  };
}

export function validSymbol(s: unknown): s is string {
  return typeof s === "string" && /^[A-Z0-9]{2,15}USDT$/.test(s);
}

export function baseOf(symbol: string): string {
  return symbol.replace(/USDT$/, "");
}

export type OrderResult = { account: DemoAccount; trade: DemoTrade } | { error: string };

// Buys for `usdt` (fee included) at `price`.
export function buy(
  a: DemoAccount,
  symbol: string,
  usdt: number,
  price: number,
  now: number,
  advice: Advice | null = null,
): OrderResult {
  if (!(usdt >= MIN_ORDER_USDT)) return { error: `Minimal beli $${MIN_ORDER_USDT}` };
  if (usdt > a.cash + 1e-9) return { error: "Saldo USDT tidak cukup" };
  const held = a.holdings.find((h) => h.symbol === symbol);
  if (!held && a.holdings.length >= MAX_HOLDINGS) return { error: `Maksimal ${MAX_HOLDINGS} koin berbeda` };
  const fee = (usdt * DEMO_FEE_PCT) / 100;
  const qty = (usdt - fee) / price;
  const holdings = held
    ? a.holdings.map((h) =>
        h === held ? { ...h, qty: h.qty + qty, cost: h.cost + usdt, tag: h.tag === advice ? advice : null } : h,
      )
    : [...a.holdings, { symbol, qty, cost: usdt, tag: advice }];
  const trade: DemoTrade = { time: now, symbol, side: "beli", qty, price, fee, pnl: null, advice };
  return {
    account: { ...a, cash: Math.max(0, a.cash - usdt), holdings, trades: [trade, ...a.trades].slice(0, MAX_TRADES) },
    trade,
  };
}

// Sells `qty` coins at `price`.
export function sell(a: DemoAccount, symbol: string, qty: number, price: number, now: number): OrderResult {
  const held = a.holdings.find((h) => h.symbol === symbol);
  if (!held) return { error: "Anda tidak punya koin ini" };
  if (qty > held.qty * 1.000001) return { error: "Jumlah melebihi koin yang dimiliki" };
  // Selling everything up to float noise counts as selling all.
  const amount = qty >= held.qty * 0.999999 ? held.qty : qty;
  if (!(amount > 0)) return { error: "Jumlah jual tidak valid" };
  const gross = amount * price;
  if (gross < MIN_ORDER_USDT && amount < held.qty) return { error: `Minimal jual $${MIN_ORDER_USDT}` };
  const fee = (gross * DEMO_FEE_PCT) / 100;
  const costPart = held.cost * (amount / held.qty);
  const pnl = gross - fee - costPart;
  const rest = held.qty - amount;
  const holdings =
    amount === held.qty
      ? a.holdings.filter((h) => h !== held)
      : a.holdings.map((h) => (h === held ? { ...h, qty: rest, cost: h.cost - costPart } : h));
  const trade: DemoTrade = { time: now, symbol, side: "jual", qty: amount, price, fee, pnl, advice: null };
  const bucket = held.tag === 0 ? "followed" : "other";
  const b = a[bucket];
  return {
    account: {
      ...a,
      cash: a.cash + gross - fee,
      holdings,
      trades: [trade, ...a.trades].slice(0, MAX_TRADES),
      realized: a.realized + pnl,
      [bucket]: { n: b.n + 1, wins: b.wins + (pnl > 0 ? 1 : 0), pnl: b.pnl + pnl },
    },
    trade,
  };
}

// ---- Compact storage ----

type Stored = {
  c: number;
  h: [string, number, number, (Advice | null)?][];
  t: [number, string, 0 | 1, number, number, number, number | null, (Advice | null)?][];
  s: number;
  r: number;
  f?: [number, number, number];
  o?: [number, number, number];
  b?: number | null;
};

// Ten significant digits is far beyond display precision and keeps the stored JSON short.
const short = (n: number) => Number(n.toPrecision(10));

const packBucket = (b: Bucket): [number, number, number] => [b.n, b.wins, short(b.pnl)];

export function pack(a: DemoAccount): Stored {
  return {
    c: short(a.cash),
    h: a.holdings.map((h) => [h.symbol, short(h.qty), short(h.cost), h.tag]),
    t: a.trades.map((t) => [
      t.time,
      t.symbol,
      t.side === "beli" ? 0 : 1,
      short(t.qty),
      short(t.price),
      short(t.fee),
      t.pnl === null ? null : short(t.pnl),
      t.advice,
    ]),
    s: a.startedAt,
    r: short(a.realized),
    f: packBucket(a.followed),
    o: packBucket(a.other),
    b: a.btcStart,
  };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const advice = (v: unknown): Advice | null => (v === 0 || v === 1 || v === 2 ? v : null);

function unpackBucket(v: unknown): Bucket {
  if (!Array.isArray(v)) return EMPTY_BUCKET;
  return { n: num(v[0]) ?? 0, wins: num(v[1]) ?? 0, pnl: num(v[2]) ?? 0 };
}

// Reads stored data defensively; anything malformed falls back to a fresh account.
// Accounts saved before advice tracking simply start with empty buckets and untagged coins.
export function unpack(raw: unknown, now: number): DemoAccount {
  const r = raw as Partial<Stored> | null;
  if (!r || num(r.c) === null) return freshAccount(now);
  const holdings: Holding[] = (Array.isArray(r.h) ? r.h : [])
    .filter((h) => Array.isArray(h) && validSymbol(h[0]) && (num(h[1]) ?? 0) > 0 && num(h[2]) !== null)
    .map((h) => ({ symbol: h[0], qty: h[1], cost: h[2], tag: advice(h[3]) }));
  const trades: DemoTrade[] = (Array.isArray(r.t) ? r.t : [])
    .filter((t) => Array.isArray(t) && validSymbol(t[1]) && num(t[3]) !== null && num(t[4]) !== null)
    .map((t) => ({
      time: num(t[0]) ?? 0,
      symbol: t[1],
      side: t[2] === 0 ? "beli" : "jual",
      qty: t[3],
      price: t[4],
      fee: num(t[5]) ?? 0,
      pnl: num(t[6]),
      advice: advice(t[7]),
    }));
  return {
    cash: r.c as number,
    holdings,
    trades,
    startedAt: num(r.s) ?? now,
    realized: num(r.r) ?? 0,
    followed: unpackBucket(r.f),
    other: unpackBucket(r.o),
    btcStart: num(r.b),
  };
}
