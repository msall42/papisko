/** Vérifie les garanties métier sur un serveur Wrangler de DÉMONSTRATION local uniquement. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
const localSql = (sql) =>
  execFileSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "papisko",
      "--local",
      "--command",
      sql,
    ],
    { stdio: "pipe" },
  );
const base = process.env.PAPISKO_TEST_URL || "http://127.0.0.1:8788";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Tests autorisés uniquement en local.");
const password = process.env.PAPISKO_TEST_PASSWORD_FILE
  ? readFileSync(process.env.PAPISKO_TEST_PASSWORD_FILE, "utf8").trim()
  : process.env.PAPISKO_TEST_PASSWORD;
if (!password)
  throw new Error(
    "Définir PAPISKO_TEST_PASSWORD ou PAPISKO_TEST_PASSWORD_FILE.",
  );
let csrf = "",
  cookie = "";
let checks = 0;
const run = randomUUID();
let product;
const created = [];
async function call(path, method = "GET", data, headers = {}) {
  const res = await fetch(base + "/api" + path, {
    method,
    headers: {
      Origin: base,
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...headers,
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const value = await res.json();
  return { status: res.status, value, res };
}
function check(ok, label) {
  assert.ok(ok, label);
  checks++;
  console.log(`✓ ${label}`);
}
const catalog = await call("/catalog");
check(
  catalog.status === 200 && catalog.value.demo,
  "catalogue de démonstration disponible",
);
localSql("DELETE FROM rate_limits");
check(
  (await call("/admin/orders")).status === 401,
  "commandes privées sans connexion",
);
const login = await call("/admin/login", "POST", { password });
assert.equal(login.status, 200, JSON.stringify(login.value));
csrf = login.value.csrf;
cookie = login.res.headers.get("set-cookie").split(";")[0];
const original = (await call("/admin/delivery")).value;
try {
  check(
    (
      await call("/admin/delivery", "PUT", original, {
        "X-CSRF-Token": "invalid",
      })
    ).status === 403,
    "modification sans jeton CSRF refusée",
  );
  // Coordonnées fictives réservées aux essais. Ne pas reprendre en production.
  assert.equal(
    (
      await call("/admin/delivery", "PUT", {
        originLat: 14.73,
        originLon: -17.32,
        originLabel: "TEST TECHNIQUE — origine fictive",
        eta: "24 à 48 heures après confirmation",
      })
    ).status,
    200,
  );
  const quote = await call("/delivery/quote", "POST", {
    latitude: 14.73,
    longitude: -17.32,
  });
  check(quote.value.fee === 1000, "tarif minimum calculé côté serveur");
  check(
    (
      await call("/delivery/quote", "POST", {
        latitude: 14.95,
        longitude: -17.55,
      })
    ).value.requiresQuote,
    "devis obligatoire au-delà de 30 km",
  );
  const p = {
    name: `TEST TECHNIQUE ${run}`,
    description: "Démonstration de test automatisé, pièce unique.",
    category_id: "femme",
    condition: "friperie",
    image_url: "",
    price: 2500,
    compare_price: 3500,
    flash_price: null,
    flash_start: null,
    flash_end: null,
    demo: true,
    active: true,
    variants: [{ label: "Taille unique TEST", stock: 1 }],
  };
  const saved = await call("/admin/products", "POST", p);
  assert.equal(saved.status, 200, JSON.stringify(saved.value));
  product = (await call("/admin/products")).value.products.find(
    (x) => x.id === saved.value.id,
  );
  const make = (method = "wave_manual") => ({
    idempotencyKey: randomUUID(),
    name: "CLIENT TEST",
    phone: "770000000",
    address: `ADRESSE FICTIVE TEST ${run}`,
    latitude: 14.73,
    longitude: -17.32,
    method,
    items: [{ variantId: product.variants[0].id, quantity: 1 }],
    expectedTotal: 3500,
  });
  check(
    (await call("/orders", "POST", { ...make(), phone: "+33123456789" }))
      .status === 400,
    "téléphone étranger refusé",
  );
  check(
    (await call("/orders", "POST", { ...make(), expectedTotal: 1, price: 1 }))
      .status === 409,
    "prix client falsifié refusé",
  );
  const first = make(),
    second = make();
  const pair = await Promise.all([
    call("/orders", "POST", first),
    call("/orders", "POST", second),
  ]);
  check(
    pair.filter((x) => x.status === 201).length === 1 &&
      pair.filter((x) => x.status === 409).length === 1,
    "deux achats simultanés : une seule vente de la pièce unique",
  );
  const winner = pair.find((x) => x.status === 201).value;
  created.push(winner.id);
  const payload = pair[0].status === 201 ? first : second;
  const replay = await call("/orders", "POST", payload);
  check(
    replay.status === 200 && replay.value.id === winner.id,
    "réessai idempotent : même commande et même reçu",
  );
  check(
    (
      await call("/orders", "POST", {
        ...payload,
        address: "AUTRE ADRESSE TEST",
      })
    ).status === 409,
    "réutilisation de clé avec données différentes refusée",
  );
  const recovered = await call("/orders/recover", "GET", undefined, {
    Authorization: `Bearer ${payload.idempotencyKey}`,
  });
  check(
    recovered.value.id === winner.id &&
      recovered.value.accessToken === winner.accessToken,
    "récupération du reçu après coupure réseau",
  );
  check(
    (await call("/orders/" + winner.id)).status === 404,
    "référence de commande seule insuffisante pour consulter le suivi",
  );
  const receipt = await call("/orders/" + winner.id, "GET", undefined, {
    Authorization: `Bearer ${winner.accessToken}`,
  });
  check(
    receipt.status === 200 &&
      receipt.value.total === 3500 &&
      !("phone" in receipt.value) &&
      !("address" in receipt.value),
    "suivi autorisé sans divulgation des coordonnées personnelles",
  );
  check(
    (
      await call("/admin/orders/" + winner.id, "PATCH", {
        action: "status",
        status: "expediee",
      })
    ).status === 409,
    "Wave non vérifié : expédition bloquée",
  );
  const cancel = await call("/admin/orders/" + winner.id, "PATCH", {
    action: "status",
    status: "annulee",
  });
  check(cancel.status === 200, "annulation non payée acceptée");
  const after = (await call("/admin/products")).value.products.find(
    (x) => x.id === product.id,
  );
  check(
    after.variants[0].stock === 1,
    "annulation : pièce remise en stock exactement une fois",
  );
  check(
    (
      await call("/admin/orders/" + winner.id, "PATCH", {
        action: "status",
        status: "annulee",
      })
    ).status === 409,
    "seconde annulation refusée",
  );
  const cash = await call("/orders", "POST", make("cash"));
  assert.equal(cash.status, 201, JSON.stringify(cash.value));
  created.push(cash.value.id);
  check(
    (
      await call("/admin/orders/" + cash.value.id, "PATCH", {
        action: "delivery",
        scheduled_at: "2099-01-01",
        slot: "14 h – 18 h",
      })
    ).status === 200,
    "créneau de livraison enregistré",
  );
  check(
    (
      await call("/admin/orders/" + cash.value.id, "PATCH", {
        action: "status",
        status: "expediee",
      })
    ).status === 200,
    "espèces : commande expédiable avant encaissement",
  );
  check(
    (
      await call("/admin/orders/" + cash.value.id, "PATCH", {
        action: "status",
        status: "livree",
      })
    ).status === 409,
    "clôture livrée bloquée avant vérification des espèces",
  );
  check(
    (
      await call("/admin/orders/" + cash.value.id, "PATCH", {
        action: "paid",
        reference: "TEST-" + run,
      })
    ).status === 200,
    "encaissement manuel enregistré",
  );
  check(
    (
      await call("/admin/orders/" + cash.value.id, "PATCH", {
        action: "status",
        status: "livree",
      })
    ).status === 200,
    "livraison clôturée après encaissement",
  );
  await call("/orders", "POST", make());
  const rate = await call("/orders", "POST", make());
  check(rate.status === 429, "limitation anti-spam après huit tentatives");
  const wrongOrigin = await call("/admin/delivery", "PUT", original, {
    Origin: "https://evil.example",
  });
  check(
    wrongOrigin.status === 403,
    "requête de modification depuis un autre site refusée",
  );
  check(
    (await call("/admin/logout", "POST", {})).status === 200,
    "déconnexion",
  );
  check(
    (await call("/admin/orders")).status === 401,
    "session révoquée après déconnexion",
  );
  console.log(`${checks} vérifications d’intégration réussies.`);
} finally {
  // Les essais restent identifiables dans l'administration. Aucune commande réelle n'est effacée.
  const auth = await call("/admin/login", "POST", { password });
  if (auth.status === 200) {
    csrf = auth.value.csrf;
    cookie = auth.res.headers.get("set-cookie").split(";")[0];
    if (product) {
      product.active = false;
      await call("/admin/products", "POST", product);
    }
    if (original.originLat !== null)
      await call("/admin/delivery", "PUT", original);
    else
      localSql(
        "UPDATE settings SET value='" +
          JSON.stringify(original).replace(/'/g, "''") +
          "' WHERE key='delivery'",
      );

    await call("/admin/logout", "POST", {});
  }
}
