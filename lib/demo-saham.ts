// Demo (paper trading) account for IDX stocks: virtual rupiah, Yahoo prices (delayed ±10 minutes).
// The server fills every order at the last price it fetches itself, in whole lots.
//
// Stored in the user's Clerk private metadata next to the crypto demo, positions and Mode Santai,
// which share an 8 KB limit; history is kept shorter than the crypto demo for that reason.

import { ADVICE_LABEL, type Advice, type Bucket, type Side } from "./demo";
import { BUY_FEE, LOT, SELL_FEE } from "./saham";

export { ADVICE_LABEL, type Advice, type Bucket, type Side };

export const DEMO_SAHAM_START = 10_000_000;
const MAX_HOLDINGS = 15;
const MAX_TRADES = 20;
const MAX_LOTS = 100_000;

const EMPTY_BUCKET: Bucket = { n: 0, wins: 0, pnl: 0 };

export type SahamHolding = {
  code: string;
  lots: number;
  // Rupiah paid for the shares still held, fees included; cost / (lots * LOT) is the average price.
  cost: number;
  // Advice at purchase; null when unknown or when buys with different advice were combined.
  tag: Advice | null;
};

export type SahamTrade = {
  time: number;
  code: string;
  side: Side;
  lots: number;
  price: number;
  fee: number;
  // Realized profit of a sale after fees; null for buys.
  pnl: number | null;
  // Advice when a buy was made; null for sales and stocks outside the app's list.
  advice: Advice | null;
};

export type SahamAccount = {
  cash: number;
  holdings: SahamHolding[];
  trades: SahamTrade[];
  startedAt: number;
  // Realized profit since the last reset, kept even after old trades drop off the history.
  realized: number;
  // Sales of stocks bought on BELI advice, and of all other stocks.
  followed: Bucket;
  other: Bucket;
  // IHSG level when the account started, to compare with simply holding the index.
  ihsgStart: number | null;
};

export function freshSahamAccount(now: number, ihsgStart: number | null = null): SahamAccount {
  return {
    cash: DEMO_SAHAM_START,
    holdings: [],
    trades: [],
    startedAt: now,
    realized: 0,
    followed: EMPTY_BUCKET,
    other: EMPTY_BUCKET,
    ihsgStart,
  };
}

export function validCode(s: unknown): s is string {
  return typeof s === "string" && /^[A-Z]{4}$/.test(s);
}

const validLots = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_LOTS;

// Rupiah paid for `lots` at `price`, buy fee included.
export function buyCost(lots: number, price: number): number {
  return lots * LOT * price * (1 + BUY_FEE);
}

// Rupiah received for `lots` at `price`, after the sell fee.
export function sellProceeds(lots: number, price: number): number {
  return lots * LOT * price * (1 - SELL_FEE);
}

export type SahamOrderResult = { account: SahamAccount; trade: SahamTrade } | { error: string };

// Buys `lots` whole lots at `price`.
export function buySaham(
  a: SahamAccount,
  code: string,
  lots: number,
  price: number,
  now: number,
  advice: Advice | null = null,
): SahamOrderResult {
  if (!validLots(lots)) return { error: "Jumlah lot tidak valid (minimal 1 lot, bilangan bulat)" };
  if (!(price > 0)) return { error: "Harga tidak tersedia" };
  const gross = lots * LOT * price;
  const fee = gross * BUY_FEE;
  const cost = gross + fee;
  if (cost > a.cash + 1e-6) return { error: "Saldo tidak cukup" };
  const held = a.holdings.find((h) => h.code === code);
  if (!held && a.holdings.length >= MAX_HOLDINGS) return { error: `Maksimal ${MAX_HOLDINGS} saham berbeda` };
  const holdings = held
    ? a.holdings.map((h) =>
        h === held
          ? { ...h, lots: h.lots + lots, cost: h.cost + cost, tag: h.tag === advice ? advice : null }
          : h,
      )
    : [...a.holdings, { code, lots, cost, tag: advice }];
  const trade: SahamTrade = { time: now, code, side: "beli", lots, price, fee, pnl: null, advice };
  return {
    account: {
      ...a,
      cash: Math.max(0, a.cash - cost),
      holdings,
      trades: [trade, ...a.trades].slice(0, MAX_TRADES),
    },
    trade,
  };
}

// Sells `lots` whole lots at `price`.
export function sellSaham(
  a: SahamAccount,
  code: string,
  lots: number,
  price: number,
  now: number,
): SahamOrderResult {
  const held = a.holdings.find((h) => h.code === code);
  if (!held) return { error: "Anda tidak memiliki saham ini" };
  if (!validLots(lots)) return { error: "Jumlah lot tidak valid (minimal 1 lot, bilangan bulat)" };
  if (lots > held.lots) return { error: `Lot melebihi yang dimiliki (${held.lots} lot)` };
  if (!(price > 0)) return { error: "Harga tidak tersedia" };
  const gross = lots * LOT * price;
  const fee = gross * SELL_FEE;
  const costPart = held.cost * (lots / held.lots);
  const pnl = gross - fee - costPart;
  const holdings =
    lots === held.lots
      ? a.holdings.filter((h) => h !== held)
      : a.holdings.map((h) => (h === held ? { ...h, lots: h.lots - lots, cost: h.cost - costPart } : h));
  const trade: SahamTrade = { time: now, code, side: "jual", lots, price, fee, pnl, advice: null };
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
  // Trade time is stored in seconds.
  t: [number, string, 0 | 1, number, number, number, number | null, (Advice | null)?][];
  s: number;
  r: number;
  f?: [number, number, number];
  o?: [number, number, number];
  i?: number | null;
};

// Two decimals is far beyond rupiah display precision and keeps the stored JSON short.
const short = (n: number) => Math.round(n * 100) / 100;

const packBucket = (b: Bucket): [number, number, number] => [b.n, b.wins, short(b.pnl)];

export function packSaham(a: SahamAccount): Stored {
  return {
    c: short(a.cash),
    h: a.holdings.map((h) => [h.code, h.lots, short(h.cost), h.tag]),
    t: a.trades.map((t) => [
      Math.round(t.time / 1000),
      t.code,
      t.side === "beli" ? 0 : 1,
      t.lots,
      short(t.price),
      short(t.fee),
      t.pnl === null ? null : short(t.pnl),
      t.advice,
    ]),
    s: a.startedAt,
    r: short(a.realized),
    f: packBucket(a.followed),
    o: packBucket(a.other),
    i: a.ihsgStart === null ? null : short(a.ihsgStart),
  };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const advice = (v: unknown): Advice | null => (v === 0 || v === 1 || v === 2 ? v : null);

function unpackBucket(v: unknown): Bucket {
  if (!Array.isArray(v)) return EMPTY_BUCKET;
  return { n: num(v[0]) ?? 0, wins: num(v[1]) ?? 0, pnl: num(v[2]) ?? 0 };
}

// Reads stored data defensively; anything malformed falls back to a fresh account.
export function unpackSaham(raw: unknown, now: number): SahamAccount {
  const r = raw as Partial<Stored> | null;
  if (!r || num(r.c) === null) return freshSahamAccount(now);
  const holdings: SahamHolding[] = (Array.isArray(r.h) ? r.h : [])
    .filter((h) => Array.isArray(h) && validCode(h[0]) && validLots(num(h[1]) ?? 0) && num(h[2]) !== null)
    .map((h) => ({ code: h[0], lots: h[1], cost: h[2], tag: advice(h[3]) }));
  const trades: SahamTrade[] = (Array.isArray(r.t) ? r.t : [])
    .filter((t) => Array.isArray(t) && validCode(t[1]) && num(t[3]) !== null && num(t[4]) !== null)
    .map((t) => ({
      time: (num(t[0]) ?? 0) * 1000,
      code: t[1],
      side: t[2] === 0 ? "beli" : "jual",
      lots: t[3],
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
    ihsgStart: num(r.i),
  };
}
