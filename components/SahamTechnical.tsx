"use client";

import { useState } from "react";
import { DIRECTION } from "@/lib/explanations";
import { outlook } from "@/lib/outlook";
import { useSahamChart, type SahamTf } from "@/lib/use-saham-chart";
import { IndicatorReport } from "./AnalysisPanel";
import Explain from "./Explain";
import { DirectionCard, type DirectionResult } from "./MarketDirection";

const TFS: { id: SahamTf; label: string }[] = [
  { id: "15m", label: "15 menit" },
  { id: "1h", label: "1 jam" },
  { id: "1d", label: "Harian" },
  { id: "1wk", label: "Mingguan" },
];

// `horizon` is how many candles ahead the projected range covers (a trading day is ±6 hourly candles).
const HORIZONS = [
  { tf: "1h", label: "Harian", horizon: 6, basis: "Candle 1 jam · proyeksi 1 hari bursa" },
  { tf: "1d", label: "Mingguan", horizon: 5, basis: "Candle harian · proyeksi 5 hari bursa" },
  { tf: "1wk", label: "Bulanan", horizon: 4, basis: "Candle mingguan · proyeksi 4 minggu" },
] as const;

const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 });

function useDirection(code: string, tf: SahamTf, horizon: number): DirectionResult | undefined {
  const { data, error } = useSahamChart(code, tf);
  if (data) return { outlook: outlook(data.candles, horizon) };
  return error ? { error: true } : undefined;
}

// The crypto module's indicator panels, fed with IDX candles for the stock shown in the chart.
export default function SahamTechnical({ code }: { code: string }) {
  const [tf, setTf] = useState<SahamTf>("1d");
  const { data, error, session } = useSahamChart(code, tf);
  const results = [
    useDirection(code, HORIZONS[0].tf, HORIZONS[0].horizon),
    useDirection(code, HORIZONS[1].tf, HORIZONS[1].horizon),
    useDirection(code, HORIZONS[2].tf, HORIZONS[2].horizon),
  ];
  const ihsg = code === "IHSG";
  const money = (n: number) => `${ihsg ? "" : "Rp"}${fmt(n)}`;

  return (
    <>
      <section className="panel">
        <header className="panel-header">
          <h2>Arah Pasar: Harian, Mingguan, Bulanan</h2>
          <span className="text-xs text-muted">{ihsg ? "IHSG" : code}</span>
        </header>
        <div className="grid gap-2 p-3 md:grid-cols-3">
          {HORIZONS.map((h, i) => (
            <DirectionCard key={h.tf} label={h.label} basis={h.basis} result={results[i]} money={money} />
          ))}
        </div>
        <div className="px-3 pb-3">
          <Explain info={DIRECTION} className="rounded bg-base p-2" />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Ukuran candle indikator:</span>
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
        <span className="text-[11px] text-muted">
          Ganti saham lewat chart di atas atau daftar di samping.
        </span>
      </div>

      <IndicatorReport
        candles={data?.candles ?? null}
        live={session.open}
        error={Boolean(error)}
        label={`${ihsg ? "IHSG" : code} · ${TFS.find((t) => t.id === tf)?.label}`}
        fmt={fmt}
        currency={ihsg ? "" : "Rp"}
      />
    </>
  );
}
