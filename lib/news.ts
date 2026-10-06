// `filter` keeps only items whose title or description matches.
type Feed = { source: string; url: string; filter?: RegExp };

const FED_TOPIC =
  /\b(fed|fomc|federal reserve|rate cuts?|rate hikes?|interest rates?|monetary policy|treasur(y|ies)|inflation|suku bunga)\b/i;

const BLOOMBERG_ECONOMICS = "https://feeds.bloomberg.com/economics/news.rss";
const BLOOMBERG_MARKETS = "https://feeds.bloomberg.com/markets/news.rss";
const CNBC_ECONOMY = "https://www.cnbc.com/id/20910258/device/rss/rss.html";
const MARKETWATCH = "https://feeds.content.dowjones.io/public/rss/mw_topstories";
const INVESTING_ECONOMY = "https://www.investing.com/rss/news_14.rss";

const FEEDS = {
  politik: [
    { source: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
    { source: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
    { source: "CNBC World", url: "https://www.cnbc.com/id/100727362/device/rss/rss.html" },
    { source: "Financial Times", url: "https://www.ft.com/world?format=rss" },
    { source: "Bloomberg Politics", url: "https://feeds.bloomberg.com/politics/news.rss" },
    { source: "Antara Dunia", url: "https://www.antaranews.com/rss/dunia.xml" },
    { source: "CNBC Indonesia", url: "https://www.cnbcindonesia.com/news/rss" },
  ],
  ekonomi: [
    { source: "CNBC Economy", url: CNBC_ECONOMY },
    { source: "MarketWatch", url: MARKETWATCH },
    { source: "Investing.com", url: INVESTING_ECONOMY },
    { source: "The Guardian Economics", url: "https://www.theguardian.com/business/economics/rss" },
    { source: "Bloomberg Economics", url: BLOOMBERG_ECONOMICS },
    { source: "Bloomberg Markets", url: BLOOMBERG_MARKETS },
    { source: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
    { source: "Antara Ekonomi", url: "https://www.antaranews.com/rss/ekonomi.xml" },
    { source: "CNBC Indonesia Market", url: "https://www.cnbcindonesia.com/market/rss" },
  ],
  fed: [
    { source: "CNBC Economy", url: CNBC_ECONOMY, filter: FED_TOPIC },
    { source: "MarketWatch", url: MARKETWATCH, filter: FED_TOPIC },
    { source: "Investing.com", url: INVESTING_ECONOMY, filter: FED_TOPIC },
    { source: "Bloomberg Economics", url: BLOOMBERG_ECONOMICS, filter: FED_TOPIC },
    { source: "Bloomberg Markets", url: BLOOMBERG_MARKETS, filter: FED_TOPIC },
    { source: "The Fed (resmi)", url: "https://www.federalreserve.gov/feeds/press_monetary.xml" },
    { source: "Pidato pejabat Fed", url: "https://www.federalreserve.gov/feeds/speeches.xml" },
  ],
  crypto: [
    { source: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
    { source: "Cointelegraph", url: "https://cointelegraph.com/rss" },
    { source: "Decrypt", url: "https://decrypt.co/feed" },
    { source: "The Block", url: "https://www.theblock.co/rss.xml" },
    { source: "Cryptonews", url: "https://cryptonews.com/news/feed/" },
    { source: "Investing.com Crypto", url: "https://www.investing.com/rss/news_301.rss" },
    { source: "Bloomberg Crypto", url: "https://feeds.bloomberg.com/crypto/news.rss" },
  ],
} satisfies Record<string, Feed[]>;

export type NewsCategory = keyof typeof FEEDS;

export function isNewsCategory(value: string): value is NewsCategory {
  return Object.hasOwn(FEEDS, value);
}

const PER_SOURCE = 10;

export type NewsItem = {
  title: string;
  link: string;
  description: string;
  source: string;
  publishedAt: number;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? match;
    const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
  });
}

function clean(raw: string): string {
  const text = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return decodeEntities(decodeEntities(text).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? clean(m[1]) : "";
}

function parseDate(raw: string): number {
  // Investing.com publishes "YYYY-MM-DD HH:MM:SS" in UTC without a zone marker.
  const bare = raw.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/);
  const t = Date.parse(bare ? `${bare[1]}T${bare[2]}Z` : raw);
  return Number.isNaN(t) ? 0 : t;
}

function parseRss(xml: string, { source, filter }: Feed): NewsItem[] {
  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = m[0];
    const title = pick(block, "title");
    const link = pick(block, "link");
    if (!title || !/^https?:\/\//.test(link)) continue;
    const description = pick(block, "description");
    if (filter && !filter.test(`${title} ${description}`)) continue;
    items.push({
      title,
      link,
      // Some feeds just repeat the title as the description.
      description: description === title ? "" : description.slice(0, 240),
      source,
      publishedAt: parseDate(pick(block, "pubDate")),
    });
    if (items.length >= PER_SOURCE) break;
  }
  return items;
}

async function loadFeed(feed: Feed): Promise<NewsItem[]> {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; KriptoScope/1.0)" },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 120 },
  });
  if (!res.ok) throw new Error(`${feed.source}: HTTP ${res.status}`);
  return parseRss(await res.text(), feed);
}

// Newest first. `failed` lists the sources that could not be loaded.
export async function getNews(cat: NewsCategory): Promise<{ items: NewsItem[]; failed: string[] }> {
  const feeds: Feed[] = FEEDS[cat];
  const results = await Promise.allSettled(feeds.map(loadFeed));
  const items = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => b.publishedAt - a.publishedAt);
  const failed = feeds.filter((_, i) => results[i].status === "rejected").map((f) => f.source);
  return { items, failed };
}
