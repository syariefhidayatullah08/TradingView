"use client";

import { useEffect, useRef, useState } from "react";
import type { Action } from "@/lib/decision";
import { useLiveCandles } from "@/lib/live-candles";
import { disableAlerts, dismissToast, enableAlerts, notify, useAlertsEnabled, useToasts } from "@/lib/notify";
import { evaluate, type Position, type Verdict } from "@/lib/positions";
import type { ScanRow } from "@/lib/scan";
import { COINS, formatPrice, type Timeframe } from "@/lib/symbols";

// A decision computed on a still-forming candle can flip back and forth; alert a coin at most this often.
const COIN_COOLDOWN_MS = 60 * 60_000;
const POSITIONS_REFRESH_MS = 5 * 60_000;

const toastTone = { up: "border-up/50", down: "border-down/50", info: "border-line" } as const;

// Alerts when one held position's advice turns to selling.
function PositionWatch({ position }: { position: Position }) {
  const live = useLiveCandles(position.symbol, position.interval);
  const status = live.candles ? evaluate(position, live.candles) : null;
  const verdict = status?.verdict;
  const previous = useRef<Verdict | undefined>(undefined);
  const base = COINS.find((c) => c.symbol === position.symbol)?.base ?? position.symbol;

  useEffect(() => {
    if (!status || verdict === previous.current) return;
    previous.current = verdict;
    if (verdict === "tahan") return;
    notify(
      `${base}: ${verdict === "jual" ? "JUAL" : "AMANKAN UNTUNG"}`,
      `${status.headline}. Harga $${formatPrice(status.price)} (${status.pnlPct >= 0 ? "+" : ""}${status.pnlPct.toFixed(2)}%).`,
      verdict === "jual" ? "down" : "info",
      `posisi-${position.id}`,
    );
  }, [verdict, status, base, position.id]);

  return null;
}

function PositionAlerts() {
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/positions")
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (!cancelled && json) setPositions(json.positions ?? []);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, POSITIONS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return positions.map((p) => <PositionWatch key={p.id} position={p} />);
}

export default function TradeAlerts({ rows, timeframe }: { rows: ScanRow[] | null; timeframe: Timeframe }) {
  const enabled = useAlertsEnabled();
  const toasts = useToasts();
  const [blocked, setBlocked] = useState(false);
  const previous = useRef(new Map<string, Action>());
  const lastAlert = useRef(new Map<string, number>());

  useEffect(() => {
    if (!enabled || !rows) return;
    const now = Date.now();
    for (const { coin, interval, decision } of rows) {
      if (!decision) continue;
      // Keyed by timeframe too, so switching timeframes compares like with like.
      const key = `${interval}:${coin.symbol}`;
      const before = previous.current.get(key);
      previous.current.set(key, decision.action);
      if (before === undefined || before === "beli" || decision.action !== "beli") continue;
      if (now - (lastAlert.current.get(coin.symbol) ?? 0) < COIN_COOLDOWN_MS) continue;
      lastAlert.current.set(coin.symbol, now);
      notify(
        `${coin.base}: waktunya BELI (${decision.confidence}%)`,
        `${decision.headline}. Harga $${formatPrice(decision.price)}, candle ${timeframe.label}` +
          (decision.plan
            ? `, stop loss $${formatPrice(decision.plan.stop)}, target $${formatPrice(decision.plan.target1)}.`
            : "."),
        "up",
        `beli-${coin.symbol}`,
      );
    }
  }, [rows, enabled, timeframe]);

  async function toggle() {
    if (enabled) {
      disableAlerts();
      return;
    }
    const system = await enableAlerts();
    setBlocked(!system);
    notify(
      "Notifikasi aktif",
      `Anda akan diberi tahu saat koin berubah jadi BELI (candle ${timeframe.label}) dan saat posisi Anda waktunya jual.` +
        (system ? "" : " Notifikasi sistem diblokir browser, jadi peringatan hanya muncul di dalam aplikasi."),
      "info",
      "aktif",
    );
  }

  return (
    <>
      <button
        onClick={toggle}
        title={
          enabled
            ? "Matikan notifikasi trading"
            : "Beri tahu saya saat koin layak dibeli atau posisi saya waktunya jual"
        }
        className={`rounded border px-2.5 py-1.5 text-xs font-medium ${
          enabled ? "border-up/50 text-up hover:bg-base" : "border-line hover:bg-base"
        }`}
      >
        {enabled ? "🔔 Notifikasi aktif" : "🔕 Notifikasi"}
        {enabled && blocked && <span className="ml-1 text-amber-300">(dalam aplikasi)</span>}
      </button>

      {enabled && <PositionAlerts />}

      <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`panel pointer-events-auto border bg-panel/95 p-3 ${toastTone[t.tone]}`}
            onClick={() => dismissToast(t.id)}
          >
            <div className={`text-sm font-semibold ${t.tone === "up" ? "text-up" : t.tone === "down" ? "text-down" : ""}`}>
              {t.title}
            </div>
            <div className="mt-0.5 text-xs text-muted">{t.body}</div>
          </div>
        ))}
      </div>
    </>
  );
}
