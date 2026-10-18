"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { Signal } from "@/lib/indicators";
import {
  BUY_FEE,
  buildPlan,
  HORIZONS,
  LOT,
  rupiah,
  SELL_FEE,
  verdict,
  type Horizon,
  type Point,
  type SahamReport,
  type StockScore,
} from "@/lib/saham";
import SahamChart from "./SahamChart";

const toneClass: Record<Signal, string> = { 1: "text-up", 0: "text-muted", [-1]: "text-down" };
const badge: Record<Signal, string> = {
  1: "bg-up/15 text-up",
  0: "bg-amber-300/15 text-amber-300",
  [-1]: "bg-down/15 text-down",
};
const regimeText = { naik: "Tren naik", netral: "Datar", turun: "Tren turun" } as const;
const regimeTone: Record<keyof typeof regimeText, Signal> = { naik: 1, netral: 0, turun: -1 };

const STORE_KEY = "saham-plan";
type Settings = { budget: number; split: Record<Horizon, number> };
const DEFAULTS: Settings = { budget: 10_000_000, split: { pendek: 20, menengah: 30, panjang: 50 } };

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    if (s && typeof s.budget === "number" && s.split) return { ...DEFAULTS, ...s };
  } catch {}
  return DEFAULTS;
}

const signed = (n: number, digits = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
const score100 = (n: number | null) => (n === null ? "—" : Math.round(n * 100).toString());

function Points({ title, points }: { title: string; points: Point[] }) {
  if (!points.length) return null;
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{title}</div>
      <table className="w-full text-xs">
        <tbody>
          {points.map((p) => (
            <tr key={p.label} className="border-t border-line">
              <td className="py-1 pr-2">
                <div>{p.label}</div>
                <div className="text-[11px] text-muted">{p.note}</div>
              </td>
              <td className={`py-1 text-right font-mono ${toneClass[p.tone]}`}>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Detail({ s, onChart }: { s: StockScore; onChart: () => void }) {
  return (
    <div className="grid gap-4 border-t border-line p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {HORIZONS.map((h) => {
            const v = verdict(s.scores[h.id]);
            return (
              <div key={h.id} className="rounded bg-base px-2 py-1 text-xs">
                <span className="text-muted">{h.label}: </span>
                <span className={`font-semibold ${toneClass[v.tone]}`}>{v.text}</span>
                <span className="text-muted"> ({score100(s.scores[h.id])})</span>
              </div>
            );
          })}
        </div>
        <Points title="Fundamental" points={s.fundPoints} />
        {!s.fundPoints.length && (
          <p className="text-xs text-muted">Data fundamental tidak tersedia; skor hanya dari teknikal.</p>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <Points title="Teknikal jangka pendek" points={s.techPoints.pendek} />
        <Points title="Teknikal jangka menengah" points={s.techPoints.menengah} />
        <Points title="Teknikal jangka panjang" points={s.techPoints.panjang} />
      </div>
      <button
        onClick={onChart}
        className="justify-self-start rounded border border-line px-2.5 py-1 text-xs hover:bg-base lg:col-span-2"
      >
        📈 Lihat chart {s.code}
      </button>
    </div>
  );
}

export default function SahamPanel() {
  const [data, setData] = useState<SahamReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [horizon, setHorizon] = useState<Horizon>("panjang");
  const [open, setOpen] = useState<string | null>(null);
  const [chartCode, setChartCode] = useState("IHSG");
  const chartRef = useRef<HTMLDivElement>(null);
  const showChart = (code: string) => {
    setChartCode(code);
    chartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/saham")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j as SahamReport;
      })
      .then((j) => !cancelled && setData(j))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Gagal memuat data"));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSettings(loadSettings()); // eslint-disable-line react-hooks/set-state-in-effect
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings, loaded]);

  const plan = useMemo(
    () => (data ? buildPlan(data.stocks, settings.budget, settings.split, data.market) : null),
    [data, settings],
  );
  const ranked = useMemo(
    () => (data ? [...data.stocks].sort((a, b) => b.scores[horizon] - a.scores[horizon]) : []),
    [data, horizon],
  );
  const m = data?.market;
  const staged = plan?.picks.some((p) => p.lotsNow < p.lots);

  return (
    <div className="flex flex-col gap-2">
      <div ref={chartRef} className="scroll-mt-2">
        <SahamChart code={chartCode} onCode={setChartCode} />
      </div>
      <section className="panel">
        <header className="panel-header">
          <h2>Saham Indonesia — Rencana Modal</h2>
          <span className="text-xs text-muted">
            {data ? `Data ${new Date(data.updatedAt).toLocaleString("id-ID")}` : "Memuat…"}
          </span>
        </header>

        {error && <p className="p-4 text-sm text-down">Data saham gagal dimuat ({error}).</p>}
        {!data && !error && (
          <p className="p-4 text-sm text-muted">Menganalisa ±40 saham IDX (teknikal + fundamental)…</p>
        )}

        {m && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-4 py-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted">IHSG</div>
              <div className="font-mono text-sm">
                {m.price.toLocaleString("id-ID", { maximumFractionDigits: 0 })}{" "}
                <span className={m.changePct >= 0 ? "text-up" : "text-down"}>{signed(m.changePct, 2)}</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted">5 hari</div>
              <div className={`font-mono text-xs ${m.change5d >= 0 ? "text-up" : "text-down"}`}>{signed(m.change5d)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted">Dari puncak setahun</div>
              <div className="font-mono text-xs text-down">{signed(m.drawdown)}</div>
            </div>
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badge[regimeTone[m.regime]]}`}>
              {regimeText[m.regime]}
            </span>
            <p className="min-w-60 flex-1 text-xs text-muted">{m.note}</p>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4 px-4 py-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted">Modal (Rp)</span>
            <input
              type="number"
              min={0}
              step={500_000}
              value={settings.budget}
              onChange={(e) => setSettings((s) => ({ ...s, budget: Math.max(0, Number(e.target.value) || 0) }))}
              className="w-36 rounded border border-line bg-base px-2 py-1 font-mono"
            />
          </label>
          {HORIZONS.map((h) => (
            <label key={h.id} className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">
                {h.label} ({h.hold}) %
              </span>
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                value={settings.split[h.id]}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    split: { ...s.split, [h.id]: Math.min(100, Math.max(0, Number(e.target.value) || 0)) },
                  }))
                }
                className="w-24 rounded border border-line bg-base px-2 py-1 font-mono"
              />
            </label>
          ))}
          <button
            onClick={() => setSettings(DEFAULTS)}
            className="rounded border border-line px-2.5 py-1 text-xs hover:bg-base"
          >
            Atur ulang
          </button>
        </div>

        {plan && (
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1.5 pr-2">Jangka</th>
                  <th className="py-1.5 pr-2">Saham</th>
                  <th className="py-1.5 pr-2 text-right">Harga</th>
                  <th className="py-1.5 pr-2 text-right">Lot</th>
                  <th className="py-1.5 pr-2 text-right">Beli sekarang</th>
                  <th className="py-1.5 pr-2 text-right">Biaya</th>
                  <th className="py-1.5 pr-2 text-right">Stop loss</th>
                  <th className="py-1.5 text-right">Target</th>
                </tr>
              </thead>
              <tbody>
                {plan.picks.map((p) => (
                  <tr key={p.stock.code} className="border-t border-line">
                    <td className="py-1.5 pr-2 text-xs">{HORIZONS.find((h) => h.id === p.horizon)?.label}</td>
                    <td className="py-1.5 pr-2">
                      <button onClick={() => showChart(p.stock.code)} className="font-semibold hover:underline">
                        {p.stock.code}
                      </button>{" "}
                      <span className="text-[11px] text-muted">{p.stock.sector}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono text-xs">{p.entry.toLocaleString("id-ID")}</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-xs">{p.lots}</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-xs">
                      {p.lotsNow} lot{p.lotsNow < p.lots && <span className="text-muted"> (+{p.lots - p.lotsNow} nanti)</span>}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono text-xs">{rupiah(p.cost)}</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-xs text-down">
                      {p.stop ? `${p.stop.toLocaleString("id-ID")} (${signed(((p.stop - p.entry) / p.entry) * 100)})` : "evaluasi fundamental"}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs text-up">
                      {p.target
                        ? `${p.target.toLocaleString("id-ID")} (${signed(((p.target * (1 - SELL_FEE)) / (p.entry * (1 + BUY_FEE)) - 1) * 100)})`
                        : "—"}
                    </td>
                  </tr>
                ))}
                {HORIZONS.filter((h) => settings.split[h.id] > 0 && !plan.picks.some((p) => p.horizon === h.id)).map(
                  (h) => (
                    <tr key={h.id} className="border-t border-line text-xs text-muted">
                      <td className="py-1.5 pr-2">{h.label}</td>
                      <td colSpan={7} className="py-1.5">
                        Belum ada saham yang lolos syarat — dana {rupiah(plan.budgets[h.id])} disimpan sebagai kas.
                      </td>
                    </tr>
                  ),
                )}
                <tr className="border-t border-line font-semibold">
                  <td colSpan={5} className="py-1.5 pr-2 text-right text-xs">
                    Sisa kas (termasuk dana yang menunggu)
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono text-xs">{rupiah(plan.cash)}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
            <ul className="mt-3 flex list-disc flex-col gap-1 pl-4 text-[11px] leading-snug text-muted">
              {staged && (
                <li>
                  Pasar sedang turun: beli kolom &quot;Beli sekarang&quot; dulu. Sisa lot dibeli bila IHSG kembali di atas
                  EMA 50 atau saham bertahan di atas harga beli selama ±2 minggu.
                </li>
              )}
              <li>
                1 lot = {LOT} lembar. Biaya dihitung beli {(BUY_FEE * 100).toFixed(2)}% dan target bersih setelah jual{" "}
                {(SELL_FEE * 100).toFixed(2)}% (biaya sekuritas umum; cek sekuritas Anda).
              </li>
              <li>
                Jangka pendek: jual di target atau stop loss, maks. 4 minggu. Menengah: naikkan stop loss saat harga naik.
                Panjang: tahan selama laba dan dividen tetap sehat; tinjau tiap laporan kuartalan.
              </li>
              <li>Penilaian dihitung otomatis dari data Yahoo Finance (tertunda ±10 menit) dan bukan saran keuangan.</li>
            </ul>
          </div>
        )}
      </section>

      {data && (
        <section className="panel">
          <header className="panel-header">
            <h2>Peringkat Saham</h2>
            <div className="flex overflow-hidden rounded border border-line">
              {HORIZONS.map((h) => (
                <button
                  key={h.id}
                  onClick={() => setHorizon(h.id)}
                  className={`px-2.5 py-1 text-xs font-medium ${
                    h.id === horizon ? "btn-active text-white" : "bg-base text-muted hover:text-fg"
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </header>
          <p className="px-4 pt-2 text-[11px] text-muted">
            Skor −100 s.d. +100. Bobot teknikal : fundamental — pendek 80:20, menengah 50:50, panjang 25:75. Klik saham
            untuk rinciannya.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-1.5">Saham</th>
                  <th className="py-1.5 pr-2 text-right">Harga</th>
                  <th className="py-1.5 pr-2 text-right">Hari ini</th>
                  <th className="py-1.5 pr-2 text-right">Teknikal</th>
                  <th className="py-1.5 pr-2 text-right">Fundamental</th>
                  <th className="py-1.5 pr-2 text-right">Skor</th>
                  <th className="py-1.5 pr-4 text-right">Saran</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((s) => {
                  const v = verdict(s.scores[horizon]);
                  return (
                    <Fragment key={s.code}>
                      <tr
                        onClick={() => setOpen(open === s.code ? null : s.code)}
                        className="cursor-pointer border-t border-line hover:bg-base"
                      >
                        <td className="px-4 py-1.5">
                          <span className="font-semibold">{s.code}</span>{" "}
                          <span className="text-[11px] text-muted">
                            {s.name} · {s.sector}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 text-right font-mono text-xs">{s.price.toLocaleString("id-ID")}</td>
                        <td className={`py-1.5 pr-2 text-right font-mono text-xs ${s.changePct >= 0 ? "text-up" : "text-down"}`}>
                          {signed(s.changePct)}
                        </td>
                        <td className="py-1.5 pr-2 text-right font-mono text-xs">{score100(s.technical[horizon])}</td>
                        <td className="py-1.5 pr-2 text-right font-mono text-xs">{score100(s.fundamental)}</td>
                        <td className={`py-1.5 pr-2 text-right font-mono text-xs font-semibold ${toneClass[v.tone]}`}>
                          {score100(s.scores[horizon])}
                        </td>
                        <td className="py-1.5 pr-4 text-right">
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${badge[v.tone]}`}>{v.text}</span>
                        </td>
                      </tr>
                      {open === s.code && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <Detail s={s} onChart={() => showChart(s.code)} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
