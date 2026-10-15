"use client";

import type { Action } from "@/lib/decision";
import { SANTAI_COINS } from "@/lib/santai";
import type { ScanRow } from "@/lib/scan";
import { useSantai } from "@/lib/use-santai";
import { formatPrice, higherTimeframe, type Coin, type Timeframe } from "@/lib/symbols";

const actionStyle: Record<Action, { text: string; label: string; order: number }> = {
  beli: { text: "text-up", label: "▲ BELI", order: 0 },
  tunggu: { text: "text-amber-300", label: "⏸ TUNGGU", order: 1 },
  jangan: { text: "text-down", label: "✕ JANGAN", order: 2 },
};

// Best opportunities first: buys by confidence, then waits, then avoids by how weak they are.
function rank(a: ScanRow, b: ScanRow): number {
  if (!a.decision || !b.decision) return a.decision ? -1 : b.decision ? 1 : 0;
  const order = actionStyle[a.decision.action].order - actionStyle[b.decision.action].order;
  if (order !== 0) return order;
  const sign = a.decision.action === "jangan" ? 1 : -1;
  return sign * (a.decision.confidence - b.decision.confidence);
}

export default function ScannerPanel({
  rows,
  timeframe,
  selected,
  onSelect,
}: {
  rows: ScanRow[] | null;
  timeframe: Timeframe;
  selected: string;
  onSelect: (coin: Coin) => void;
}) {
  const { settings } = useSantai();
  // Mode Santai trades only its few coins, so the others are noise here.
  const shown = settings.enabled ? rows?.filter((r) => SANTAI_COINS.includes(r.coin.symbol)) : rows;
  const sorted = shown ? [...shown].sort(rank) : null;
  const buys = shown?.filter((r) => r.decision?.action === "beli").length ?? 0;
  const higher = higherTimeframe(timeframe);

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Pemindai Trading Semua Koin</h2>
        <span className="text-xs text-muted">
          Candle {timeframe.label}
          {higher && ` + tren ${higher.label}`} · real-time · klik koin untuk membuka chart
        </span>
      </header>

      {!sorted && <p className="p-4 text-sm text-muted">Memindai koin…</p>}
      {settings.enabled && (
        <p className="px-4 pt-3 text-xs text-muted">
          🌿 Mode Santai aktif: hanya BTC, ETH, dan BNB, dengan keyakinan minimal 50%.
        </p>
      )}

      {sorted && (
        <>
          <p className="px-4 pt-3 text-sm">
            {buys > 0 ? (
              <>
                <span className="font-semibold text-up">{buys} koin</span> layak dibeli sekarang.
              </>
            ) : (
              <span className="text-muted">Belum ada koin yang layak dibeli. Sabar, tunggu peluang berikutnya.</span>
            )}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 text-left font-medium">Koin</th>
                  <th className="px-2 py-2 text-right font-medium">Harga</th>
                  <th className="px-2 py-2 text-left font-medium">Keputusan</th>
                  <th className="px-2 py-2 text-left font-medium">Keyakinan</th>
                  <th className="px-2 py-2 text-left font-medium">Alasan utama</th>
                  <th className="px-2 py-2 text-right font-medium">Stop loss</th>
                  <th className="px-3 py-2 text-right font-medium">Target 1</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ coin, decision, live, error }) => (
                  <tr
                    key={coin.symbol}
                    onClick={() => onSelect(coin)}
                    className={`cursor-pointer border-t border-line hover:bg-base ${
                      coin.symbol === selected ? "bg-base" : ""
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-up" : "bg-muted"}`} />
                        <span className="font-semibold">{coin.base}</span>
                        <span className="text-muted">{coin.name}</span>
                      </span>
                    </td>
                    {decision ? (
                      <>
                        <td className="px-2 py-1.5 text-right font-mono">${formatPrice(decision.price)}</td>
                        <td className={`px-2 py-1.5 font-bold ${actionStyle[decision.action].text}`}>
                          {actionStyle[decision.action].label}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-12 overflow-hidden rounded-full bg-base">
                              <span
                                className={`block h-full ${
                                  decision.action === "beli"
                                    ? "bg-up"
                                    : decision.action === "jangan"
                                      ? "bg-down"
                                      : "bg-amber-300"
                                }`}
                                style={{ width: `${decision.confidence}%` }}
                              />
                            </span>
                            {decision.confidence}%
                          </span>
                        </td>
                        <td className="max-w-72 truncate px-2 py-1.5 text-muted" title={decision.headline}>
                          {decision.headline.replace(/^[^:]+:\s*/, "")}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-down">
                          {decision.plan ? `$${formatPrice(decision.plan.stop)}` : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-up">
                          {decision.plan ? `$${formatPrice(decision.plan.target1)}` : "—"}
                        </td>
                      </>
                    ) : (
                      <td colSpan={6} className={`px-2 py-1.5 ${error ? "text-down" : "text-muted"}`}>
                        {error ? "Data gagal dimuat, mencoba lagi…" : "Memuat…"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="px-4 py-2 text-[11px] text-muted">
        Memakai analisa yang sama dengan tombol &ldquo;Mulai Trading&rdquo;. Koin BELI diurutkan dari keyakinan
        tertinggi. Pilih koin, lalu tekan &ldquo;Mulai Trading&rdquo; untuk rencana lengkapnya. Bukan saran keuangan.
      </p>
    </section>
  );
}
