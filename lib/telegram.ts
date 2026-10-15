import { createHmac, timingSafeEqual } from "node:crypto";

// Telegram bot helpers (server only). Needs TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

export function telegramConfigured(): boolean {
  return TOKEN !== "" && SECRET !== "";
}

async function api<T>(method: string, body: Record<string, unknown>): Promise<T | null> {
  if (!TOKEN) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json();
    return json?.ok ? (json.result as T) : null;
  } catch {
    return null;
  }
}

export async function sendMessage(chatId: number, html: string): Promise<boolean> {
  const r = await api("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true });
  return r !== null;
}

let username: string | null = null;

export async function botUsername(): Promise<string | null> {
  if (username) return username;
  const me = await api<{ username: string }>("getMe", {});
  username = me?.username ?? null;
  return username;
}

export async function setWebhook(url: string): Promise<boolean> {
  return (await api("setWebhook", { url, secret_token: SECRET, allowed_updates: ["message"] })) !== null;
}

function sign(userId: string): string {
  return createHmac("sha256", SECRET).update(userId).digest("hex").slice(0, 16);
}

// Deep-link code that ties a Telegram chat to an app user: "<userId>-<signature>".
export function linkCode(userId: string): string {
  return `${userId}-${sign(userId)}`;
}

export function userFromCode(code: string): string | null {
  const cut = code.lastIndexOf("-");
  if (cut <= 0) return null;
  const userId = code.slice(0, cut);
  const sig = Buffer.from(code.slice(cut + 1));
  const want = Buffer.from(sign(userId));
  return sig.length === want.length && timingSafeEqual(sig, want) ? userId : null;
}

export function webhookAuthorized(request: Request): boolean {
  const got = Buffer.from(request.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const want = Buffer.from(SECRET);
  return SECRET !== "" && got.length === want.length && timingSafeEqual(got, want);
}
