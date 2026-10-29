import { HttpError, now } from "./domain";
export interface Env {
  DB: D1Database;
  ADMIN_PASSWORD_HASH?: string;
  RATE_LIMIT_SECRET?: string;
  SHOP_MODE?: string;
  WHATSAPP_NUMBER?: string;
}
export const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
export const sha = async (s: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
export async function hmac(secret: string, value: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(value)),
  );
}
export function equal(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
export function originCheck(r: Request) {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(r.method) &&
    r.headers.get("Origin") !== new URL(r.url).origin
  )
    throw new HttpError(403, "Origine de requête refusée.");
}
export async function body(r: Request) {
  if (!r.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "JSON requis.");
  if (Number(r.headers.get("content-length") || 0) > 16384)
    throw new HttpError(413, "Requête trop volumineuse.");
  const reader = r.body?.getReader();
  if (!reader) throw new HttpError(400, "Corps manquant.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) {
      await reader.cancel();
      throw new HttpError(413, "Requête trop volumineuse.");
    }
    chunks.push(value);
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || Array.isArray(data) || typeof data !== "object") throw 0;
    return data as Record<string, any>;
  } catch {
    throw new HttpError(400, "JSON invalide.");
  }
}
export async function limit(
  env: Env,
  r: Request,
  scope: string,
  max: number,
  seconds: number,
) {
  if (!env.RATE_LIMIT_SECRET)
    throw new HttpError(503, "La protection anti-spam doit être configurée.");
  const ip = r.headers.get("CF-Connecting-IP") || "local";
  const t = now();
  const key = await hmac(
    env.RATE_LIMIT_SECRET,
    `${scope}:${ip}:${Math.floor(t / seconds)}`,
  );
  const row = await env.DB.prepare(
    "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(key, t + seconds)
    .first<{ count: number }>();
  // Nettoyage borné : aucune adresse IP brute n'est conservée.
  await env.DB.prepare(
    "DELETE FROM rate_limits WHERE key IN(SELECT key FROM rate_limits WHERE expires_at<? LIMIT 50)",
  )
    .bind(t)
    .run();
  if (!row || row.count > max)
    throw new HttpError(429, "Trop de tentatives. Réessayez plus tard.");
}
// SHA-256 est réservé ici à un secret aléatoire de 256 bits (43 caractères).
// Ne pas l'utiliser pour un mot de passe choisi par un humain.
export async function verifyPassword(password: string, encoded: string) {
  const [scheme, expected] = encoded.split(":");
  if (
    scheme !== "random256" ||
    !/^[a-f0-9]{64}$/.test(expected || "") ||
    !/^[A-Za-z0-9_-]{43}$/.test(password)
  )
    return false;
  return equal(await sha(password), expected);
}
export async function session(env: Env, r: Request, mutating = false) {
  const raw = r.headers
    .get("Cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("papisko_admin="))
    ?.slice(14);
  if (!raw || !/^[a-f0-9]{64}$/.test(raw))
    throw new HttpError(401, "Connexion nécessaire.");
  const row = await env.DB.prepare(
    "SELECT csrf FROM admin_sessions WHERE token_hash=? AND expires_at>?",
  )
    .bind(await sha(raw), now())
    .first<{ csrf: string }>();
  if (!row) throw new HttpError(401, "Session expirée.");
  if (mutating && !equal(r.headers.get("X-CSRF-Token") || "", row.csrf))
    throw new HttpError(403, "Session invalide. Rechargez la page.");
  return row;
}
export function randomToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}
export function cookie(r: Request, value: string, age = 28800) {
  return `papisko_admin=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(r.url).protocol === "https:" ? "; Secure" : ""}`;
}
