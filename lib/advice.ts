import { decide, type Decision } from "./decision";
import type { Candle } from "./indicators";
import { outlook } from "./outlook";
import type { Position } from "./positions";
import { applySantai, type SantaiSettings } from "./santai";

// The app's buy advice with the user's strategy settings applied. Mulai Trading, the scanner,
// the watchlist and the backtest all go through here so they always agree.

export const MARKET_SYMBOL = "BTCUSDT";
export const MARKET_INTERVAL = "1d";
const MARKET_WINDOW = 120;

// Direction of BTC on daily candles, for the market filter.
export function marketOutlook(btcDaily: Candle[] | null) {
  return btcDaily && btcDaily.length >= 60 ? outlook(btcDaily.slice(-MARKET_WINDOW), 1) : null;
}

export function advise(
  candles: Candle[],
  higher: Candle[] | null,
  higherLabel: string | null,
  symbol: string,
  settings: SantaiSettings,
  btcDaily: Candle[] | null,
  open: Position[] | null = null,
): Decision | null {
  const d = decide(candles, higher, higherLabel, {
    sensitive: settings.sensitive,
    market: settings.btcFilter ? marketOutlook(btcDaily) : null,
  });
  return d && applySantai(d, symbol, settings, open);
}
