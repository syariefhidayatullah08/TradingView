"use client";

import { useEffect, useSyncExternalStore } from "react";
import { MARKET_INTERVAL, MARKET_SYMBOL } from "./advice";
import { runBacktest, type BacktestOptions } from "./backtest";
import type { Candle } from "./indicators";
import { SANTAI_COINS, SANTAI_MIN_CONFIDENCE, type SantaiSettings } from "./santai";
import { BINANCE_API, COINS, higherTimeframe, type Timeframe } from "./symbols";

// Evidence for the scanner: a backtest of the current strategy on each coin's last 1000 candles,
// run in the background once per day per timeframe and settings, cached in localStorage.

export type Evidence = { totalPct: number; buyHoldPct: number; trades: number };

type Entry = { results: Record<string, Evidence>; done: number; total: number; running: boolean };

const INTERVAL_MS: Record<string, number> = {
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
};
const CACHE_PREFIX = "kriptoscope:evidence:";

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const EMPTY: Entry = { results: {}, done: 0, total: 0, running: false };

function emit() {
  listeners.forEach((l) => l());
}

export function backtestOptions(s: SantaiSettings): BacktestOptions {
  return {
    sensitive: s.sensitive,
    btcFilter: s.btcFilter,
    trailing: s.trailing,
    exit: s.enabled ? "santai" : "normal",
    targetPct: s.targetPct,
    minConfidence: s.enabled ? SANTAI_MIN_CONFIDENCE : 0,
  };
}

function keyOf(tf: Timeframe, s: SantaiSettings): string {
  return `${tf.binance}:${JSON.stringify(backtestOptions(s))}`;
}

async function klines(symbol: string, interval: string): Promise<Candle[]> {
  const res = await fetch(`${BINANCE_API}/klines?symbol=${symbol}&interval=${interval}&limit=1000`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw: (string | number)[][] = await res.json();
  return raw.map((k) => ({
    time: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    takerBuyVolume: Number(k[9]),
  }));
}

async function run(key: string, tf: Timeframe, s: SantaiSettings) {
  const coins = s.enabled ? COINS.filter((c) => SANTAI_COINS.includes(c.symbol)) : COINS;
  const entry: Entry = { results: {}, done: 0, total: coins.length, running: true };
  entries.set(key, entry);
  emit();
  const cacheKey = `${CACHE_PREFIX}${key}:${new Date().toDateString()}`;
  const higher = higherTimeframe(tf);
  const opts = backtestOptions(s);
  try {
    const btc = await klines(MARKET_SYMBOL, MARKET_INTERVAL);
    for (const coin of coins) {
      try {
        const [candles, big] = await Promise.all([
          klines(coin.symbol, tf.binance),
          higher ? klines(coin.symbol, higher.binance) : Promise.resolve(null),
        ]);
        const r = await runBacktest(
          {
            candles,
            intervalMs: INTERVAL_MS[tf.binance],
            higher: big,
            higherMs: higher ? INTERVAL_MS[higher.binance] : 0,
            higherLabel: higher?.label ?? null,
            btcDaily: btc,
          },
          opts,
        );
        entry.results = {
          ...entry.results,
          [coin.symbol]: { totalPct: r.totalPct, buyHoldPct: r.buyHoldPct, trades: r.trades.length },
        };
      } catch {
        // A coin without enough history is simply left without evidence.
      }
      entry.done++;
      entries.set(key, { ...entry });
      emit();
    }
    try {
      localStorage.setItem(cacheKey, JSON.stringify(entry.results));
    } catch {}
  } catch {
    // Without BTC data nothing can be tested; the scanner works without evidence.
  }
  entries.set(key, { ...entry, running: false });
  emit();
}

function ensure(tf: Timeframe, s: SantaiSettings) {
  const key = keyOf(tf, s);
  if (entries.has(key)) return;
  try {
    const cached = localStorage.getItem(`${CACHE_PREFIX}${key}:${new Date().toDateString()}`);
    if (cached) {
      const results = JSON.parse(cached) as Record<string, Evidence>;
      const n = Object.keys(results).length;
      entries.set(key, { results, done: n, total: n, running: false });
      emit();
      return;
    }
  } catch {}
  run(key, tf, s);
}

// Evidence for a timeframe and settings; null while there is none for that coin yet.
export function getEvidence(tf: Timeframe, s: SantaiSettings, symbol: string): Evidence | null {
  return entries.get(keyOf(tf, s))?.results[symbol] ?? null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Starts (or reuses) the background backtests when `enabled`, and follows their progress.
export function useEvidence(tf: Timeframe, s: SantaiSettings, enabled: boolean): Entry {
  const key = keyOf(tf, s);
  useEffect(() => {
    if (enabled) ensure(tf, s);
    // The key captures every setting that changes the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return useSyncExternalStore(subscribe, () => entries.get(key) ?? EMPTY, () => EMPTY);
}
