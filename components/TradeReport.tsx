"use client";

import { buildReport, tradeResult, type ClosedTrade } from "@/lib/positions";
import { COINS, formatPrice } from "@/lib/symbols";

function when(time: number): string {
  return time
    ? new Date(time).toLocaleString("id-ID", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";
}

function usd(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TradeReport({
  trades,
  onDelete,
  onClear,
}: {
  trades: ClosedTrade[];
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const report = buildReport(trades);
  const winRate = report.wins + report.losses ? Math.round((report.wins / (report.wins + report.losses)) * 100) : null;

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Laporan Untung Rugi</h2>
        <span className="text-xs text-muted">{report.count} transaksi selesai</span>
      </header>
      <div className="flex flex-col gap-3 p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <div className="rounded bg-base p-3">
            <div className="text-[11px] text-muted">Total untung</div>
            <div className="font-mono text-lg font-semibold text-up">{usd(report.profit)}</div>
          </div>
          <div className="rounded bg-base p-3">
            <div className="text-[11px] text-muted">Total rugi</div>
            <div className="font-mono text-lg font-semibold text-down">{usd(-report.loss)}</div>
          </div>
          <div className="rounded bg-base p-3">
            <div className="text-[11px] text-muted">Bersih</div>
            <div className={`font-mono text-lg font-semibold ${report.net >= 0 ? "text-up" : "text-down"}`}>
              {usd(report.net)}
            </div>
          </div>
          <div className="rounded bg-base p-3">
            <div className="text-[11px] text-muted">Menang / kalah</div>
            <div className="font-mono text-lg font-semibold">
              <span className="text-up">{report.wins}</span> / <span className="text-down">{report.losses}</span>
              {winRate !== null && <span className="ml-1 text-xs font-normal text-muted">({winRate}%)</span>}
            </div>
          </div>
          <div className="rounded bg-base p-3">
            <div className="text-[11px] text-muted">Rata-rata per transaksi</div>
            <div className={`font-mono text-lg font-semibold ${(report.avgPct ?? 0) >= 0 ? "text-up" : "text-down"}`}>
              {report.avgPct === null ? "—" : `${report.avgPct >= 0 ? "+" : ""}${report.avgPct.toFixed(2)}%`}
            </div>
          </div>
        </div>
        {report.valued < report.count && (
          <p className="text-[11px] text-muted">
            Nilai dolar hanya dihitung dari {report.valued} transaksi yang mencantumkan jumlah koin; sisanya hanya
            masuk hitungan persentase.
          </p>
        )}

        {trades.length === 0 ? (
          <p className="text-sm text-muted">
            Belum ada transaksi selesai. Saat posisi dijual, catat harga jualnya di kartu posisi dan hasilnya masuk ke
            sini.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-2 py-2 text-left font-medium">Koin</th>
                  <th className="px-2 py-2 text-left font-medium">Beli</th>
                  <th className="px-2 py-2 text-left font-medium">Jual</th>
                  <th className="px-2 py-2 text-right font-medium">Jumlah</th>
                  <th className="px-2 py-2 text-right font-medium">Hasil</th>
                  <th className="px-2 py-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => {
                  const r = tradeResult(t);
                  const base = COINS.find((c) => c.symbol === t.symbol)?.base ?? t.symbol;
                  return (
                    <tr key={t.id} className="border-t border-line">
                      <td className="px-2 py-1.5 font-semibold">{base}</td>
                      <td className="px-2 py-1.5 font-mono">
                        ${formatPrice(t.entryPrice)} <span className="text-muted">{when(t.entryTime)}</span>
                      </td>
                      <td className="px-2 py-1.5 font-mono">
                        ${formatPrice(t.exitPrice)} <span className="text-muted">{when(t.exitTime)}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">{t.amount ?? "—"}</td>
                      <td className={`px-2 py-1.5 text-right font-mono ${r.pnlPct >= 0 ? "text-up" : "text-down"}`}>
                        {r.pnlPct >= 0 ? "+" : ""}
                        {r.pnlPct.toFixed(2)}%{r.pnlValue !== null && <div>{usd(r.pnlValue)}</div>}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          onClick={() => onDelete(t.id)}
                          className="rounded border border-line px-2 py-0.5 text-[11px] text-muted hover:bg-base hover:text-fg"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {trades.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted">
              Maksimal 50 transaksi tersimpan; yang paling lama terhapus otomatis saat penuh.
            </p>
            <button
              onClick={() => {
                if (window.confirm("Hapus seluruh riwayat transaksi? Tidak bisa dibatalkan.")) onClear();
              }}
              className="rounded border border-down/50 px-2.5 py-1 text-[11px] font-medium text-down hover:bg-down/10"
            >
              Hapus semua riwayat
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
