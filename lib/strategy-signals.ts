import type { SeriesMarker, Time, UTCTimestamp } from "lightweight-charts";
import type { BacktestResult, ExitReason } from "./backtest";

// Buy/sell events of the app's real strategy (the trades from useStrategyTrades), shared by
// every chart and table that shows signals, so they all agree with "Mulai Trading".

export const INTERVAL_MS: Record<string, number> = {
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
};

const exitText: Record<Exclude<ExitReason, "open">, string> = {
  target: "Jual di target",
  trail: "Jual oleh trailing stop (harga turun dari puncak)",
  stop: "Kena stop loss",
};

export type StrategySignal = { type: "beli" | "jual"; time: number; price: number; reason: string; netPct: number | null };

// Latest event: the open position's buy, or the sell that closed the last trade.
export function lastSignal(result: BacktestResult): StrategySignal | null {
  const t = result.trades[result.trades.length - 1];
  if (!t) return null;
  if (t.reason === "open") {
    return {
      type: "beli",
      time: t.entryTime,
      price: t.entryPrice,
      reason: `Saran BELI dari strategi (keyakinan ${Math.round(t.confidence)}%), posisi masih dipegang`,
      netPct: null,
    };
  }
  return { type: "jual", time: t.exitTime, price: t.exitPrice, reason: exitText[t.reason], netPct: t.netPct };
}

const offset = new Date().getTimezoneOffset() * 60;

// Chart arrows: BELI at each entry and JUAL/STOP with the net result at each exit. Trade times
// are candle close times, so they are shifted back one interval onto the candle that triggered them.
export function tradeMarkers(result: BacktestResult, intervalMs: number, first: number): SeriesMarker<Time>[] {
  const at = (closeTime: number) => ((closeTime - intervalMs) / 1000 - offset) as UTCTimestamp;
  const out: SeriesMarker<Time>[] = [];
  for (const t of result.trades) {
    if (t.entryTime - intervalMs < first) continue;
    const win = t.netPct >= 0;
    out.push({ time: at(t.entryTime), position: "belowBar", shape: "arrowUp", color: "#34d399", text: "BELI" });
    if (t.reason === "open") continue;
    out.push({
      time: at(t.exitTime),
      position: "aboveBar",
      shape: "arrowDown",
      color: win ? "#34d399" : "#fb7185",
      text: `${t.reason === "stop" ? "STOP" : "JUAL"} ${t.netPct >= 0 ? "+" : ""}${t.netPct.toFixed(1)}%`,
    });
  }
  return out.sort((a, b) => (a.time as number) - (b.time as number));
}
