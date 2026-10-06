"use client";

import { DIRECTION } from "@/lib/explanations";
import Explain from "./Explain";
import type { Signal } from "@/lib/indicators";
import { useLiveCandles } from "@/lib/live-candles";
import { outlook, type Outlook } from "@/lib/outlook";
import { formatPrice, type Coin } from "@/lib/symbols";

// `horizon` is how many candles ahead the projected range covers.
const HORIZONS = [
  { id: "harian", label: "Harian", interval: "1h", horizon: 24, basis: "Candle 1 jam · proyeksi 24 jam" },
  { id: "mingguan", label: "Mingguan", interval: "1d", horizon: 7, basis: "Candle harian · proyeksi 7 hari" },
  { id: "bulanan", label: "Bulanan", interval: "1w", horizon: 4, basis: "Candle mingguan · proyeksi 4 minggu" },
] as const;

type Result = { outlook: Outlook | null } | { error: true };

const toneClass: Record<Signal, string> = { 1: "text-up", 0: "text-muted", [-1]: "text-down" };
const toneBg: Record<Signal, string> = { 1: "bg-up", 0: "bg-muted", [-1]: "bg-down" };
const arrow: Record<Signal, string> = { 1: "▲", 0: "◆", [-1]: "▼" };

function strengthText(strength: number, tone: Signal): string {
  if (tone === 0) return "Arah belum jelas";
  return strength >= 70 ? "Sinyal kuat" : strength >= 45 ? "Sinyal sedang" : "Sinyal lemah";
}

function Card({ label, basis, result }: { label: string; basis: string; result: Result | undefined }) {
  const o = result && "outlook" in result ? result.outlook : null;
  return (
    <div className="flex flex-col gap-3 rounded bg-base p-3">
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-[11px] text-muted">{basis}</div>
      </div>

      {!result && <p className="text-sm text-muted">Memuat…</p>}
      {result && "error" in result && <p className="text-sm text-down">Data gagal dimuat.</p>}
      {result && "outlook" in result && !o && (
        <p className="text-sm text-muted">Data historis belum cukup.</p>
      )}

      {o && (
        <>
          <div>
            <div className={`text-2xl font-bold ${toneClass[o.tone]}`}>
              {arrow[o.tone]} {o.direction}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {strengthText(o.strength, o.tone)} · {o.bullish} faktor naik, {o.bearish} faktor turun
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
              <div className={`h-full ${toneBg[o.tone]}`} style={{ width: `${Math.max(o.strength, 4)}%` }} />
            </div>
          </div>

          {o.warning && (
            <p className="rounded border border-yellow-600/40 bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-400">
              ⚠ {o.warning}
            </p>
          )}

          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <div>
              <dt className="text-[11px] text-muted">Support terdekat</dt>
              <dd className="font-mono text-up">${formatPrice(o.support)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">Resistance terdekat</dt>
              <dd className="font-mono text-down">${formatPrice(o.resistance)}</dd>
            </div>
            {o.rangeLow !== null && o.rangeHigh !== null && (
              <div className="col-span-2">
                <dt className="text-[11px] text-muted">Perkiraan rentang gerak (dari volatilitas)</dt>
                <dd className="font-mono">
                  ${formatPrice(Math.max(o.rangeLow, 0))} – ${formatPrice(o.rangeHigh)}
                </dd>
              </div>
            )}
          </dl>

          <ul className="flex flex-col gap-1 border-t border-line pt-2 text-[11px]">
            {o.factors.map((f) => (
              <li key={f.label} className="flex items-center gap-1.5">
                <span className={toneClass[f.tone]}>{arrow[f.tone]}</span>
                <span className="text-muted">{f.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function MarketDirection({ coin }: { coin: Coin }) {
  const hourly = useLiveCandles(coin.symbol, HORIZONS[0].interval);
  const daily = useLiveCandles(coin.symbol, HORIZONS[1].interval);
  const weekly = useLiveCandles(coin.symbol, HORIZONS[2].interval);
  const results = [hourly, daily, weekly].map((live, i): Result | undefined =>
    live.candles ? { outlook: outlook(live.candles, HORIZONS[i].horizon) } : live.error ? { error: true } : undefined,
  );


  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Arah Pasar: Harian, Mingguan, Bulanan</h2>
        <span className="text-xs text-muted">{coin.base}/USDT</span>
      </header>
      <div className="grid gap-2 p-3 md:grid-cols-3">
        {HORIZONS.map((h, i) => (
          <Card key={h.id} label={h.label} basis={h.basis} result={results[i]} />
        ))}
      </div>
      <div className="px-3 pb-3">
        <Explain info={DIRECTION} className="rounded bg-base p-2" />
        <p className="mt-2 text-[11px] leading-snug text-muted">
          Bukan ramalan pasti dan bukan saran keuangan. Berita besar dapat membalik arah kapan saja.
        </p>
      </div>
    </section>
  );
}
