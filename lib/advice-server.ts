import { advise, MARKET_INTERVAL, MARKET_SYMBOL } from "./advice";
import { fetchCandles } from "./candles";
import type { Advice } from "./demo";
import { sanitizePositions } from "./positions-store";
import { sanitizeSantai, tradeTimeframe } from "./santai";
import { COINS, higherTimeframe } from "./symbols";

const CODE = { beli: 0, tunggu: 1, jangan: 2 } as const;

// The app's current advice for one coin, computed on the server with the user's settings on the
// same candle the Telegram alerts use (see tradeTimeframe). Null for coins the app
// does not analyse or when data is missing.
export async function adviceNow(symbol: string, meta: Record<string, unknown>): Promise<Advice | null> {
  if (!COINS.some((c) => c.symbol === symbol)) return null;
  const settings = sanitizeSantai(meta.santai);
  const tf = tradeTimeframe(settings);
  const higher = higherTimeframe(tf);
  try {
    const [candles, big, btc] = await Promise.all([
      fetchCandles(symbol, tf.binance, 300),
      higher ? fetchCandles(symbol, higher.binance, 300) : Promise.resolve(null),
      fetchCandles(MARKET_SYMBOL, MARKET_INTERVAL, 300),
    ]);
    const d = advise(candles, big, higher?.label ?? null, symbol, settings, btc, sanitizePositions(meta.positions));
    return d ? CODE[d.action] : null;
  } catch {
    return null;
  }
}
