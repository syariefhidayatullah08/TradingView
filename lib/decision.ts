import { analyze, atr, bollinger, rsi, type Candle, type Signal } from "./indicators";
import { outlook, type Outlook } from "./outlook";
import { planLevels, type PlanLevels } from "./positions";
import { detectSignals, volumeSplit } from "./signals";
import { bullishBreak, bullishDivergence, vwap, zones } from "./structure";

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
  // Price structure (break of structure, RSI divergence, VWAP, support/resistance):
  // "votes" adds them to the score, "reversal" also lets a confirmed turn buy before the trend indicators agree.
  structure?: "votes" | "reversal";
  // Price format for reason texts (default US dollars) and the name of the market used by `market`.
  money?: (n: number) => string;
  marketName?: "BTC" | "IHSG";
};
const OVERBOUGHT_RSI = 72;

function usd(n: number): string {
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
  const fmt = opts.money ?? usd;
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

  let reversal = false;
  if (opts.structure) {
    const bos = bullishBreak(candles);
    const div = bullishDivergence(candles);
    const vw = vwap(candles);
    const range = atr(candles);
    const near = zones(candles);
    const support = near.find((z) => z.kind === "support" && range !== null && price - z.price <= range);
    const resistance = near.find((z) => z.kind === "resistance" && range !== null && z.price - price <= range * 0.5);
    if (bos) {
      points += 1;
      reasons.push({ text: "Struktur pasar berbalik: harga menembus puncak terakhir setelah titik terendah baru", tone: 1 });
    }
    if (div) {
      points += 1;
      reasons.push({ text: "Divergensi RSI: harga membuat titik rendah baru tetapi RSI tidak, tekanan jual melemah", tone: 1 });
    }
    if (vw !== null) {
      const above = price >= vw;
      points += above ? 0.5 : -0.5;
      reasons.push({ text: `Harga ${above ? "di atas" : "di bawah"} VWAP ${fmt(vw)}`, tone: above ? 1 : -1 });
    }
    if (support) reasons.push({ text: `Dekat support kuat ${fmt(support.price)} (${support.touches}× disentuh)`, tone: 1 });
    if (resistance) {
      points -= 0.5;
      reasons.push({ text: `Tepat di bawah resistance ${fmt(resistance.price)}, ruang naik sempit`, tone: -1 });
    }
    reversal = opts.structure === "reversal" && (bos || div) && vw !== null && price >= vw && !resistance;
  }

  const m = opts.market;
  if (m) {
    const name = opts.marketName === "IHSG" ? "IHSG" : "Pasar BTC";
    reasons.push({ text: `${name} harian ${m.direction.toLowerCase()} (kekuatan ${m.strength}%)`, tone: m.tone });
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
  if (reversal && !stretched && !(m && m.tone === -1)) {
    action = "beli";
    headline = "BELI (pembalikan): struktur harga berbalik naik lebih awal dari indikator tren";
  } else if (points <= AVOID_POINTS) {
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
    headline =
      opts.marketName === "IHSG"
        ? "Tunggu: IHSG sedang turun, kebanyakan saham ikut turun"
        : "Tunggu: pasar BTC sedang turun, altcoin biasanya ikut turun";
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
