import {
  HttpError,
  text,
  integer,
  imageUrl,
  coordinates,
  canTransition,
  now,
} from "./domain";
import {
  json,
  body,
  limit,
  session,
  sha,
  verifyPassword,
  randomToken,
  cookie,
  type Env,
} from "./security";
import { settings, demoMode } from "./catalog";
async function adminProducts(env: Env) {
  const products = (
    await env.DB.prepare(
      "SELECT * FROM products ORDER BY created_at DESC LIMIT 500",
    ).all<any>()
  ).results;
  const variants = (
    await env.DB.prepare(
      "SELECT * FROM variants ORDER BY label LIMIT 3000",
    ).all<any>()
  ).results;
  return json({
    products: products.map((p) => ({
      ...p,
      variants: variants.filter((v) => v.product_id === p.id),
    })),
    categories: (
      await env.DB.prepare("SELECT * FROM categories ORDER BY position").all()
    ).results,
  });
}
async function saveProduct(env: Env, b: Record<string, any>) {
  const id = b.id ? text(b.id, "Produit", 80) : crypto.randomUUID();
  const existing = await env.DB.prepare("SELECT id FROM products WHERE id=?")
    .bind(id)
    .first();
  if (b.id && !existing) throw new HttpError(404, "Produit introuvable.");
  const name = text(b.name, "Nom", 140, 2),
    description = text(b.description, "Description", 2000, 5),
    category = text(b.category_id, "Catégorie", 60);
  if (
    !(await env.DB.prepare("SELECT id FROM categories WHERE id=?")
      .bind(category)
      .first())
  )
    throw new HttpError(400, "Catégorie inconnue.");
  if (!["neuf", "friperie"].includes(b.condition))
    throw new HttpError(400, "État invalide.");
  const price = integer(b.price, "Prix", 100, 2000000),
    compare =
      b.compare_price === null
        ? null
        : integer(b.compare_price, "Ancien prix", price + 1, 3000000);
  const flash =
    b.flash_price === null
      ? null
      : integer(b.flash_price, "Prix flash", 1, price - 1);
  const start =
      flash === null
        ? null
        : integer(b.flash_start, "Début de promotion", 1, 4102444800),
    end =
      flash === null
        ? null
        : integer(b.flash_end, "Fin de promotion", start! + 1, 4102444800);
  const image = imageUrl(b.image_url);
  const demo = b.demo === true || b.demo === 1 ? 1 : 0;
  if (!demo && !image)
    throw new HttpError(
      400,
      "Une photo réelle est requise pour un article hors démonstration.",
    );
  if (
    !Array.isArray(b.variants) ||
    b.variants.length < 1 ||
    b.variants.length > 20
  )
    throw new HttpError(400, "De 1 à 20 variantes sont requises.");
  const old = (
    await env.DB.prepare("SELECT * FROM variants WHERE product_id=?")
      .bind(id)
      .all<any>()
  ).results;
  const variants = b.variants.map((v: any) => ({
    id: v.id ? text(v.id, "Variante", 80) : crypto.randomUUID(),
    label: text(v.label, "Taille / couleur", 80),
    stock: integer(v.stock, "Stock", 0, 10000),
  }));
  if (
    new Set(variants.map((v: any) => v.id)).size !== variants.length ||
    old.some((o) => !variants.find((v: any) => v.id === o.id))
  )
    throw new HttpError(
      400,
      "Conservez les variantes existantes ; mettez leur stock à zéro pour les retirer.",
    );
  for (const v of variants) {
    const row = await env.DB.prepare(
      "SELECT product_id FROM variants WHERE id=?",
    )
      .bind(v.id)
      .first<{ product_id: string }>();
    if (row && row.product_id !== id)
      throw new HttpError(400, "Variante invalide.");
  }
  const statements = [
    env.DB.prepare(
      `INSERT INTO products(id,category_id,name,description,condition,image_url,price,compare_price,flash_price,flash_start,flash_end,active,demo,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id,name=excluded.name,description=excluded.description,condition=excluded.condition,image_url=excluded.image_url,price=excluded.price,compare_price=excluded.compare_price,flash_price=excluded.flash_price,flash_start=excluded.flash_start,flash_end=excluded.flash_end,active=excluded.active,demo=excluded.demo`,
    ).bind(
      id,
      category,
      name,
      description,
      b.condition,
      image,
      price,
      compare,
      flash,
      start,
      end,
      b.active === false || b.active === 0 ? 0 : 1,
      demo,
      now(),
    ),
  ];
  for (const v of variants) {
    const previous = old.find((o) => o.id === v.id);
    if (previous)
      statements.push(
        env.DB.prepare(
          "UPDATE variants SET label=?,stock=stock+? WHERE id=? AND product_id=?",
        ).bind(v.label, v.stock - previous.stock, v.id, id),
      );
    else
      statements.push(
        env.DB.prepare(
          "INSERT INTO variants(id,product_id,label,stock) VALUES(?,?,?,?)",
        ).bind(v.id, id, v.label, v.stock),
      );
  }
  try {
    await env.DB.batch(statements);
  } catch {
    throw new HttpError(
      409,
      "Le stock a changé. Rechargez le produit avant de réessayer.",
    );
  }
  return json({ id });
}
async function listOrders(env: Env, url: URL) {
  const page = Math.max(
    1,
    Math.min(10000, Number(url.searchParams.get("page")) || 1),
  );
  if (!Number.isInteger(page)) throw new HttpError(400, "Page invalide.");
  const rows = (
    await env.DB.prepare(
      `SELECT o.*,p.status AS payment_status,p.external_reference,d.scheduled_at,d.slot,d.status AS delivery_status FROM orders o JOIN payments p ON p.order_id=o.id JOIN deliveries d ON d.order_id=o.id ORDER BY o.created_at DESC,o.id DESC LIMIT 21 OFFSET ?`,
    )
      .bind((page - 1) * 20)
      .all<any>()
  ).results;
  const orders = rows.slice(0, 20);
  for (const o of orders) {
    delete o.access_hash;
    delete o.idempotency_key;
    delete o.request_hash;
    o.items = (
      await env.DB.prepare(
        "SELECT name,variant_label,quantity,unit_price FROM order_items WHERE order_id=?",
      )
        .bind(o.id)
        .all()
    ).results;
  }
  return json({ orders, hasMore: rows.length > 20, page });
}
async function updateOrder(env: Env, id: string, b: Record<string, any>) {
  const o = await env.DB.prepare(
    "SELECT o.*,p.status AS payment_status FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.id=?",
  )
    .bind(id)
    .first<any>();
  if (!o) throw new HttpError(404, "Commande introuvable.");
  const t = now();
  const statements: D1PreparedStatement[] = [];
  // Toutes les mutations ci-dessous gardent une condition SQL contre les doubles clics et courses.
  if (b.action === "paid") {
    if (o.status === "annulee" || o.payment_status !== "pending")
      throw new HttpError(409, "Ce paiement ne peut plus être confirmé.");
    const ref = text(
      b.reference,
      "Référence du paiement ou encaissement",
      100,
      3,
    );
    statements.push(
      env.DB.prepare(
        "UPDATE payments SET status='paid',external_reference=?,confirmed_at=? WHERE order_id=? AND status='pending' AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status!='annulee')",
      ).bind(ref, t, id, id),
    );
    statements.push(
      env.DB.prepare(
        "UPDATE orders SET status=CASE WHEN status='en_attente' THEN 'payee' ELSE status END,updated_at=? WHERE id=? AND status!='annulee' AND EXISTS(SELECT 1 FROM payments WHERE order_id=? AND status='paid')",
      ).bind(t, id, id),
    );
  } else if (b.action === "status") {
    const next = text(b.status, "Statut", 20);
    if (
      !canTransition(o.status, next, o.payment_status === "paid", o.method) ||
      (next === "annulee" && o.payment_status === "paid") ||
      (next === "livree" && o.payment_status !== "paid")
    )
      throw new HttpError(
        409,
        "Transition refusée. Vérifiez le paiement et l’état de la commande.",
      );
    statements.push(
      env.DB.prepare(
        `UPDATE orders SET status=?,updated_at=? WHERE id=? AND status=? AND (?!='annulee' OR EXISTS(SELECT 1 FROM payments WHERE order_id=? AND status='pending')) AND (? NOT IN('expediee','livree') OR method='cash' OR EXISTS(SELECT 1 FROM payments WHERE order_id=? AND status='paid'))`,
      ).bind(next, t, id, o.status, next, id, next, id),
    );
    if (next === "annulee")
      statements.push(
        env.DB.prepare(
          "UPDATE payments SET status='cancelled' WHERE order_id=? AND status='pending' AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='annulee')",
        ).bind(id, id),
      );
    const d =
      next === "annulee"
        ? "annulee"
        : next === "livree"
          ? "livree"
          : next === "expediee"
            ? "en_cours"
            : null;
    if (d)
      statements.push(
        env.DB.prepare(
          "UPDATE deliveries SET status=? WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status=?)",
        ).bind(d, id, id, next),
      );
  } else if (b.action === "delivery") {
    if (["annulee", "livree"].includes(o.status))
      throw new HttpError(409, "Cette livraison est clôturée.");
    const date = text(b.scheduled_at, "Date de livraison", 10);
    const parsed = new Date(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date ||
      date < new Date().toISOString().slice(0, 10)
    )
      throw new HttpError(400, "Date de livraison invalide ou passée.");
    const slot = text(b.slot, "Créneau", 60, 3);
    statements.push(
      env.DB.prepare(
        "UPDATE deliveries SET scheduled_at=?,slot=?,status=CASE WHEN status='en_cours' THEN status ELSE 'planifiee' END WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status NOT IN('livree','annulee'))",
      ).bind(date, slot, id, id),
    );
  } else throw new HttpError(400, "Action inconnue.");
  try {
    const res = await env.DB.batch(statements);
    if (!res[0].meta.changes)
      throw new HttpError(409, "La commande a changé. Rechargez la liste.");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(
      409,
      "Modification refusée. Référence déjà utilisée ou état modifié.",
    );
  }
  return json({ ok: true });
}
export async function admin(env: Env, r: Request, path: string) {
  if (path === "/api/admin/login" && r.method === "POST") {
    await limit(env, r, "login", 5, 900);
    if (!env.ADMIN_PASSWORD_HASH)
      throw new HttpError(
        503,
        "Le mot de passe administrateur doit être configuré.",
      );
    const b = await body(r),
      password = text(b.password, "Mot de passe", 256, 1);
    if (!(await verifyPassword(password, env.ADMIN_PASSWORD_HASH)))
      throw new HttpError(401, "Identifiants incorrects.");
    const raw = randomToken(),
      csrf = randomToken();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at<?").bind(
        now(),
      ),
      env.DB.prepare("INSERT INTO admin_sessions VALUES(?,?,?)").bind(
        await sha(raw),
        csrf,
        now() + 28800,
      ),
    ]);
    return json({ csrf }, 200, { "Set-Cookie": cookie(r, raw) });
  }
  const auth = await session(env, r, !["GET", "HEAD"].includes(r.method));
  if (path === "/api/admin/session" && r.method === "GET")
    return json({ csrf: auth.csrf, demo: demoMode(env) });
  if (path === "/api/admin/logout" && r.method === "POST") {
    await env.DB.prepare("DELETE FROM admin_sessions WHERE csrf=?")
      .bind(auth.csrf)
      .run();
    return json({ ok: true }, 200, { "Set-Cookie": cookie(r, "", 0) });
  }
  if (path === "/api/admin/products") {
    if (r.method === "GET") return adminProducts(env);
    if (r.method === "POST") {
      await limit(env, r, "admin", 100, 600);
      return saveProduct(env, await body(r));
    }
  }
  if (path === "/api/admin/orders" && r.method === "GET")
    return listOrders(env, new URL(r.url));
  const match = path.match(/^\/api\/admin\/orders\/([a-f0-9-]{36})$/);
  if (match && r.method === "PATCH") {
    await limit(env, r, "admin", 100, 600);
    return updateOrder(env, match[1], await body(r));
  }
  if (path === "/api/admin/delivery") {
    if (r.method === "GET") return json(await settings(env));
    if (r.method === "PUT") {
      const b = await body(r);
      const point = coordinates(b.originLat, b.originLon);
      const config = {
        originLat: point.lat,
        originLon: point.lon,
        originLabel: text(b.originLabel, "Point de retrait", 160),
        eta: text(b.eta, "Délai indicatif", 120),
      };
      await env.DB.prepare("UPDATE settings SET value=? WHERE key='delivery'")
        .bind(JSON.stringify(config))
        .run();
      return json(config);
    }
  }
  return json({ error: "Route administrateur introuvable." }, 404);
}
