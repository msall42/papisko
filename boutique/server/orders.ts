import {
  HttpError,
  text,
  integer,
  phone,
  coordinates,
  effectivePrice,
  now,
} from "./domain";
import { type Env, json, sha, hmac } from "./security";
import { quote, demoMode } from "./catalog";
export async function createOrder(env: Env, b: Record<string, any>) {
  const key = text(b.idempotencyKey, "Identifiant de commande", 36);
  if (!/^[a-f0-9-]{36}$/.test(key))
    throw new HttpError(400, "Identifiant de commande invalide.");
  const name = text(b.name, "Nom", 100, 2),
    tel = phone(b.phone),
    address = text(b.address, "Adresse de livraison", 300, 5);
  const dest = coordinates(b.latitude, b.longitude);
  if (!["wave_manual", "cash"].includes(b.method))
    throw new HttpError(400, "Paiement indisponible.");
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 20)
    throw new HttpError(400, "Le panier doit contenir entre 1 et 20 articles.");
  const items = b.items
    .map((x: any) => ({
      variantId: text(x?.variantId, "Variante", 80),
      quantity: integer(x?.quantity, "Quantité", 1, 10),
    }))
    .sort((a: any, b: any) => a.variantId.localeCompare(b.variantId));
  if (new Set(items.map((x: any) => x.variantId)).size !== items.length)
    throw new HttpError(400, "Article présent en double.");
  const requestHash = await sha(
    JSON.stringify({ name, tel, address, ...dest, method: b.method, items }),
  );
  const accessToken = await hmac(env.RATE_LIMIT_SECRET!, `order:${key}`);
  const existing = await env.DB.prepare(
    "SELECT id,request_hash FROM orders WHERE idempotency_key=?",
  )
    .bind(key)
    .first<{ id: string; request_hash: string }>();
  if (existing) {
    if (existing.request_hash !== requestHash)
      throw new HttpError(
        409,
        "Cette commande a déjà été envoyée avec un contenu différent.",
      );
    return json({ id: existing.id, accessToken }, 200);
  }
  const shipping = await quote(env, dest.lat, dest.lon);
  if (shipping.fee === null)
    throw new HttpError(
      422,
      "Au-delà de 30 km, contactez Papisko pour un devis avant de payer.",
    );
  const ids = items.map((i: any) => i.variantId);
  const { results } = await env.DB.prepare(
    `SELECT v.id AS variant_id,v.label,v.stock,p.*,s.active AS seller_active FROM variants v JOIN products p ON p.id=v.product_id JOIN sellers s ON s.id=p.seller_id WHERE v.id IN(${ids.map(() => "?").join(",")})`,
  )
    .bind(...ids)
    .all<any>();
  let subtotal = 0;
  const lines = items.map((i: any) => {
    const p = results.find((p) => p.variant_id === i.variantId);
    if (
      !p ||
      !p.active ||
      !p.seller_active ||
      (!demoMode(env) && p.demo) ||
      p.stock < i.quantity
    )
      throw new HttpError(
        409,
        "Un article est épuisé ou indisponible. Actualisez le catalogue.",
      );
    const price = effectivePrice(p).price;
    subtotal += price * i.quantity;
    return { ...i, p, price };
  });
  if (subtotal > 2000000)
    throw new HttpError(
      400,
      "Contactez Papisko pour une commande de ce montant.",
    );
  // Consentement explicite au montant calculé ; aucun prix fourni par le client ne sert au calcul.
  if (b.expectedTotal !== subtotal + shipping.fee)
    throw new HttpError(
      409,
      "Le prix a changé. Actualisez le panier avant de confirmer.",
    );
  const id = crypto.randomUUID(),
    t = now();
  const statements = [
    env.DB.prepare(
      "INSERT INTO orders(id,access_hash,idempotency_key,request_hash,customer_name,phone,address,latitude,longitude,subtotal,delivery_fee,distance_km,total,method,demo,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      id,
      await sha(accessToken),
      key,
      requestHash,
      name,
      tel,
      address,
      dest.lat,
      dest.lon,
      subtotal,
      shipping.fee,
      shipping.distanceKm,
      subtotal + shipping.fee,
      b.method,
      demoMode(env) ? 1 : 0,
      t,
      t,
    ),
  ];
  for (const l of lines)
    statements.push(
      env.DB.prepare(
        "INSERT INTO order_items(order_id,variant_id,seller_id,name,variant_label,unit_price,quantity) VALUES(?,?,?,?,?,?,?)",
      ).bind(
        id,
        l.variantId,
        l.p.seller_id,
        l.p.name,
        l.p.label,
        l.price,
        l.quantity,
      ),
    );
  statements.push(
    env.DB.prepare(
      "INSERT INTO payments(id,order_id,method,amount) VALUES(?,?,?,?)",
    ).bind(crypto.randomUUID(), id, b.method, subtotal + shipping.fee),
  );
  statements.push(
    env.DB.prepare("INSERT INTO deliveries(order_id) VALUES(?)").bind(id),
  );
  statements.push(
    env.DB.prepare(
      "INSERT INTO order_history(order_id,action,created_at) VALUES(?,?,?)",
    ).bind(id, "Commande enregistrée", t),
  );
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const raced = await env.DB.prepare(
      "SELECT id,request_hash FROM orders WHERE idempotency_key=?",
    )
      .bind(key)
      .first<{ id: string; request_hash: string }>();
    if (raced && raced.request_hash === requestHash)
      return json({ id: raced.id, accessToken }, 200);
    if (String(error).includes("PRICE_CHANGED"))
      throw new HttpError(409, "Le prix a changé. Actualisez le catalogue.");
    if (String(error).includes("STOCK_UNAVAILABLE"))
      throw new HttpError(
        409,
        "Un article vient d’être vendu. Actualisez le panier.",
      );
    throw error;
  }
  return json({ id, accessToken }, 201);
}
export async function publicOrder(env: Env, r: Request, id: string) {
  const token = r.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new HttpError(404, "Commande introuvable.");
  const o = await env.DB.prepare(
    `SELECT o.id,o.subtotal,o.delivery_fee,o.total,o.status,o.method,o.demo,o.created_at,p.status AS payment_status,d.scheduled_at,d.slot FROM orders o JOIN payments p ON p.order_id=o.id JOIN deliveries d ON d.order_id=o.id WHERE o.id=? AND o.access_hash=?`,
  )
    .bind(id, await sha(token))
    .first<any>();
  if (!o) throw new HttpError(404, "Commande introuvable.");
  const items = (
    await env.DB.prepare(
      "SELECT name,variant_label,unit_price,quantity FROM order_items WHERE order_id=?",
    )
      .bind(id)
      .all()
  ).results;
  return json({ ...o, items, whatsapp: env.WHATSAPP_NUMBER || "221762466785" });
}

// Le UUID de soumission est une capacité secrète conservée sur l'appareil :
// il permet de récupérer le reçu si la connexion coupe après le commit D1.
export async function recoverOrder(env: Env, r: Request) {
  const key = r.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
  if (!/^[a-f0-9-]{36}$/.test(key))
    throw new HttpError(404, "Commande introuvable.");
  const row = await env.DB.prepare(
    "SELECT id FROM orders WHERE idempotency_key=?",
  )
    .bind(key)
    .first<{ id: string }>();
  if (!row)
    throw new HttpError(
      404,
      "Aucune commande retrouvée pour cet envoi. Réessayez depuis le panier avec les mêmes informations.",
    );
  return json({
    id: row.id,
    accessToken: await hmac(env.RATE_LIMIT_SECRET!, `order:${key}`),
  });
}
