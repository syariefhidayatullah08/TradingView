"use client";

import { useEffect, useState } from "react";
import { fetchCandles } from "@/lib/candles";
import { ATR, INDICATORS, PIVOT, SUMMARY } from "@/lib/explanations";
import Explain from "./Explain";
import { analyze, summaryLabel, type Candle, type Signal } from "@/lib/indicators";
import { formatPrice, type Coin, type Timeframe } from "@/lib/symbols";

const REFRESH_MS = 30_000;

type State = { key: string; candles?: Candle[]; error?: string };

const toneClass: Record<Signal, string> = {
  1: "text-up",
  0: "text-muted",
  [-1]: "text-down",
};
const signalText: Record<Signal, string> = { 1: "Beli", 0: "Netral", [-1]: "Jual" };

export default function AnalysisPanel({ coin, timeframe }: { coin: Coin; timeframe: Timeframe }) {
  const key = `${coin.symbol}:${timeframe.binance}`;
  const [state, setState] = useState<State>({ key: "" });
  const [explain, setExplain] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const candles = await fetchCandles(coin.symbol, timeframe.binance);
        if (!cancelled) setState({ key, candles });
      } catch (e) {
        if (!cancelled) {
          // Keep showing the last good data for this symbol if a refresh fails.
          setState((prev) =>
            prev.key === key && prev.candles
              ? prev
              : { key, error: e instanceof Error ? e.message : "Gagal memuat data" },
          );
        }
      }
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [key, coin.symbol, timeframe.binance]);

  const current = state.key === key ? state : null;
  const analysis = current?.candles ? analyze(current.candles, formatPrice) : null;

  return (
    <section className="panel flex flex-col">
      <header className="panel-header">
        <h2>Analisa Teknikal</h2>
        <span className="flex items-center gap-2 text-xs text-muted">
          {coin.base}/USDT · {timeframe.label}
          <button
            onClick={() => setExplain((e) => !e)}
            className="rounded border border-line px-2 py-0.5 text-[11px] font-medium hover:bg-base"
          >
            {explain ? "Sembunyikan penjelasan" : "Tampilkan penjelasan"}
          </button>
        </span>
      </header>

      {!current && <p className="p-4 text-sm text-muted">Memuat data pasar…</p>}
      {current?.error && (
        <p className="p-4 text-sm text-down">Data pasar gagal dimuat ({current.error}).</p>
      )}
      {current?.candles && !analysis && (
        <p className="p-4 text-sm text-muted">Data historis belum cukup untuk dianalisa.</p>
      )}

      {analysis && (
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="font-mono text-2xl font-semibold">${formatPrice(analysis.price)}</div>
              <div className={`text-xs ${analysis.changePct >= 0 ? "text-up" : "text-down"}`}>
                {analysis.changePct >= 0 ? "+" : ""}
                {analysis.changePct.toFixed(2)}% vs candle sebelumnya
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wide text-muted">Ringkasan</div>
              <div className={`text-lg font-bold ${toneClass[summaryLabel(analysis.score).tone]}`}>
                {summaryLabel(analysis.score).text}
              </div>
            </div>
          </div>

          <div>
            <div className="relative h-2 rounded-full bg-gradient-to-r from-down via-neutral-500 to-up">
              <div
                className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded bg-white shadow"
                style={{ left: `${((analysis.score + 1) / 2) * 100}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs">
              <span className="text-down">Jual {analysis.sell}</span>
              <span className="text-muted">Netral {analysis.neutral}</span>
              <span className="text-up">Beli {analysis.buy}</span>
            </div>
            {explain && <Explain info={SUMMARY} className="mt-2 rounded bg-base p-2" />}
          </div>

          <table className="w-full text-sm">
            <tbody>
              {analysis.rows.map((row) => [
                <tr key={row.name} className="border-t border-line">
                  <td className="py-1.5 pr-2">
                    <div>{row.name}</div>
                    <div className="text-[11px] text-muted">{row.note}</div>
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono text-xs">{row.value}</td>
                  <td className={`w-14 py-1.5 text-right text-xs font-semibold ${toneClass[row.signal]}`}>
                    {signalText[row.signal]}
                  </td>
                </tr>,
                explain && INDICATORS[row.name] && (
                  <tr key={`${row.name}-info`}>
                    <td colSpan={3} className="pb-2">
                      <Explain info={INDICATORS[row.name]} className="rounded bg-base p-2" />
                    </td>
                  </tr>
                ),
              ])}
            </tbody>
          </table>

          {analysis.pivots && (
            <div>
              <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">
                Support &amp; Resistance (pivot)
              </div>
              <div className="grid grid-cols-5 gap-1 text-center font-mono text-[11px]">
                {(
                  [
                    ["S2", analysis.pivots.s2, "text-up"],
                    ["S1", analysis.pivots.s1, "text-up"],
                    ["P", analysis.pivots.p, "text-muted"],
                    ["R1", analysis.pivots.r1, "text-down"],
                    ["R2", analysis.pivots.r2, "text-down"],
                  ] as const
                ).map(([label, value, cls]) => (
                  <div key={label} className="rounded bg-base px-1 py-1.5">
                    <div className={`font-sans font-semibold ${cls}`}>{label}</div>
                    <div>{formatPrice(value)}</div>
                  </div>
                ))}
              </div>
              {explain && <Explain info={PIVOT} className="mt-2 rounded bg-base p-2" />}
              {analysis.atr !== null && (
                <p className="mt-3 text-xs text-muted">
                  Volatilitas ATR(14): <span className="font-mono text-fg">{formatPrice(analysis.atr)}</span>{" "}
                  ({((analysis.atr / analysis.price) * 100).toFixed(2)}% dari harga)
                </p>
              )}
              {explain && analysis.atr !== null && <Explain info={ATR} className="mt-2 rounded bg-base p-2" />}
            </div>
          )}

          <p className="text-[11px] leading-snug text-muted">
            Sinyal dihitung otomatis dari indikator dan bukan saran keuangan. Selalu gunakan manajemen
            risiko.
          </p>
        </div>
      )}
    </section>
  );
}
