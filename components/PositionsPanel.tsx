"use client";

import { useEffect, useState } from "react";
import { useLiveCandles } from "@/lib/live-candles";
import {
  evaluate,
  planLevels,
  type ClosedTrade,
  type ExitMode,
  type Position,
  type Verdict,
} from "@/lib/positions";
import TradeReport from "./TradeReport";
import {
  COINS,
  formatPrice,
  TIMEFRAMES,
  type Coin,
  type Timeframe,
} from "@/lib/symbols";

const verdictStyle: Record<Verdict, { badge: string; text: string }> = {
  tahan: { badge: "bg-up/15 text-up", text: "TAHAN" },
  amankan: { badge: "bg-yellow-500/15 text-yellow-400", text: "AMANKAN" },
  jual: { badge: "bg-down text-white animate-pulse", text: "JUAL" },
};

// Fresh id and timestamp for a position recorded (or closed) right now.
function stampNew(): { id: string; entryTime: number } {
  return { id: crypto.randomUUID(), entryTime: Date.now() };
}

function when(time: number): string {
  return new Date(time).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PositionCard({
  position,
  onClose,
  onRemove,
}: {
  position: Position;
  onClose: (exitPrice: number) => void;
  onRemove: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [exit, setExit] = useState("");
  const coin = COINS.find((c) => c.symbol === position.symbol);
  const live = useLiveCandles(position.symbol, position.interval);
  const status = live.candles ? evaluate(position, live.candles) : null;
  const tf =
    TIMEFRAMES.find((t) => t.binance === position.interval)?.label ??
    position.interval;

  return (
    <div className="rounded bg-base p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${live.live ? "animate-pulse bg-up" : "bg-muted"}`}
            />
            <span className="text-sm font-semibold">
              {coin?.base ?? position.symbol}
            </span>
            <span className="text-[11px] text-muted">
              beli {when(position.entryTime)} di $
              {formatPrice(position.entryPrice)}
              {position.amount !== null &&
                ` · ${position.amount} ${coin?.base}`}{" "}
              · candle {tf} ·{" "}
              {position.mode === "untung"
                ? "jual hanya saat untung"
                : "pakai stop loss"}
            </span>
          </div>
          {status && (
            <div className="mt-1 flex items-baseline gap-2 font-mono">
              <span className="text-lg font-semibold">
                ${formatPrice(status.price)}
              </span>
              <span
                className={`text-sm ${status.pnlPct >= 0 ? "text-up" : "text-down"}`}
              >
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
            <span
              className={`rounded px-2.5 py-1 text-sm font-bold ${verdictStyle[status.verdict].badge}`}
            >
              {verdictStyle[status.verdict].text}
            </span>
          )}
          <button
            onClick={() => setClosing((c) => !c)}
            className="rounded btn-active px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90"
          >
            Sudah dijual
          </button>
          <button
            onClick={() => {
              if (window.confirm("Hapus posisi ini tanpa mencatat hasilnya?"))
                onRemove();
            }}
            className="rounded border border-line px-2 py-1 text-[11px] text-muted hover:bg-panel hover:text-fg"
          >
            Hapus
          </button>
        </div>
      </div>

      {closing && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded border border-line p-2">
          <label className="text-[11px] text-muted">
            Harga jual (USDT)
            <input
              value={exit}
              onChange={(e) => setExit(e.target.value)}
              placeholder={status ? formatPrice(status.price) : "harga jual"}
              inputMode="decimal"
              autoFocus
              className="mt-1 block w-40 rounded border border-line bg-panel px-2 py-1.5 font-mono text-sm text-fg"
            />
          </label>
          <button
            onClick={() => {
              const price = exit.trim() === "" ? status?.price : Number(exit);
              if (price && price > 0) onClose(price);
            }}
            className="rounded bg-up px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Simpan ke laporan
          </button>
          <button
            onClick={() => setClosing(false)}
            className="px-2 py-1.5 text-xs text-muted hover:text-fg"
          >
            Batal
          </button>
          <span className="w-full text-[11px] text-muted">
            Kosongkan harga jual untuk memakai harga sekarang. Hasilnya masuk ke
            Laporan Untung Rugi.
          </span>
        </div>
      )}

      {!status && (
        <p className="mt-2 text-xs text-muted">
          {live.error ? "Harga gagal dimuat, mencoba lagi…" : "Memuat harga…"}
        </p>
      )}

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
              <div className="font-sans text-[11px] text-down">
                {position.mode === "untung"
                  ? "Tanpa stop loss"
                  : "Stop loss (jual rugi)"}
              </div>
              <div>${formatPrice(position.stop)}</div>
              <div className="text-[11px] text-muted">
                {(
                  ((position.stop - position.entryPrice) /
                    position.entryPrice) *
                  100
                ).toFixed(2)}
                %
              </div>
            </div>
            <div className="rounded bg-panel p-2">
              <div className="font-sans text-[11px] text-up">
                Target 1 (jual sebagian)
              </div>
              <div>${formatPrice(position.target1)}</div>
              <div className="text-[11px] text-muted">
                +
                {(
                  ((position.target1 - position.entryPrice) /
                    position.entryPrice) *
                  100
                ).toFixed(2)}
                %
              </div>
            </div>
            <div className="rounded bg-panel p-2">
              <div className="font-sans text-[11px] text-up">
                Target 2 (jual semua)
              </div>
              <div>${formatPrice(position.target2)}</div>
              <div className="text-[11px] text-muted">
                +
                {(
                  ((position.target2 - position.entryPrice) /
                    position.entryPrice) *
                  100
                ).toFixed(2)}
                %
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
            <span>
              {position.mode === "untung" ? "Rugi (ditahan)" : "Stop loss"}
            </span>
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
  const [mode, setMode] = useState<ExitMode>("untung");
  const [entry, setEntry] = useState("");
  const [amount, setAmount] = useState("");
  const live = useLiveCandles(symbol, interval);
  const current = live.candles
    ? live.candles[live.candles.length - 1].close
    : null;
  const entryPrice = entry.trim() === "" ? current : Number(entry);
  const levels =
    live.candles && entryPrice && entryPrice > 0
      ? planLevels(live.candles, entryPrice)
      : null;

  function submit() {
    if (!levels || !entryPrice) return;
    onAdd({
      ...stampNew(),
      symbol,
      mode,
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

  const rr =
    levels && entryPrice
      ? (levels.target1 - entryPrice) / (entryPrice - levels.stop)
      : null;

  return (
    <div className="flex flex-col gap-3 rounded bg-base p-3">
      <div className="grid gap-2 sm:grid-cols-5">
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
                {t.label}{" "}
                {t.binance === "1h"
                  ? "(harian)"
                  : t.binance === "1d"
                    ? "(mingguan)"
                    : t.binance === "1w"
                      ? "(bulanan)"
                      : ""}
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
          Kapan boleh jual
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as ExitMode)}
            className="mt-1 w-full rounded border border-line bg-panel px-2 py-1.5 text-sm text-fg"
          >
            <option value="untung">Hanya saat untung</option>
            <option value="stoploss">Pakai stop loss</option>
          </select>
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
            {mode === "stoploss" && (
              <>
                <span className="text-down">
                  Stop ${formatPrice(levels.stop)}
                </span>{" "}
                ·{" "}
              </>
            )}
            <span className="text-up">
              Target 1 ${formatPrice(levels.target1)}
            </span>{" "}
            ·{" "}
            <span className="text-up">
              Target 2 ${formatPrice(levels.target2)}
            </span>
            {rr !== null && (
              <span className="text-muted">
                {" "}
                · untung:rugi {rr.toFixed(1)} : 1
              </span>
            )}
          </span>
          <button
            onClick={submit}
            className="rounded btn-active px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Catat pembelian
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted">
          {live.error
            ? "Harga gagal dimuat."
            : "Memuat harga untuk menghitung rencana jual…"}
        </p>
      )}
      <p className="text-[11px] leading-snug text-muted">
        <strong className="text-fg">Hanya saat untung</strong>: aplikasi tidak
        pernah menyarankan jual di bawah harga beli; sinyal JUAL baru muncul
        setelah untung minimal 0,5% (menutup biaya) dan target tercapai, sinyal
        jual terbentuk, atau arah pasar berbalik turun. Risikonya: kalau harga
        terus turun, posisi bisa tertahan lama atau tidak pernah kembali untung.{" "}
        <strong className="text-fg">Pakai stop loss</strong>: jual rugi di harga
        beli − 1,5×ATR untuk membatasi kerugian. Target 1 = resistance terdekat
        (atau +2×ATR), target 2 = +3×ATR.
      </p>
    </div>
  );
}

export default function PositionsPanel({
  coin,
  timeframe,
}: {
  coin: Coin;
  timeframe: Timeframe;
}) {
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [trades, setTrades] = useState<ClosedTrade[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/positions")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (cancelled) return;
        setPositions(json.positions);
        setTrades(json.trades ?? []);
      })
      .catch(
        (e) =>
          !cancelled &&
          setError(e instanceof Error ? e.message : "Gagal memuat posisi"),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(
    nextPositions: Position[],
    nextTrades: ClosedTrade[] = trades,
  ) {
    setPositions(nextPositions);
    setTrades(nextTrades);
    try {
      const res = await fetch("/api/positions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: nextPositions, trades: nextTrades }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setTrades(json.trades);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    }
  }

  function closePosition(p: Position, exitPrice: number) {
    const closed: ClosedTrade = {
      id: p.id,
      symbol: p.symbol,
      interval: p.interval,
      entryPrice: p.entryPrice,
      entryTime: p.entryTime,
      amount: p.amount,
      exitPrice,
      exitTime: stampNew().entryTime,
    };
    save(
      (positions ?? []).filter((x) => x.id !== p.id),
      [closed, ...trades],
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <section className="panel">
        <header className="panel-header">
          <h2>Posisi Saya: Kapan Harus Jual</h2>
          <span className="text-xs text-muted">
            Tersimpan di akun Anda · dipantau real-time
          </span>
        </header>
        <div className="flex flex-col gap-3 p-3">
          {error && (
            <p className="rounded border border-down/40 bg-down/10 px-3 py-2 text-xs text-down">
              {error}
            </p>
          )}
          <NewPositionForm
            coin={coin}
            timeframe={timeframe}
            onAdd={(p) => save([...(positions ?? []), p])}
          />
          {positions === null && !error && (
            <p className="text-sm text-muted">Memuat posisi…</p>
          )}
          {positions && positions.length === 0 && (
            <p className="text-sm text-muted">
              Belum ada pembelian yang dicatat. Catat pembelian di atas setelah
              Anda membeli di Tokocrypto.
            </p>
          )}
          {positions?.map((p) => (
            <PositionCard
              key={p.id}
              position={p}
              onClose={(exitPrice) => closePosition(p, exitPrice)}
              onRemove={() => save(positions.filter((x) => x.id !== p.id))}
            />
          ))}
          <p className="text-[11px] leading-snug text-muted">
            TAHAN = belum ada alasan jual. AMANKAN = untung sudah cukup atau ada
            sinyal jual saat rugi: naikkan stop loss atau jual sebagian. JUAL =
            stop loss tersentuh, target tercapai, atau sinyal jual muncul
            setelah pembelian. Keputusan tetap di tangan Anda; ini bukan saran
            keuangan.
          </p>
        </div>
      </section>
      <TradeReport
        trades={trades}
        onDelete={(id) =>
          save(
            positions ?? [],
            trades.filter((t) => t.id !== id),
          )
        }
        onClear={() => save(positions ?? [], [])}
      />
    </div>
  );
}
