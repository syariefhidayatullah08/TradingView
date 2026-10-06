"use client";

import { useEffect, useState } from "react";
import { fetchCandles } from "@/lib/candles";
import { detectSignals, signalStats, type SignalStats } from "@/lib/signals";
import { COINS, formatPrice, type Coin, type Timeframe } from "@/lib/symbols";

const REFRESH_MS = 60_000;
const HISTORY = 500;

type Row = { coin: Coin; price: number; stats: SignalStats } | { coin: Coin; error: true };
type State = { key: string; rows?: Row[] };

function ago(time: number, now: number): string {
  const minutes = Math.round((now - time) / 60_000);
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}

export default function SignalsOverview({
  timeframe,
  selected,
  onSelect,
}: {
  timeframe: Timeframe;
  selected: string;
  onSelect: (coin: Coin) => void;
}) {
  const key = timeframe.binance;
  const [state, setState] = useState<State>({ key: "" });
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const rows = await Promise.all(
        COINS.map(async (coin): Promise<Row> => {
          try {
            const candles = await fetchCandles(coin.symbol, key, HISTORY);
            return { coin, price: candles[candles.length - 1].close, stats: signalStats(detectSignals(candles), candles) };
          } catch {
            return { coin, error: true };
          }
        }),
      );
      if (cancelled) return;
      setState({ key, rows });
      setLoadedAt(Date.now());
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [key]);

  const rows = state.key === key ? state.rows : undefined;

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Sinyal Beli/Jual Semua Koin</h2>
        <span className="text-xs text-muted">Candle {timeframe.label} · klik koin untuk detail</span>
      </header>
      {!rows && <p className="p-4 text-sm text-muted">Memuat sinyal 20 koin…</p>}
      {rows && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 text-left font-medium">Koin</th>
                <th className="px-2 py-2 text-right font-medium">Harga</th>
                <th className="px-2 py-2 text-left font-medium">Sinyal terakhir</th>
                <th className="px-2 py-2 text-left font-medium">Kapan</th>
                <th className="px-2 py-2 text-right font-medium">Harga sinyal</th>
                <th className="px-2 py-2 text-right font-medium">Sejak sinyal</th>
                <th className="px-3 py-2 text-right font-medium">Beli untung</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const active = row.coin.symbol === selected;
                const cls = `cursor-pointer border-t border-line hover:bg-base ${active ? "bg-base" : ""}`;
                if ("error" in row) {
                  return (
                    <tr key={row.coin.symbol} className={cls} onClick={() => onSelect(row.coin)}>
                      <td className="px-3 py-1.5 font-semibold">{row.coin.base}</td>
                      <td colSpan={6} className="px-2 py-1.5 text-down">
                        Data gagal dimuat
                      </td>
                    </tr>
                  );
                }
                const { stats, price } = row;
                const last = stats.last;
                const closed = stats.wins + stats.losses;
                const sinceGood = last && stats.sinceLastPct !== null
                  ? (last.type === "beli" ? stats.sinceLastPct : -stats.sinceLastPct) >= 0
                  : true;
                return (
                  <tr key={row.coin.symbol} className={cls} onClick={() => onSelect(row.coin)}>
                    <td className="px-3 py-1.5">
                      <span className="font-semibold">{row.coin.base}</span>{" "}
                      <span className="text-muted">{row.coin.name}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">${formatPrice(price)}</td>
                    <td className="px-2 py-1.5">
                      {last ? (
                        <span className={`font-bold ${last.type === "beli" ? "text-up" : "text-down"}`}>
                          {last.type === "beli" ? "▲ BELI" : "▼ JUAL"}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-muted">{last ? ago(last.time, loadedAt) : "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{last ? `$${formatPrice(last.price)}` : "—"}</td>
                    <td className={`px-2 py-1.5 text-right font-mono ${sinceGood ? "text-up" : "text-down"}`}>
                      {stats.sinceLastPct === null
                        ? "—"
                        : `${stats.sinceLastPct >= 0 ? "+" : ""}${stats.sinceLastPct.toFixed(2)}%`}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      {closed ? `${stats.wins}/${closed} (${Math.round((stats.wins / closed) * 100)}%)` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-4 py-2 text-[11px] text-muted">
        "Sejak sinyal" hijau berarti harga bergerak searah sinyal terakhir. "Beli untung" = pasangan beli→jual
        yang berakhir untung dari {HISTORY} candle terakhir, tanpa biaya transaksi.
      </p>
    </section>
  );
}
