/**
 * Single-admin login for deployed demos. Credentials come from the environment:
 *   ADMIN_USERNAME  (default "admin")
 *   ADMIN_PASSWORD  required to enable login; unset on Vercel = every request refused
 *   AUTH_SECRET     signs the session cookie (falls back to ADMIN_PASSWORD, so changing
 *                   the password also logs everyone out)
 * Web Crypto only, so it runs in proxy.ts and in route handlers alike.
 */
export const SESSION_COOKIE = "ce_session";
export const SESSION_DAYS = 7;

export type AuthMode = "on" | "off" | "misconfigured";

/** off = local dev without a password; misconfigured = deployed without one (fail closed). */
export function authMode(): AuthMode {
  if (process.env.ADMIN_PASSWORD) return "on";
  return process.env.VERCEL ? "misconfigured" : "off";
}

const enc = new TextEncoder();

async function hmac(data: string): Promise<string> {
  const secret = process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || "";
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Buffer.from(sig).toString("base64url");
}

/** Compare two strings without leaking where they differ (HMAC both, then compare). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([hmac(`cmp:${a}`), hmac(`cmp:${b}`)]);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.min(x.length, y.length); i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export async function checkCredentials(username: string, password: string): Promise<boolean> {
  if (authMode() !== "on") return false;
  const user = process.env.ADMIN_USERNAME || "admin";
  const [u, p] = await Promise.all([safeEqual(username, user), safeEqual(password, process.env.ADMIN_PASSWORD!)]);
  return u && p;
}

/** Cookie value: "<expiry ms>.<signature>". */
export async function createSession(now = Date.now()): Promise<string> {
  const exp = String(now + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return `${exp}.${await hmac(`session:${exp}`)}`;
}

export async function verifySession(value: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value || authMode() !== "on") return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  return safeEqual(sig, await hmac(`session:${exp}`));
}
