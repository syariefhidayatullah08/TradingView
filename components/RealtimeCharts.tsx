"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, Signal } from "@/lib/indicators";
import { useLiveCandles } from "@/lib/live-candles";
import { outlook } from "@/lib/outlook";
import { detectSignals, type TradeSignal } from "@/lib/signals";
import { COINS, formatPrice, pricePrecision, type Coin, type Timeframe } from "@/lib/symbols";

const HISTORY = 500;
const COUNT_OPTIONS = [6, 12, COINS.length];

type Direction = { text: string; tone: Signal; strength: number };

const toneClass: Record<Signal, string> = {
  1: "bg-up/15 text-up",
  0: "bg-line text-muted",
  [-1]: "bg-down/15 text-down",
};
const arrow: Record<Signal, string> = { 1: "▲", 0: "◆", [-1]: "▼" };

const offset = new Date().getTimezoneOffset() * 60;
const toTime = (c: Candle) => (c.time / 1000 - offset) as UTCTimestamp;
const toBar = (c: Candle) => ({ time: toTime(c), open: c.open, high: c.high, low: c.low, close: c.close });

function sinceLabel(time: number): string {
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}

function sincePct(signal: TradeSignal, price: number): string {
  const pct = ((price - signal.price) / signal.price) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% sejak sinyal`;
}

function directionOf(candles: Candle[]): Direction | null {
  const o = outlook(candles, 1);
  return o ? { text: o.direction, tone: o.tone, strength: o.strength } : null;
}

type ChartRefs = {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  markers: ISeriesMarkersPluginApi<Time>;
  lastSignalTime: number;
  loaded: boolean;
};

function MiniChart({
  coin,
  timeframe,
  selected,
  onSelect,
}: {
  coin: Coin;
  timeframe: Timeframe;
  selected: boolean;
  onSelect: (coin: Coin) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const refs = useRef<ChartRefs | null>(null);
  const key = `${coin.symbol}:${timeframe.binance}`;
  const live = useLiveCandles(coin.symbol, timeframe.binance);
  const candles = live.candles;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#8f95c9", fontSize: 11 },
      grid: { vertLines: { color: "rgba(132,140,255,0.08)" }, horzLines: { color: "rgba(132,140,255,0.08)" } },
      rightPriceScale: { borderColor: "rgba(132,140,255,0.25)" },
      timeScale: { borderColor: "rgba(132,140,255,0.25)", timeVisible: true, secondsVisible: false },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#2ee59d",
      downColor: "#ff5c7a",
      wickUpColor: "#2ee59d",
      wickDownColor: "#ff5c7a",
      borderVisible: false,
    });
    refs.current = { chart, series, markers: createSeriesMarkers(series, []), lastSignalTime: -1, loaded: false };
    return () => {
      chart.remove();
      refs.current = null;
    };
  }, [key]);

  useEffect(() => {
    const r = refs.current;
    if (!r || !candles || candles.length === 0) return;
    const last = candles[candles.length - 1];
    if (!r.loaded) {
      const precision = pricePrecision(last.close);
      r.series.applyOptions({ priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision } });
      r.series.setData(candles.map(toBar));
      r.chart.timeScale().setVisibleLogicalRange({ from: candles.length - 150, to: candles.length + 2 });
      r.loaded = true;
    } else {
      r.series.update(toBar(last));
    }
    // Redraw buy/sell arrows only when a new signal appears.
    const signals = detectSignals(candles);
    const newest = signals[signals.length - 1]?.time ?? 0;
    if (newest !== r.lastSignalTime) {
      r.lastSignalTime = newest;
      const markers: SeriesMarker<Time>[] = signals.map((sg) => ({
        time: toTime(candles[sg.index]),
        position: sg.type === "beli" ? "belowBar" : "aboveBar",
        shape: sg.type === "beli" ? "arrowUp" : "arrowDown",
        color: sg.type === "beli" ? "#2ee59d" : "#ff5c7a",
        text: sg.type === "beli" ? "BELI" : "JUAL",
      }));
      r.markers.setMarkers(markers);
    }
  }, [candles]);

  const price = candles ? candles[candles.length - 1].close : undefined;
  const changePct = candles ? ((candles[candles.length - 1].close - candles[0].open) / candles[0].open) * 100 : 0;
  const direction = candles ? directionOf(candles) : null;
  const signals = candles ? detectSignals(candles) : [];
  const lastSignal = signals[signals.length - 1] ?? null;

  return (
    <section className={`panel overflow-hidden ${selected ? "border-accent" : ""}`}>
      <button
        onClick={() => onSelect(coin)}
        title="Buka di chart utama"
        className="flex w-full flex-col gap-1 border-b border-line px-3 py-2 text-left hover:bg-base"
      >
        <span className="flex w-full items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${live.live ? "animate-pulse bg-up" : "bg-muted"}`}
              aria-label={live.live ? "Terhubung real-time" : "Menghubungkan"}
            />
            <span className="text-sm font-semibold">{coin.base}</span>
            <span className="truncate text-[11px] text-muted">{coin.name}</span>
          </span>
          <span className="flex shrink-0 items-baseline gap-2 font-mono">
            {live.error && !candles ? (
              <span className="font-sans text-xs text-down">Gagal memuat, mencoba lagi…</span>
            ) : price === undefined ? (
              <span className="font-sans text-xs text-muted">Memuat…</span>
            ) : (
              <>
                <span className="text-sm font-semibold">${formatPrice(price)}</span>
                <span className={`text-xs ${changePct >= 0 ? "text-up" : "text-down"}`}>
                  {changePct >= 0 ? "+" : ""}
                  {changePct.toFixed(2)}%
                </span>
              </>
            )}
          </span>
        </span>
        {direction && (
          <span className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className={`rounded px-1.5 py-0.5 font-semibold ${toneClass[direction.tone]}`}>
              {arrow[direction.tone]} Arah: {direction.text}
            </span>
            <span className="text-muted">
              {direction.tone === 0 ? "belum jelas" : `kekuatan sinyal ${direction.strength}%`}
            </span>
            {lastSignal && price !== undefined && (
              <span
                className={`rounded px-1.5 py-0.5 font-semibold ${
                  lastSignal.type === "beli" ? "bg-up/15 text-up" : "bg-down/15 text-down"
                }`}
                title={lastSignal.reason}
              >
                {lastSignal.type === "beli" ? "▲ BELI" : "▼ JUAL"} {sinceLabel(lastSignal.time)} ·{" "}
                {sincePct(lastSignal, price)}
              </span>
            )}
          </span>
        )}
      </button>
      <div ref={ref} className="h-[400px] w-full" />
    </section>
  );
}

export default function RealtimeCharts({
  timeframe,
  selected,
  onSelect,
}: {
  timeframe: Timeframe;
  selected: string;
  onSelect: (coin: Coin) => void;
}) {
  const [count, setCount] = useState(12);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-xs text-muted">
          Candle {timeframe.label} · harga, arah, dan sinyal ▲ beli / ▼ jual diperbarui langsung dari Binance.
          Persentase = perubahan sepanjang {HISTORY} candle. Klik judul untuk membuka di chart utama.
        </p>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted">Tampilkan</span>
          {COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className={`rounded px-2 py-1 font-medium ${
                count === n ? "btn-active text-white" : "bg-panel text-muted hover:text-fg"
              }`}
            >
              {n === COINS.length ? `Semua (${n})` : `${n} koin`}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2 xl:grid-cols-2">
        {COINS.slice(0, count).map((coin) => (
          <MiniChart
            key={coin.symbol}
            coin={coin}
            timeframe={timeframe}
            selected={selected === coin.symbol}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
