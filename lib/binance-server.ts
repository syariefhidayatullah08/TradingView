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
