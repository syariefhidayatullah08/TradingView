"use client";

import { useEffect, useState } from "react";
import type { AiAnalysis } from "@/lib/ai-analysis";
import { tokocryptoUrl, type Coin } from "@/lib/symbols";

type State = { symbol: string; data?: AiAnalysis; error?: string };
type Horizon = AiAnalysis["pendek"];

const arahStyle = {
  naik: { text: "▲ NAIK", cls: "text-up" },
  turun: { text: "▼ TURUN", cls: "text-down" },
  sideways: { text: "◆ SIDEWAYS", cls: "text-muted" },
} as const;

const penilaianStyle = {
  bagus: { text: "BAGUS", cls: "bg-up/15 text-up" },
  cukup: { text: "CUKUP", cls: "bg-yellow-500/15 text-amber-300" },
  hindari: { text: "HINDARI", cls: "bg-down/15 text-down" },
} as const;

const HORIZONS = [
  { key: "pendek", label: "Jangka Pendek", basis: "Trading harian" },
  { key: "menengah", label: "Jangka Menengah", basis: "Trading mingguan" },
  { key: "panjang", label: "Jangka Panjang", basis: "Bulanan ke atas" },
] as const;

function HorizonCard({ label, basis, h }: { label: string; basis: string; h: Horizon }) {
  return (
    <div className="flex flex-col gap-2 rounded bg-base p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{label}</div>
          <div className="text-[11px] text-muted">{basis}</div>
        </div>
        <span className={`rounded px-2 py-0.5 text-xs font-bold ${penilaianStyle[h.penilaian].cls}`}>
          {penilaianStyle[h.penilaian].text}
        </span>
      </div>
      <div className={`text-lg font-bold ${arahStyle[h.arah].cls}`}>{arahStyle[h.arah].text}</div>
      <p className="text-xs leading-relaxed">{h.alasan}</p>
      <p className="border-t border-line pt-2 text-xs leading-relaxed text-muted">
        <span className="font-semibold text-fg">Strategi: </span>
        {h.strategi}
      </p>
    </div>
  );
}

export default function AiAnalysisPanel({ coin }: { coin: Coin }) {
  const [state, setState] = useState<State>({ symbol: "" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ai-analysis?symbol=${coin.symbol}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!cancelled) setState({ symbol: coin.symbol, data: json });
      })
      .catch((e) => {
        if (!cancelled) {
          setState({
            symbol: coin.symbol,
            error: e instanceof Error ? e.message : "Analisa AI gagal dimuat",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [coin.symbol]);

  const current = state.symbol === coin.symbol ? state : null;
  const a = current?.data;

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Analisa AI: Arah Pasar &amp; Kelayakan Trading</h2>
        <span className="text-xs text-muted">{coin.base}/USDT</span>
      </header>

      {!current && (
        <p className="p-4 text-sm text-muted">
          Sedang membaca teknikal, fundamental, dan berita terbaru… (bisa sampai 30 detik)
        </p>
      )}
      {current?.error && <p className="p-4 text-sm text-down">{current.error}</p>}

      {a && (
        <div className="flex flex-col gap-4 p-4">
          {a.model === null && (
            <p className="rounded border border-yellow-600/40 bg-yellow-500/10 px-3 py-2 text-xs text-amber-300">
              AI belum aktif, jadi ini analisa otomatis berbasis aturan dari indikator teknikal dan
              fundamental (belum menimbang isi berita).
            </p>
          )}
          <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted">Arah paling mungkin</div>
              <div className={`text-2xl font-bold ${arahStyle[a.arah].cls}`}>{arahStyle[a.arah].text}</div>
              <div className="text-xs text-muted">Keyakinan: {a.keyakinan}</div>
            </div>
            <p className="min-w-0 flex-1 basis-80 text-sm leading-relaxed">{a.ringkasan}</p>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            {HORIZONS.map((h) => (
              <HorizonCard key={h.key} label={h.label} basis={h.basis} h={a[h.key]} />
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">
                {a.model === null ? "Berita terkait terbaru" : "Dampak berita terbaru"}
              </h3>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed">
                {a.dampakBerita.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">Risiko utama</h3>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed">
                {a.risiko.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <p className="text-[11px] leading-snug text-muted">
              {a.model === null ? "Dihitung otomatis" : `Dibuat AI (${a.model})`} pada{" "}
              {new Date(a.generatedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
              {a.model !== null && ", diperbarui paling cepat tiap 1 jam"}. Analisa bisa salah; ini bukan
              saran keuangan.
            </p>
            {coin.toko && (
              <a
                href={tokocryptoUrl(coin.base, coin.tokoIdr ? "IDR" : "USDT")}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded btn-active px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                Buka {coin.base} di Tokocrypto ↗
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
