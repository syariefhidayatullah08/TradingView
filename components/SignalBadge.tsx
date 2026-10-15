"use client";

import { decide, type Action } from "@/lib/decision";
import { useLiveCandles } from "@/lib/live-candles";
import { higherTimeframe, type Timeframe } from "@/lib/symbols";

const style: Record<Action, { badge: string; label: string }> = {
  beli: { badge: "bg-up/15 text-up", label: "BELI" },
  tunggu: { badge: "bg-amber-300/15 text-amber-300", label: "TUNGGU" },
  jangan: { badge: "bg-down/15 text-down", label: "JANGAN" },
};

// One coin's current "Mulai Trading" decision, updated live. Used in the watchlist.
export default function SignalBadge({ symbol, timeframe }: { symbol: string; timeframe: Timeframe }) {
  const higherTf = higherTimeframe(timeframe);
  const live = useLiveCandles(symbol, timeframe.binance);
  const higher = useLiveCandles(symbol, (higherTf ?? timeframe).binance);
  if (!live.candles || live.candles.length <= 60) return <span className="text-[11px] text-muted">…</span>;
  const d = decide(live.candles, higherTf ? higher.candles : null, higherTf?.label ?? null);
  if (!d) return <span className="text-[11px] text-muted">—</span>;
  return (
    <span title={d.headline} className="inline-flex flex-col items-end">
      <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${style[d.action].badge}`}>
        {style[d.action].label}
      </span>
      <span className="text-[10px] text-muted">yakin {d.confidence}%</span>
    </span>
  );
}
