import type { Candle } from "./indicators";
import { COINS } from "./symbols";

// Price alarms: "tell me when BTC falls to $78,000". Checked by the scheduled server scan and
// sent to Telegram, then removed. Stored compactly in the user's Clerk private metadata.

export const MAX_ALERTS = 10;
// Candle interval used to check alarms; its highs and lows catch moves between scans.
export const ALERT_INTERVAL = "15m";

export type PriceAlert = {
  id: string;
  symbol: string;
  price: number;
  // 1: alert when price rises to `price`; -1: when it falls to it.
  dir: 1 | -1;
  created: number;
};

type Stored = [string, string, number, 1 | -1, number];

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function validAlertSymbol(s: unknown): s is string {
  return typeof s === "string" && COINS.some((c) => c.symbol === s);
}

export function unpackAlerts(raw: unknown): PriceAlert[] {
  if (!Array.isArray(raw)) return [];
  const out: PriceAlert[] = [];
  for (const r of raw.slice(0, MAX_ALERTS)) {
    if (!Array.isArray(r) || typeof r[0] !== "string" || !validAlertSymbol(r[1])) continue;
    const price = num(r[2]);
    const created = num(r[4]);
    if (price === null || price <= 0 || created === null || (r[3] !== 1 && r[3] !== -1)) continue;
    out.push({ id: r[0].slice(0, 12), symbol: r[1], price, dir: r[3], created });
  }
  return out;
}

export function packAlerts(list: PriceAlert[]): Stored[] {
  return list.slice(0, MAX_ALERTS).map((a) => [a.id, a.symbol, Number(a.price.toPrecision(10)), a.dir, a.created]);
}

// True when any candle since the alarm was set reached its price.
export function reached(a: PriceAlert, candles: Candle[]): boolean {
  const hit = (p: number) => (a.dir === 1 ? p >= a.price : p <= a.price);
  // The candle open when the alarm was set may have reached the price before it, so only later
  // candles count by their high/low; the latest price always counts.
  const last = candles[candles.length - 1];
  if (last && hit(last.close)) return true;
  return candles.some((c) => c.time >= a.created && hit(a.dir === 1 ? c.high : c.low));
}
