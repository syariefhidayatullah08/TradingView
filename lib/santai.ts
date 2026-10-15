import type { Decision } from "./decision";
import type { Position } from "./positions";

// Mode Santai: a relaxed spot plan for a small "cold money" budget. Only the largest coins,
// only confident buys, capital split into equal parts, and each part sold at a fixed net profit
// with no stop loss. Backtested on 4h candles (2026-10): most buys closed in profit within days,
// but a buy made before a downtrend stays underwater until the market recovers.

export type SantaiSettings = {
  enabled: boolean;
  // Budget in rupiah, converted to USDT at the Tokocrypto rate.
  capitalIdr: number;
  // The budget is split into this many equal buys; at most this many positions are open.
  parts: number;
  // Net profit (after fees) at which a position is sold.
  targetPct: number;
};

export const DEFAULT_SANTAI: SantaiSettings = { enabled: false, capitalIdr: 1_000_000, parts: 3, targetPct: 2 };

export const SANTAI_COINS = ["BTCUSDT", "ETHUSDT", "BNBUSDT"];
export const SANTAI_MIN_CONFIDENCE = 50;
// Index into TIMEFRAMES of the 4h candle the plan is built on.
export const SANTAI_TIMEFRAME = 2;

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

export function sanitizeSantai(raw: unknown): SantaiSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    enabled: r.enabled === true,
    capitalIdr: Math.round(clamp(r.capitalIdr, 100_000, 1_000_000_000, DEFAULT_SANTAI.capitalIdr)),
    parts: Math.round(clamp(r.parts, 1, 10, DEFAULT_SANTAI.parts)),
    targetPct: clamp(r.targetPct, 0.5, 20, DEFAULT_SANTAI.targetPct),
  };
}

// USDT to spend on one buy.
export function partUsdt(s: SantaiSettings, idrPerUsdt: number): number {
  return s.capitalIdr / s.parts / idrPerUsdt;
}

// The decision under Mode Santai rules. `open` is the list of open positions when known,
// which adds the one-position-per-coin and capital-parts limits.
export function applySantai(d: Decision, symbol: string, s: SantaiSettings, open: Position[] | null = null): Decision {
  if (!s.enabled) return d;
  const blocked = (headline: string, reason: string): Decision => ({
    ...d,
    action: d.action === "jangan" ? "jangan" : "tunggu",
    headline,
    reasons: [{ text: reason, tone: 0 }, ...d.reasons],
  });

  if (!SANTAI_COINS.includes(symbol)) {
    return blocked(
      "Lewati: Mode Santai hanya BTC, ETH, dan BNB",
      "Koin kecil turun lebih dalam dan lebih lama pulih, terlalu berisiko tanpa stop loss",
    );
  }
  if (d.action !== "beli") return d;
  if (d.confidence < SANTAI_MIN_CONFIDENCE) {
    return blocked(
      `Tunggu: keyakinan ${d.confidence}%, Mode Santai minta minimal ${SANTAI_MIN_CONFIDENCE}%`,
      `Keyakinan di bawah ${SANTAI_MIN_CONFIDENCE}% hasilnya hampir impas setelah biaya`,
    );
  }
  if (open) {
    if (open.some((p) => p.symbol === symbol)) {
      return blocked("Tunggu: Anda sudah punya posisi di koin ini", "Mode Santai: satu posisi per koin");
    }
    if (open.length >= s.parts) {
      return blocked(
        `Modal sudah terpakai semua (${open.length}/${s.parts} bagian)`,
        "Tunggu salah satu posisi terjual di target sebelum membeli lagi",
      );
    }
  }
  return d;
}
