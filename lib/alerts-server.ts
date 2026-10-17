import { advise, MARKET_INTERVAL, MARKET_SYMBOL } from "./advice";
import { fetchCandles } from "./candles";
import { isDue, split, unpack as unpackDca } from "./dca";
import type { Action } from "./decision";
import type { Candle } from "./indicators";
import { evaluate, type Verdict } from "./positions";
import { expand, sanitizePositions } from "./positions-store";
import { ALERT_INTERVAL, reached, unpackAlerts } from "./price-alerts";
import { applyLock, weeklyLock } from "./risk";
import { partUsdt, SANTAI_COINS, sanitizeSantai, tradeTimeframe, type SantaiSettings } from "./santai";
import { COINS, formatPrice, higherTimeframe } from "./symbols";
import { reportDue, weekId, weeklyReport, type AdviceCount } from "./weekly-report";

// Server-side alerts for Telegram, run on a schedule: the same advice the app shows, checked
// for every linked user even when the app is closed.

const COOLDOWN_MS = 60 * 60_000;
const ACTION_CODE: Record<Action, number> = { beli: 0, tunggu: 1, jangan: 2 };

// What was already reported, so each change is sent once.
export type AlertState = {
  // Last action per coin.
  a: Record<string, number>;
  // Last BUY alert time per coin.
  t: Record<string, number>;
  // Last verdict per open position.
  v: Record<string, Verdict>;
  // Day the DCA reminder was sent.
  d: string;
  // Week (its Monday) the weekly report was sent, and the demo account value at that time.
  w?: string;
  e?: number;
};

export function readState(raw: unknown): AlertState {
  const r = (raw ?? {}) as Partial<AlertState>;
  return {
    a: r.a ?? {},
    t: r.t ?? {},
    v: r.v ?? {},
    d: typeof r.d === "string" ? r.d : "",
    ...(typeof r.w === "string" ? { w: r.w } : {}),
    ...(typeof r.e === "number" && Number.isFinite(r.e) ? { e: r.e } : {}),
  };
}

// Coins the scan checks for these settings.
export function scannedCoins(settings: SantaiSettings) {
  return settings.enabled ? COINS.filter((c) => SANTAI_COINS.includes(c.symbol)) : COINS;
}

// How many of the scanned coins currently get each action, from the last scan.
export function adviceCount(state: AlertState, settings: SantaiSettings): AdviceCount {
  const codes = scannedCoins(settings)
    .map((c) => state.a[c.symbol])
    .filter((c) => c !== undefined);
  return {
    beli: codes.filter((c) => c === ACTION_CODE.beli).length,
    tunggu: codes.filter((c) => c === ACTION_CODE.tunggu).length,
    jangan: codes.filter((c) => c === ACTION_CODE.jangan).length,
  };
}

// Candles shared across all users within one run.
export function candleCache() {
  const cache = new Map<string, Promise<Candle[] | null>>();
  return (symbol: string, interval: string) => {
    const key = `${symbol}:${interval}`;
    if (!cache.has(key)) cache.set(key, fetchCandles(symbol, interval, 300).catch(() => null));
    return cache.get(key)!;
  };
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export type UserData = { private: Record<string, unknown>; idrPerUsdt: number | null };

// Messages to send to one user and their updated alert state.
export async function alertsFor(
  data: UserData,
  candles: ReturnType<typeof candleCache>,
  now: number,
): Promise<{ messages: string[]; state: AlertState; fired: string[] }> {
  const meta = data.private;
  const settings: SantaiSettings = sanitizeSantai(meta.santai);
  const prev = readState(meta.tgState);
  const state: AlertState = { ...prev, a: { ...prev.a }, t: { ...prev.t }, v: {} };
  const fresh = !meta.tgState;
  const messages: string[] = [];

  const tf = tradeTimeframe(settings);
  const higher = higherTimeframe(tf);
  const coins = scannedCoins(settings);
  const positions = sanitizePositions(meta.positions);
  const trades = expand(meta.trades);
  const capitalUsdt = data.idrPerUsdt ? settings.capitalIdr / data.idrPerUsdt : null;
  const lock = capitalUsdt ? weeklyLock(trades, capitalUsdt, settings, now) : null;
  const btc = await candles(MARKET_SYMBOL, MARKET_INTERVAL);

  for (const coin of coins) {
    const [c, h] = await Promise.all([
      candles(coin.symbol, tf.binance),
      higher ? candles(coin.symbol, higher.binance) : Promise.resolve(null),
    ]);
    if (!c || c.length <= 60) continue;
    const advised = advise(c, h, higher?.label ?? null, coin.symbol, settings, btc, positions);
    const d = advised && applyLock(advised, lock);
    if (!d) continue;
    const before = prev.a[coin.symbol];
    state.a[coin.symbol] = ACTION_CODE[d.action];
    // The first run only learns the current state; alerts start from the next change.
    if (fresh || before === undefined || before === ACTION_CODE.beli || d.action !== "beli") continue;
    if (now - (prev.t[coin.symbol] ?? 0) < COOLDOWN_MS) continue;
    state.t[coin.symbol] = now;
    const plan = settings.enabled
      ? data.idrPerUsdt
        ? `Beli ${usd(partUsdt(settings, data.idrPerUsdt))} (1 dari ${settings.parts} bagian), jual di untung bersih ${settings.targetPct}%${settings.trailing ? " lalu trailing" : ""}.`
        : ""
      : d.plan
        ? `Stop loss $${formatPrice(d.plan.stop)}, target $${formatPrice(d.plan.target1)}.`
        : "";
    messages.push(
      `🟢 <b>${coin.base}: waktunya BELI</b> (keyakinan ${d.confidence}%, candle ${tf.label})\nHarga $${formatPrice(d.price)}\n${d.headline}\n${plan}`,
    );
  }

  for (const p of positions) {
    const c = await candles(p.symbol, p.interval);
    if (!c || c.length < 2) continue;
    const s = evaluate(p, c);
    state.v[p.id] = s.verdict;
    if (prev.v[p.id] === s.verdict || s.verdict === "tahan") continue;
    const base = COINS.find((x) => x.symbol === p.symbol)?.base ?? p.symbol;
    messages.push(
      `${s.verdict === "jual" ? "🔴" : "🟡"} <b>${base}: ${s.verdict === "jual" ? "JUAL" : "AMANKAN UNTUNG"}</b>\n${s.headline}\nHarga $${formatPrice(s.price)} (${s.pnlPct >= 0 ? "+" : ""}${s.pnlPct.toFixed(2)}%)`,
    );
  }

  if (settings.dcaEnabled && data.idrPerUsdt) {
    const today = new Date(now).toDateString();
    const dca = unpackDca(meta.dca);
    if (state.d !== today && isDue(dca, now, settings.dcaDay)) {
      state.d = today;
      const plan = split(settings.dcaIdr, settings.dcaBtcPct, data.idrPerUsdt);
      const parts = Object.entries(plan)
        .filter(([, v]) => v > 0)
        .map(([s, v]) => `${s.replace("USDT", "")} Rp ${Math.round(v * data.idrPerUsdt!).toLocaleString("id-ID")}`);
      messages.push(`🗓️ <b>Jadwal DCA minggu ini</b>\nBeli ${parts.join(" dan ")} di Tokocrypto, lalu catat di tab Inti (DCA).`);
    }
  }

  // Price alarms fire once, then are removed by the caller.
  const fired: string[] = [];
  for (const a of unpackAlerts(meta.priceAlerts)) {
    const c = await candles(a.symbol, ALERT_INTERVAL);
    if (!c || c.length === 0 || !reached(a, c)) continue;
    fired.push(a.id);
    const base = COINS.find((x) => x.symbol === a.symbol)?.base ?? a.symbol;
    messages.push(
      `🔔 <b>Alarm ${base}: harga ${a.dir === 1 ? "naik ke" : "turun ke"} ${formatPrice(a.price)}</b>
Harga sekarang ${formatPrice(c[c.length - 1].close)}.${a.dir === -1 ? " Cek saran Mulai Trading sebelum membeli." : ""}`,
    );
  }

  if (!fresh && reportDue(now, state.w ?? "")) {
    const report = await weeklyReport(meta, btc, adviceCount(state, settings), state.e ?? null, now);
    messages.push(report.text);
    state.w = weekId(now);
    if (report.equity !== null) state.e = Math.round(report.equity * 100) / 100;
  }

  return { messages, state: fresh ? { ...state, t: {} } : state, fired };
}

