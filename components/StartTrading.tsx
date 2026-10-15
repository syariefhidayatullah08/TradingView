"use client";

import { useEffect, useState } from "react";
import { advise, MARKET_INTERVAL, MARKET_SYMBOL } from "@/lib/advice";
import type { Action } from "@/lib/decision";
import { useLiveCandles } from "@/lib/live-candles";
import { netTargetPrice, type ClosedTrade, type Mood, type Position } from "@/lib/positions";
import { applyLock, riskSizedUsdt, weeklyLock } from "@/lib/risk";
import JournalFields from "./JournalFields";
import { partUsdt } from "@/lib/santai";
import { useSantai } from "@/lib/use-santai";
import { formatPrice, higherTimeframe, tokocryptoUrl, type Coin, type Timeframe } from "@/lib/symbols";

const actionStyle: Record<Action, { box: string; title: string; label: string }> = {
  beli: { box: "border-up/50 bg-up/10", title: "text-up", label: "▲ BELI SEKARANG" },
  tunggu: { box: "border-amber-300/40 bg-amber-300/10", title: "text-amber-300", label: "⏸ TUNGGU" },
  jangan: { box: "border-down/50 bg-down/10", title: "text-down", label: "✕ JANGAN BELI" },
};

const toneDot = { 1: "bg-up", 0: "bg-muted", [-1]: "bg-down" } as const;

type SaveState = "idle" | "saving" | "saved" | "error";

// Fresh id and timestamp for a position recorded right now.
function stampNew(): { id: string; entryTime: number } {
  return { id: crypto.randomUUID(), entryTime: Date.now() };
}

function TradingDecision({ coin, timeframe, onClose }: { coin: Coin; timeframe: Timeframe; onClose: () => void }) {
  const higherTf = higherTimeframe(timeframe);
  const live = useLiveCandles(coin.symbol, timeframe.binance);
  // Subscribing to the same interval twice is harmless when there is no higher timeframe.
  const higher = useLiveCandles(coin.symbol, (higherTf ?? timeframe).binance);
  const btc = useLiveCandles(MARKET_SYMBOL, MARKET_INTERVAL);
  const [amount, setAmount] = useState("");
  const [save, setSave] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const { settings: santai, idrPerUsdt } = useSantai();
  // Open positions, for Mode Santai's one-per-coin and capital-parts limits.
  const [open, setOpen] = useState<Position[] | null>(null);
  const [trades, setTrades] = useState<ClosedTrade[] | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [mood, setMood] = useState<Mood | undefined>();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/positions")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        setOpen(json.positions);
        setTrades(json.trades ?? []);
        setLoadedAt(Date.now());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const capitalUsdt = idrPerUsdt ? santai.capitalIdr / idrPerUsdt : null;
  // Weekly loss brake from the risk manager.
  const lock = trades && capitalUsdt ? weeklyLock(trades, capitalUsdt, santai, loadedAt) : null;
  const advised =
    live.candles && live.candles.length > 60
      ? advise(live.candles, higherTf ? higher.candles : null, higherTf?.label ?? null, coin.symbol, santai, btc.candles, open)
      : null;
  const decision = advised && applyLock(advised, lock);
  // Mode Santai sizing: one equal part of the budget, sold at a fixed net profit.
  const usdtPerPart = santai.enabled && idrPerUsdt ? partUsdt(santai, idrPerUsdt) : null;
  const santaiTarget = santai.enabled && decision ? netTargetPrice(decision.price, santai.targetPct) : null;
  // Outside Mode Santai, size the buy so a stop-loss hit costs riskPct of capital.
  const riskUsdt =
    !santai.enabled && capitalUsdt && decision?.plan
      ? riskSizedUsdt(capitalUsdt, decision.price, decision.plan.stop, santai.riskPct)
      : null;
  const buyUsdt = usdtPerPart ?? riskUsdt;
  const suggestedAmount = buyUsdt && decision ? buyUsdt / decision.price : null;

  async function record() {
    if (!decision?.plan) return;
    setSave("saving");
    try {
      const current = await fetch("/api/positions").then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        return json as { positions: Position[]; trades: unknown[] };
      });
      const position: Position = {
        ...stampNew(),
        symbol: coin.symbol,
        mode: santaiTarget ? "target" : "untung",
        interval: timeframe.binance,
        entryPrice: decision.price,
        amount: amount.trim() === "" ? suggestedAmount : Number(amount) || null,
        stop: decision.plan.stop,
        target1: santaiTarget ?? decision.plan.target1,
        target2: santaiTarget ?? decision.plan.target2,
        ...(santaiTarget && santai.trailing ? { trail: true } : {}),
        why: "saran",
        ...(mood ? { mood } : {}),
      };
      const res = await fetch("/api/positions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: [...current.positions, position], trades: current.trades }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setOpen(json.positions);
      setSave("saved");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Gagal menyimpan");
      setSave("error");
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${live.live ? "animate-pulse bg-up" : "bg-muted"}`} />
          {coin.base}/USDT · candle {timeframe.label}
          {higherTf && ` · dicek dengan tren ${higherTf.label}`}
        </span>
        <span>Diperbarui langsung</span>
      </div>

      {!decision && !live.error && <p className="text-sm text-muted">Menganalisa pasar…</p>}
      {live.error && <p className="text-sm text-down">Data harga gagal dimuat, mencoba lagi…</p>}

      {decision && (
        <>
          <div className={`rounded-xl border p-4 ${actionStyle[decision.action].box}`}>
            <div className={`text-2xl font-bold ${actionStyle[decision.action].title}`}>
              {actionStyle[decision.action].label}
            </div>
            <div className="mt-1 text-sm">{decision.headline}</div>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-muted">
              Keyakinan
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-base">
                <div
                  className={`h-full ${decision.action === "beli" ? "bg-up" : decision.action === "jangan" ? "bg-down" : "bg-amber-300"}`}
                  style={{ width: `${decision.confidence}%` }}
                />
              </div>
              {decision.confidence}%
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">Alasan</div>
            <ul className="flex flex-col gap-1 text-xs">
              {decision.reasons.map((r) => (
                <li key={r.text} className="flex items-start gap-2">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${toneDot[r.tone]}`} />
                  {r.text}
                </li>
              ))}
            </ul>
          </div>

          {santaiTarget && decision.action === "beli" && (
            <div>
              <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">🌿 Rencana Mode Santai</div>
              <div className="grid grid-cols-1 gap-2 font-mono text-xs sm:grid-cols-3">
                <div className="rounded bg-base p-2">
                  <div className="font-sans text-[11px] text-muted">Beli (1 dari {santai.parts} bagian)</div>
                  {usdtPerPart ? (
                    <>
                      ${usdtPerPart.toFixed(2)} USDT
                      <div className="text-[11px] text-muted">
                        ≈ Rp {Math.round(santai.capitalIdr / santai.parts).toLocaleString("id-ID")} ·{" "}
                        {suggestedAmount?.toPrecision(3)} {coin.base}
                      </div>
                    </>
                  ) : (
                    "memuat kurs…"
                  )}
                </div>
                <div className="rounded bg-base p-2">
                  <div className="font-sans text-[11px] text-muted">
                    {santai.trailing ? "Target (lalu trailing stop)" : "Jual semua di"}
                  </div>
                  <span className="text-up">${formatPrice(santaiTarget)}</span>
                  <div className="text-[11px] text-muted">
                    untung bersih {santai.targetPct}%
                    {usdtPerPart && ` ≈ $${((usdtPerPart * santai.targetPct) / 100).toFixed(2)}`}
                  </div>
                </div>
                <div className="rounded bg-base p-2">
                  <div className="font-sans text-[11px] text-muted">Stop loss</div>
                  Tidak ada
                  <div className="text-[11px] text-muted">tahan sampai target</div>
                </div>
              </div>
              {open && (
                <div className="mt-1 text-[11px] text-muted">
                  Bagian terpakai: {open.length}/{santai.parts}. Biaya Tokocrypto 0,1% beli + 0,1% jual sudah dihitung.
                </div>
              )}
            </div>
          )}

          {decision.plan && !(santaiTarget && decision.action === "beli") && (
            <div>
              <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">
                {decision.action === "beli" ? "Rencana trading" : "Rencana jika tetap ingin beli"}
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-4">
                <div className="rounded bg-base p-2">
                  <div className="font-sans text-[11px] text-muted">Harga beli</div>${formatPrice(decision.price)}
                </div>
                <div className="rounded bg-base p-2">
                  <div className="font-sans text-[11px] text-muted">Stop loss</div>
                  <span className="text-down">${formatPrice(decision.plan.stop)}</span>
                </div>
                <div className="rounded bg-base p-2">
                  <div className="font-sans text-[11px] text-muted">Target 1</div>
                  <span className="text-up">${formatPrice(decision.plan.target1)}</span>
                </div>
                <div className="rounded bg-base p-2">
                  <div className="font-sans text-[11px] text-muted">Target 2</div>
                  <span className="text-up">${formatPrice(decision.plan.target2)}</span>
                </div>
              </div>
              {decision.riskReward !== null && (
                <div className="mt-1 text-[11px] text-muted">
                  Potensi untung ke target 1 = {decision.riskReward.toFixed(1)}× risiko ke stop loss
                </div>
              )}
              {riskUsdt && idrPerUsdt && (
                <div className="mt-2 rounded border border-line p-2 text-xs">
                  <b>Ukuran posisi (manajer risiko):</b> beli ${riskUsdt.toFixed(2)} ≈ Rp{" "}
                  {Math.round(riskUsdt * idrPerUsdt).toLocaleString("id-ID")}. Jika kena stop loss, rugi sekitar $
                  {((riskUsdt * (decision.price - decision.plan.stop)) / decision.price).toFixed(2)} ({santai.riskPct}% dari
                  modal Rp {santai.capitalIdr.toLocaleString("id-ID")}).
                </div>
              )}
            </div>
          )}

          {decision.action === "beli" && decision.plan && (
            <div className="flex flex-col gap-2 rounded bg-base p-3">
              {save === "saved" ? (
                <div className="text-sm text-up">
                  ✓ Posisi dicatat. Pantau kapan harus jual di tab <b>Posisi Saya</b>.
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-48">
                    <JournalFields mood={mood} onMood={setMood} />
                  </div>
                  <label className="text-[11px] text-muted">
                    Jumlah {coin.base} (opsional)
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      inputMode="decimal"
                      placeholder={suggestedAmount ? suggestedAmount.toPrecision(3) : "mis. 0.01"}
                      className="mt-1 block w-32 rounded border border-line bg-panel px-2 py-1.5 font-mono text-sm text-fg"
                    />
                  </label>
                  <button
                    onClick={record}
                    disabled={save === "saving"}
                    className="rounded btn-active px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {save === "saving" ? "Menyimpan…" : "Saya sudah beli, catat posisi"}
                  </button>
                  {coin.toko && (
                    <a
                      href={tokocryptoUrl(coin.base, "USDT")}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-line px-3 py-2 text-xs font-medium hover:bg-panel"
                    >
                      Buka Tokocrypto ↗
                    </a>
                  )}
                </div>
              )}
              {save === "error" && <div className="text-xs text-down">{saveError}</div>}
            </div>
          )}

          <p className="text-[11px] text-muted">
            Keputusan dihitung otomatis dari RSI, Stochastic, MACD, EMA 20/50/200, Bollinger, sinyal beli/jual,
            volume, dan tren timeframe lebih besar. Bisa berubah setiap candle. Bukan saran keuangan; gunakan
            uang yang siap Anda tanggung risikonya.
          </p>
        </>
      )}

      <button onClick={onClose} className="self-end rounded border border-line px-3 py-1.5 text-xs hover:bg-base">
        Tutup
      </button>
    </div>
  );
}

export default function StartTrading({ coin, timeframe }: { coin: Coin; timeframe: Timeframe }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded btn-active px-3 py-1 text-xs font-semibold text-white">
        ▶ Mulai Trading
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Keputusan trading"
            className="panel w-full max-w-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="panel-header">
              <h2>Mulai Trading — {coin.base}/USDT</h2>
            </header>
            {/* Remount when the coin or timeframe changes so the save state resets. */}
            <TradingDecision
              key={`${coin.symbol}:${timeframe.binance}`}
              coin={coin}
              timeframe={timeframe}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
