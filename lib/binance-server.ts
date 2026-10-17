import { BINANCE_API } from "./symbols";

// The live last-trade price on Binance, fetched on the server at the moment it is needed.
export async function livePrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`${BINANCE_API}/ticker/price?symbol=${symbol}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const price = Number((await res.json())?.price);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

// Close of the hourly candle that ended around `time`, for prices in the past.
export async function priceAt(symbol: string, time: number): Promise<number | null> {
  try {
    const res = await fetch(`${BINANCE_API}/klines?symbol=${symbol}&interval=1h&startTime=${time - 3_600_000}&limit=1`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const price = Number((await res.json())?.[0]?.[4]);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}
