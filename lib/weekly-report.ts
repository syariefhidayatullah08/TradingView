import { marketOutlook } from "./advice";
import { livePrice } from "./binance-server";
import { baseOf, DEMO_START_USDT, unpack as unpackDemo } from "./demo";
import type { Candle } from "./indicators";
import { tradeResult } from "./positions";
import { expand, sanitizePositions } from "./positions-store";

// Weekly Telegram summary, sent on Monday morning (WIB): the market, the app's current advice,
// the demo account and the trades recorded in the journal over the past seven days.

const WIB_MS = 7 * 3_600_000;
const WEEK_MS = 7 * 86_400_000;
const SEND_HOUR_WIB = 8;

// The Monday (WIB date) that starts the week containing `now`; one report per week.
export function weekId(now: number): string {
  const wib = new Date(now + WIB_MS);
  const back = (wib.getUTCDay() + 6) % 7;
  return new Date(wib.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

// Monday from 08:00 WIB, and not yet sent this week.
export function reportDue(now: number, lastWeek: string): boolean {
  const wib = new Date(now + WIB_MS);
  return wib.getUTCDay() === 1 && wib.getUTCHours() >= SEND_HOUR_WIB && lastWeek !== weekId(now);
}

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function usd(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function day(time: number): string {
  return new Date(time + WIB_MS).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
}

export type AdviceCount = { beli: number; tunggu: number; jangan: number };

// The report text and the demo account's value, kept to show next week's change.
export async function weeklyReport(
  meta: Record<string, unknown>,
  btcDaily: Candle[] | null,
  advice: AdviceCount,
  lastEquity: number | null,
  now: number,
): Promise<{ text: string; equity: number | null }> {
  const since = now - WEEK_MS;
  const lines: string[] = [`📊 <b>Laporan mingguan KriptoScope</b> (${day(since)} – ${day(now)})`];

  // Market.
  if (btcDaily && btcDaily.length > 8) {
    const price = btcDaily[btcDaily.length - 1].close;
    const weekAgo = btcDaily[btcDaily.length - 8].close;
    const o = marketOutlook(btcDaily);
    const dir = o ? { NAIK: "naik 📈", TURUN: "turun 📉", SIDEWAYS: "mendatar ➖" }[o.direction] : "belum jelas";
    lines.push(
      "",
      `<b>Pasar</b>\nBTC $${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}, seminggu ${pct(((price - weekAgo) / weekAgo) * 100)}. Arah harian: ${dir}.`,
    );
    if (o?.direction === "TURUN") lines.push("Pasar sedang turun, wajar jika sinyal BELI jarang. Menunggu juga bagian dari strategi.");
  }

  // Current advice across the watched coins.
  const total = advice.beli + advice.tunggu + advice.jangan;
  if (total > 0) {
    lines.push("", `<b>Saran sekarang</b>\n🟢 ${advice.beli} BELI · 🟡 ${advice.tunggu} TUNGGU · 🔴 ${advice.jangan} JANGAN`);
  }

  // Demo account, valued at live prices (cost when a price is missing).
  let equity: number | null = null;
  if (meta.demo) {
    const demo = unpackDemo(meta.demo, now);
    const prices = await Promise.all(demo.holdings.map((h) => livePrice(h.symbol)));
    const held = demo.holdings.map((h, i) => ({ h, value: prices[i] !== null ? h.qty * prices[i]! : h.cost }));
    equity = demo.cash + held.reduce((a, x) => a + x.value, 0);
    const week = demo.trades.filter((t) => t.time >= since);
    const realized = week.reduce((a, t) => a + (t.pnl ?? 0), 0);
    const parts = [`Nilai ${usd(equity)} (${pct(((equity - DEMO_START_USDT) / DEMO_START_USDT) * 100)} dari modal awal)`];
    if (lastEquity !== null) parts.push(`minggu ini ${usd(equity - lastEquity)}`);
    lines.push("", `<b>Akun Demo</b>\n${parts.join(", ")}.`);
    lines.push(
      week.length
        ? `${week.filter((t) => t.side === "beli").length} beli, ${week.filter((t) => t.side === "jual").length} jual, untung/rugi terealisasi ${usd(realized)}.`
        : "Tidak ada transaksi minggu ini.",
    );
    if (held.length) {
      lines.push(
        `Dipegang: ${held
          .map(({ h, value }) => `${baseOf(h.symbol)} ${pct(((value - h.cost) / h.cost) * 100)}`)
          .join(", ")}`,
      );
    }
  }

  // Real trades from the journal.
  const closed = expand(meta.trades).filter((t) => t.exitTime >= since);
  const open = sanitizePositions(meta.positions);
  if (closed.length || open.length) {
    const results = closed.map(tradeResult);
    const wins = results.filter((r) => r.pnlPct > 0).length;
    const avg = results.length ? results.reduce((a, r) => a + r.pnlPct, 0) / results.length : 0;
    lines.push(
      "",
      `<b>Catatan trading</b>\n${
        closed.length ? `${closed.length} transaksi selesai, ${wins} untung, rata-rata ${pct(avg)} bersih.` : "Belum ada transaksi yang selesai minggu ini."
      } ${open.length} posisi masih terbuka.`,
    );
  }

  lines.push("", "Hasil masa lalu tidak menjamin hasil berikutnya. Ketik /laporan kapan saja untuk laporan terbaru.");
  return { text: lines.join("\n"), equity };
}
