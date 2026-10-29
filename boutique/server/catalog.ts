import {
  effectivePrice,
  now,
  HttpError,
  coordinates,
  haversine,
  deliveryFee,
} from "./domain";
import { json, type Env } from "./security";
export async function settings(env: Env) {
  const row = await env.DB.prepare(
    "SELECT value FROM settings WHERE key='delivery'",
  ).first<{ value: string }>();
  return JSON.parse(row!.value) as {
    originLat: number | null;
    originLon: number | null;
    originLabel: string;
    eta: string;
  };
}
export const demoMode = (env: Env) => env.SHOP_MODE !== "live";
export async function catalog(env: Env, url: URL) {
  let q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  // D1 limite les motifs LIKE à 50 octets, échappements et % inclus.
  while (new TextEncoder().encode(q.replace(/[\\%_]/g, "\\$&")).length > 46)
    q = q.slice(0, -1);
  const category = url.searchParams.get("category") || "";
  const condition = url.searchParams.get("condition") || "";
  const page = Math.max(
    1,
    Math.min(1000, Number(url.searchParams.get("page")) || 1),
  );
  if (!Number.isInteger(page)) throw new HttpError(400, "Page invalide.");
  const filters = ["p.active=1", "s.active=1"];
  const values: (string | number)[] = [];
  if (!demoMode(env)) filters.push("p.demo=0");
  if (q) {
    filters.push(
      "(p.name LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')",
    );
    const escaped = q.replace(/[\\%_]/g, "\\$&");
    values.push(`%${escaped}%`, `%${escaped}%`);
  }
  if (category) {
    filters.push("p.category_id=?");
    values.push(category);
  }
  if (condition) {
    filters.push("p.condition=?");
    values.push(condition);
  }
  const { results } = await env.DB.prepare(
    `SELECT p.*,s.name AS seller_name FROM products p JOIN sellers s ON s.id=p.seller_id WHERE ${filters.join(" AND ")} ORDER BY p.created_at DESC,p.id LIMIT 13 OFFSET ?`,
  )
    .bind(...values, (page - 1) * 12)
    .all<any>();
  const hasMore = results.length > 12;
  const products = results.slice(0, 12);
  const ids = products.map((p) => p.id);
  const variants = ids.length
    ? (
        await env.DB.prepare(
          `SELECT * FROM variants WHERE product_id IN (${ids.map(() => "?").join(",")}) ORDER BY label`,
        )
          .bind(...ids)
          .all<any>()
      ).results
    : [];
  const cats = (
    await env.DB.prepare("SELECT * FROM categories ORDER BY position").all()
  ).results;
  const config = await settings(env);
  return json({
    products: products.map((p) => ({
      ...p,
      base_price: p.price,
      ...effectivePrice(p),
      variants: variants.filter((v) => v.product_id === p.id),
    })),
    categories: cats,
    hasMore,
    page,
    serverTime: now(),
    demo: demoMode(env),
    delivery: {
      eta: config.eta,
      originLabel: config.originLabel,
      configured: config.originLat !== null && config.originLon !== null,
    },
    whatsapp: env.WHATSAPP_NUMBER || "221762466785",
  });
}
export async function quote(env: Env, lat: unknown, lon: unknown) {
  const dest = coordinates(lat, lon);
  const config = await settings(env);
  if (config.originLat === null || config.originLon === null)
    throw new HttpError(
      503,
      "Le point de retrait doit être configuré par Papisko avant de commander.",
    );
  const distance = haversine(
    config.originLat,
    config.originLon,
    dest.lat,
    dest.lon,
  );
  const fee = deliveryFee(distance);
  return {
    fee,
    distanceKm: Math.ceil(distance * 100) / 100,
    eta: config.eta,
    requiresQuote: fee === null,
  };
}
