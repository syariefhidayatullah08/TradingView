"use client";

import { BACKTEST_WINDOW } from "@/lib/backtest";
import { useLiveCandles } from "@/lib/live-candles";
import { lastSignal } from "@/lib/strategy-signals";
import { COINS, formatPrice, type Coin, type Timeframe } from "@/lib/symbols";
import { useStrategyTrades } from "@/lib/use-strategy-trades";
import SignalBadge from "./SignalBadge";

const HISTORY = 500;

function ago(time: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000));
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function SignalRow({
  coin,
  timeframe,
  active,
  onSelect,
}: {
  coin: Coin;
  timeframe: Timeframe;
  active: boolean;
  onSelect: (coin: Coin) => void;
}) {
  const live = useLiveCandles(coin.symbol, timeframe.binance);
  const candles = live.candles;
  const result = useStrategyTrades(coin.symbol, timeframe, candles);
  const cls = `cursor-pointer border-t border-line hover:bg-base ${active ? "bg-base" : ""}`;

  if (!candles || !result) {
    return (
      <tr className={cls} onClick={() => onSelect(coin)}>
        <td className="px-3 py-1.5 font-semibold">{coin.base}</td>
        <td colSpan={7} className={`px-2 py-1.5 ${live.error ? "text-down" : "text-muted"}`}>
          {live.error ? "Data gagal dimuat, mencoba lagi…" : "Menghitung…"}
        </td>
      </tr>
    );
  }

  const price = candles[candles.length - 1].close;
  const last = lastSignal(result);
  const since = last ? ((price - last.price) / last.price) * 100 : null;
  // Green when price moved the way the last signal hoped: up after a buy, down after a sell.
  const sinceGood = last && since !== null ? (last.type === "beli" ? since : -since) >= 0 : true;
  const closed = result.wins + result.losses;

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
      <td className="px-2 py-1.5 text-right">
        <SignalBadge symbol={coin.symbol} timeframe={timeframe} />
      </td>
      <td className="px-2 py-1.5">
        {last ? (
          <span className={`font-bold ${last.type === "beli" ? "text-up" : "text-down"}`} title={last.reason}>
            {last.type === "beli" ? "▲ BELI" : "▼ JUAL"}
            {last.netPct === null && <span className="ml-1 font-normal text-muted">dipegang</span>}
            {last.netPct !== null && (
              <span className={`ml-1 font-mono font-normal ${last.netPct >= 0 ? "text-up" : "text-down"}`}>
                {pct(last.netPct)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-muted">{last ? ago(last.time) : "—"}</td>
      <td className="px-2 py-1.5 text-right font-mono">{last ? `$${formatPrice(last.price)}` : "—"}</td>
      <td className={`px-2 py-1.5 text-right font-mono ${sinceGood ? "text-up" : "text-down"}`}>
        {since === null ? "—" : pct(since)}
      </td>
      <td className="px-3 py-1.5 text-right font-mono">
        {closed ? `${result.wins}/${closed}` : "—"}
        <span className={`ml-1 ${result.totalPct >= 0 ? "text-up" : "text-down"}`}>{pct(result.totalPct)}</span>
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
        <span className="text-xs text-muted">Candle {timeframe.label} · strategi aplikasi · klik koin untuk detail</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 text-left font-medium">Koin</th>
              <th className="px-2 py-2 text-right font-medium">Harga</th>
              <th className="px-2 py-2 text-right font-medium">Saran sekarang</th>
              <th className="px-2 py-2 text-left font-medium">Sinyal terakhir</th>
              <th className="px-2 py-2 text-left font-medium">Kapan</th>
              <th className="px-2 py-2 text-right font-medium">Harga sinyal</th>
              <th className="px-2 py-2 text-right font-medium">Sejak sinyal</th>
              <th className="px-3 py-2 text-right font-medium">Menang · hasil</th>
            </tr>
          </thead>
          <tbody>
            {COINS.map((coin) => (
              <SignalRow
                key={coin.symbol}
                coin={coin}
                timeframe={timeframe}
                active={coin.symbol === selected}
                onSelect={onSelect}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[11px] text-muted">
        Sinyal dari strategi yang sama dengan &ldquo;Mulai Trading&rdquo; dan pengaturan Anda. &ldquo;Saran
        sekarang&rdquo; = keputusan saat ini. &ldquo;Sinyal terakhir&rdquo; = beli yang masih dipegang (strategi menunggu target
        atau stop, walau saran sekarang bukan BELI lagi), atau jual terakhir beserta hasil bersihnya. &ldquo;Menang · hasil&rdquo; = transaksi untung dari yang selesai, dan
        hasil bersih total selama {HISTORY - BACKTEST_WINDOW} candle terakhir, biaya sudah dihitung.
      </p>
    </section>
  );
}
