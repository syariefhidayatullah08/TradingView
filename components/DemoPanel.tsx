"use client";

import { useEffect, useMemo, useState } from "react";
import { baseOf, DEMO_FEE_PCT, DEMO_START_USDT, type DemoAccount, type DemoTrade, type Side } from "@/lib/demo";
import { getLive, subscribeLive, useLiveCandles } from "@/lib/live-candles";
import { BINANCE_API, COINS, formatPrice, type Coin } from "@/lib/symbols";

const PRICE_INTERVAL = "1m";
const PRICE_REFRESH_MS = 1500;

function usd(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signedUsd(n: number): string {
  return `${n >= 0 ? "+" : ""}${usd(n)}`;
}

function qtyText(n: number): string {
  return n.toLocaleString("en-US", { maximumSignificantDigits: 6 });
}

function when(time: number): string {
  return new Date(time).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Live last price of several symbols, refreshed on a timer from the shared Binance stream.
function useLivePrices(symbols: string[]): Record<string, number> {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const key = symbols.join(",");

  useEffect(() => {
    const list = key ? key.split(",") : [];
    const unsubscribe = list.map((s) => subscribeLive(s, PRICE_INTERVAL, () => {}));
    // Fallback REST prices for coins whose live stream has not delivered yet.
    let rest: Record<string, number> = {};
    let fetching = false;
    const fill = async (missing: string[]) => {
      if (fetching || missing.length === 0) return;
      fetching = true;
      try {
        const res = await fetch(`${BINANCE_API}/ticker/price?symbols=${encodeURIComponent(JSON.stringify(missing))}`);
        if (res.ok) {
          const list: { symbol: string; price: string }[] = await res.json();
          rest = { ...rest, ...Object.fromEntries(list.map((t) => [t.symbol, Number(t.price)])) };
        }
      } catch {}
      fetching = false;
    };
    const update = () => {
      const next: Record<string, number> = {};
      for (const s of list) {
        const c = getLive(s, PRICE_INTERVAL).candles;
        if (c?.length) next[s] = c[c.length - 1].close;
        else if (rest[s]) next[s] = rest[s];
      }
      setPrices(next);
      fill(list.filter((s) => !getLive(s, PRICE_INTERVAL).candles?.length));
    };
    const first = setTimeout(update, 0);
    const timer = setInterval(update, PRICE_REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      unsubscribe.forEach((u) => u());
    };
  }, [key]);

  return prices;
}

// Every USDT spot pair on Binance, the app's coins first.
function useAllSymbols(): string[] {
  const [all, setAll] = useState<string[]>(COINS.map((c) => c.symbol));
  useEffect(() => {
    let cancelled = false;
    fetch(`${BINANCE_API}/ticker/price`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list: { symbol: string }[]) => {
        if (cancelled) return;
        const known = new Set(COINS.map((c) => c.symbol));
        const others = list
          .map((t) => t.symbol)
          .filter((s) => /^[A-Z0-9]{2,15}USDT$/.test(s) && !known.has(s) && !/(UP|DOWN|BULL|BEAR)USDT$/.test(s))
          .sort();
        setAll([...known, ...others]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return all;
}

function OrderForm({
  account,
  symbol,
  onSymbol,
  onDone,
}: {
  account: DemoAccount;
  symbol: string;
  onSymbol: (s: string) => void;
  onDone: (a: DemoAccount, t: DemoTrade) => void;
}) {
  const symbols = useAllSymbols();
  const [query, setQuery] = useState(baseOf(symbol));
  // Follow a coin picked elsewhere (header, holdings) unless it is the one being typed.
  const [shown, setShown] = useState(symbol);
  if (symbol !== shown) {
    setShown(symbol);
    if (query.trim().toUpperCase() + "USDT" !== symbol) setQuery(baseOf(symbol));
  }
  const [side, setSide] = useState<Side>("beli");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useLiveCandles(symbol, PRICE_INTERVAL);
  const price = live.candles?.length ? live.candles[live.candles.length - 1].close : null;
  const held = account.holdings.find((h) => h.symbol === symbol);
  const value = Number(amount.replace(",", "."));

  function pick(text: string) {
    setQuery(text);
    const s = text.trim().toUpperCase().replace(/\/?USDT$/, "") + "USDT";
    if (symbols.includes(s)) {
      onSymbol(s);
      setAmount("");
      setError(null);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(side === "beli" ? { symbol, side, usdt: value } : { symbol, side, qty: value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      onDone(json.account, json.trade);
      setAmount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order gagal");
    } finally {
      setBusy(false);
    }
  }

  const fee = side === "beli" ? (value * DEMO_FEE_PCT) / 100 : price ? (value * price * DEMO_FEE_PCT) / 100 : 0;
  const preview =
    value > 0 && price
      ? side === "beli"
        ? `≈ ${qtyText((value - fee) / price)} ${baseOf(symbol)} · biaya ${usd(fee)}`
        : `≈ ${usd(value * price - fee)} diterima · biaya ${usd(fee)}`
      : null;
  const shares = [0.1, 0.25, 0.5, 1];

  return (
    <div className="flex flex-col gap-3 rounded bg-base p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[11px] text-muted">
          Koin (ketik, mis. PEPE)
          <input
            value={query}
            onChange={(e) => pick(e.target.value)}
            list="demo-symbols"
            className="mt-1 block w-40 rounded border border-line bg-panel px-2 py-1.5 font-mono text-sm uppercase text-fg"
          />
          <datalist id="demo-symbols">
            {symbols.map((s) => (
              <option key={s} value={baseOf(s)} />
            ))}
          </datalist>
        </label>
        <div>
          <div className="text-[11px] text-muted">
            {baseOf(symbol)}/USDT{" "}
            <span className={`ml-1 inline-block h-1.5 w-1.5 rounded-full ${live.live ? "animate-pulse bg-up" : "bg-muted"}`} />
          </div>
          <div className="font-mono text-xl font-semibold">{price ? `$${formatPrice(price)}` : "…"}</div>
        </div>
        <div className="ml-auto flex overflow-hidden rounded border border-line">
          {(["beli", "jual"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setSide(s);
                setAmount("");
                setError(null);
              }}
              className={`px-4 py-1.5 text-sm font-semibold ${
                side === s ? (s === "beli" ? "bg-up text-black" : "bg-down text-white") : "text-muted hover:text-fg"
              }`}
            >
              {s === "beli" ? "Beli" : "Jual"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-muted">
          {side === "beli" ? "Jumlah USDT" : `Jumlah ${baseOf(symbol)}`}
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="mt-1 block w-44 rounded border border-line bg-panel px-2 py-1.5 font-mono text-sm text-fg"
          />
        </label>
        {shares.map((f) => (
          <button
            key={f}
            disabled={side === "jual" && !held}
            onClick={() => {
              const v = side === "beli" ? Math.floor(account.cash * f * 100) / 100 : (held?.qty ?? 0) * f;
              setAmount(String(v));
            }}
            className="rounded border border-line px-2 py-1.5 text-xs hover:bg-panel disabled:opacity-40"
          >
            {f === 1 ? "Semua" : `${f * 100}%`}
          </button>
        ))}
        <button
          onClick={submit}
          disabled={busy || !(value > 0) || !price}
          className={`rounded px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
            side === "beli" ? "bg-up text-black" : "bg-down text-white"
          }`}
        >
          {busy ? "Memproses…" : side === "beli" ? `Beli ${baseOf(symbol)}` : `Jual ${baseOf(symbol)}`}
        </button>
      </div>

      <div className="text-[11px] text-muted">
        {side === "beli"
          ? `Saldo: ${usd(account.cash)}`
          : held
            ? `Dimiliki: ${qtyText(held.qty)} ${baseOf(symbol)}`
            : `Anda belum punya ${baseOf(symbol)}`}
        {preview && ` · ${preview}`}
      </div>
      {error && <div className="text-xs text-down">{error}</div>}
    </div>
  );
}

export default function DemoPanel({ coin, onSelect }: { coin: Coin; onSelect: (coin: Coin) => void }) {
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState(coin.symbol);
  const [last, setLast] = useState<DemoTrade | null>(null);
  const [resetting, setResetting] = useState(false);
  // Follow the coin chosen in the dashboard header.
  const [headerCoin, setHeaderCoin] = useState(coin.symbol);
  if (coin.symbol !== headerCoin) {
    setHeaderCoin(coin.symbol);
    setSymbol(coin.symbol);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/demo")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!cancelled) setAccount(json);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Akun demo gagal dimuat"));
    return () => {
      cancelled = true;
    };
  }, []);

  const held = useMemo(() => account?.holdings.map((h) => h.symbol) ?? [], [account]);
  const prices = useLivePrices(held);

  // Keep the main chart on the coin being traded when the app knows it.
  function chooseSymbol(s: string) {
    setSymbol(s);
    const known = COINS.find((c) => c.symbol === s);
    if (known) onSelect(known);
  }

  async function reset() {
    if (!window.confirm(`Reset akun demo ke ${usd(DEMO_START_USDT)}? Semua koin dan riwayat demo dihapus.`)) return;
    setResetting(true);
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setAccount(json.account);
      setLast(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset gagal");
    } finally {
      setResetting(false);
    }
  }

  if (!account) {
    return (
      <section className="panel">
        <header className="panel-header">
          <h2>Akun Demo</h2>
        </header>
        <p className={`p-4 text-sm ${error ? "text-down" : "text-muted"}`}>{error ?? "Memuat akun demo…"}</p>
      </section>
    );
  }

  // Coins valued after the sell fee, like the holdings table; a coin without a price yet is not
  // silently counted at cost, the totals say they are still being calculated instead.
  const pending = account.holdings.filter((h) => !prices[h.symbol]).length;
  const coinsValue = account.holdings.reduce(
    (sum, h) => sum + h.qty * (prices[h.symbol] ?? h.cost / h.qty) * (prices[h.symbol] ? 1 - DEMO_FEE_PCT / 100 : 1),
    0,
  );
  const equity = account.cash + coinsValue;
  const total = equity - DEMO_START_USDT;

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Akun Demo</h2>
        <span className="flex items-center gap-2 text-xs text-muted">
          Uang virtual · harga live Binance · sejak {when(account.startedAt)}
          <button
            onClick={reset}
            disabled={resetting}
            className="rounded border border-line px-2 py-0.5 text-[11px] font-medium text-fg hover:bg-base disabled:opacity-50"
          >
            ↻ Reset ke {usd(DEMO_START_USDT)}
          </button>
        </span>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded bg-base p-3">
            <div className="text-[11px] text-muted">Total aset</div>
            <div className="font-mono text-lg font-semibold">{pending ? "menghitung…" : usd(equity)}</div>
          </div>
          <div className="rounded bg-base p-3">
            <div className="text-[11px] text-muted">Untung / rugi total</div>
            {pending ? (
              <div className="font-mono text-lg font-semibold text-muted">menghitung…</div>
            ) : (
              <>
                <div className={`font-mono text-lg font-semibold ${total >= 0 ? "text-up" : "text-down"}`}>
                  {signedUsd(total)}
                </div>
                <div className={`text-[11px] ${total >= 0 ? "text-up" : "text-down"}`}>
                  {((total / DEMO_START_USDT) * 100).toFixed(2)}% · belum terjual {signedUsd(total - account.realized)}
                </div>
              </>
            )}
          </div>
          <div className="rounded bg-base p-3">
            <div className="text-[11px] text-muted">Saldo USDT</div>
            <div className="font-mono text-lg font-semibold">{usd(account.cash)}</div>
          </div>
          <div className="rounded bg-base p-3">
            <div className="text-[11px] text-muted">Untung terealisasi</div>
            <div className={`font-mono text-lg font-semibold ${account.realized >= 0 ? "text-up" : "text-down"}`}>
              {signedUsd(account.realized)}
            </div>
          </div>
        </div>

        <OrderForm
          account={account}
          symbol={symbol}
          onSymbol={chooseSymbol}
          onDone={(a, t) => {
            setAccount(a);
            setLast(t);
          }}
        />

        {last && (
          <div className={`rounded border px-3 py-2 text-xs ${last.side === "beli" ? "border-up/40 text-up" : "border-down/40 text-down"}`}>
            ✓ {last.side === "beli" ? "Beli" : "Jual"} {qtyText(last.qty)} {baseOf(last.symbol)} di ${formatPrice(last.price)}
            {last.pnl !== null && ` · hasil ${signedUsd(last.pnl)}`}
          </div>
        )}

        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">Koin dimiliki</div>
          {account.holdings.length === 0 ? (
            <p className="text-sm text-muted">Belum ada koin. Coba beli di atas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] text-muted">
                    <th className="py-1 text-left font-medium">Koin</th>
                    <th className="py-1 text-right font-medium">Jumlah</th>
                    <th className="py-1 text-right font-medium">Harga beli rata2</th>
                    <th className="py-1 text-right font-medium">Harga sekarang</th>
                    <th className="py-1 text-right font-medium">Nilai</th>
                    <th className="py-1 text-right font-medium">Untung/rugi</th>
                  </tr>
                </thead>
                <tbody>
                  {account.holdings.map((h) => {
                    const p = prices[h.symbol];
                    const value = p ? h.qty * p * (1 - DEMO_FEE_PCT / 100) : null;
                    const pnl = value !== null ? value - h.cost : null;
                    return (
                      <tr
                        key={h.symbol}
                        onClick={() => chooseSymbol(h.symbol)}
                        className="cursor-pointer border-t border-line font-mono hover:bg-base"
                      >
                        <td className="py-1.5 font-sans font-semibold">{baseOf(h.symbol)}</td>
                        <td className="py-1.5 text-right">{qtyText(h.qty)}</td>
                        <td className="py-1.5 text-right">${formatPrice(h.cost / h.qty)}</td>
                        <td className="py-1.5 text-right">{p ? `$${formatPrice(p)}` : "…"}</td>
                        <td className="py-1.5 text-right">{value !== null ? usd(value) : "…"}</td>
                        <td className={`py-1.5 text-right ${pnl === null ? "" : pnl >= 0 ? "text-up" : "text-down"}`}>
                          {pnl !== null ? `${signedUsd(pnl)} (${((pnl / h.cost) * 100).toFixed(2)}%)` : "…"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {account.trades.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">Riwayat transaksi demo</div>
            <table className="w-full text-xs">
              <tbody>
                {account.trades.slice(0, 12).map((t, i) => (
                  <tr key={`${t.time}-${i}`} className="border-t border-line font-mono">
                    <td className="py-1 font-sans text-muted">{when(t.time)}</td>
                    <td className={`py-1 font-sans font-semibold ${t.side === "beli" ? "text-up" : "text-down"}`}>
                      {t.side === "beli" ? "BELI" : "JUAL"} {baseOf(t.symbol)}
                    </td>
                    <td className="py-1 text-right">
                      {qtyText(t.qty)} @ ${formatPrice(t.price)}
                    </td>
                    <td className={`py-1 text-right ${t.pnl === null ? "text-muted" : t.pnl >= 0 ? "text-up" : "text-down"}`}>
                      {t.pnl === null ? usd(t.qty * t.price) : signedUsd(t.pnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-muted">
          Order diisi di harga live Binance saat tombol ditekan, dengan biaya {DEMO_FEE_PCT}% seperti Tokocrypto. Nilai
          koin dihitung setelah biaya jual. Uang demo tidak bisa ditarik; gunakan untuk berlatih sebelum memakai uang
          sungguhan.
        </p>
      </div>
    </section>
  );
}
