"use client";

import { useEffect, useState } from "react";
import {
  assess,
  fetchFundamentals,
  fetchGlobal,
  fundamentalLabel,
  type Fundamentals,
  type GlobalMarket,
} from "@/lib/fundamentals";
import type { Signal } from "@/lib/indicators";
import { formatCompact, formatPrice, type Coin } from "@/lib/symbols";

type State = { key: string; data?: Fundamentals; global?: GlobalMarket | null; error?: string };

const toneClass: Record<Signal, string> = {
  1: "text-up",
  0: "text-muted",
  [-1]: "text-down",
};
const toneText: Record<Signal, string> = { 1: "Positif", 0: "Netral", [-1]: "Negatif" };

function usd(n: number | null): string {
  return n === null ? "—" : `$${formatCompact(n)}`;
}

function date(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function FundamentalPanel({ coin }: { coin: Coin }) {
  const [state, setState] = useState<State>({ key: "" });

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchFundamentals(coin.gecko), fetchGlobal().catch(() => null)])
      .then(([data, global]) => !cancelled && setState({ key: coin.gecko, data, global }))
      .catch(
        (e) =>
          !cancelled &&
          setState({ key: coin.gecko, error: e instanceof Error ? e.message : "Gagal memuat data" }),
      );
    return () => {
      cancelled = true;
    };
  }, [coin.gecko]);

  const current = state.key === coin.gecko ? state : null;
  const f = current?.data;
  const result = f ? assess(f) : null;
  const verdict = result ? fundamentalLabel(result.score) : null;
  const g = current?.global;

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Analisa Fundamental</h2>
        <span className="text-xs text-muted">
          {coin.name} ({coin.base})
        </span>
      </header>

      {!current && <p className="p-4 text-sm text-muted">Memuat data fundamental…</p>}
      {current?.error && (
        <p className="p-4 text-sm text-down">Data fundamental gagal dimuat ({current.error}).</p>
      )}

      {f && result && verdict && (
        <div className="grid gap-5 p-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted">Penilaian fundamental</div>
                <div className={`text-xl font-bold ${toneClass[verdict.tone]}`}>{verdict.text}</div>
              </div>
              <div className="text-right text-xs text-muted">
                {result.points.filter((p) => p.tone === 1).length} positif ·{" "}
                {result.points.filter((p) => p.tone === 0).length} netral ·{" "}
                {result.points.filter((p) => p.tone === -1).length} negatif
              </div>
            </div>

            <table className="w-full text-sm">
              <tbody>
                {result.points.map((p) => (
                  <tr key={p.label} className="border-t border-line">
                    <td className="py-1.5 pr-2">
                      <div>{p.label}</div>
                      <div className="text-[11px] text-muted">{p.note}</div>
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono text-xs">{p.value}</td>
                    <td className={`w-16 py-1.5 text-right text-xs font-semibold ${toneClass[p.tone]}`}>
                      {toneText[p.tone]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="text-[11px] leading-snug text-muted">
              Penilaian dihitung otomatis dari data pasar dan bukan saran keuangan.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              {(
                [
                  ["Kapitalisasi pasar", usd(f.marketCap)],
                  ["Valuasi terdilusi (FDV)", usd(f.fdv)],
                  ["Volume 24 jam", usd(f.volume)],
                  ["Suplai beredar", f.circulating === null ? "—" : formatCompact(f.circulating)],
                  ["Suplai total", f.totalSupply === null ? "—" : formatCompact(f.totalSupply)],
                  ["Suplai maksimum", f.maxSupply === null ? "Tidak ada" : formatCompact(f.maxSupply)],
                  ["ATH", f.ath === null ? "—" : `$${formatPrice(f.ath)}`],
                  ["Tanggal ATH", date(f.athDate)],
                  ["ATL", f.atl === null ? "—" : `$${formatPrice(f.atl)}`],
                  ["Kinerja 7 hari", f.change7d === null ? "—" : `${f.change7d.toFixed(1)}%`],
                  ["Diluncurkan", date(f.genesisDate)],
                  ["Algoritma", f.algorithm ?? "—"],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] text-muted">{label}</dt>
                  <dd className="font-mono text-xs">{value}</dd>
                </div>
              ))}
            </dl>

            {g && (
              <div className="rounded bg-base p-3">
                <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">
                  Kondisi pasar crypto global
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-[11px] text-muted">Total kapitalisasi</dt>
                    <dd className="font-mono text-xs">${formatCompact(g.totalMarketCap)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted">Perubahan 24j</dt>
                    <dd className={`font-mono text-xs ${g.change24h >= 0 ? "text-up" : "text-down"}`}>
                      {g.change24h >= 0 ? "+" : ""}
                      {g.change24h.toFixed(2)}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted">Dominasi BTC</dt>
                    <dd className="font-mono text-xs">{g.btcDominance.toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted">Dominasi ETH</dt>
                    <dd className="font-mono text-xs">{g.ethDominance.toFixed(1)}%</dd>
                  </div>
                </dl>
              </div>
            )}

            {f.categories.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {f.categories.slice(0, 6).map((c) => (
                  <span key={c} className="rounded bg-base px-1.5 py-0.5 text-[11px] text-muted">
                    {c}
                  </span>
                ))}
              </div>
            )}

            {f.description && (
              <p className="text-xs leading-relaxed text-muted">
                {f.description.length > 420 ? `${f.description.slice(0, 420)}…` : f.description}
              </p>
            )}

            {f.homepage && (
              <a
                href={f.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent-soft hover:underline"
              >
                Situs resmi ↗
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
