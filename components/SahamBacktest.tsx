"use client";

import { useState } from "react";
import { BACKTEST_WINDOW, runBacktest, type BacktestOptions, type BacktestResult } from "@/lib/backtest";
import type { Candle } from "@/lib/indicators";
import { STOCKS, type SahamChart } from "@/lib/saham";
import { idr, STOCK_FEES, toWeekly } from "@/lib/saham-signals";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const CANDLES = [
  { id: "1d-5y", label: "Harian (5 tahun)", ms: DAY_MS, higherLabel: "mingguan" },
  { id: "1h-2y", label: "1 jam (2 tahun)", ms: HOUR_MS, higherLabel: "harian" },
] as const;
type CandleId = (typeof CANDLES)[number]["id"];

const BASE: BacktestOptions = {
  sensitive: false,
  btcFilter: false,
  trailing: false,
  exit: "normal",
  targetPct: 0,
  minConfidence: 0,
  fees: STOCK_FEES,
  money: idr,
  marketName: "IHSG",
};

const VARIANTS: { name: string; note: string; opts: BacktestOptions }[] = [
  { name: "Dasar", note: "stop loss & target dari rencana", opts: BASE },
  { name: "Trailing stop", note: "jual saat turun dari puncak", opts: { ...BASE, trailing: true } },
  {
    name: "Pembalikan + trailing",
    note: "struktur harga, divergensi RSI, VWAP",
    opts: { ...BASE, trailing: true, structure: "reversal" },
  },
  {
    name: "Sensitif + trailing",
    note: "beli lebih cepat",
    opts: { ...BASE, sensitive: true, trailing: true },
  },
  {
    name: "Filter IHSG + trailing",
    note: "tahan beli saat IHSG turun",
    opts: { ...BASE, btcFilter: true, trailing: true },
  },
];
// Used when testing every stock at once.
const ALL_VARIANT = VARIANTS[4];

async function chart(code: string, tf: string): Promise<Candle[]> {
  const res = await fetch(`/api/saham/chart?code=${code}&tf=${tf}`);
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return (j as SahamChart).candles;
}

async function test(
  code: string,
  candle: (typeof CANDLES)[number],
  ihsg: Candle[],
  opts: BacktestOptions,
  onProgress?: (d: number) => void,
  cache?: Map<string, Candle[]>,
) {
  const get = async (tf: string) => {
    const key = `${code}:${tf}`;
    const hit = cache?.get(key);
    if (hit) return hit;
    const list = await chart(code, tf);
    cache?.set(key, list);
    return list;
  };
  const candles = await get(candle.id);
  const daily = candle.id === "1d-5y" ? candles : await get("1d-5y");
  if (candles.length <= BACKTEST_WINDOW + 20) return null;
  return runBacktest(
    {
      candles,
      intervalMs: candle.ms,
      higher: candle.id === "1d-5y" ? toWeekly(daily) : daily,
      higherMs: candle.id === "1d-5y" ? WEEK_MS : DAY_MS,
      higherLabel: candle.higherLabel,
      btcDaily: ihsg,
    },
    opts,
    onProgress,
  );
}

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const tone = (n: number) => (n >= 0 ? "text-up" : "text-down");
const date = (ms: number) =>
  new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" });
const hold = (h: number | null, ms: number) =>
  h === null ? "—" : ms >= DAY_MS ? `${(h / 24).toFixed(0)} hari` : `${h.toFixed(0)} jam`;

type Row = { name: string; note: string; r: BacktestResult };
type AllRow = { code: string; r: BacktestResult };

// The crypto module's strategy test on IDX stocks, with IDX broker fees on both sides.
export default function SahamBacktest({ code, onChart }: { code: string; onChart: (code: string) => void }) {
  const [candleId, setCandleId] = useState<CandleId>("1d-5y");
  const [progress, setProgress] = useState<number | null>(null);
  const [rows, setRows] = useState<{ code: string; candle: CandleId; list: Row[] } | null>(null);
  const [pick, setPick] = useState(0);
  const [all, setAll] = useState<AllRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const candle = CANDLES.find((c) => c.id === candleId)!;
  const stock = code === "IHSG" ? null : code;

  async function runOne() {
    if (!stock) return;
    setError(null);
    setRows(null);
    setProgress(0);
    try {
      const ihsg = await chart("IHSG", "1d-5y");
      const cache = new Map<string, Candle[]>();
      const list: Row[] = [];
      for (let k = 0; k < VARIANTS.length; k++) {
        const v = VARIANTS[k];
        const r = await test(
          stock,
          candle,
          ihsg,
          v.opts,
          (d) => setProgress((k + d) / VARIANTS.length),
          cache,
        );
        if (!r) throw new Error("Riwayat harga saham ini belum cukup panjang");
        list.push({ name: v.name, note: v.note, r });
      }
      setRows({ code: stock, candle: candleId, list });
      setPick(list.reduce((b, x, i) => (x.r.totalPct > list[b].r.totalPct ? i : b), 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uji strategi gagal");
    } finally {
      setProgress(null);
    }
  }

  async function runAll() {
    setError(null);
    setAll(null);
    setProgress(0);
    try {
      const ihsg = await chart("IHSG", "1d-5y");
      const daily = CANDLES[0];
      const out: AllRow[] = [];
      for (let k = 0; k < STOCKS.length; k++) {
        const r = await test(STOCKS[k].code, daily, ihsg, ALL_VARIANT.opts, (d) =>
          setProgress((k + d) / STOCKS.length),
        ).catch(() => null);
        if (r) out.push({ code: STOCKS[k].code, r });
      }
      setAll(out.sort((a, b) => b.r.totalPct - a.r.totalPct));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uji strategi gagal");
    } finally {
      setProgress(null);
    }
  }

  const shown = rows && rows.code === stock && rows.candle === candleId ? rows : null;
  const chosen = shown?.list[pick];
  const busy = progress !== null;

  return (
    <>
      <section className="panel">
        <header className="panel-header">
          <h2>Uji Strategi Saham</h2>
          <span className="text-xs text-muted">{stock ?? "Pilih saham di chart"}</span>
        </header>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <div className="flex overflow-hidden rounded border border-line">
            {CANDLES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCandleId(c.id)}
                className={`px-2.5 py-1 text-xs font-medium ${
                  c.id === candleId ? "btn-active text-white" : "bg-base text-muted hover:text-fg"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <button
            onClick={runOne}
            disabled={!stock || busy}
            className="btn-active rounded px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            Uji {stock ?? "saham"}
          </button>
          <button
            onClick={runAll}
            disabled={busy}
            className="rounded border border-line px-3 py-1 text-xs hover:bg-base disabled:opacity-50"
          >
            Uji semua {STOCKS.length} saham (harian)
          </button>
          {busy && (
            <span className="text-xs text-muted">Menghitung… {Math.round((progress ?? 0) * 100)}%</span>
          )}
        </div>
        {!stock && (
          <p className="px-4 pb-3 text-xs text-muted">
            Chart sedang menampilkan IHSG. Pilih saham di chart atau daftar samping untuk mengujinya.
          </p>
        )}
        {error && <p className="px-4 pb-3 text-xs text-down">{error}</p>}

        {shown && (
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1.5 pr-2">Variasi</th>
                  <th className="py-1.5 pr-2 text-right">Transaksi</th>
                  <th className="py-1.5 pr-2 text-right">Menang</th>
                  <th className="py-1.5 pr-2 text-right">Hasil bersih</th>
                  <th className="py-1.5 pr-2 text-right">Beli & tahan</th>
                  <th className="py-1.5 pr-2 text-right">Turun terdalam</th>
                  <th className="py-1.5 text-right">Rata-rata tahan</th>
                </tr>
              </thead>
              <tbody>
                {shown.list.map((row, i) => {
                  const closed = row.r.wins + row.r.losses;
                  return (
                    <tr
                      key={row.name}
                      onClick={() => setPick(i)}
                      className={`cursor-pointer border-t border-line hover:bg-base ${i === pick ? "bg-base" : ""}`}
                    >
                      <td className="py-1.5 pr-2">
                        <div className="text-xs font-semibold">{row.name}</div>
                        <div className="text-[11px] text-muted">{row.note}</div>
                      </td>
                      <td className="py-1.5 pr-2 text-right font-mono text-xs">{closed}</td>
                      <td className="py-1.5 pr-2 text-right font-mono text-xs">
                        {closed ? `${Math.round((row.r.wins / closed) * 100)}%` : "—"}
                      </td>
                      <td
                        className={`py-1.5 pr-2 text-right font-mono text-xs font-semibold ${tone(row.r.totalPct)}`}
                      >
                        {pct(row.r.totalPct)}
                      </td>
                      <td className={`py-1.5 pr-2 text-right font-mono text-xs ${tone(row.r.buyHoldPct)}`}>
                        {pct(row.r.buyHoldPct)}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-mono text-xs text-down">
                        −{row.r.maxDrawdownPct.toFixed(1)}%
                      </td>
                      <td className="py-1.5 text-right font-mono text-xs">
                        {hold(row.r.avgHoldHours, candle.ms)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted">
              Periode {date(shown.list[0].r.from)} – {date(shown.list[0].r.to)}. Biaya beli{" "}
              {STOCK_FEES.buy.toFixed(2)}% dan jual {STOCK_FEES.sell.toFixed(2)}% sudah dihitung. Klik variasi
              untuk melihat transaksinya.
            </p>
          </div>
        )}

        {chosen && (
          <div className="border-t border-line px-4 py-3">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">
              Transaksi — {chosen.name} ({chosen.r.trades.length})
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <tbody>
                  {[...chosen.r.trades].reverse().map((t) => (
                    <tr key={t.entryTime} className="border-t border-line">
                      <td className="py-1 pr-2">{date(t.entryTime)}</td>
                      <td className="py-1 pr-2 font-mono">{idr(t.entryPrice)}</td>
                      <td className="py-1 pr-2 text-muted">
                        → {t.reason === "open" ? "masih dipegang" : date(t.exitTime)}
                      </td>
                      <td className="py-1 pr-2 font-mono">{idr(t.exitPrice)}</td>
                      <td className="py-1 pr-2 text-muted">
                        {
                          { target: "target", stop: "stop loss", trail: "trailing", open: "terbuka" }[
                            t.reason
                          ]
                        }
                      </td>
                      <td className={`py-1 text-right font-mono font-semibold ${tone(t.netPct)}`}>
                        {pct(t.netPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {all && (
        <section className="panel">
          <header className="panel-header">
            <h2>Hasil Strategi per Saham</h2>
            <span className="text-xs text-muted">{ALL_VARIANT.name} · candle harian · 5 tahun</span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-1.5">Saham</th>
                  <th className="py-1.5 pr-2 text-right">Transaksi</th>
                  <th className="py-1.5 pr-2 text-right">Menang</th>
                  <th className="py-1.5 pr-2 text-right">Strategi</th>
                  <th className="py-1.5 pr-4 text-right">Beli & tahan</th>
                </tr>
              </thead>
              <tbody>
                {all.map(({ code: c, r }) => {
                  const closed = r.wins + r.losses;
                  return (
                    <tr
                      key={c}
                      onClick={() => onChart(c)}
                      className="cursor-pointer border-t border-line hover:bg-base"
                    >
                      <td className="px-4 py-1.5 font-semibold">{c}</td>
                      <td className="py-1.5 pr-2 text-right font-mono text-xs">{closed}</td>
                      <td className="py-1.5 pr-2 text-right font-mono text-xs">
                        {closed ? `${Math.round((r.wins / closed) * 100)}%` : "—"}
                      </td>
                      <td
                        className={`py-1.5 pr-2 text-right font-mono text-xs font-semibold ${tone(r.totalPct)}`}
                      >
                        {pct(r.totalPct)}
                      </td>
                      <td className={`py-1.5 pr-4 text-right font-mono text-xs ${tone(r.buyHoldPct)}`}>
                        {pct(r.buyHoldPct)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-[11px] text-muted">
            {all.filter((x) => x.r.totalPct > 0).length} dari {all.length} saham untung dengan strategi ini.
            Hasil masa lalu tidak menjamin hasil berikutnya.
          </p>
        </section>
      )}
    </>
  );
}
