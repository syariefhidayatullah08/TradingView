import { clerkClient } from "@clerk/nextjs/server";
import { isOwnerEmail } from "@/lib/access";
import { packAlerts, unpackAlerts } from "@/lib/price-alerts";
import { alertsFor, candleCache } from "@/lib/alerts-server";
import { sendMessage, telegramConfigured } from "@/lib/telegram";

// Scheduled scan (GitHub Actions every 15 minutes) that sends Telegram alerts to linked users.
// Authorized with "Authorization: Bearer <CRON_SECRET>".

async function usdtIdr(): Promise<number | null> {
  try {
    const res = await fetch("https://www.tokocrypto.com/open/v1/market/depth?symbol=USDT_IDR&limit=5", {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json();
    const bid = Number(json?.data?.bids?.[0]?.[0]);
    const ask = Number(json?.data?.asks?.[0]?.[0]);
    return Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("forbidden", { status: 403 });
  }
  // Not set up yet: succeed quietly so the schedule does not report failures.
  if (!telegramConfigured()) return Response.json({ skipped: "Telegram belum dikonfigurasi" });

  const client = await clerkClient();
  const { data: users } = await client.users.getUserList({ limit: 200 });
  const linked = users.filter((u) => {
    const chatId = (u.privateMetadata.telegram as { chatId?: unknown } | undefined)?.chatId;
    const email = u.primaryEmailAddress?.emailAddress ?? "";
    const allowed = isOwnerEmail(email) || (u.publicMetadata.approved === true && u.publicMetadata.rejected !== true);
    return typeof chatId === "number" && allowed;
  });

  const idrPerUsdt = await usdtIdr();
  const candles = candleCache();
  const now = Date.now();
  let sent = 0;
  for (const u of linked) {
    const chatId = (u.privateMetadata.telegram as { chatId: number }).chatId;
    try {
      const { messages, state, fired } = await alertsFor({ private: u.privateMetadata, idrPerUsdt }, candles, now);
      for (const m of messages) if (await sendMessage(chatId, m)) sent++;
      const update: Record<string, unknown> = { tgState: state };
      if (fired.length) {
        // Re-read so an alarm added during this run is kept.
        const fresh = await client.users.getUser(u.id);
        update.priceAlerts = packAlerts(unpackAlerts(fresh.privateMetadata.priceAlerts).filter((a) => !fired.includes(a.id)));
      }
      await client.users.updateUserMetadata(u.id, { privateMetadata: update });
    } catch {
      // One user's failure must not stop the others.
    }
  }
  return Response.json({ users: linked.length, sent });
}
