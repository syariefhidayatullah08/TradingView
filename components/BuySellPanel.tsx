"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";
import { fetchCandles } from "@/lib/candles";
import { SIGNALS } from "@/lib/explanations";
import type { Candle } from "@/lib/indicators";
import { detectSignals, signalStats, volumeSplit, type SignalStats, type VolumeSplit } from "@/lib/signals";
import { formatCompact, formatPrice, pricePrecision, type Coin, type Timeframe } from "@/lib/symbols";
import Explain from "./Explain";

const REFRESH_MS = 30_000;
const HISTORY = 500;
const VOLUME_LOOKBACK = 24;

type State = { key: string; candles?: Candle[]; error?: boolean };

function when(time: number): string {
  return new Date(time).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function SignalChart({ candles }: { candles: Candle[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || candles.length === 0) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#787b86", fontSize: 11 },
      grid: { vertLines: { color: "#1e222d" }, horzLines: { color: "#1e222d" } },
      rightPriceScale: { borderColor: "#2a2e39", scaleMargins: { top: 0.05, bottom: 0.3 } },
      timeScale: { borderColor: "#2a2e39", timeVisible: true, secondsVisible: false },
    });
    const offset = new Date().getTimezoneOffset() * 60;
    const t = (c: Candle) => (c.time / 1000 - offset) as UTCTimestamp;
    const precision = pricePrecision(candles[candles.length - 1].close);

    const price = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      borderVisible: false,
      priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision },
    });
    price.setData(candles.map((c) => ({ time: t(c), open: c.open, high: c.high, low: c.low, close: c.close })));

    // Market-buy volume stacked under market-sell volume at the bottom of the chart.
    const volumeOptions = { priceFormat: { type: "volume" as const }, priceScaleId: "volume" };
    const sellVolume = chart.addSeries(HistogramSeries, { ...volumeOptions, color: "#ef535080" });
    const buyVolume = chart.addSeries(HistogramSeries, { ...volumeOptions, color: "#26a69a" });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    sellVolume.setData(candles.map((c) => ({ time: t(c), value: c.volume })));
    buyVolume.setData(candles.map((c) => ({ time: t(c), value: c.takerBuyVolume ?? 0 })));

    const markers: SeriesMarker<UTCTimestamp>[] = detectSignals(candles).map((s) => ({
      time: t(candles[s.index]),
      position: s.type === "beli" ? "belowBar" : "aboveBar",
      shape: s.type === "beli" ? "arrowUp" : "arrowDown",
      color: s.type === "beli" ? "#26a69a" : "#ef5350",
      text: s.type === "beli" ? "BELI" : "JUAL",
    }));
    createSeriesMarkers(price, markers);
    chart.timeScale().setVisibleLogicalRange({ from: candles.length - 120, to: candles.length + 2 });

    return () => chart.remove();
  }, [candles]);

  return <div ref={ref} className="h-[360px] w-full" />;
}

export default function BuySellPanel({ coin, timeframe }: { coin: Coin; timeframe: Timeframe }) {
  const key = `${coin.symbol}:${timeframe.binance}`;
  const [state, setState] = useState<State>({ key: "" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const candles = await fetchCandles(coin.symbol, timeframe.binance, HISTORY);
        if (!cancelled) setState({ key, candles });
      } catch {
        if (!cancelled) setState((prev) => (prev.key === key && prev.candles ? prev : { key, error: true }));
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
  const candles = current?.candles;
  let stats: SignalStats | null = null;
  let volume: VolumeSplit | null = null;
  if (candles && candles.length > 60) {
    stats = signalStats(detectSignals(candles), candles);
    volume = volumeSplit(candles, VOLUME_LOOKBACK);
  }
  const closedTrades = stats ? stats.wins + stats.losses : 0;

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Sinyal Beli/Jual &amp; Volume</h2>
        <span className="text-xs text-muted">
          {coin.base}/USDT · {timeframe.label}
        </span>
      </header>

      {!current && <p className="p-4 text-sm text-muted">Memuat sinyal…</p>}
      {current?.error && <p className="p-4 text-sm text-down">Data sinyal gagal dimuat.</p>}

      {candles && stats && (
        <div className="flex flex-col gap-4 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded bg-base p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted">Sinyal terakhir</div>
              {stats.last ? (
                <>
                  <div className={`text-xl font-bold ${stats.last.type === "beli" ? "text-up" : "text-down"}`}>
                    {stats.last.type === "beli" ? "▲ BELI" : "▼ JUAL"}
                  </div>
                  <div className="text-xs">
                    {when(stats.last.time)} di ${formatPrice(stats.last.price)}
                  </div>
                  <div className="text-[11px] text-muted">{stats.last.reason}</div>
                  {stats.sinceLastPct !== null && (
                    <div
                      className={`mt-1 text-xs ${
                        (stats.last.type === "beli" ? stats.sinceLastPct : -stats.sinceLastPct) >= 0
                          ? "text-up"
                          : "text-down"
                      }`}
                    >
                      Harga sejak sinyal: {pct(stats.sinceLastPct)}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted">Belum ada sinyal</div>
              )}
            </div>

            <div className="rounded bg-base p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted">
                Rekam jejak ({HISTORY} candle)
              </div>
              <div className="mt-1 text-xs">
                <span className="text-up">{stats.buys} sinyal beli</span> ·{" "}
                <span className="text-down">{stats.sells} sinyal jual</span>
              </div>
              {closedTrades > 0 ? (
                <>
                  <div className="mt-1 text-xl font-bold">
                    {Math.round((stats.wins / closedTrades) * 100)}%{" "}
                    <span className="text-xs font-normal text-muted">beli yang berakhir untung</span>
                  </div>
                  <div className="text-[11px] text-muted">
                    {stats.wins} untung, {stats.losses} rugi · rata-rata {pct(stats.avgReturnPct ?? 0)} per
                    transaksi beli→jual
                  </div>
                </>
              ) : (
                <div className="mt-1 text-sm text-muted">Belum ada pasangan beli→jual</div>
              )}
            </div>

            <div className="rounded bg-base p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted">
                Volume beli vs jual ({VOLUME_LOOKBACK} candle)
              </div>
              {volume ? (
                <>
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-up">
                      Beli {formatCompact(volume.buy)} {coin.base} ({Math.round(volume.buyShare * 100)}%)
                    </span>
                    <span className="text-down">
                      Jual {formatCompact(volume.sell)} {coin.base} ({Math.round((1 - volume.buyShare) * 100)}%)
                    </span>
                  </div>
                  <div className="mt-2 flex h-2.5 overflow-hidden rounded-full">
                    <div className="bg-up" style={{ width: `${volume.buyShare * 100}%` }} />
                    <div className="flex-1 bg-down" />
                  </div>
                  <div className="mt-1 text-[11px] text-muted">
                    {volume.buyShare > 0.52
                      ? "Pembeli lebih agresif"
                      : volume.buyShare < 0.48
                        ? "Penjual lebih agresif"
                        : "Beli dan jual berimbang"}
                  </div>
                </>
              ) : (
                <div className="mt-1 text-sm text-muted">Data volume tidak tersedia</div>
              )}
            </div>
          </div>

          <SignalChart candles={candles} />
          <p className="-mt-2 text-[11px] text-muted">
            ▲ hijau = sinyal beli, ▼ merah = sinyal jual. Batang di bawah: hijau = volume beli, merah = volume
            jual per candle. Geser chart untuk melihat sinyal lebih lama.
          </p>

          {stats.trades.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">Transaksi beli→jual terakhir</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] text-muted">
                    <th className="py-1 text-left font-medium">Beli</th>
                    <th className="py-1 text-left font-medium">Jual</th>
                    <th className="py-1 text-right font-medium">Hasil</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.trades
                    .slice(-6)
                    .reverse()
                    .map((tr) => (
                      <tr key={tr.buy.time} className="border-t border-line font-mono">
                        <td className="py-1">
                          {when(tr.buy.time)} · ${formatPrice(tr.buy.price)}
                        </td>
                        <td className="py-1">
                          {tr.sell ? `${when(tr.sell.time)} · $${formatPrice(tr.sell.price)}` : "masih terbuka"}
                        </td>
                        <td className={`py-1 text-right ${tr.returnPct >= 0 ? "text-up" : "text-down"}`}>
                          {pct(tr.returnPct)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          <Explain info={SIGNALS} className="rounded bg-base p-2" />
        </div>
      )}
    </section>
  );
}
