import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const base = process.env.PAPISKO_TEST_URL || "http://127.0.0.1:8788";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Tests navigateur réservés à la démonstration locale.");
const password = process.env.PAPISKO_TEST_PASSWORD_FILE
  ? readFileSync(process.env.PAPISKO_TEST_PASSWORD_FILE, "utf8").trim()
  : process.env.PAPISKO_TEST_PASSWORD;
if (!password) throw new Error("Mot de passe de test requis.");
const browser = await chromium.launch({
  executablePath: process.env.PAPISKO_CHROME || "/opt/google/chrome/chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let original;
let cookie;
let csrf;
async function adminApi(path, method = "GET", data) {
  const r = await fetch(base + "/api/admin" + path, {
    method,
    headers: {
      Origin: base,
      Cookie: cookie,
      "X-CSRF-Token": csrf,
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  assert.ok(r.ok, await r.clone().text());
  return r.json();
}
try {
  const catalog = await fetch(base + "/api/catalog").then((r) => r.json());
  assert.equal(catalog.demo, true);
  execFileSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "papisko",
      "--local",
      "--command",
      "DELETE FROM rate_limits",
    ],
    { stdio: "pipe" },
  );
  await page.goto(base + "/admin");
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page
    .getByRole("heading", { name: "Votre boutique, au quotidien." })
    .waitFor();
  const session = await page.evaluate(async () =>
    fetch("/api/admin/session").then((r) => r.json()),
  );
  csrf = session.csrf;
  cookie = (await context.cookies())
    .map((c) => c.name + "=" + c.value)
    .join(";");
  original = await adminApi("/delivery");
  await page.getByRole("button", { name: "Livraison", exact: true }).click();
  await page.getByText("Saisir les coordonnées manuellement").click();
  await page.getByLabel("Latitude", { exact: true }).fill("14.73");
  await page.getByLabel("Longitude", { exact: true }).fill("-17.32");
  await page
    .getByRole("button", { name: "Enregistrer le point de retrait" })
    .click();
  await page.getByText("Modification enregistrée.").waitFor();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await page
    .getByRole("heading", { name: "Administration", exact: true })
    .waitFor();
  await page.goto(base);
  await page.getByRole("button", { name: "Voir Robe en coton" }).waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "pas de débordement mobile",
  );
  mkdirSync("/tmp/papisko-preview", { recursive: true });
  await page.screenshot({
    path: "/tmp/papisko-preview/mobile.png",
    fullPage: true,
  });
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("/api/catalog?") &&
        r.url().includes("condition=friperie"),
    ),
    page.getByRole("button", { name: "Friperie ♻", exact: true }).click(),
  ]);
  await page.getByRole("button", { name: "Voir Veste vintage" }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Voir Robe en coton" }).count(),
    0,
  );
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("/api/catalog?") && r.url().includes("condition=&"),
    ),
    page.getByRole("button", { name: "Tout découvrir", exact: true }).click(),
  ]);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("q=Chemise")),
    page.getByRole("searchbox").fill("Chemise"),
  ]);
  await page
    .getByRole("button", { name: "Voir Chemise décontractée" })
    .waitFor();
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/catalog?q=&")),
    page.getByRole("searchbox").fill(""),
  ]);
  await page.getByRole("button", { name: "Voir Robe en coton" }).waitFor();
  await page.getByRole("button", { name: "Voir Robe en coton" }).click();
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await page.getByRole("button", { name: /Panier/ }).click();
  await page
    .getByRole("button", { name: "Livraison & paiement", exact: true })
    .click();
  await page
    .getByLabel("Nom complet", { exact: true })
    .fill("CLIENT NAVIGATEUR TEST");
  await page.getByLabel("Téléphone mobile", { exact: true }).fill("770000000");
  await page
    .getByLabel("Quartier, rue et repère de livraison")
    .fill("ADRESSE FICTIVE TEST NAVIGATEUR");
  await page.getByText("Saisir les coordonnées manuellement").click();
  await page.getByLabel("Latitude", { exact: true }).fill("14.73");
  await page.getByLabel("Longitude", { exact: true }).fill("-17.32");
  await page.getByLabel(/Espèces/).check();
  await page.getByLabel(/J’accepte/).check();
  const submit = page.getByRole("button", {
    name: "Enregistrer une commande de démonstration",
    exact: true,
  });
  await submit.waitFor();
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent.includes("Enregistrer une commande de démonstration"),
      )?.disabled,
  );
  // Le serveur enregistre mais le navigateur perd la réponse : récupération après rechargement.
  await page.route(
    "**/api/orders",
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await submit.click();
  await page
    .getByRole("button", { name: "Réessayer la même commande" })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Suivre ma dernière commande", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Commande enregistrée · Démonstration" })
    .waitFor();
  await page
    .getByText("Ne transférez pas d’argent pour cette commande fictive.")
    .waitFor();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(base);
  await page.getByRole("button", { name: "Voir Robe en coton" }).waitFor();
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "/tmp/papisko-preview/desktop.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "pas de débordement desktop",
  );
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "/tmp/papisko-preview/dark.png",
    fullPage: true,
  });
  assert.deepEqual(errors, [], "aucune erreur JavaScript");
  console.log(
    "✓ Chrome mobile/desktop/sombre, filtres, recherche, panier, commande et récupération après coupure : OK.",
  );
  console.log("Captures : /tmp/papisko-preview/{mobile,desktop,dark}.png");
} finally {
  // Rétablir uniquement la configuration originale de livraison.
  if (original)
    execFileSync(
      process.execPath,
      [
        "node_modules/wrangler/bin/wrangler.js",
        "d1",
        "execute",
        "papisko",
        "--local",
        "--command",
        "UPDATE settings SET value='" +
          JSON.stringify(original).replace(/'/g, "''") +
          "' WHERE key='delivery'",
      ],
      { stdio: "pipe" },
    );
  await browser.close();
}
