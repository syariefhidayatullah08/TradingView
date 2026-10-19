import { marketOutlook } from "./advice";
import { decide, type Decision } from "./decision";
import type { Candle } from "./indicators";
import { BUY_FEE, SELL_FEE } from "./saham";

// The crypto module's buy decision applied to IDX stocks: daily candles, the weekly trend as the
// higher timeframe, and IHSG instead of BTC as the market filter.

export const STOCK_FEES = { buy: BUY_FEE * 100, sell: SELL_FEE * 100 };

export const idr = (n: number) =>
  `Rp${n.toLocaleString("id-ID", { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 })}`;

// Weekly candles built from daily ones (weeks start on Monday, WIB).
export function toWeekly(daily: Candle[]): Candle[] {
  const out: Candle[] = [];
  let key = "";
  for (const c of daily) {
    const d = new Date(c.time + 7 * 3600_000);
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const k = monday.toISOString().slice(0, 10);
    const last = out[out.length - 1];
    if (k !== key || !last) {
      key = k;
      out.push({ ...c });
    } else {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    }
  }
  return out;
}

export function stockDecision(daily: Candle[], ihsgDaily: Candle[] | null): Decision | null {
  if (daily.length <= 60) return null;
  return decide(daily.slice(-300), toWeekly(daily).slice(-300), "mingguan", {
    market: marketOutlook(ihsgDaily),
    money: idr,
    marketName: "IHSG",
  });
}
