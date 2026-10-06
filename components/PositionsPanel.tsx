"use client";

import { useEffect, useState } from "react";
import { useLiveCandles } from "@/lib/live-candles";
import { evaluate, planLevels, type Position, type Verdict } from "@/lib/positions";
import { COINS, formatPrice, TIMEFRAMES, type Coin, type Timeframe } from "@/lib/symbols";

const verdictStyle: Record<Verdict, { badge: string; text: string }> = {
  tahan: { badge: "bg-up/15 text-up", text: "TAHAN" },
  amankan: { badge: "bg-yellow-500/15 text-yellow-400", text: "AMANKAN" },
  jual: { badge: "bg-down text-white animate-pulse", text: "JUAL" },
};

// Fresh id and timestamp for a position recorded right now.
function stampNew(): { id: string; entryTime: number } {
  return { id: crypto.randomUUID(), entryTime: Date.now() };
}

function when(time: number): string {
  return new Date(time).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function PositionCard({ position, onRemove }: { position: Position; onRemove: () => void }) {
  const coin = COINS.find((c) => c.symbol === position.symbol);
  const live = useLiveCandles(position.symbol, position.interval);
  const status = live.candles ? evaluate(position, live.candles) : null;
  const tf = TIMEFRAMES.find((t) => t.binance === position.interval)?.label ?? position.interval;

  return (
    <div className="rounded bg-base p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${live.live ? "animate-pulse bg-up" : "bg-muted"}`} />
            <span className="text-sm font-semibold">{coin?.base ?? position.symbol}</span>
            <span className="text-[11px] text-muted">
              beli {when(position.entryTime)} di ${formatPrice(position.entryPrice)}
              {position.amount !== null && ` · ${position.amount} ${coin?.base}`} · rencana candle {tf}
            </span>
          </div>
          {status && (
            <div className="mt-1 flex items-baseline gap-2 font-mono">
              <span className="text-lg font-semibold">${formatPrice(status.price)}</span>
              <span className={`text-sm ${status.pnlPct >= 0 ? "text-up" : "text-down"}`}>
                {status.pnlPct >= 0 ? "+" : ""}
                {status.pnlPct.toFixed(2)}%
                {status.pnlValue !== null &&
                  ` (${status.pnlValue >= 0 ? "+" : "-"}$${Math.abs(status.pnlValue).toFixed(2)})`}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <span className={`rounded px-2.5 py-1 text-sm font-bold ${verdictStyle[status.verdict].badge}`}>
              {verdictStyle[status.verdict].text}
            </span>
          )}
          <button
            onClick={onRemove}
            className="rounded border border-line px-2 py-1 text-[11px] text-muted hover:bg-panel hover:text-fg"
          >
            Sudah dijual / hapus
          </button>
        </div>
      </div>

      {!status && <p className="mt-2 text-xs text-muted">{live.error ? "Harga gagal dimuat, mencoba lagi…" : "Memuat harga…"}</p>}

      {status && (
        <>
          <p className="mt-2 text-sm font-semibold">{status.headline}</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
            {status.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center font-mono text-xs">
            <div className="rounded bg-panel p-2">
              <div className="font-sans text-[11px] text-down">Stop loss (jual rugi)</div>
              <div>${formatPrice(position.stop)}</div>
              <div className="text-[11px] text-muted">
                {(((position.stop - position.entryPrice) / position.entryPrice) * 100).toFixed(2)}%
              </div>
            </div>
            <div className="rounded bg-panel p-2">
              <div className="font-sans text-[11px] text-up">Target 1 (jual sebagian)</div>
              <div>${formatPrice(position.target1)}</div>
              <div className="text-[11px] text-muted">
                +{(((position.target1 - position.entryPrice) / position.entryPrice) * 100).toFixed(2)}%
              </div>
            </div>
            <div className="rounded bg-panel p-2">
              <div className="font-sans text-[11px] text-up">Target 2 (jual semua)</div>
              <div>${formatPrice(position.target2)}</div>
              <div className="text-[11px] text-muted">
                +{(((position.target2 - position.entryPrice) / position.entryPrice) * 100).toFixed(2)}%
              </div>
            </div>
          </div>

          <div className="relative mt-3 h-2 rounded-full bg-line">
            <div className="absolute left-1/2 top-0 h-full w-px bg-muted" />
            <div
              className={`absolute top-0 h-full rounded-full ${status.progress >= 0 ? "bg-up" : "bg-down"}`}
              style={
                status.progress >= 0
                  ? { left: "50%", width: `${status.progress * 50}%` }
                  : { right: "50%", width: `${-status.progress * 50}%` }
              }
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted">
            <span>Stop loss</span>
            <span>Harga beli</span>
            <span>Target 1</span>
          </div>
        </>
      )}
    </div>
  );
}

function NewPositionForm({
  coin,
  timeframe,
  onAdd,
}: {
  coin: Coin;
  timeframe: Timeframe;
  onAdd: (p: Position) => void;
}) {
  const [symbol, setSymbol] = useState(coin.symbol);
  const [interval, setInterval] = useState<string>(timeframe.binance);
  const [entry, setEntry] = useState("");
  const [amount, setAmount] = useState("");
  const live = useLiveCandles(symbol, interval);
  const current = live.candles ? live.candles[live.candles.length - 1].close : null;
  const entryPrice = entry.trim() === "" ? current : Number(entry);
  const levels = live.candles && entryPrice && entryPrice > 0 ? planLevels(live.candles, entryPrice) : null;

  function submit() {
    if (!levels || !entryPrice) return;
    onAdd({
      ...stampNew(),
      symbol,
      interval,
      entryPrice,
      amount: amount.trim() === "" ? null : Number(amount) || null,
      stop: levels.stop,
      target1: levels.target1,
      target2: levels.target2,
    });
    setEntry("");
    setAmount("");
  }

  const rr = levels && entryPrice ? (levels.target1 - entryPrice) / (entryPrice - levels.stop) : null;

  return (
    <div className="flex flex-col gap-3 rounded bg-base p-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="text-[11px] text-muted">
          Koin
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="mt-1 w-full rounded border border-line bg-panel px-2 py-1.5 text-sm text-fg"
          >
            {COINS.map((c) => (
              <option key={c.symbol} value={c.symbol}>
                {c.base} — {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-muted">
          Gaya trading (candle)
          <select
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
            className="mt-1 w-full rounded border border-line bg-panel px-2 py-1.5 text-sm text-fg"
          >
            {TIMEFRAMES.map((t) => (
              <option key={t.binance} value={t.binance}>
                {t.label} {t.binance === "1h" ? "(harian)" : t.binance === "1d" ? "(mingguan)" : t.binance === "1w" ? "(bulanan)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-muted">
          Harga beli (USDT)
          <input
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            placeholder={current ? formatPrice(current) : "harga sekarang"}
            inputMode="decimal"
            className="mt-1 w-full rounded border border-line bg-panel px-2 py-1.5 font-mono text-sm text-fg"
          />
        </label>
        <label className="text-[11px] text-muted">
          Jumlah koin (opsional)
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="mis. 0.01"
            inputMode="decimal"
            className="mt-1 w-full rounded border border-line bg-panel px-2 py-1.5 font-mono text-sm text-fg"
          />
        </label>
      </div>

      {levels && entryPrice ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-mono">
            <span className="text-down">Stop ${formatPrice(levels.stop)}</span> ·{" "}
            <span className="text-up">Target 1 ${formatPrice(levels.target1)}</span> ·{" "}
            <span className="text-up">Target 2 ${formatPrice(levels.target2)}</span>
            {rr !== null && <span className="text-muted"> · untung:rugi {rr.toFixed(1)} : 1</span>}
          </span>
          <button
            onClick={submit}
            className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Catat pembelian
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted">
          {live.error ? "Harga gagal dimuat." : "Memuat harga untuk menghitung rencana jual…"}
        </p>
      )}
      <p className="text-[11px] leading-snug text-muted">
        Stop loss = harga beli − 1,5×ATR (gerak rata-rata per candle). Target 1 = resistance terdekat jika
        jaraknya minimal sama dengan risiko, kalau tidak harga beli + 2×ATR. Target 2 = harga beli + 3×ATR.
        Setelah dicatat, aplikasi memantau posisi ini real-time dan memberi tahu kapan harus jual.
      </p>
    </div>
  );
}

export default function PositionsPanel({ coin, timeframe }: { coin: Coin; timeframe: Timeframe }) {
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/positions")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!cancelled) setPositions(json.positions);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Gagal memuat posisi"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(next: Position[]) {
    setPositions(next);
    try {
      const res = await fetch("/api/positions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan posisi");
    }
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Posisi Saya: Kapan Harus Jual</h2>
        <span className="text-xs text-muted">Tersimpan di akun Anda · dipantau real-time</span>
      </header>
      <div className="flex flex-col gap-3 p-3">
        {error && <p className="rounded border border-down/40 bg-down/10 px-3 py-2 text-xs text-down">{error}</p>}
        <NewPositionForm coin={coin} timeframe={timeframe} onAdd={(p) => save([...(positions ?? []), p])} />
        {positions === null && !error && <p className="text-sm text-muted">Memuat posisi…</p>}
        {positions && positions.length === 0 && (
          <p className="text-sm text-muted">Belum ada pembelian yang dicatat. Catat pembelian di atas setelah Anda membeli di Tokocrypto.</p>
        )}
        {positions?.map((p) => (
          <PositionCard key={p.id} position={p} onRemove={() => save(positions.filter((x) => x.id !== p.id))} />
        ))}
        <p className="text-[11px] leading-snug text-muted">
          TAHAN = belum ada alasan jual. AMANKAN = untung sudah cukup atau ada sinyal jual saat rugi: naikkan stop
          loss atau jual sebagian. JUAL = stop loss tersentuh, target tercapai, atau sinyal jual muncul setelah
          pembelian. Keputusan tetap di tangan Anda; ini bukan saran keuangan.
        </p>
      </div>
    </section>
  );
}
