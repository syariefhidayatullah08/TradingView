"use client";

import { useEffect, useState } from "react";
import { BINANCE_API, COINS, formatCompact, formatPrice, type Coin } from "@/lib/symbols";

const REFRESH_MS = 20_000;

type Ticker = { symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string };

export default function MarketTable({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (coin: Coin) => void;
}) {
  const [tickers, setTickers] = useState<Record<string, Ticker> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const symbols = encodeURIComponent(JSON.stringify(COINS.map((c) => c.symbol)));
    async function load() {
      try {
        const res = await fetch(`${BINANCE_API}/ticker/24hr?symbols=${symbols}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list: Ticker[] = await res.json();
        if (cancelled) return;
        setTickers(Object.fromEntries(list.map((t) => [t.symbol, t])));
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Daftar Pantau</h2>
        <span className="text-xs text-muted">{error ? "Gagal memperbarui" : "24 jam · USDT"}</span>
      </header>
      {error && !tickers ? (
        <p className="p-4 text-sm text-down">Data pasar gagal dimuat.</p>
      ) : (
        <div className="max-h-[640px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 text-left font-medium">Koin</th>
              <th className="px-2 py-2 text-right font-medium">Harga</th>
              <th className="px-2 py-2 text-right font-medium">24j</th>
              <th className="px-3 py-2 text-right font-medium">Vol</th>
            </tr>
          </thead>
          <tbody>
            {COINS.map((coin) => {
              const t = tickers?.[coin.symbol];
              const change = t ? Number(t.priceChangePercent) : null;
              return (
                <tr
                  key={coin.symbol}
                  onClick={() => onSelect(coin)}
                  className={`cursor-pointer border-t border-line hover:bg-base ${
                    selected === coin.symbol ? "bg-base" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="font-semibold">{coin.base}</div>
                    <div className="text-[11px] text-muted">{coin.name}</div>
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {t ? formatPrice(Number(t.lastPrice)) : "—"}
                  </td>
                  <td
                    className={`px-2 py-2 text-right font-mono ${
                      change === null ? "text-muted" : change >= 0 ? "text-up" : "text-down"
                    }`}
                  >
                    {change === null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted">
                    {t ? `$${formatCompact(Number(t.quoteVolume))}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
