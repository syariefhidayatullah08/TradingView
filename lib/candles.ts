import type { Candle } from "./indicators";
import { BINANCE_API } from "./symbols";

export async function fetchCandles(symbol: string, interval: string, limit = 300): Promise<Candle[]> {
  const res = await fetch(`${BINANCE_API}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw: (string | number)[][] = await res.json();
  return raw.map((k) => ({
    time: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    takerBuyVolume: Number(k[9]),
  }));
}
