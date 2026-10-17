"use client";

import { useEffect, useState } from "react";
import { useLiveCandles } from "@/lib/live-candles";
import { MAX_ALERTS, type PriceAlert } from "@/lib/price-alerts";
import { COINS, formatPrice, type Coin } from "@/lib/symbols";

const QUICK = [-10, -5, 5, 10];

function baseOf(symbol: string): string {
  return COINS.find((c) => c.symbol === symbol)?.base ?? symbol;
}

// Price alarms sent to Telegram by the scheduled scan, e.g. for DCA buys at a lower price.
export default function PriceAlerts({ coin }: { coin: Coin }) {
  const live = useLiveCandles(coin.symbol, "1h");
  const price = live.candles ? live.candles[live.candles.length - 1].close : null;
  const [list, setList] = useState<PriceAlert[] | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/price-alerts")
      .then((res) => (res.ok ? res.json() : []))
      .then((json) => !cancelled && setList(Array.isArray(json) ? json : []))
      .catch(() => !cancelled && setList([]));
    fetch("/api/telegram/link")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => !cancelled && setLinked(Boolean(json?.linked)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function call(init: RequestInit, query = "") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/price-alerts${query}`, init);
      const json = await res.json().catch(() => null);
      if (!res.ok) setError(json?.error ?? "Gagal menyimpan alarm");
      else {
        setList(json);
        setInput("");
      }
    } catch {
      setError("Gagal menyimpan alarm");
    } finally {
      setBusy(false);
    }
  }

  function add() {
    // Commas are thousands separators, as prices are shown; the dot is the decimal point.
    const value = Number(input.replace(/[,s$]/g, ""));
    if (!(value > 0)) return setError("Isi harga alarm dalam dolar");
    if (price !== null && (value < price * 0.5 || value > price * 2)) {
      return setError(`Harga terlalu jauh dari harga sekarang (${formatPrice(price)}). Periksa titik dan koma: titik = desimal.`);
    }
    call({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: coin.symbol, price: value }) });
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Alarm Harga</h2>
        <span className="text-xs text-muted">Pesan Telegram saat harga tercapai</span>
      </header>
      <div className="flex flex-col gap-3 p-4 text-sm">
        {linked === false && (
          <p className="rounded bg-base p-2 text-xs text-amber-300">
            Telegram belum terhubung. Hubungkan dulu di tab Pengaturan supaya alarm bisa dikirim.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-muted">
            {coin.base}/USDT{price !== null && <> · sekarang ${formatPrice(price)}</>}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              inputMode="decimal"
              placeholder="Harga alarm ($)"
              className="mt-1 block w-40 rounded border border-line bg-base px-2 py-1.5 font-mono text-sm text-fg"
            />
          </label>
          {price !== null &&
            QUICK.map((q) => (
              <button
                key={q}
                onClick={() => setInput(formatPrice(price * (1 + q / 100)).replace(/,/g, ""))}
                className="rounded border border-line px-2 py-1.5 text-xs hover:bg-base"
              >
                {q > 0 ? "+" : ""}
                {q}%
              </button>
            ))}
          <button
            onClick={add}
            disabled={busy || (list?.length ?? 0) >= MAX_ALERTS}
            className="rounded btn-active px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            + Pasang alarm
          </button>
        </div>
        {error && <p className="text-xs text-down">{error}</p>}

        {list === null ? (
          <p className="text-xs text-muted">Memuat…</p>
        ) : list.length === 0 ? (
          <p className="text-xs text-muted">Belum ada alarm.</p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="py-1.5 font-semibold">{baseOf(a.symbol)}</td>
                  <td className={`py-1.5 ${a.dir === 1 ? "text-up" : "text-down"}`}>
                    {a.dir === 1 ? "▲ naik ke" : "▼ turun ke"} <span className="font-mono">${formatPrice(a.price)}</span>
                  </td>
                  <td className="py-1.5 text-right">
                    <button
                      onClick={() => call({ method: "DELETE" }, `?id=${encodeURIComponent(a.id)}`)}
                      disabled={busy}
                      className="rounded border border-line px-2 py-0.5 text-[11px] text-muted hover:text-fg"
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-muted">
          Diperiksa sekitar setiap 15 menit, termasuk lonjakan singkat di antaranya. Alarm terhapus setelah terkirim.
          Maksimal {MAX_ALERTS} alarm. Berguna untuk DCA: pasang alarm di harga yang Anda anggap murah.
        </p>
      </div>
    </section>
  );
}
