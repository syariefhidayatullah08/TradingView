"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ADVICE_LABEL,
  buyCost,
  DEMO_SAHAM_START,
  sellProceeds,
  type Advice,
  type Bucket,
  type SahamAccount,
  type SahamTrade,
  type Side,
} from "@/lib/demo-saham";
import { BUY_FEE, LOT, SELL_FEE, STOCKS } from "@/lib/saham";
import { idr } from "@/lib/saham-signals";
import { useSahamChart } from "@/lib/use-saham-chart";

const PRICE_REFRESH_MS = 60_000;

function rp(n: number): string {
  return `${n < 0 ? "-" : ""}Rp${Math.round(Math.abs(n)).toLocaleString("id-ID")}`;
}

function signedRp(n: number): string {
  return `${n >= 0 ? "+" : ""}${rp(n)}`;
}

function signedPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

const ADVICE_CLASS: Record<Advice, string> = { 0: "text-up", 1: "text-amber-300", 2: "text-down" };

function AdviceTag({ advice }: { advice: Advice | null }) {
  if (advice === null) return <span className="text-muted">—</span>;
  return <span className={ADVICE_CLASS[advice]}>{ADVICE_LABEL[advice]}</span>;
}

function BucketRow({ label, b }: { label: string; b: Bucket }) {
  return (
    <tr className="border-t border-line">
      <td className="py-1.5">{label}</td>
      <td className="py-1.5 text-right font-mono">{b.n}</td>
      <td className="py-1.5 text-right font-mono">{b.n ? `${Math.round((b.wins / b.n) * 100)}%` : "—"}</td>
      <td
        className={`py-1.5 text-right font-mono ${b.n === 0 ? "text-muted" : b.pnl >= 0 ? "text-up" : "text-down"}`}
      >
        {b.n ? signedRp(b.pnl) : "—"}
      </td>
    </tr>
  );
}

function when(time: number): string {
  return new Date(time).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Last price of several IDX codes ("IHSG" for the index), refreshed every minute; prices are
// delayed ±10 minutes anyway, so polling faster would only add load.
function useSahamPrices(codes: string[]): Record<string, number> {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const key = codes.join(",");

  useEffect(() => {
    const list = key ? key.split(",") : [];
    let cancelled = false;
    const update = async () => {
      const got = await Promise.all(
        list.map(async (c) => {
          try {
            const res = await fetch(`/api/saham/chart?code=${c}&tf=1d`);
            const j = await res.json();
            return res.ok && j.price > 0 ? ([c, j.price as number] as const) : null;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setPrices((p) => {
        const next: Record<string, number> = {};
        for (const c of list) if (p[c]) next[c] = p[c];
        for (const g of got) if (g) next[g[0]] = g[1];
        return next;
      });
    };
    update();
    const timer = setInterval(update, PRICE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [key]);

  return prices;
}

function OrderForm({
  account,
  code,
  onCode,
  onDone,
}: {
  account: SahamAccount;
  code: string;
  onCode: (code: string) => void;
  onDone: (a: SahamAccount, t: SahamTrade) => void;
}) {
  const isStock = /^[A-Z]{4}$/.test(code);
  const [query, setQuery] = useState(isStock ? code : "");
  // Follow a stock picked elsewhere (chart, holdings) unless it is the one being typed.
  const [shown, setShown] = useState(code);
  if (code !== shown) {
    setShown(code);
    if (query.trim().toUpperCase() !== code) setQuery(isStock ? code : "");
  }
  const [side, setSide] = useState<Side>("beli");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chart = useSahamChart(code, "1d");
  const price = isStock && chart.data?.price ? chart.data.price : null;
  const held = account.holdings.find((h) => h.code === code);
  const lots = Number(amount);
  const validLots = Number.isInteger(lots) && lots >= 1;
  const maxBuy = price ? Math.floor(account.cash / buyCost(1, price)) : 0;

  function pick(text: string) {
    const c = text.trim().toUpperCase();
    setQuery(c);
    if (/^[A-Z]{4}$/.test(c) && c !== code) {
      onCode(c);
      setAmount("");
      setError(null);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/saham/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, side, lots }),
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

  const preview =
    validLots && price
      ? side === "beli"
        ? `≈ ${rp(buyCost(lots, price))} dibayar · biaya ${rp(lots * LOT * price * BUY_FEE)}`
        : `≈ ${rp(sellProceeds(lots, price))} diterima · biaya ${rp(lots * LOT * price * SELL_FEE)}`
      : null;
  const shares = [0.25, 0.5, 1];

  return (
    <div className="flex flex-col gap-3 rounded bg-base p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[11px] text-muted">
          Kode saham (mis. BBCA)
          <input
            value={query}
            onChange={(e) => pick(e.target.value)}
            list="demo-saham-codes"
            maxLength={4}
            className="mt-1 block w-32 rounded border border-line bg-panel px-2 py-1.5 font-mono text-sm uppercase text-fg"
          />
          <datalist id="demo-saham-codes">
            {STOCKS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </datalist>
        </label>
        {isStock ? (
          <div>
            <div className="text-[11px] text-muted">
              {code} · {chart.session.text}
            </div>
            <div className="font-mono text-xl font-semibold">
              {price ? (
                idr(price)
              ) : chart.error ? (
                <span className="text-sm text-down">{chart.error}</span>
              ) : (
                "…"
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted">
            Pilih saham dulu (ketik kodenya atau pilih di chart) untuk membeli.
          </p>
        )}
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
                side === s
                  ? s === "beli"
                    ? "bg-up text-black"
                    : "bg-down text-white"
                  : "text-muted hover:text-fg"
              }`}
            >
              {s === "beli" ? "Beli" : "Jual"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-muted">
          Jumlah lot (1 lot = {LOT} lembar)
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="0"
            className="mt-1 block w-36 rounded border border-line bg-panel px-2 py-1.5 font-mono text-sm text-fg"
          />
        </label>
        {shares.map((f) => (
          <button
            key={f}
            disabled={side === "jual" ? !held : !maxBuy}
            onClick={() => {
              const max = side === "beli" ? maxBuy : (held?.lots ?? 0);
              setAmount(String(Math.max(1, Math.floor(max * f))));
            }}
            className="rounded border border-line px-2 py-1.5 text-xs hover:bg-panel disabled:opacity-40"
          >
            {f === 1 ? "Semua" : `${f * 100}%`}
          </button>
        ))}
        <button
          onClick={submit}
          disabled={busy || !validLots || !price}
          className={`rounded px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
            side === "beli" ? "bg-up text-black" : "bg-down text-white"
          }`}
        >
          {busy ? "Memproses…" : `${side === "beli" ? "Beli" : "Jual"} ${isStock ? code : ""}`}
        </button>
      </div>

      <div className="text-[11px] text-muted">
        {side === "beli"
          ? `Saldo: ${rp(account.cash)}${price ? ` · maks ${maxBuy} lot` : ""}`
          : held
            ? `Dimiliki: ${held.lots} lot ${code}`
            : isStock
              ? `Anda belum punya ${code}`
              : "Pilih saham yang dimiliki"}
        {preview && ` · ${preview}`}
      </div>
      {error && <div className="text-xs text-down">{error}</div>}
    </div>
  );
}

export default function SahamDemoPanel({ code, onCode }: { code: string; onCode: (code: string) => void }) {
  const [account, setAccount] = useState<SahamAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<SahamTrade | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/saham/demo")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!cancelled) setAccount(json);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Akun demo saham gagal dimuat"));
    return () => {
      cancelled = true;
    };
  }, []);

  // Held stocks plus IHSG, for the comparison with simply holding the index.
  const codes = useMemo(
    () => [...new Set([...(account?.holdings.map((h) => h.code) ?? []), "IHSG"])],
    [account],
  );
  const prices = useSahamPrices(codes);

  async function reset() {
    if (
      !window.confirm(
        `Reset akun demo saham ke ${rp(DEMO_SAHAM_START)}? Semua saham dan riwayat demo dihapus.`,
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      const res = await fetch("/api/saham/demo", {
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
          <h2>Akun Demo Saham</h2>
        </header>
        <p className={`p-4 text-sm ${error ? "text-down" : "text-muted"}`}>
          {error ?? "Memuat akun demo saham…"}
        </p>
      </section>
    );
  }

  // Stocks valued after the sell fee, like the holdings table; a stock without a price yet is not
  // silently counted at cost, the totals say they are still being calculated instead.
  const pending = account.holdings.filter((h) => !prices[h.code]).length;
  const stocksValue = account.holdings.reduce(
    (sum, h) => sum + (prices[h.code] ? sellProceeds(h.lots, prices[h.code]) : h.cost),
    0,
  );
  const equity = account.cash + stocksValue;
  const total = equity - DEMO_SAHAM_START;
  const accountPct = (total / DEMO_SAHAM_START) * 100;
  const ihsgNow = prices.IHSG;
  const ihsgPct =
    account.ihsgStart && ihsgNow ? ((ihsgNow - account.ihsgStart) / account.ihsgStart) * 100 : null;

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Akun Demo Saham</h2>
        <span className="flex items-center gap-2 text-xs text-muted">
          Uang virtual · sejak {when(account.startedAt)}
          <button
            onClick={reset}
            disabled={resetting}
            className="rounded border border-line px-2 py-0.5 text-[11px] font-medium text-fg hover:bg-base disabled:opacity-50"
          >
            ↻ Reset ke {rp(DEMO_SAHAM_START)}
          </button>
        </span>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded bg-base p-3">
            <div className="text-[11px] text-muted">Total aset</div>
            <div className="font-mono text-lg font-semibold">{pending ? "menghitung…" : rp(equity)}</div>
          </div>
          <div className="rounded bg-base p-3">
            <div className="text-[11px] text-muted">Untung / rugi total</div>
            {pending ? (
              <div className="font-mono text-lg font-semibold text-muted">menghitung…</div>
            ) : (
              <>
                <div className={`font-mono text-lg font-semibold ${total >= 0 ? "text-up" : "text-down"}`}>
                  {signedRp(total)}
                </div>
                <div className={`text-[11px] ${total >= 0 ? "text-up" : "text-down"}`}>
                  {signedPct(accountPct)} · belum terjual {signedRp(total - account.realized)}
                </div>
              </>
            )}
          </div>
          <div className="rounded bg-base p-3">
            <div className="text-[11px] text-muted">Saldo tunai</div>
            <div className="font-mono text-lg font-semibold">{rp(account.cash)}</div>
          </div>
          <div className="rounded bg-base p-3">
            <div className="text-[11px] text-muted">Untung terealisasi</div>
            <div
              className={`font-mono text-lg font-semibold ${account.realized >= 0 ? "text-up" : "text-down"}`}
            >
              {signedRp(account.realized)}
            </div>
          </div>
        </div>

        <OrderForm
          account={account}
          code={code}
          onCode={onCode}
          onDone={(a, t) => {
            setAccount(a);
            setLast(t);
          }}
        />

        {last && (
          <div
            className={`rounded border px-3 py-2 text-xs ${last.side === "beli" ? "border-up/40 text-up" : "border-down/40 text-down"}`}
          >
            ✓ {last.side === "beli" ? "Beli" : "Jual"} {last.lots} lot {last.code} di {idr(last.price)}
            {last.pnl !== null && ` · hasil ${signedRp(last.pnl)}`}
          </div>
        )}

        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">Saham dimiliki</div>
          {account.holdings.length === 0 ? (
            <p className="text-sm text-muted">Belum ada saham. Coba beli di atas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] text-muted">
                    <th className="py-1 text-left font-medium">Saham</th>
                    <th className="py-1 text-right font-medium">Lot</th>
                    <th className="py-1 text-right font-medium">Harga beli rata2</th>
                    <th className="py-1 text-right font-medium">Harga sekarang</th>
                    <th className="py-1 text-right font-medium">Nilai</th>
                    <th className="py-1 text-right font-medium">Untung/rugi</th>
                    <th className="py-1 text-right font-medium">Saran saat beli</th>
                  </tr>
                </thead>
                <tbody>
                  {account.holdings.map((h) => {
                    const p = prices[h.code];
                    const value = p ? sellProceeds(h.lots, p) : null;
                    const pnl = value !== null ? value - h.cost : null;
                    return (
                      <tr
                        key={h.code}
                        onClick={() => onCode(h.code)}
                        className="cursor-pointer border-t border-line font-mono hover:bg-base"
                      >
                        <td className="py-1.5 font-sans font-semibold">{h.code}</td>
                        <td className="py-1.5 text-right">{h.lots}</td>
                        <td className="py-1.5 text-right">{idr(h.cost / (h.lots * LOT))}</td>
                        <td className="py-1.5 text-right">{p ? idr(p) : "…"}</td>
                        <td className="py-1.5 text-right">{value !== null ? rp(value) : "…"}</td>
                        <td
                          className={`py-1.5 text-right ${pnl === null ? "" : pnl >= 0 ? "text-up" : "text-down"}`}
                        >
                          {pnl !== null ? `${signedRp(pnl)} (${((pnl / h.cost) * 100).toFixed(2)}%)` : "…"}
                        </td>
                        <td className="py-1.5 text-right font-sans">
                          <AdviceTag advice={h.tag} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded bg-base p-3">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">
            Bukti: ikut saran aplikasi atau tidak?
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-muted">
                <th className="py-1 text-left font-medium">Saham yang dijual</th>
                <th className="py-1 text-right font-medium">Penjualan</th>
                <th className="py-1 text-right font-medium">Untung</th>
                <th className="py-1 text-right font-medium">Hasil bersih</th>
              </tr>
            </thead>
            <tbody>
              <BucketRow label="Dibeli saat saran BELI" b={account.followed} />
              <BucketRow label="Dibeli tanpa saran BELI" b={account.other} />
            </tbody>
          </table>
          <div className="mt-2 text-xs">
            Akun demo{" "}
            <b className={pending ? "text-muted" : accountPct >= 0 ? "text-up" : "text-down"}>
              {pending ? "…" : signedPct(accountPct)}
            </b>{" "}
            vs beli IHSG lalu tahan sejak akun dimulai{" "}
            <b className={ihsgPct === null ? "text-muted" : ihsgPct >= 0 ? "text-up" : "text-down"}>
              {ihsgPct === null ? "…" : signedPct(ihsgPct)}
            </b>
            {!pending && ihsgPct !== null && (
              <span className="text-muted">
                {" "}
                · {accountPct >= ihsgPct ? "trading Anda lebih baik" : "menahan IHSG lebih baik"} sejauh ini
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Saat Anda membeli, aplikasi mencatat sarannya untuk saham itu (candle harian, seperti tab Analisa
            Teknikal). Saham di luar daftar aplikasi tidak punya catatan saran. Setelah beberapa minggu
            terlihat apakah mengikuti saran BELI memang lebih untung.
          </p>
        </div>

        {account.trades.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">
              Riwayat transaksi demo
            </div>
            <table className="w-full text-xs">
              <tbody>
                {account.trades.slice(0, 12).map((t, i) => (
                  <tr key={`${t.time}-${i}`} className="border-t border-line font-mono">
                    <td className="py-1 font-sans text-muted">{when(t.time)}</td>
                    <td
                      className={`py-1 font-sans font-semibold ${t.side === "beli" ? "text-up" : "text-down"}`}
                    >
                      {t.side === "beli" ? "BELI" : "JUAL"} {t.code}
                      {t.side === "beli" && t.advice !== null && (
                        <span className="ml-1 text-[10px] font-normal">
                          (saran <AdviceTag advice={t.advice} />)
                        </span>
                      )}
                    </td>
                    <td className="py-1 text-right">
                      {t.lots} lot @ {idr(t.price)}
                    </td>
                    <td
                      className={`py-1 text-right ${t.pnl === null ? "text-muted" : t.pnl >= 0 ? "text-up" : "text-down"}`}
                    >
                      {t.pnl === null ? rp(t.lots * LOT * t.price + t.fee) : signedRp(t.pnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-muted">
          Harga saham tertunda ±10 menit. Order diisi di harga terakhir saat tombol ditekan, juga ketika bursa
          tutup, dalam lot utuh (1 lot = {LOT} lembar) dengan biaya beli{" "}
          {(BUY_FEE * 100).toLocaleString("id-ID")}% dan jual {(SELL_FEE * 100).toLocaleString("id-ID")}%
          (termasuk pajak) seperti broker online. Nilai saham dihitung setelah biaya jual. Uang demo tidak
          bisa ditarik; gunakan untuk berlatih sebelum memakai uang sungguhan.
        </p>
      </div>
    </section>
  );
}
