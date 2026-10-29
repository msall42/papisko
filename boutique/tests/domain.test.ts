import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deliveryFee,
  haversine,
  effectivePrice,
  phone,
  coordinates,
  canTransition,
  integer,
  imageUrl,
} from "../server/domain";
import { body, originCheck, verifyPassword, equal } from "../server/security";
import { createHash, randomBytes } from "node:crypto";
test("tarifs aux limites exactes et devis au-delà de 30 km", () => {
  for (const [km, fee] of [
    [0, 1000],
    [5, 1000],
    [5.001, 1500],
    [10, 1500],
    [10.001, 2000],
    [15, 2000],
    [15.001, 2500],
    [20, 2500],
    [20.001, 3000],
    [30, 3000],
    [30.001, null],
  ])
    assert.equal(deliveryFee(km!), fee);
  assert.throws(() => deliveryFee(NaN));
  assert.throws(() => deliveryFee(-1));
});
test("distance géographique symétrique et point identique", () => {
  assert.equal(haversine(14.7, -17.3, 14.7, -17.3), 0);
  assert.ok(
    Math.abs(
      haversine(14.7, -17.3, 14.8, -17.4) - haversine(14.8, -17.4, 14.7, -17.3),
    ) < 1e-9,
  );
});
test("promotion expirée ou future ignorée, début inclus et fin exclue", () => {
  const p = {
    price: 1000,
    compare_price: 1500,
    flash_price: 800,
    flash_start: 100,
    flash_end: 200,
  };
  assert.equal(effectivePrice(p, 99).price, 1000);
  assert.equal(effectivePrice(p, 100).price, 800);
  assert.equal(effectivePrice(p, 199).price, 800);
  assert.equal(effectivePrice(p, 200).price, 1000);
});
test("téléphone mobile sénégalais normalisé, numéros étrangers refusés", () => {
  assert.equal(phone("76 246 67 85"), "+221762466785");
  assert.equal(phone("00221762466785"), "+221762466785");
  assert.throws(() => phone("+33762466785"));
  assert.throws(() => phone("77000"));
});
test("positions hors Dakar, non finies et types falsifiés refusés", () => {
  assert.deepEqual(coordinates(14.73, -17.39), { lat: 14.73, lon: -17.39 });
  for (const a of [NaN, Infinity, 13, "14.73"])
    assert.throws(() => coordinates(a, -17.39));
});
test("expédition Wave non payée refusée et annulation terminale", () => {
  assert.equal(
    canTransition("en_attente", "expediee", false, "wave_manual"),
    false,
  );
  assert.equal(canTransition("en_attente", "expediee", false, "cash"), true);
  assert.equal(canTransition("annulee", "expediee", true, "cash"), false);
  assert.equal(canTransition("payee", "annulee", true, "cash"), false);
});
test("quantités entières et photos HTTPS sans identifiants", () => {
  assert.throws(() => integer(1.5, "Quantité", 1, 10));
  assert.throws(() => integer("2", "Quantité", 1, 10));
  assert.throws(() => imageUrl("javascript:alert(1)"));
  assert.throws(() => imageUrl("https://secret:pass@example.com/a.jpg"));
  assert.equal(
    imageUrl("https://example.com/a.webp"),
    "https://example.com/a.webp",
  );
});
test("validation JSON plafonnée même sans Content-Length", async () => {
  const req = new Request("https://papisko.example/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "x".repeat(17000) }),
  });
  await assert.rejects(() => body(req), /volumineuse/);
  await assert.rejects(
    () =>
      body(
        new Request("https://a", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "[]",
        }),
      ),
    /JSON invalide/,
  );
});
test("origine obligatoire pour chaque mutation", () => {
  assert.throws(() =>
    originCheck(
      new Request("https://a/api", {
        method: "POST",
        headers: { Origin: "https://evil" },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    originCheck(
      new Request("https://a/api", {
        method: "POST",
        headers: { Origin: "https://a" },
      }),
    ),
  );
});
test("secret admin aléatoire de 256 bits : hash compatible, secrets courts refusés", async () => {
  const pass = randomBytes(32).toString("base64url");
  const digest = createHash("sha256").update(pass).digest("hex");
  assert.equal(await verifyPassword(pass, `random256:${digest}`), true);
  assert.equal(
    await verifyPassword(
      randomBytes(32).toString("base64url"),
      `random256:${digest}`,
    ),
    false,
  );
  assert.equal(
    await verifyPassword("mot-de-passe-faible", `random256:${digest}`),
    false,
  );
  assert.equal(await verifyPassword(pass, ""), false);
  assert.equal(equal("a", "aa"), false);
});
