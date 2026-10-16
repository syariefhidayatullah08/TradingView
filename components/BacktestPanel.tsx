"use client";

import { useState } from "react";
import { MARKET_INTERVAL, MARKET_SYMBOL } from "@/lib/advice";
import { BACKTEST_WINDOW, FEES_NOTE, runBacktest, type BacktestOptions, type BacktestResult } from "@/lib/backtest";
import type { Candle } from "@/lib/indicators";
import { SANTAI_MIN_CONFIDENCE, type SantaiSettings } from "@/lib/santai";
import { useSantai } from "@/lib/use-santai";
import { BINANCE_API, COINS, formatPrice, higherTimeframe, TIMEFRAMES, type Coin, type Timeframe } from "@/lib/symbols";

const INTERVAL_MS: Record<string, number> = {
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
};
const PAGE = 1000;
// The weekly candle has too little history for a meaningful test.
const TESTABLE = TIMEFRAMES.filter((t) => t.binance !== "1w");

async function history(symbol: string, interval: string, pages: number): Promise<Candle[]> {
  let out: (string | number)[][] = [];
  let end: number | null = null;
  for (let p = 0; p < pages; p++) {
    const res = await fetch(
      `${BINANCE_API}/klines?symbol=${symbol}&interval=${interval}&limit=${PAGE}${end ? `&endTime=${end}` : ""}`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const page: (string | number)[][] = await res.json();
    if (page.length === 0) break;
    out = [...page, ...out];
    end = Number(page[0][0]) - 1;
    if (page.length < PAGE) break;
  }
  return out.map((k) => ({
    time: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    takerBuyVolume: Number(k[9]),
  }));
}

type Variant = { name: string; note: string; opts: BacktestOptions; mine?: boolean };

function variants(s: SantaiSettings): Variant[] {
  const base: BacktestOptions = {
    sensitive: false,
    btcFilter: false,
    trailing: false,
    exit: s.enabled ? "santai" : "normal",
    targetPct: s.targetPct,
    minConfidence: s.enabled ? SANTAI_MIN_CONFIDENCE : 0,
  };
  return [
    {
      name: "Pengaturan Anda",
      note:
        [s.trailing && "trailing", s.structure && !s.enabled && "pembalikan", s.sensitive && "sensitif", s.btcFilter && "filter BTC"]
          .filter(Boolean)
          .join(", ") || "dasar",
      opts: {
        ...base,
        sensitive: s.sensitive,
        btcFilter: s.btcFilter,
        trailing: s.trailing,
        ...(s.structure && !s.enabled ? { structure: "reversal" as const } : {}),
      },
      mine: true,
    },
    { name: "Dasar", note: "tanpa tambahan", opts: base },
    { name: "Trailing stop", note: "jual saat turun dari puncak", opts: { ...base, trailing: true } },
    {
      name: "Pembalikan + trailing",
      note: "struktur harga, divergensi RSI, VWAP",
      opts: { ...base, trailing: true, structure: "reversal" },
    },
    { name: "Sensitif + trailing", note: "beli lebih cepat", opts: { ...base, sensitive: true, trailing: true } },
    { name: "Filter BTC + trailing", note: "tahan saat BTC turun", opts: { ...base, btcFilter: true, trailing: true } },
  ];
}

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function day(time: number): string {
  return new Date(time).toLocaleString("id-ID", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function holdText(hours: number | null): string {
  if (hours === null) return "—";
  return hours < 48 ? `${hours.toFixed(0)} jam` : `${(hours / 24).toFixed(1)} hari`;
}

const reasonText = { target: "target", stop: "stop loss", trail: "trailing", open: "masih terbuka" } as const;

export default function BacktestPanel({ coin: initialCoin, timeframe: initialTf }: { coin: Coin; timeframe: Timeframe }) {
  const { settings } = useSantai();
  const [coin, setCoin] = useState(initialCoin);
  const [tf, setTf] = useState<Timeframe>(TESTABLE.find((t) => t.tv === initialTf.tv) ?? TESTABLE[1]);
  const [pages, setPages] = useState(2);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ v: Variant; r: BacktestResult }[] | null>(null);

  const days = Math.round((pages * PAGE - BACKTEST_WINDOW) * (INTERVAL_MS[tf.binance] / 86_400_000));

  async function run() {
    setError(null);
    setResults(null);
    setProgress(0);
    try {
      const higher = higherTimeframe(tf);
      const [candles, big, btc] = await Promise.all([
        history(coin.symbol, tf.binance, pages),
        higher ? history(coin.symbol, higher.binance, 1) : Promise.resolve(null),
        history(MARKET_SYMBOL, MARKET_INTERVAL, 1),
      ]);
      if (candles.length <= BACKTEST_WINDOW + 50) throw new Error("Riwayat harga koin ini terlalu pendek");
      const list = variants(settings);
      const out: { v: Variant; r: BacktestResult }[] = [];
      for (let k = 0; k < list.length; k++) {
        const r = await runBacktest(
          {
            candles,
            intervalMs: INTERVAL_MS[tf.binance],
            higher: big,
            higherMs: higher ? INTERVAL_MS[higher.binance] : 0,
            higherLabel: higher?.label ?? null,
            btcDaily: btc,
          },
          list[k].opts,
          (done) => setProgress((k + done) / list.length),
        );
        out.push({ v: list[k], r });
      }
      setResults(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uji gagal");
    } finally {
      setProgress(null);
    }
  }

  const mine = results?.find((x) => x.v.mine)?.r;

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Uji Strategi (Backtest)</h2>
        <span className="text-xs text-muted">Bagaimana hasilnya jika dulu mengikuti saran aplikasi</span>
      </header>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[11px] text-muted">
            Koin
            <select
              value={coin.symbol}
              onChange={(e) => setCoin(COINS.find((c) => c.symbol === e.target.value) ?? COINS[0])}
              className="mt-1 block rounded border border-line bg-base px-2 py-1.5 text-sm text-fg"
            >
              {COINS.map((c) => (
                <option key={c.symbol} value={c.symbol}>
                  {c.base} — {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-muted">
            Candle
            <select
              value={tf.tv}
              onChange={(e) => setTf(TESTABLE.find((t) => t.tv === e.target.value) ?? TESTABLE[1])}
              className="mt-1 block rounded border border-line bg-base px-2 py-1.5 text-sm text-fg"
            >
              {TESTABLE.map((t) => (
                <option key={t.tv} value={t.tv}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-muted">
            Panjang data
            <select
              value={pages}
              onChange={(e) => setPages(Number(e.target.value))}
              className="mt-1 block rounded border border-line bg-base px-2 py-1.5 text-sm text-fg"
            >
              {[1, 2, 3].map((p) => (
                <option key={p} value={p}>
                  {p * PAGE} candle
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={run}
            disabled={progress !== null}
            className="rounded btn-active px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {progress !== null ? `Menguji… ${Math.round(progress * 100)}%` : "▶ Jalankan uji"}
          </button>
          <span className="text-[11px] text-muted">
            ≈ {days} hari diuji · mode {settings.enabled ? "Santai (tanpa stop loss)" : "normal (stop loss + target)"}
          </span>
        </div>

        {error && <p className="text-sm text-down">{error}</p>}

        {results && mine && (
          <>
            <p className="text-sm">
              {coin.base}, candle {tf.label}, {day(mine.from)} – {day(mine.to)}. Beli lalu tahan saja hasilnya{" "}
              <b className={mine.buyHoldPct >= 0 ? "text-up" : "text-down"}>{pct(mine.buyHoldPct)}</b>.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted">
                    <th className="py-1.5 text-left font-medium">Varian</th>
                    <th className="py-1.5 text-right font-medium">Hasil bersih</th>
                    <th className="py-1.5 text-right font-medium">Trade</th>
                    <th className="py-1.5 text-right font-medium">Menang</th>
                    <th className="py-1.5 text-right font-medium">Turun terdalam</th>
                    <th className="py-1.5 text-right font-medium">Rata2 tahan</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(({ v, r }) => {
                    const closed = r.wins + r.losses;
                    const open = r.trades.some((t) => t.reason === "open");
                    return (
                      <tr key={v.name} className={`border-t border-line ${v.mine ? "bg-base font-semibold" : ""}`}>
                        <td className="py-1.5">
                          {v.name} <span className="font-normal text-muted">({v.note})</span>
                        </td>
                        <td className={`py-1.5 text-right font-mono ${r.totalPct >= 0 ? "text-up" : "text-down"}`}>
                          {pct(r.totalPct)}
                        </td>
                        <td className="py-1.5 text-right font-mono">
                          {closed}
                          {open && <span className="text-muted"> +1 terbuka</span>}
                        </td>
                        <td className="py-1.5 text-right font-mono">
                          {closed ? `${Math.round((r.wins / closed) * 100)}%` : "—"}
                        </td>
                        <td className="py-1.5 text-right font-mono text-down">-{r.maxDrawdownPct.toFixed(1)}%</td>
                        <td className="py-1.5 text-right font-mono">{holdText(r.avgHoldHours)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {mine.trades.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">
                  Transaksi dengan pengaturan Anda (terbaru)
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {mine.trades
                      .slice(-15)
                      .reverse()
                      .map((t) => (
                        <tr key={t.entryTime} className="border-t border-line font-mono">
                          <td className="py-1">
                            {day(t.entryTime)} · ${formatPrice(t.entryPrice)}
                          </td>
                          <td className="py-1">
                            → {t.reason === "open" ? "sekarang" : day(t.exitTime)} · ${formatPrice(t.exitPrice)}
                          </td>
                          <td className="py-1 font-sans text-muted">{reasonText[t.reason]}</td>
                          <td className={`py-1 text-right ${t.netPct >= 0 ? "text-up" : "text-down"}`}>{pct(t.netPct)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <p className="text-[11px] text-muted">
          Simulasi satu posisi sekaligus memakai keputusan yang sama dengan &ldquo;Mulai Trading&rdquo;, hanya dari
          data yang sudah ada di setiap candle. {FEES_NOTE} &ldquo;Turun terdalam&rdquo; = penurunan nilai terbesar
          dari puncak, termasuk saat posisi sedang minus. Hasil masa lalu tidak menjamin hasil ke depan.
        </p>
      </div>
    </section>
  );
}
