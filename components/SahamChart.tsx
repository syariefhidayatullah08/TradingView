"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { emaSeries, type Candle } from "@/lib/indicators";
import { STOCKS } from "@/lib/saham";
import { useSahamChart } from "@/lib/use-saham-chart";

const TFS = [
  { id: "1m", label: "1m" },
  { id: "5m", label: "5m" },
  { id: "15m", label: "15m" },
  { id: "1h", label: "1J" },
  { id: "1d", label: "1H" },
  { id: "1wk", label: "1M" },
] as const;
type Tf = (typeof TFS)[number]["id"];

// Chart axes show Jakarta time whatever the viewer's own timezone is.
const toTime = (ms: number) => (ms / 1000 + 7 * 3600) as UTCTimestamp;

type Refs = {
  chart: IChartApi;
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  ema20: ISeriesApi<"Line">;
  ema50: ISeriesApi<"Line">;
};

function draw(r: Refs, candles: Candle[], fit: boolean) {
  r.candles.setData(
    candles.map((c) => ({ time: toTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close })),
  );
  r.volume.setData(
    candles.map((c) => ({
      time: toTime(c.time),
      value: c.volume,
      color: c.close >= c.open ? "rgba(52,211,153,0.35)" : "rgba(251,113,133,0.35)",
    })),
  );
  const closes = candles.map((c) => c.close);
  for (const [series, period] of [
    [r.ema20, 20],
    [r.ema50, 50],
  ] as const) {
    const e = emaSeries(closes, period);
    series.setData(
      candles.flatMap((c, i) => (Number.isNaN(e[i]) ? [] : [{ time: toTime(c.time), value: e[i] }])),
    );
  }
  if (fit) r.chart.timeScale().setVisibleLogicalRange({ from: candles.length - 160, to: candles.length + 3 });
}

export default function SahamChart({ code, onCode }: { code: string; onCode: (code: string) => void }) {
  const [tf, setTf] = useState<Tf>("5m");
  const { data, error, session, key } = useSahamChart(code, tf);
  const [input, setInput] = useState("");
  const el = useRef<HTMLDivElement>(null);
  const refs = useRef<Refs | null>(null);
  const fitted = useRef("");

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const chart = createChart(node, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#8ea0c9", fontSize: 11 },
      grid: {
        vertLines: { color: "rgba(147,197,253,0.08)" },
        horzLines: { color: "rgba(147,197,253,0.08)" },
      },
      rightPriceScale: { borderColor: "rgba(147,197,253,0.22)", scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderColor: "rgba(147,197,253,0.22)", timeVisible: true, secondsVisible: false },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#34d399",
      downColor: "#fb7185",
      wickUpColor: "#34d399",
      wickDownColor: "#fb7185",
      borderVisible: false,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });
    const volume = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" } });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const line = {
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    } as const;
    const ema20 = chart.addSeries(LineSeries, { ...line, color: "#fbbf24" });
    const ema50 = chart.addSeries(LineSeries, { ...line, color: "#a5b4fc" });
    refs.current = { chart, candles, volume, ema20, ema50 };
    return () => {
      chart.remove();
      refs.current = null;
    };
  }, []);

  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    if (!data?.candles.length) {
      // Don't leave the previous symbol's candles on screen under the new name.
      if (fitted.current !== key) draw(r, [], false);
      return;
    }
    // Stocks trade in whole rupiah; the index has two decimals.
    const ihsg = code === "IHSG";
    r.candles.applyOptions({
      priceFormat: { type: "price", precision: ihsg ? 2 : 0, minMove: ihsg ? 0.01 : 1 },
    });
    draw(r, data.candles, fitted.current !== key);
    fitted.current = key;
  }, [data, key, code]);

  const current = data;

  return (
    <section className="panel overflow-hidden">
      <header className="panel-header flex-wrap gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={STOCKS.some((s) => s.code === code) || code === "IHSG" ? code : "lain"}
            onChange={(e) => e.target.value !== "lain" && onCode(e.target.value)}
            className="rounded border border-line bg-base px-2 py-1 text-sm font-semibold"
            aria-label="Pilih saham"
          >
            <option value="IHSG">IHSG — Indeks Harga Saham Gabungan</option>
            {STOCKS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} — {s.name}
              </option>
            ))}
            {!STOCKS.some((s) => s.code === code) && code !== "IHSG" && <option value="lain">{code}</option>}
          </select>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const c = input.trim().toUpperCase();
              if (/^[A-Z]{4}$/.test(c)) {
                onCode(c);
                setInput("");
              }
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Kode lain, mis. BUMI"
              maxLength={4}
              className="w-40 rounded border border-line bg-base px-2 py-1 text-xs uppercase"
              aria-label="Ketik kode saham BEI"
            />
          </form>
        </div>
        <div className="flex overflow-hidden rounded border border-line">
          {TFS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTf(t.id)}
              className={`px-2.5 py-1 text-xs font-medium ${
                t.id === tf ? "btn-active text-white" : "bg-base text-muted hover:text-fg"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 px-4 py-2 text-sm">
        {current ? (
          <>
            <span className="font-semibold">{current.name}</span>
            <span className="font-mono text-base font-bold">
              {current.price.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
            </span>
            <span className={`font-mono text-xs ${current.changePct >= 0 ? "text-up" : "text-down"}`}>
              {current.changePct >= 0 ? "+" : ""}
              {current.changePct.toFixed(2)}%
            </span>
            {current.dayLow !== null && current.dayHigh !== null && (
              <span className="text-xs text-muted">
                Rentang hari ini {current.dayLow.toLocaleString("id-ID")} –{" "}
                {current.dayHigh.toLocaleString("id-ID")}
              </span>
            )}
            <span className="text-xs text-muted">
              Update {new Date(current.marketTime).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" })}{" "}
              WIB
            </span>
          </>
        ) : (
          <span className="text-xs text-muted">{error ? "" : "Memuat chart…"}</span>
        )}
        <span
          className={`ml-auto rounded px-2 py-0.5 text-[11px] font-semibold ${
            session.open ? "bg-up/15 text-up" : "bg-line text-muted"
          }`}
        >
          {session.open && "● "}
          {session.text}
        </span>
      </div>
      {error && <p className="px-4 pb-2 text-xs text-down">Chart gagal dimuat ({error}).</p>}

      <div ref={el} style={{ height: 420 }} />
      <p className="px-4 py-2 text-[11px] text-muted">
        <span className="text-amber-300">━ EMA 20</span> · <span className="text-indigo-300">━ EMA 50</span> ·
        Data Yahoo Finance, tertunda ±10 menit dari BEI, diperbarui tiap 15 detik saat bursa buka. Waktu dalam
        WIB.
      </p>
    </section>
  );
}
