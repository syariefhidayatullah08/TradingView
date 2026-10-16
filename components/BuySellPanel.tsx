"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { SIGNALS } from "@/lib/explanations";
import type { Candle } from "@/lib/indicators";
import { useLiveCandles } from "@/lib/live-candles";
import { BACKTEST_WINDOW, type BacktestResult } from "@/lib/backtest";
import { volumeSplit, type VolumeSplit } from "@/lib/signals";
import { INTERVAL_MS, lastSignal, tradeMarkers } from "@/lib/strategy-signals";
import { formatCompact, formatPrice, pricePrecision, type Coin, type Timeframe } from "@/lib/symbols";
import { useStrategyTrades } from "@/lib/use-strategy-trades";
import Explain from "./Explain";

const VOLUME_LOOKBACK = 24;

function when(time: number): string {
  return new Date(time).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

type ChartRefs = {
  chart: IChartApi;
  price: ISeriesApi<"Candlestick">;
  buyVolume: ISeriesApi<"Histogram">;
  sellVolume: ISeriesApi<"Histogram">;
  markers: ISeriesMarkersPluginApi<Time>;
  loaded: boolean;
};

const offset = new Date().getTimezoneOffset() * 60;
const toTime = (c: Candle) => (c.time / 1000 - offset) as UTCTimestamp;
const toBar = (c: Candle) => ({ time: toTime(c), open: c.open, high: c.high, low: c.low, close: c.close });

function SignalChart({
  candles,
  chartKey,
  result,
  intervalMs,
}: {
  candles: Candle[];
  chartKey: string;
  result: BacktestResult;
  intervalMs: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const refs = useRef<ChartRefs | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#8ea0c9", fontSize: 11 },
      grid: { vertLines: { color: "rgba(147,197,253,0.08)" }, horzLines: { color: "rgba(147,197,253,0.08)" } },
      rightPriceScale: { borderColor: "rgba(147,197,253,0.22)", scaleMargins: { top: 0.05, bottom: 0.3 } },
      timeScale: { borderColor: "rgba(147,197,253,0.22)", timeVisible: true, secondsVisible: false },
    });
    const price = chart.addSeries(CandlestickSeries, {
      upColor: "#34d399",
      downColor: "#fb7185",
      wickUpColor: "#34d399",
      wickDownColor: "#fb7185",
      borderVisible: false,
    });
    // Market-buy volume stacked under market-sell volume at the bottom of the chart.
    const volumeOptions = { priceFormat: { type: "volume" as const }, priceScaleId: "volume" };
    const sellVolume = chart.addSeries(HistogramSeries, { ...volumeOptions, color: "#fb718580" });
    const buyVolume = chart.addSeries(HistogramSeries, { ...volumeOptions, color: "#34d399" });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    refs.current = {
      chart,
      price,
      buyVolume,
      sellVolume,
      markers: createSeriesMarkers(price, []),
      loaded: false,
    };
    return () => {
      chart.remove();
      refs.current = null;
    };
  }, [chartKey]);

  useEffect(() => {
    const r = refs.current;
    if (!r || candles.length === 0) return;
    const last = candles[candles.length - 1];
    if (!r.loaded) {
      const precision = pricePrecision(last.close);
      r.price.applyOptions({ priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision } });
      r.price.setData(candles.map(toBar));
      r.sellVolume.setData(candles.map((c) => ({ time: toTime(c), value: c.volume })));
      r.buyVolume.setData(candles.map((c) => ({ time: toTime(c), value: c.takerBuyVolume ?? 0 })));
      r.chart.timeScale().setVisibleLogicalRange({ from: candles.length - 120, to: candles.length + 2 });
      r.loaded = true;
    } else {
      r.price.update(toBar(last));
      r.sellVolume.update({ time: toTime(last), value: last.volume });
      r.buyVolume.update({ time: toTime(last), value: last.takerBuyVolume ?? 0 });
    }
  }, [candles]);

  // Arrows from the real strategy, redrawn when its trades are recomputed (once per closed candle).
  useEffect(() => {
    const r = refs.current;
    if (!r || candles.length === 0) return;
    r.markers.setMarkers(tradeMarkers(result, intervalMs, candles[0].time));
    // candles is read only for its first time, which does not change between recomputes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, intervalMs]);

  return <div ref={ref} className="h-[360px] w-full" />;
}


const reasonText = { target: "target", stop: "stop loss", trail: "trailing", open: "masih dipegang" } as const;

export default function BuySellPanel({ coin, timeframe }: { coin: Coin; timeframe: Timeframe }) {
  const key = `${coin.symbol}:${timeframe.binance}`;
  const live = useLiveCandles(coin.symbol, timeframe.binance);
  const candles = live.candles;
  const result = useStrategyTrades(coin.symbol, timeframe, candles);

  let volume: VolumeSplit | null = null;
  if (candles && candles.length > 60) volume = volumeSplit(candles, VOLUME_LOOKBACK);
  const price = candles ? candles[candles.length - 1].close : 0;
  const last = result ? lastSignal(result) : null;
  const since = last ? ((price - last.price) / last.price) * 100 : null;
  const closedTrades = result ? result.wins + result.losses : 0;
  const testedCandles = candles ? Math.max(0, candles.length - BACKTEST_WINDOW) : 0;

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Sinyal Beli/Jual &amp; Volume</h2>
        <span className="flex items-center gap-2 text-xs text-muted">
          <span className={`h-2 w-2 rounded-full ${live.live ? "animate-pulse bg-up" : "bg-muted"}`} />
          {coin.base}/USDT · {timeframe.label}
        </span>
      </header>

      {!candles && !live.error && <p className="p-4 text-sm text-muted">Memuat sinyal…</p>}
      {live.error && <p className="p-4 text-sm text-down">Data sinyal gagal dimuat, mencoba lagi…</p>}
      {candles && !result && !live.error && <p className="p-4 text-sm text-muted">Menghitung sinyal strategi…</p>}

      {candles && result && (
        <div className="flex flex-col gap-4 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded bg-base p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted">Sinyal terakhir</div>
              {last ? (
                <>
                  <div className={`text-xl font-bold ${last.type === "beli" ? "text-up" : "text-down"}`}>
                    {last.type === "beli" ? "▲ BELI" : "▼ JUAL"}
                    {last.netPct !== null && (
                      <span className={`ml-2 text-sm ${last.netPct >= 0 ? "text-up" : "text-down"}`}>
                        {pct(last.netPct)} bersih
                      </span>
                    )}
                  </div>
                  <div className="text-xs">
                    {when(last.time)} di ${formatPrice(last.price)}
                  </div>
                  <div className="text-[11px] text-muted">{last.reason}</div>
                  {since !== null && (
                    <div
                      className={`mt-1 text-xs ${(last.type === "beli" ? since : -since) >= 0 ? "text-up" : "text-down"}`}
                    >
                      Harga sejak sinyal: {pct(since)}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted">Belum ada sinyal di {testedCandles} candle terakhir</div>
              )}
            </div>

            <div className="rounded bg-base p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted">Rekam jejak ({testedCandles} candle)</div>
              {closedTrades > 0 ? (
                <>
                  <div className="mt-1 text-xl font-bold">
                    {Math.round((result.wins / closedTrades) * 100)}%{" "}
                    <span className="text-xs font-normal text-muted">transaksi berakhir untung</span>
                  </div>
                  <div className="text-[11px] text-muted">
                    {result.wins} untung, {result.losses} rugi · hasil bersih total{" "}
                    <span className={result.totalPct >= 0 ? "text-up" : "text-down"}>{pct(result.totalPct)}</span>
                  </div>
                </>
              ) : (
                <div className="mt-1 text-sm text-muted">Belum ada transaksi yang selesai</div>
              )}
              <div className="mt-1 text-[11px] text-muted">
                Pembanding beli lalu tahan:{" "}
                <span className={result.buyHoldPct >= 0 ? "text-up" : "text-down"}>{pct(result.buyHoldPct)}</span>
              </div>
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

          <SignalChart candles={candles} chartKey={key} result={result} intervalMs={INTERVAL_MS[timeframe.binance]} />
          <p className="-mt-2 text-[11px] text-muted">
            ▲ BELI = strategi membeli. ▼ JUAL/STOP = strategi menjual, dengan hasil bersih setelah biaya (hijau untung,
            merah rugi). Batang di bawah: hijau = volume beli, merah = volume jual per candle.
          </p>

          {result.trades.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">Transaksi strategi terakhir</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] text-muted">
                    <th className="py-1 text-left font-medium">Beli</th>
                    <th className="py-1 text-left font-medium">Jual</th>
                    <th className="py-1 text-left font-medium">Sebab</th>
                    <th className="py-1 text-right font-medium">Hasil bersih</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades
                    .slice(-6)
                    .reverse()
                    .map((t) => (
                      <tr key={t.entryTime} className="border-t border-line font-mono">
                        <td className="py-1">
                          {when(t.entryTime)} · ${formatPrice(t.entryPrice)}
                        </td>
                        <td className="py-1">
                          {t.reason === "open" ? "sekarang" : when(t.exitTime)} · ${formatPrice(t.exitPrice)}
                        </td>
                        <td className="py-1 font-sans text-muted">{reasonText[t.reason]}</td>
                        <td className={`py-1 text-right ${t.netPct >= 0 ? "text-up" : "text-down"}`}>{pct(t.netPct)}</td>
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
