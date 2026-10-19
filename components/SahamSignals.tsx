"use client";

import { Fragment, useState } from "react";
import type { Action } from "@/lib/decision";
import type { Signal } from "@/lib/indicators";
import { roundTick, type StockScore } from "@/lib/saham";
import { idr } from "@/lib/saham-signals";

const style: Record<Action, { badge: string; label: string }> = {
  beli: { badge: "bg-up/15 text-up", label: "BELI" },
  tunggu: { badge: "bg-amber-300/15 text-amber-300", label: "TUNGGU" },
  jangan: { badge: "bg-down/15 text-down", label: "JANGAN" },
};
const order: Record<Action, number> = { beli: 0, tunggu: 1, jangan: 2 };
const toneClass: Record<Signal, string> = { 1: "text-up", 0: "text-muted", [-1]: "text-down" };
const arrow: Record<Signal, string> = { 1: "▲", 0: "◆", [-1]: "▼" };

const pct = (to: number, from: number) => {
  const v = ((to - from) / from) * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
};

// Scanner of every stock with the crypto module's buy decision: daily candles, weekly trend, IHSG filter.
export default function SahamSignals({
  stocks,
  onChart,
}: {
  stocks: StockScore[];
  onChart: (code: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [only, setOnly] = useState(false);
  const rows = stocks
    .filter((s) => s.decision && (!only || s.decision.action === "beli"))
    .sort(
      (a, b) =>
        order[a.decision!.action] - order[b.decision!.action] ||
        b.decision!.confidence - a.decision!.confidence,
    );
  const count = (a: Action) => stocks.filter((s) => s.decision?.action === a).length;

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Sinyal Beli/Jual Saham</h2>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />
          Hanya BELI
        </label>
      </header>
      <div className="flex flex-wrap gap-3 px-4 pt-3 text-xs">
        {(["beli", "tunggu", "jangan"] as Action[]).map((a) => (
          <span key={a} className={`rounded px-2 py-0.5 font-semibold ${style[a].badge}`}>
            {style[a].label} {count(a)}
          </span>
        ))}
        <span className="text-[11px] text-muted">
          Mesin keputusan yang sama dengan modul kripto: candle harian, tren besar mingguan, dan filter arah
          IHSG.
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="mt-2 w-full min-w-[620px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-1.5">Saham</th>
              <th className="py-1.5 pr-2 text-right">Harga</th>
              <th className="py-1.5 pr-2 text-right">Saran</th>
              <th className="py-1.5 pr-2 text-right">Yakin</th>
              <th className="py-1.5 pr-4">Alasan utama</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-3 text-xs text-muted">
                  Belum ada saham dengan saran BELI. Menunggu itu juga keputusan yang baik.
                </td>
              </tr>
            )}
            {rows.map((s) => {
              const d = s.decision!;
              return (
                <Fragment key={s.code}>
                  <tr
                    onClick={() => setOpen(open === s.code ? null : s.code)}
                    className="cursor-pointer border-t border-line hover:bg-base"
                  >
                    <td className="px-4 py-1.5">
                      <span className="font-semibold">{s.code}</span>{" "}
                      <span className="text-[11px] text-muted">{s.sector}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono text-xs">
                      {s.price.toLocaleString("id-ID")}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${style[d.action].badge}`}
                      >
                        {style[d.action].label}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono text-xs">{d.confidence}%</td>
                    <td className="py-1.5 pr-4 text-xs text-muted">{d.headline}</td>
                  </tr>
                  {open === s.code && (
                    <tr>
                      <td colSpan={5} className="border-t border-line bg-base/50 px-4 py-3">
                        <div className="grid gap-4 md:grid-cols-2">
                          <ul className="flex flex-col gap-1 text-xs">
                            {d.reasons.map((r) => (
                              <li key={r.text} className="flex gap-1.5">
                                <span className={toneClass[r.tone]}>{arrow[r.tone]}</span>
                                <span>{r.text}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="flex flex-col gap-2 text-xs">
                            {d.plan && (
                              <dl className="grid grid-cols-3 gap-2">
                                <div>
                                  <dt className="text-[11px] text-muted">Stop loss</dt>
                                  <dd className="font-mono text-down">
                                    {idr(roundTick(d.plan.stop))} ({pct(d.plan.stop, d.price)})
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-[11px] text-muted">Target 1</dt>
                                  <dd className="font-mono text-up">
                                    {idr(roundTick(d.plan.target1, "up"))} ({pct(d.plan.target1, d.price)})
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-[11px] text-muted">Target 2</dt>
                                  <dd className="font-mono text-up">
                                    {idr(roundTick(d.plan.target2, "up"))} ({pct(d.plan.target2, d.price)})
                                  </dd>
                                </div>
                              </dl>
                            )}
                            {d.riskReward !== null && (
                              <p className="text-muted">
                                Untung : risiko ={" "}
                                <span className="font-mono text-fg">{d.riskReward.toFixed(2)}</span>
                              </p>
                            )}
                            <button
                              onClick={() => onChart(s.code)}
                              className="self-start rounded border border-line px-2.5 py-1 hover:bg-base"
                            >
                              📈 Lihat chart {s.code}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-[11px] text-muted">
        Diperbarui tiap 30 menit dari candle harian (data tertunda ±10 menit). Cek riwayat strategi di tab Uji
        Strategi sebelum ikut. Bukan saran keuangan.
      </p>
    </section>
  );
}
