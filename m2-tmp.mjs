import fs from "node:fs";
let s = fs.readFileSync("components/PositionsPanel.tsx", "utf8");
const rep = (a, b) => { if (!s.includes(a)) throw new Error("anchor: " + a.slice(0, 60)); s = s.replace(a, b); };
rep(`import {
  evaluate,
  planLevels,
  type ClosedTrade,
  type Position,
  type Verdict,
} from "@/lib/positions";`, `import {
  evaluate,
  planLevels,
  type ClosedTrade,
  type ExitMode,
  type Position,
  type Verdict,
} from "@/lib/positions";`);
rep('  const [interval, setInterval] = useState<string>(timeframe.binance);\n', '  const [interval, setInterval] = useState<string>(timeframe.binance);\n  const [mode, setMode] = useState<ExitMode>("untung");\n');
rep("      ...stampNew(),\n      symbol,\n", "      ...stampNew(),\n      symbol,\n      mode,\n");
rep('<div className="grid gap-2 sm:grid-cols-4">', '<div className="grid gap-2 sm:grid-cols-5">');
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
rep(`              <div className="font-sans text-[11px] text-down">
                Stop loss (jual rugi)
              </div>`, `              <div className="font-sans text-[11px] text-down">
                {position.mode === "untung" ? "Tanpa stop loss" : "Stop loss (jual rugi)"}
              </div>`);
rep(`            <span>Stop loss</span>
            <span>Harga beli</span>
            <span>Target 1</span>`, `            <span>{position.mode === "untung" ? "Rugi (ditahan)" : "Stop loss"}</span>
            <span>Harga beli</span>
            <span>Target 1</span>`);
rep(`            <span className="text-down">Stop \${formatPrice(levels.stop)}</span>{" "}
            ·{" "}`, `            {mode === "stoploss" && (
              <>
                <span className="text-down">Stop \${formatPrice(levels.stop)}</span> ·{" "}
              </>
            )}`);
rep(`        Stop loss = harga beli − 1,5×ATR (gerak rata-rata per candle). Target 1
        = resistance terdekat jika jaraknya minimal sama dengan risiko, kalau
        tidak harga beli + 2×ATR. Target 2 = harga beli + 3×ATR. Setelah
        dicatat, aplikasi memantau posisi ini real-time dan memberi tahu kapan
        harus jual.`, `        <strong className="text-fg">Hanya saat untung</strong>: aplikasi tidak pernah menyarankan jual di bawah
        harga beli; sinyal JUAL baru muncul setelah untung minimal 0,5% (menutup biaya) dan target tercapai,
        sinyal jual terbentuk, atau arah pasar berbalik turun. Risikonya: kalau harga terus turun, posisi
        bisa tertahan lama atau tidak pernah kembali untung. <strong className="text-fg">Pakai stop loss</strong>:
        jual rugi di harga beli − 1,5×ATR untuk membatasi kerugian. Target 1 = resistance terdekat (atau +2×ATR),
        target 2 = +3×ATR.`);
// Mode label in the card header.
rep("{position.amount !== null && ` · ${position.amount} ${coin?.base}`} · rencana candle {tf}",
    "{position.amount !== null && ` · ${position.amount} ${coin?.base}`} · candle {tf} ·{\" \"}\n              {position.mode === \"untung\" ? \"jual hanya saat untung\" : \"pakai stop loss\"}");
fs.writeFileSync("components/PositionsPanel.tsx", s);
