import fs from "node:fs";
const edit = (p, pairs) => {
  let s = fs.readFileSync(p, "utf8");
  for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error(p + " anchor: " + a.slice(0, 60)); s = s.replace(a, b); }
  fs.writeFileSync(p, s);
};

edit("lib/positions.ts", [
  ['import { detectSignals } from "./signals";', 'import { outlook } from "./outlook";\nimport { detectSignals } from "./signals";'],
  ["export type Position = {\n  id: string;\n  symbol: string;",
   `// "untung": never advise selling below the entry price (no stop loss); sell only once the
// position is in profit and the market turns. "stoploss": classic plan with a stop loss.
export type ExitMode = "untung" | "stoploss";

export type Position = {
  id: string;
  symbol: string;
  mode: ExitMode;`],
  ["const SWING_LOOKBACK = 20;\n", "const SWING_LOOKBACK = 20;\n// Net profit needed before a sale counts as a win, covering Tokocrypto fees on both sides.\nconst MIN_PROFIT_PCT = 0.5;\n"],
  [`  const signals = detectSignals(candles);
  const last = signals[signals.length - 1];
  const sellSignalAfterEntry = last && last.type === "jual" && last.time > position.entryTime;

  if (price <= position.stop) {`, `  const signals = detectSignals(candles);
  const last = signals[signals.length - 1];
  const sellSignalAfterEntry = last && last.type === "jual" && last.time > position.entryTime;

  if (position.mode === "untung") {
    return profitOnly(position, candles, price, pnlPct, pnlValue, sellSignalAfterEntry ? last.reason : null);
  }

  if (price <= position.stop) {`],
  ["function fmt(n: number): string {", `// Profit-only mode: hold through losses, sell only in profit when the market stops supporting the trade.
function profitOnly(
  position: Position,
  candles: Candle[],
  price: number,
  pnlPct: number,
  pnlValue: number | null,
  sellSignal: string | null,
): PositionStatus {
  const o = outlook(candles, 1);
  const trendDown = o !== null && o.tone === -1 && o.strength >= 45;
  const reasons: string[] = [];
  let verdict: Verdict = "tahan";
  let headline: string;
  const progress = Math.max(-1, Math.min(1, (price - position.entryPrice) / (position.target1 - position.entryPrice)));

  if (pnlPct < MIN_PROFIT_PCT) {
    headline =
      pnlPct < 0
        ? \`BELUM UNTUNG: tahan, jangan jual di bawah harga beli \${fmt(position.entryPrice)}\`
        : \`Untung masih tipis (\${pnlPct.toFixed(2)}%): tahan sampai di atas \${MIN_PROFIT_PCT}% agar menutup biaya\`;
    reasons.push(
      pnlPct < 0
        ? \`Harga \${fmt(price)} masih \${Math.abs(pnlPct).toFixed(2)}% di bawah harga beli. Mode ini menunggu sampai untung.\`
        : \`Harga \${fmt(price)}, baru \${pnlPct.toFixed(2)}% di atas harga beli.\`,
    );
    if (o) reasons.push(\`Arah pasar sekarang \${o.direction} (kekuatan \${o.strength}%)\${trendDown ? "; pemulihan bisa makan waktu lama" : ""}.\`);
    reasons.push(\`Harga perlu mencapai \${fmt(position.entryPrice * (1 + MIN_PROFIT_PCT / 100))} dulu sebelum sinyal jual diberikan.\`);
    return { price, pnlPct, pnlValue, verdict, headline, reasons, progress };
  }

  // In profit from here on.
  if (price >= position.target2) {
    verdict = "jual";
    headline = \`JUAL: untung \${pnlPct.toFixed(2)}%, target 2 tercapai\`;
    reasons.push(\`Harga \${fmt(price)} sudah melewati target 2 (\${fmt(position.target2)}). Ambil untung seluruhnya.\`);
  } else if (sellSignal) {
    verdict = "jual";
    headline = \`JUAL: untung \${pnlPct.toFixed(2)}% dan sinyal jual muncul\`;
    reasons.push(\`Sinyal jual: \${sellSignal}. Amankan untung sebelum hilang.\`);
  } else if (trendDown) {
    verdict = "jual";
    headline = \`JUAL: untung \${pnlPct.toFixed(2)}% dan arah pasar berbalik turun\`;
    reasons.push(\`Arah pasar TURUN dengan kekuatan \${o?.strength}%. Untung yang ada bisa habis kalau ditahan.\`);
  } else if (price >= position.target1) {
    verdict = "amankan";
    headline = \`Target 1 tercapai (untung \${pnlPct.toFixed(2)}%): jual sebagian, sisanya tahan\`;
    reasons.push(\`Harga \${fmt(price)} di atas target 1 (\${fmt(position.target1)}); target berikutnya \${fmt(position.target2)}.\`);
    if (o) reasons.push(\`Arah pasar masih \${o.direction}, jadi sisa posisi boleh ditahan.\`);
  } else {
    headline = \`UNTUNG \${pnlPct.toFixed(2)}%: tahan, pasar masih mendukung\`;
    reasons.push(\`Belum ada sinyal jual dan arah pasar \${o?.direction ?? "belum jelas"}. Target 1 di \${fmt(position.target1)}.\`);
    reasons.push("Sinyal JUAL akan muncul saat target tercapai, sinyal jual terbentuk, atau arah pasar berbalik turun.");
  }
  return { price, pnlPct, pnlValue, verdict, headline, reasons, progress };
}

function fmt(n: number): string {`],
]);

edit("app/api/positions/route.ts", [
  ["      symbol: p.symbol,\n      interval: typeof p.interval === \"string\" ? p.interval.slice(0, 4) : \"1h\",\n      entryPrice,\n      entryTime: num(p.entryTime) ?? Date.now(),",
   "      symbol: p.symbol,\n      mode: p.mode === \"stoploss\" ? \"stoploss\" : \"untung\",\n      interval: typeof p.interval === \"string\" ? p.interval.slice(0, 4) : \"1h\",\n      entryPrice,\n      entryTime: num(p.entryTime) ?? Date.now(),"],
]);

let s = fs.readFileSync("components/PositionsPanel.tsx", "utf8");
const rep = (a, b) => { if (!s.includes(a)) throw new Error("PositionsPanel anchor: " + a.slice(0, 60)); s = s.replace(a, b); };
rep('import { evaluate, planLevels, type ClosedTrade, type Position, type Verdict } from "@/lib/positions";',
    'import {\n  evaluate,\n  planLevels,\n  type ClosedTrade,\n  type ExitMode,\n  type Position,\n  type Verdict,\n} from "@/lib/positions";');
// form: mode selector
rep('  const [interval, setInterval] = useState<string>(timeframe.binance);\n', '  const [interval, setInterval] = useState<string>(timeframe.binance);\n  const [mode, setMode] = useState<ExitMode>("untung");\n');
rep("      ...stampNew(),\n      symbol,\n      interval,", "      ...stampNew(),\n      symbol,\n      mode,\n      interval,");
rep(`      <div className="grid gap-2 sm:grid-cols-4">
        <label className="text-[11px] text-muted">
          Koin`, `      <div className="grid gap-2 sm:grid-cols-5">
        <label className="text-[11px] text-muted">
          Koin`);
rep(`        <label className="text-[11px] text-muted">
          Jumlah koin (opsional)`, `        <label className="text-[11px] text-muted">
          Kapan boleh jual
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as ExitMode)}
            className="mt-1 w-full rounded border border-line bg-panel px-2 py-1.5 text-sm text-fg"
          >
            <option value="untung">Hanya saat untung</option>
            <option value="stoploss">Pakai stop loss</option>
          </select>
        </label>
        <label className="text-[11px] text-muted">
          Jumlah koin (opsional)`);
fs.writeFileSync("components/PositionsPanel.tsx", s);
