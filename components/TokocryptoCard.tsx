"use client";

import { useEffect, useState } from "react";
import { tokocryptoUrl, type Coin } from "@/lib/symbols";

const REFRESH_MS = 15_000;

type State = { base: string; bid?: number; ask?: number; error?: boolean };

const idr = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

export default function TokocryptoCard({ coin }: { coin: Coin }) {
  const [state, setState] = useState<State>({ base: "" });

  useEffect(() => {
    if (!coin.tokoIdr) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/tokocrypto?base=${coin.base}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setState({ base: coin.base, bid: json.bid, ask: json.ask });
      } catch {
        if (!cancelled) {
          setState((prev) => (prev.base === coin.base && prev.bid ? prev : { base: coin.base, error: true }));
        }
      }
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [coin.base, coin.tokoIdr]);

  const current = state.base === coin.base ? state : null;

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Tokocrypto</h2>
        <span className="text-xs text-muted">{coin.base}</span>
      </header>
      <div className="flex flex-col gap-3 p-4">
        {!coin.toko && (
          <p className="text-sm text-muted">{coin.name} belum tersedia di Tokocrypto.</p>
        )}
        {coin.toko && !coin.tokoIdr && (
          <p className="text-sm text-muted">
            Tidak ada pasangan {coin.base}/IDR. Tersedia lewat pasangan {coin.base}/USDT.
          </p>
        )}
        {coin.tokoIdr && (
          <>
            {!current && <p className="text-sm text-muted">Memuat harga rupiah…</p>}
            {current?.error && <p className="text-sm text-down">Harga Tokocrypto gagal dimuat.</p>}
            {current?.bid !== undefined && current.ask !== undefined && (
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[11px] text-muted">Harga jual (bid)</dt>
                  <dd className="font-mono text-sm text-up">Rp{idr.format(current.bid)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted">Harga beli (ask)</dt>
                  <dd className="font-mono text-sm text-down">Rp{idr.format(current.ask)}</dd>
                </div>
              </dl>
            )}
          </>
        )}
        {coin.toko && (
          <div className="flex flex-wrap gap-2">
            {coin.tokoIdr && (
              <a
                href={tokocryptoUrl(coin.base, "IDR")}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded btn-active px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                Trading {coin.base}/IDR ↗
              </a>
            )}
            <a
              href={tokocryptoUrl(coin.base, "USDT")}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-line px-3 py-1.5 text-xs font-semibold hover:bg-base"
            >
              Trading {coin.base}/USDT ↗
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
