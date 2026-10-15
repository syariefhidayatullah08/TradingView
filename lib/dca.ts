import { FEE_PCT } from "./positions";

// Core holding (DCA): BTC and ETH bought for a fixed rupiah amount every week and held,
// separate from the trading "satellite". Holdings are aggregated per coin to stay small
// inside the user's Clerk metadata.

export const DCA_COINS = ["BTCUSDT", "ETHUSDT"] as const;
const MAX_LOG = 8;
const DAY_MS = 86_400_000;

export type DcaHolding = { symbol: string; qty: number; cost: number; count: number };
export type DcaBuy = { time: number; symbol: string; qty: number; price: number };
export type DcaState = { holdings: DcaHolding[]; last: number; log: DcaBuy[] };

export const EMPTY_DCA: DcaState = { holdings: [], last: 0, log: [] };

// Start (00:00 local) of the latest scheduled DCA day on or before `now`.
export function scheduledDay(now: number, weekday: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - weekday + 7) % 7));
  return d.getTime();
}

export function isDue(state: DcaState, now: number, weekday: number): boolean {
  return state.last < scheduledDay(now, weekday);
}

export function nextDay(now: number, weekday: number): number {
  const s = scheduledDay(now, weekday);
  return s + 7 * DAY_MS;
}

// USDT per coin for one weekly buy.
export function split(idr: number, btcPct: number, idrPerUsdt: number): Record<string, number> {
  const usdt = idr / idrPerUsdt;
  return { BTCUSDT: (usdt * btcPct) / 100, ETHUSDT: (usdt * (100 - btcPct)) / 100 };
}

export function record(state: DcaState, buys: { symbol: string; usdt: number; price: number }[], now: number): DcaState {
  let holdings = state.holdings;
  const log: DcaBuy[] = [];
  for (const b of buys) {
    if (!(b.usdt > 0)) continue;
    const qty = (b.usdt * (1 - FEE_PCT / 100)) / b.price;
    const held = holdings.find((h) => h.symbol === b.symbol);
    holdings = held
      ? holdings.map((h) => (h === held ? { ...h, qty: h.qty + qty, cost: h.cost + b.usdt, count: h.count + 1 } : h))
      : [...holdings, { symbol: b.symbol, qty, cost: b.usdt, count: 1 }];
    log.push({ time: now, symbol: b.symbol, qty, price: b.price });
  }
  return { holdings, last: now, log: [...log, ...state.log].slice(0, MAX_LOG) };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const short = (n: number) => Number(n.toPrecision(10));

type Stored = { h: [string, number, number, number][]; l: number; g: [number, string, number, number][] };

export function pack(s: DcaState): Stored {
  return {
    h: s.holdings.map((h) => [h.symbol, short(h.qty), short(h.cost), h.count]),
    l: s.last,
    g: s.log.map((b) => [b.time, b.symbol, short(b.qty), short(b.price)]),
  };
}

export function unpack(raw: unknown): DcaState {
  const r = raw as Partial<Stored> | null;
  if (!r) return EMPTY_DCA;
  const valid = (s: unknown): s is string => typeof s === "string" && (DCA_COINS as readonly string[]).includes(s);
  return {
    holdings: (Array.isArray(r.h) ? r.h : [])
      .filter((h) => Array.isArray(h) && valid(h[0]) && (num(h[1]) ?? 0) > 0)
      .map((h) => ({ symbol: h[0], qty: h[1], cost: num(h[2]) ?? 0, count: num(h[3]) ?? 0 })),
    last: num(r.l) ?? 0,
    log: (Array.isArray(r.g) ? r.g : [])
      .filter((b) => Array.isArray(b) && valid(b[1]) && num(b[2]) !== null && num(b[3]) !== null)
      .map((b) => ({ time: num(b[0]) ?? 0, symbol: b[1], qty: b[2], price: b[3] })),
  };
}
