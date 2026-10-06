"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";
import { fetchCandles } from "@/lib/candles";
import type { Candle, Signal } from "@/lib/indicators";
import { outlook } from "@/lib/outlook";
import { detectSignals, type TradeSignal } from "@/lib/signals";
import {
  BINANCE_WS,
  COINS,
  formatPrice,
  pricePrecision,
  type Coin,
  type Timeframe,
} from "@/lib/symbols";

// Enough candles for EMA 200 to settle, so the direction badge uses every factor.
const HISTORY = 300;
const RETRY_MS = 4000;
const COUNT_OPTIONS = [6, 12, COINS.length];

type Direction = { text: string; tone: Signal; strength: number };

type Quote = {
  key: string;
  price?: number;
  changePct?: number;
  direction?: Direction | null;
  lastSignal?: TradeSignal | null;
  live?: boolean;
  error?: boolean;
};

const toneClass: Record<Signal, string> = {
  1: "bg-up/15 text-up",
  0: "bg-line text-muted",
  [-1]: "bg-down/15 text-down",
};
const arrow: Record<Signal, string> = { 1: "▲", 0: "◆", [-1]: "▼" };

function sinceLabel(time: number): string {
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}

function sincePct(signal: TradeSignal, price: number | undefined): string {
  if (price === undefined) return "";
  const pct = ((price - signal.price) / signal.price) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% sejak sinyal`;
}

function directionOf(candles: Candle[]): Direction | null {
  const o = outlook(candles, 1);
  return o ? { text: o.direction, tone: o.tone, strength: o.strength } : null;
}

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
  const key = `${coin.symbol}:${timeframe.binance}`;
  const [quote, setQuote] = useState<Quote>({ key: "" });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#787b86", fontSize: 11 },
      grid: { vertLines: { color: "#1e222d" }, horzLines: { color: "#1e222d" } },
      rightPriceScale: { borderColor: "#2a2e39" },
      timeScale: { borderColor: "#2a2e39", timeVisible: true, secondsVisible: false },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      borderVisible: false,
    });

    // The chart renders timestamps as UTC, so shift them to show local time.
    const offset = new Date().getTimezoneOffset() * 60;
    const toBar = (c: Candle) => ({
      time: (c.time / 1000 - offset) as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    });

    let disposed = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let candles: Candle[] = [];
    const markers = createSeriesMarkers(series, []);
    let lastSignalTime = -1;

    // Redraw buy/sell arrows only when a new signal appears, and report the latest one.
    function updateSignals(): TradeSignal | null {
      const signals = detectSignals(candles);
      const last = signals[signals.length - 1] ?? null;
      if ((last?.time ?? 0) !== lastSignalTime) {
        lastSignalTime = last?.time ?? 0;
        const list: SeriesMarker<UTCTimestamp>[] = signals.map((sg) => ({
          time: toBar(candles[sg.index]).time,
          position: sg.type === "beli" ? "belowBar" : "aboveBar",
          shape: sg.type === "beli" ? "arrowUp" : "arrowDown",
          color: sg.type === "beli" ? "#26a69a" : "#ef5350",
          text: sg.type === "beli" ? "BELI" : "JUAL",
        }));
        markers.setMarkers(list);
      }
      return last;
    }

    function publish(live: boolean) {
      const price = candles[candles.length - 1].close;
      const baseline = candles[0].open;
      setQuote({
        key,
        price,
        changePct: ((price - baseline) / baseline) * 100,
        direction: directionOf(candles),
        lastSignal: updateSignals(),
        live,
      });
    }

    function connect() {
      if (disposed) return;
      ws = new WebSocket(`${BINANCE_WS}/${coin.symbol.toLowerCase()}@kline_${timeframe.binance}`);
      ws.onopen = () => setQuote((q) => (q.key === key ? { ...q, live: true } : q));
      ws.onmessage = (ev) => {
        const k = JSON.parse(ev.data).k;
        if (!k) return;
        const candle: Candle = {
          time: Number(k.t),
          open: Number(k.o),
          high: Number(k.h),
          low: Number(k.l),
          close: Number(k.c),
          volume: Number(k.v),
          takerBuyVolume: Number(k.V),
        };
        const lastTime = candles[candles.length - 1].time;
        if (candle.time < lastTime) return;
        if (candle.time === lastTime) candles[candles.length - 1] = candle;
        else candles = [...candles.slice(1), candle];
        series.update(toBar(candle));
        publish(true);
      };
      ws.onerror = () => ws?.close();
      ws.onclose = () => {
        if (disposed) return;
        setQuote((q) => (q.key === key ? { ...q, live: false } : q));
        retry = setTimeout(connect, RETRY_MS);
      };
    }

    async function start() {
      try {
        const history = await fetchCandles(coin.symbol, timeframe.binance, HISTORY);
        if (disposed) return;
        if (history.length === 0) throw new Error("Tidak ada data");
        candles = history;
        const precision = pricePrecision(candles[candles.length - 1].close);
        series.applyOptions({
          priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision },
        });
        series.setData(candles.map(toBar));
        chart.timeScale().fitContent();
        publish(false);
        connect();
      } catch {
        if (disposed) return;
        setQuote({ key, error: true });
        retry = setTimeout(start, RETRY_MS);
      }
    }
    start();

    return () => {
      disposed = true;
      clearTimeout(retry);
      ws?.close();
      chart.remove();
    };
  }, [key, coin.symbol, timeframe.binance]);

  const q = quote.key === key ? quote : null;
  const up = (q?.changePct ?? 0) >= 0;

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
              className={`h-2 w-2 shrink-0 rounded-full ${q?.live ? "animate-pulse bg-up" : "bg-muted"}`}
              aria-label={q?.live ? "Terhubung real-time" : "Menghubungkan"}
            />
            <span className="text-sm font-semibold">{coin.base}</span>
            <span className="truncate text-[11px] text-muted">{coin.name}</span>
          </span>
          <span className="flex shrink-0 items-baseline gap-2 font-mono">
            {q?.error ? (
              <span className="font-sans text-xs text-down">Gagal memuat, mencoba lagi…</span>
            ) : q?.price === undefined ? (
              <span className="font-sans text-xs text-muted">Memuat…</span>
            ) : (
              <>
                <span className="text-sm font-semibold">${formatPrice(q.price)}</span>
                {q.changePct !== undefined && (
                  <span className={`text-xs ${up ? "text-up" : "text-down"}`}>
                    {up ? "+" : ""}
                    {q.changePct.toFixed(2)}%
                  </span>
                )}
              </>
            )}
          </span>
        </span>
        {q?.direction && (
          <span className="flex items-center gap-2 text-[11px]">
            <span className={`rounded px-1.5 py-0.5 font-semibold ${toneClass[q.direction.tone]}`}>
              {arrow[q.direction.tone]} Arah: {q.direction.text}
            </span>
            <span className="text-muted">
              {q.direction.tone === 0 ? "belum jelas" : `kekuatan sinyal ${q.direction.strength}%`}
            </span>
            {q.lastSignal && (
              <span
                className={`rounded px-1.5 py-0.5 font-semibold ${
                  q.lastSignal.type === "beli" ? "bg-up/15 text-up" : "bg-down/15 text-down"
                }`}
                title={q.lastSignal.reason}
              >
                {q.lastSignal.type === "beli" ? "▲ BELI" : "▼ JUAL"} {sinceLabel(q.lastSignal.time)} ·{" "}
                {sincePct(q.lastSignal, q.price)}
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
          Candle {timeframe.label} · harga, arah, dan sinyal ▲ beli / ▼ jual diperbarui langsung dari Binance. Persentase =
          perubahan sepanjang {HISTORY} candle. Klik judul untuk membuka di chart utama.
        </p>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted">Tampilkan</span>
          {COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className={`rounded px-2 py-1 font-medium ${
                count === n ? "bg-accent text-white" : "bg-panel text-muted hover:text-fg"
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
