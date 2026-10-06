"use client";

import { SENTIMENT_PARTS } from "@/lib/explanations";
import type { Signal } from "@/lib/indicators";
import { useLiveCandles } from "@/lib/live-candles";
import { sentiment } from "@/lib/sentiment";
import type { Coin, Timeframe } from "@/lib/symbols";

const toneClass: Record<Signal, string> = { 1: "text-up", 0: "text-muted", [-1]: "text-down" };

function barColor(value: number): string {
  return value < 45 ? "bg-down" : value > 55 ? "bg-up" : "bg-muted";
}

export default function CoinSentiment({ coin, timeframe }: { coin: Coin; timeframe: Timeframe }) {
  const live = useLiveCandles(coin.symbol, timeframe.binance);
  const s = live.candles ? sentiment(live.candles) : null;


  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Sentimen {coin.base}</h2>
        <span className="flex items-center gap-2 text-xs text-muted">
          <span className={`h-2 w-2 rounded-full ${live.live ? "animate-pulse bg-up" : "bg-muted"}`} />
          Sesuai chart · {timeframe.label}
        </span>
      </header>
      <div className="p-4">
        {!live.candles && !live.error && <p className="text-sm text-muted">Memuat…</p>}
        {live.error && <p className="text-sm text-down">Sentimen gagal dimuat, mencoba lagi…</p>}
        {live.candles && !s && (
          <p className="text-sm text-muted">Data historis belum cukup.</p>
        )}
        {s && (
          <>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-3xl font-semibold">{s.score}</span>
              <span className={`text-sm font-semibold ${toneClass[s.tone]}`}>{s.label}</span>
            </div>
            <div className="relative mt-3 h-2 rounded-full bg-gradient-to-r from-down via-yellow-500 to-up">
              <div
                className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded bg-white shadow"
                style={{ left: `${s.score}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted">
              <span>Bearish</span>
              <span>Bullish</span>
            </div>

            <ul className="mt-4 flex flex-col gap-2.5">
              {s.parts.map((p) => (
                <li key={p.label}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span>{p.label}</span>
                    <span className="font-mono">{Math.round(p.value)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className={`h-full ${barColor(p.value)}`} style={{ width: `${Math.max(p.value, 3)}%` }} />
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">{p.note}</div>
                  {SENTIMENT_PARTS[p.label] && (
                    <div className="mt-0.5 text-[11px] leading-snug text-muted/80">{SENTIMENT_PARTS[p.label]}</div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
