import { analyze, bollinger, rsi, type Candle, type Signal } from "./indicators";
import { outlook, type Outlook } from "./outlook";
import { planLevels, type PlanLevels } from "./positions";
import { detectSignals, volumeSplit } from "./signals";

export type Action = "beli" | "tunggu" | "jangan";

export type Reason = { text: string; tone: Signal };

export type Decision = {
  action: Action;
  headline: string;
  // 0..100: how strongly the evidence points to the chosen action.
  confidence: number;
  price: number;
  reasons: Reason[];
  plan: PlanLevels | null;
  // Reward to first target per unit of risk to the stop loss.
  riskReward: number | null;
};

const HORIZON = 12;
const VOLUME_LOOKBACK = 24;
// A signal counts as fresh when it fired within this many candles.
const FRESH_CANDLES = 3;
// Total weight of all votes below, used to scale the score into a confidence.
const MAX_POINTS = 8;
const BUY_POINTS = 2.5;
const AVOID_POINTS = -1;
const MIN_RISK_REWARD = 1.2;
// Mode Sensitif buys on weaker agreement and a smaller reward-to-risk.
const SENSITIVE_BUY_POINTS = 1.5;
const SENSITIVE_MIN_RISK_REWARD = 1;

export type DecideOptions = {
  sensitive?: boolean;
  // Daily outlook of BTC; altcoins rarely rise while it falls, so a falling BTC holds buys back.
  market?: Outlook | null;
};
const OVERBOUGHT_RSI = 72;

function fmt(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 1 ? 2 : 6 })}`;
}

// Whether to open a spot buy right now, from the same indicators the dashboard shows:
// indicator score, trend outlook, the latest buy/sell signal, taker volume and the trend
// one timeframe higher. A heuristic vote, not a forecast.
export function decide(
  candles: Candle[],
  higher: Candle[] | null,
  higherLabel: string | null,
  opts: DecideOptions = {},
): Decision | null {
  const a = analyze(candles, fmt);
  const o = outlook(candles, HORIZON);
  if (!a || !o) return null;
  const price = a.price;
  const reasons: Reason[] = [];
  let points = 0;

  points += a.score * 2;
  reasons.push({
    text: `Indikator: ${a.buy} beli, ${a.sell} jual, ${a.neutral} netral`,
    tone: a.score >= 0.15 ? 1 : a.score <= -0.15 ? -1 : 0,
  });

  points += o.tone * (o.strength / 100) * 2;
  reasons.push({
    text: `Arah tren ${o.direction.toLowerCase()} (kekuatan ${o.strength}%)`,
    tone: o.tone,
  });

  const signals = detectSignals(candles);
  const last = signals[signals.length - 1];
  if (last) {
    const age = candles.length - 1 - last.index;
    const fresh = age <= FRESH_CANDLES;
    const sign = last.type === "beli" ? 1 : -1;
    points += sign * (fresh ? 1.5 : 0.5);
    reasons.push({
      text: `${fresh ? "Sinyal baru" : "Sinyal terakhir"} ${last.type.toUpperCase()} ${
        age === 0 ? "di candle ini" : `${age} candle lalu`
      }: ${last.reason}`,
      tone: sign,
    });
  }

  const vol = volumeSplit(candles, VOLUME_LOOKBACK);
  if (vol) {
    const tone: Signal = vol.buyShare > 0.53 ? 1 : vol.buyShare < 0.47 ? -1 : 0;
    points += tone * 0.5;
    reasons.push({
      text: `Volume beli ${Math.round(vol.buyShare * 100)}% dari ${VOLUME_LOOKBACK} candle terakhir`,
      tone,
    });
  }

  const ho = higher ? outlook(higher, HORIZON) : null;
  if (ho && higherLabel) {
    points += ho.tone;
    reasons.push({ text: `Tren besar (${higherLabel}) ${ho.direction.toLowerCase()}`, tone: ho.tone });
  }

  const m = opts.market;
  if (m) {
    reasons.push({ text: `Pasar BTC harian ${m.direction.toLowerCase()} (kekuatan ${m.strength}%)`, tone: m.tone });
  }

  const closes = candles.map((c) => c.close);
  const r = rsi(closes);
  const bb = bollinger(closes);
  const stretched = (r !== null && r >= OVERBOUGHT_RSI) || (bb !== null && price > bb.upper);
  if (stretched) {
    reasons.push({ text: "Harga sudah terlalu tinggi (overbought), rawan koreksi", tone: -1 });
  }

  const plan = planLevels(candles, price);
  const riskReward = plan ? (plan.target1 - price) / (price - plan.stop) : null;
  const confidence = Math.round(Math.min(Math.abs(points) / MAX_POINTS, 1) * 100);

  let action: Action;
  let headline: string;
  if (points <= AVOID_POINTS) {
    action = "jangan";
    headline = "Jangan beli dulu: mayoritas indikator menunjukkan tekanan jual";
  } else if (points < (opts.sensitive ? SENSITIVE_BUY_POINTS : BUY_POINTS)) {
    action = "tunggu";
    headline = "Tunggu: sinyal belum cukup kuat untuk masuk";
  } else if (ho && ho.tone === -1) {
    action = "tunggu";
    headline = `Tunggu: naik di timeframe ini, tetapi tren besar (${higherLabel}) masih turun`;
  } else if (m && m.tone === -1) {
    action = "tunggu";
    headline = "Tunggu: pasar BTC sedang turun, altcoin biasanya ikut turun";
  } else if (stretched) {
    action = "tunggu";
    headline = "Tunggu koreksi: tren naik, tetapi harga sudah overbought";
  } else if (riskReward !== null && riskReward < (opts.sensitive ? SENSITIVE_MIN_RISK_REWARD : MIN_RISK_REWARD)) {
    action = "tunggu";
    headline = "Tunggu: target terlalu dekat dibanding risikonya";
  } else {
    action = "beli";
    headline = "BELI: indikator dan tren sepakat naik";
  }

  return { action, headline, confidence, price, reasons, plan, riskReward };
}
