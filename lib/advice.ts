import { decide, type Decision } from "./decision";
import type { Evidence } from "./evidence";
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
  evidence: Evidence | null = null,
): Decision | null {
  const d = decide(candles, higher, higherLabel, {
    sensitive: settings.sensitive,
    market: settings.btcFilter ? marketOutlook(btcDaily) : null,
  });
  return d && applyEvidence(applySantai(d, symbol, settings, open), evidence, settings.evidenceOnly);
}

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// Shows the coin's recent backtest and, when asked, skips coins where the strategy lost money.
function applyEvidence(d: Decision, ev: Evidence | null, only: boolean): Decision {
  if (!ev) return d;
  const reason = {
    text: `Uji 1000 candle terakhir: strategi ${pct(ev.totalPct)} (beli & tahan ${pct(ev.buyHoldPct)})`,
    tone: (ev.totalPct > 0 ? 1 : -1) as 1 | -1,
  };
  const withReason = { ...d, reasons: [...d.reasons, reason] };
  if (!only || d.action !== "beli" || ev.totalPct > 0) return withReason;
  return {
    ...withReason,
    action: "tunggu",
    headline: `Lewati: di uji 1000 candle, strategi ini rugi ${pct(ev.totalPct)} di koin ini`,
  };
}
