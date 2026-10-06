"use client";

import { useLiveCandles } from "@/lib/live-candles";
import { detectSignals, signalStats } from "@/lib/signals";
import { COINS, formatPrice, type Coin, type Timeframe } from "@/lib/symbols";

const HISTORY = 500;

function ago(time: number): string {
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}

function SignalRow({
  coin,
  interval,
  active,
  onSelect,
}: {
  coin: Coin;
  interval: string;
  active: boolean;
  onSelect: (coin: Coin) => void;
}) {
  const live = useLiveCandles(coin.symbol, interval);
  const cls = `cursor-pointer border-t border-line hover:bg-base ${active ? "bg-base" : ""}`;
  const candles = live.candles;

  if (!candles) {
    return (
      <tr className={cls} onClick={() => onSelect(coin)}>
        <td className="px-3 py-1.5 font-semibold">{coin.base}</td>
        <td colSpan={6} className={`px-2 py-1.5 ${live.error ? "text-down" : "text-muted"}`}>
          {live.error ? "Data gagal dimuat, mencoba lagi…" : "Memuat…"}
        </td>
      </tr>
    );
  }

  const stats = signalStats(detectSignals(candles), candles);
  const price = candles[candles.length - 1].close;
  const last = stats.last;
  const closed = stats.wins + stats.losses;
  const sinceGood =
    last && stats.sinceLastPct !== null
      ? (last.type === "beli" ? stats.sinceLastPct : -stats.sinceLastPct) >= 0
      : true;

  return (
    <tr className={cls} onClick={() => onSelect(coin)}>
      <td className="px-3 py-1.5">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${live.live ? "bg-up" : "bg-muted"}`} />
          <span className="font-semibold">{coin.base}</span>
          <span className="text-muted">{coin.name}</span>
        </span>
      </td>
      <td className="px-2 py-1.5 text-right font-mono">${formatPrice(price)}</td>
      <td className="px-2 py-1.5">
        {last ? (
          <span className={`font-bold ${last.type === "beli" ? "text-up" : "text-down"}`} title={last.reason}>
            {last.type === "beli" ? "▲ BELI" : "▼ JUAL"}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-muted">{last ? ago(last.time) : "—"}</td>
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
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Sinyal Beli/Jual Semua Koin</h2>
        <span className="text-xs text-muted">Candle {timeframe.label} · real-time · klik koin untuk detail</span>
      </header>
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
            {COINS.map((coin) => (
              <SignalRow
                key={coin.symbol}
                coin={coin}
                interval={timeframe.binance}
                active={coin.symbol === selected}
                onSelect={onSelect}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[11px] text-muted">
        &ldquo;Sejak sinyal&rdquo; hijau berarti harga bergerak searah sinyal terakhir. &ldquo;Beli untung&rdquo; =
        pasangan beli→jual yang berakhir untung dari {HISTORY} candle terakhir, tanpa biaya transaksi.
      </p>
    </section>
  );
}
