// `gecko` is the CoinGecko coin id used for fundamental data.
// `toko` / `tokoIdr`: the coin has a USDT / IDR pair on Tokocrypto (checked 2026-10-05).
export type Coin = {
  symbol: string;
  base: string;
  name: string;
  gecko: string;
  toko: boolean;
  tokoIdr: boolean;
};

// Ordered roughly by market cap, largest first.
export const COINS: Coin[] = [
  { symbol: "BTCUSDT", base: "BTC", name: "Bitcoin", gecko: "bitcoin", toko: true, tokoIdr: true },
  { symbol: "ETHUSDT", base: "ETH", name: "Ethereum", gecko: "ethereum", toko: true, tokoIdr: true },
  { symbol: "BNBUSDT", base: "BNB", name: "BNB", gecko: "binancecoin", toko: true, tokoIdr: true },
  { symbol: "XRPUSDT", base: "XRP", name: "XRP", gecko: "ripple", toko: true, tokoIdr: true },
  { symbol: "SOLUSDT", base: "SOL", name: "Solana", gecko: "solana", toko: true, tokoIdr: true },
  { symbol: "TRXUSDT", base: "TRX", name: "TRON", gecko: "tron", toko: true, tokoIdr: false },
  { symbol: "DOGEUSDT", base: "DOGE", name: "Dogecoin", gecko: "dogecoin", toko: true, tokoIdr: true },
  { symbol: "LINKUSDT", base: "LINK", name: "Chainlink", gecko: "chainlink", toko: true, tokoIdr: false },
  { symbol: "ADAUSDT", base: "ADA", name: "Cardano", gecko: "cardano", toko: true, tokoIdr: true },
  { symbol: "LTCUSDT", base: "LTC", name: "Litecoin", gecko: "litecoin", toko: true, tokoIdr: false },
  { symbol: "AVAXUSDT", base: "AVAX", name: "Avalanche", gecko: "avalanche-2", toko: true, tokoIdr: true },
  { symbol: "DOTUSDT", base: "DOT", name: "Polkadot", gecko: "polkadot", toko: true, tokoIdr: false },
  { symbol: "XLMUSDT", base: "XLM", name: "Stellar", gecko: "stellar", toko: true, tokoIdr: false },
  { symbol: "NEARUSDT", base: "NEAR", name: "NEAR Protocol", gecko: "near", toko: true, tokoIdr: false },
  { symbol: "BCHUSDT", base: "BCH", name: "Bitcoin Cash", gecko: "bitcoin-cash", toko: true, tokoIdr: false },
  { symbol: "UNIUSDT", base: "UNI", name: "Uniswap", gecko: "uniswap", toko: true, tokoIdr: false },
  { symbol: "SUIUSDT", base: "SUI", name: "Sui", gecko: "sui", toko: true, tokoIdr: true },
  { symbol: "HBARUSDT", base: "HBAR", name: "Hedera", gecko: "hedera-hashgraph", toko: true, tokoIdr: true },
  { symbol: "TONUSDT", base: "TON", name: "Toncoin", gecko: "the-open-network", toko: false, tokoIdr: false },
  { symbol: "SHIBUSDT", base: "SHIB", name: "Shiba Inu", gecko: "shiba-inu", toko: true, tokoIdr: false },
];

// `tv` is the TradingView chart interval, `binance` the matching kline interval,
// `gauge` the interval name used by the TradingView technical-analysis widget.
export const TIMEFRAMES = [
  { label: "15m", tv: "15", binance: "15m", gauge: "15m" },
  { label: "1j", tv: "60", binance: "1h", gauge: "1h" },
  { label: "4j", tv: "240", binance: "4h", gauge: "4h" },
  { label: "1H", tv: "D", binance: "1d", gauge: "1D" },
  { label: "1M", tv: "W", binance: "1w", gauge: "1W" },
] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];

export const BINANCE_API = "https://data-api.binance.vision/api/v3";
export const COINGECKO_API = "https://api.coingecko.com/api/v3";

export function formatPrice(n: number): string {
  const digits = n >= 1000 ? 2 : n >= 1 ? 3 : n >= 0.01 ? 5 : 8;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  });
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

export function formatCompact(n: number): string {
  return compact.format(n);
}

// Decimal places needed to show meaningful price moves on a chart axis.
export function pricePrecision(n: number): number {
  return n >= 100 ? 2 : n >= 1 ? 3 : n >= 0.01 ? 5 : 8;
}

export function tokocryptoUrl(base: string, quote: "IDR" | "USDT"): string {
  return `https://www.tokocrypto.com/id/trade/${base}_${quote}`;
}
