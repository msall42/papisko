import { HttpError } from "../../server/domain";
import {
  json,
  body,
  limit,
  originCheck,
  type Env,
} from "../../server/security";
import { catalog, quote } from "../../server/catalog";
import { createOrder, publicOrder, recoverOrder } from "../../server/orders";
import { admin } from "../../server/admin";
export const onRequest: PagesFunction<Env> = async ({ request: r, env }) => {
  try {
    originCheck(r);
    const u = new URL(r.url),
      p = u.pathname;
    if (p.startsWith("/api/admin/")) return await admin(env, r, p);
    if (p === "/api/catalog" && r.method === "GET")
      return await catalog(env, u);
    if (p === "/api/delivery/quote" && r.method === "POST") {
      await limit(env, r, "quote", 60, 600);
      const b = await body(r);
      return json(await quote(env, b.latitude, b.longitude));
    }
    if (p === "/api/orders" && r.method === "POST") {
      await limit(env, r, "order", 8, 600);
      return await createOrder(env, await body(r));
    }
    if (p === "/api/orders/recover" && r.method === "GET") {
      await limit(env, r, "status", 120, 600);
      return await recoverOrder(env, r);
    }
    const order = p.match(/^\/api\/orders\/([a-f0-9-]{36})$/);
    if (order && r.method === "GET") {
      await limit(env, r, "status", 120, 600);
      return await publicOrder(env, r, order[1]);
    }
    return json({ error: "Route introuvable." }, 404);
  } catch (e) {
    if (e instanceof HttpError)
      return json(
        { error: e.message },
        e.status,
        e.status === 429 ? { "Retry-After": "600" } : {},
      );
    // Aucune donnée client ou secret dans les journaux.
    console.error("API_FAILURE", e instanceof Error ? e.name : "Unknown");
    return json(
      { error: "Une erreur est survenue. Réessayez sans recréer la commande." },
      500,
    );
  }
};
