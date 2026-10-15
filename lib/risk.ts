import type { Decision } from "./decision";
import { tradeResult, type ClosedTrade } from "./positions";

// Risk manager: size each buy so a stop-loss hit costs a fixed share of capital, and stop
// buying for the rest of the week once the week's realized losses pass a limit.

export type RiskSettings = {
  // Share of capital lost if a stop loss is hit.
  riskPct: number;
  // Realized weekly loss, as a share of capital, at which new buys are locked until Monday.
  weeklyLossPct: number;
};

function mondayOf(time: number): number {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

// Realized net result of trades sold this week, in USDT, from trades that recorded an amount.
export function weekResultUsdt(trades: ClosedTrade[], now: number): number {
  const start = mondayOf(now);
  return trades
    .filter((t) => t.exitTime >= start)
    .reduce((sum, t) => sum + (tradeResult(t).pnlValue ?? 0), 0);
}

export type RiskLock = { lossPct: number; limitPct: number } | null;

export function weeklyLock(trades: ClosedTrade[], capitalUsdt: number, s: RiskSettings, now: number): RiskLock {
  if (capitalUsdt <= 0) return null;
  const lossPct = (-weekResultUsdt(trades, now) / capitalUsdt) * 100;
  return lossPct >= s.weeklyLossPct ? { lossPct, limitPct: s.weeklyLossPct } : null;
}

// USDT to spend so that falling from `entry` to `stop` loses `riskPct` of capital, capped at the capital.
export function riskSizedUsdt(capitalUsdt: number, entry: number, stop: number, riskPct: number): number | null {
  const drop = (entry - stop) / entry;
  if (!(drop > 0)) return null;
  return Math.min(capitalUsdt, (capitalUsdt * riskPct) / 100 / drop);
}

export function applyLock(d: Decision, lock: RiskLock): Decision {
  if (!lock || d.action !== "beli") return d;
  return {
    ...d,
    action: "tunggu",
    headline: `Rem darurat: rugi minggu ini ${lock.lossPct.toFixed(1)}% modal (batas ${lock.limitPct}%). Istirahat sampai Senin`,
    reasons: [{ text: "Berhenti setelah rugi besar mencegah keputusan emosional untuk balas rugi", tone: 0 }, ...d.reasons],
  };
}
