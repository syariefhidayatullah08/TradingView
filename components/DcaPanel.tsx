"use client";

import { useEffect, useState } from "react";
import { DCA_COINS, isDue, nextDay, split, type DcaState } from "@/lib/dca";
import { useLiveCandles } from "@/lib/live-candles";
import { FEE_PCT } from "@/lib/positions";
import { formatPrice } from "@/lib/symbols";
import { saveSantai, useSantai } from "@/lib/use-santai";

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function usd(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function rp(n: number): string {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

function useLastPrice(symbol: string): number | null {
  const live = useLiveCandles(symbol, "1m");
  return live.candles?.length ? live.candles[live.candles.length - 1].close : null;
}

export default function DcaPanel() {
  const { settings, loaded, idrPerUsdt } = useSantai();
  const [state, setState] = useState<DcaState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const btc = useLastPrice("BTCUSDT");
  const eth = useLastPrice("ETHUSDT");
  const prices: Record<string, number | null> = { BTCUSDT: btc, ETHUSDT: eth };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dca")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!cancelled) setState(json);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Data DCA gagal dimuat"));
    return () => {
      cancelled = true;
    };
  }, []);

  const plan = idrPerUsdt ? split(settings.dcaIdr, settings.dcaBtcPct, idrPerUsdt) : null;
  const due = settings.dcaEnabled && state ? isDue(state, now, settings.dcaDay) : false;

  async function post(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setState(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  async function change(patch: Partial<typeof settings>) {
    try {
      await saveSantai({ ...settings, ...patch });
    } catch {
      setError("Pengaturan gagal disimpan");
    }
  }

  const holdings = state?.holdings ?? [];
  const value = holdings.reduce((s, h) => s + h.qty * (prices[h.symbol] ?? h.cost / h.qty) * (1 - FEE_PCT / 100), 0);
  const cost = holdings.reduce((s, h) => s + h.cost, 0);

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Inti (DCA): Beli Rutin, Simpan Lama</h2>
        <span className="text-xs text-muted">Terpisah dari modal trading</span>
      </header>
      <div className="flex flex-col gap-4 p-4">
        <p className="text-xs text-muted">
          Cara trader profesional: sebagian besar uang (inti) dibeli rutin di BTC/ETH tanpa peduli harga, lalu disimpan
          lama. Trading aktif hanya memakai sebagian kecil (satelit). Saat pasar naik besar, inti ikut untung; saat turun,
          pembelian rutin mendapat harga lebih murah.
        </p>

        {loaded && (
          <div className="flex flex-wrap items-end gap-3 rounded bg-base p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.dcaEnabled}
                onChange={() => change({ dcaEnabled: !settings.dcaEnabled })}
                className="h-4 w-4 accent-[var(--t-accent)]"
              />
              Aktifkan jadwal DCA
            </label>
            <label className="text-[11px] text-muted">
              Rupiah per minggu
              <select
                value={settings.dcaIdr}
                onChange={(e) => change({ dcaIdr: Number(e.target.value) })}
                className="mt-1 block rounded border border-line bg-panel px-2 py-1.5 text-sm text-fg"
              >
                {[25_000, 50_000, 100_000, 200_000, 500_000, 1_000_000].map((v) => (
                  <option key={v} value={v}>
                    {rp(v)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted">
              Hari
              <select
                value={settings.dcaDay}
                onChange={(e) => change({ dcaDay: Number(e.target.value) })}
                className="mt-1 block rounded border border-line bg-panel px-2 py-1.5 text-sm text-fg"
              >
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted">
              Porsi BTC / ETH
              <select
                value={settings.dcaBtcPct}
                onChange={(e) => change({ dcaBtcPct: Number(e.target.value) })}
                className="mt-1 block rounded border border-line bg-panel px-2 py-1.5 text-sm text-fg"
              >
                {[100, 80, 70, 60, 50].map((v) => (
                  <option key={v} value={v}>
                    {v}% BTC / {100 - v}% ETH
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {settings.dcaEnabled && plan && state && (
          <div className={`rounded border p-3 ${due ? "border-up/50 bg-up/10" : "border-line"}`}>
            {due ? (
              <>
                <div className="text-sm font-semibold text-up">🗓️ Jadwal DCA minggu ini sudah tiba</div>
                <div className="mt-1 text-sm">
                  Beli di Tokocrypto:{" "}
                  {DCA_COINS.filter((s) => plan[s] > 0)
                    .map((s) => `${s.replace("USDT", "")} ${usd(plan[s])} (${rp(plan[s] * idrPerUsdt!)})`)
                    .join(" dan ")}
                  . Tidak perlu menunggu harga bagus; itulah intinya DCA.
                </div>
                <button
                  onClick={() => post({ buys: DCA_COINS.map((s) => ({ symbol: s, usdt: plan[s] })).filter((b) => b.usdt > 0) })}
                  disabled={busy}
                  className="mt-2 rounded btn-active px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Mencatat…" : "Saya sudah beli, catat di harga sekarang"}
                </button>
              </>
            ) : (
              <div className="text-sm">
                ✓ DCA minggu ini sudah dicatat. Jadwal berikutnya:{" "}
                <b>
                  {new Date(nextDay(now, settings.dcaDay)).toLocaleDateString("id-ID", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </b>{" "}
                · {rp(settings.dcaIdr)}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-xs text-down">{error}</p>}

        {holdings.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-wide text-muted">
              <span>Simpanan inti</span>
              <span className={value - cost >= 0 ? "text-up" : "text-down"}>
                Nilai {usd(value)} · modal {usd(cost)} · {value - cost >= 0 ? "+" : ""}
                {cost ? (((value - cost) / cost) * 100).toFixed(2) : "0"}%
              </span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[11px] text-muted">
                  <th className="py-1 text-left font-medium">Koin</th>
                  <th className="py-1 text-right font-medium">Jumlah</th>
                  <th className="py-1 text-right font-medium">Harga rata2</th>
                  <th className="py-1 text-right font-medium">Harga sekarang</th>
                  <th className="py-1 text-right font-medium">Untung/rugi</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const p = prices[h.symbol];
                  const v = p ? h.qty * p * (1 - FEE_PCT / 100) : null;
                  return (
                    <tr key={h.symbol} className="border-t border-line font-mono">
                      <td className="py-1.5 font-sans font-semibold">
                        {h.symbol.replace("USDT", "")} <span className="font-normal text-muted">{h.count}× beli</span>
                      </td>
                      <td className="py-1.5 text-right">{h.qty.toLocaleString("en-US", { maximumSignificantDigits: 6 })}</td>
                      <td className="py-1.5 text-right">${formatPrice(h.cost / h.qty)}</td>
                      <td className="py-1.5 text-right">{p ? `$${formatPrice(p)}` : "…"}</td>
                      <td className={`py-1.5 text-right ${v === null ? "" : v >= h.cost ? "text-up" : "text-down"}`}>
                        {v === null ? "…" : `${v >= h.cost ? "+" : ""}${usd(v - h.cost)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button
              onClick={() => window.confirm("Hapus semua catatan simpanan inti?") && post({ action: "reset" })}
              className="mt-2 rounded border border-line px-2 py-1 text-[11px] text-muted hover:bg-base"
            >
              Hapus catatan inti
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
