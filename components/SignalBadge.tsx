"use client";

import { useLiveCandles } from "@/lib/live-candles";
import { detectSignals } from "@/lib/signals";

// Latest buy/sell signal of one coin, updated live. Used in the watchlist.
export default function SignalBadge({ symbol, interval }: { symbol: string; interval: string }) {
  const live = useLiveCandles(symbol, interval);
  if (!live.candles) return <span className="text-[11px] text-muted">…</span>;
  const signals = detectSignals(live.candles);
  const last = signals[signals.length - 1];
  if (!last) return <span className="text-[11px] text-muted">—</span>;
  const price = live.candles[live.candles.length - 1].close;
  const since = ((price - last.price) / last.price) * 100;
  const candlesAgo = live.candles.length - 1 - last.index;
  return (
    <span
      title={`${last.reason} · ${since >= 0 ? "+" : ""}${since.toFixed(2)}% sejak sinyal`}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
        last.type === "beli" ? "bg-up/15 text-up" : "bg-down/15 text-down"
      }`}
    >
      {last.type === "beli" ? "▲ BELI" : "▼ JUAL"}
      <span className="font-normal opacity-70">{candlesAgo === 0 ? "baru" : `${candlesAgo} candle`}</span>
    </span>
  );
}
