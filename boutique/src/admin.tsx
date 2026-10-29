import { useEffect, useState } from "preact/hooks";
import { lazy, Suspense } from "preact/compat";
import { api, money, labels } from "./api";
import { Icon, Dialog, Photo } from "./components";
const LocationPicker = lazy(() => import("./LocationPicker"));
export default function Admin() {
  const [csrf, setCsrf] = useState(""),
    [checking, setChecking] = useState(true),
    [password, setPassword] = useState(""),
    [tab, setTab] = useState("orders"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [demo, setDemo] = useState(true);
  const [orders, setOrders] = useState<any[]>([]),
    [page, setPage] = useState(1),
    [hasMore, setHasMore] = useState(false),
    [products, setProducts] = useState<any[]>([]),
    [categories, setCategories] = useState<any[]>([]),
    [editing, setEditing] = useState<any>(null),
    [delivery, setDelivery] = useState<any>(null);
  async function request(path: string, method = "GET", data?: unknown) {
    return api("/admin" + path, {
      method,
      headers: { "X-CSRF-Token": csrf },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  }
  useEffect(() => {
    api("/admin/session")
      .then((s) => {
        setCsrf(s.csrf);
        setDemo(s.demo);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);
  async function load() {
    setError("");
    try {
      if (tab === "orders") {
        const d = await request(`/orders?page=${page}`);
        setOrders(d.orders);
        setHasMore(d.hasMore);
      }
      if (tab === "products") {
        const d = await request("/products");
        setProducts(d.products);
        setCategories(d.categories);
      }
      if (tab === "delivery") setDelivery(await request("/delivery"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (csrf) load();
  }, [csrf, tab, page]);
  async function login(e: Event) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const d = await api("/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setCsrf(d.csrf);
      setPassword("");
      const s = await api("/admin/session");
      setDemo(s.demo);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function mutate(path: string, method: string, data: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request(path, method, data);
      setMessage("Modification enregistrée.");
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (checking) return <p role="status">Vérification de la session…</p>;
  if (!csrf)
    return (
      <div class="admin-login">
        <span class="eyebrow">ESPACE PAPISKO</span>
        <h1>Administration</h1>
        <p>Produits, commandes et livraisons.</p>
        <form onSubmit={login}>
          <label>
            Mot de passe
            <input
              type="password"
              required
              maxLength={256}
              autoComplete="current-password"
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
          </label>
          {error && (
            <p role="alert" class="error">
              {error}
            </p>
          )}
          <button class="primary full" disabled={busy}>
            {busy ? "Connexion…" : "Se connecter"} <Icon name="arrow" />
          </button>
        </form>
      </div>
    );
  return (
    <div class="admin">
      <div class="section-heading">
        <div>
          <span class="eyebrow">ESPACE PAPISKO</span>
          <h1>Votre boutique, au quotidien.</h1>
        </div>
        <button
          class="secondary"
          onClick={async () => {
            try {
              await request("/logout", "POST", {});
              setCsrf("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Se déconnecter
        </button>
      </div>
      {demo && (
        <p class="demo-banner">
          Mode démonstration. Les commandes sont des essais. Les articles de
          démonstration seront masqués en mode réel.
        </p>
      )}
      <nav class="condition-tabs" aria-label="Administration">
        {[
          ["orders", "Commandes"],
          ["products", "Produits"],
          ["delivery", "Livraison"],
        ].map(([id, label]) => (
          <button
            aria-current={tab === id ? "page" : undefined}
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id);
              setError("");
              setMessage("");
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p class="notice" role="status">
          {message}
        </p>
      )}
      {tab === "orders" && (
        <>
          <div class="row spread">
            <h2>Commandes récentes</h2>
            <button class="secondary" onClick={load}>
              Actualiser
            </button>
          </div>
          {!orders.length && (
            <div class="empty">Aucune commande pour le moment.</div>
          )}
          <div class="admin-orders">
            {orders.map((o) => (
              <OrderCard order={o} disabled={busy} mutate={mutate} />
            ))}
          </div>
          <div class="row">
            <button
              class="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Précédent
            </button>
            <span>Page {page}</span>
            <button
              class="secondary"
              disabled={!hasMore}
              onClick={() => setPage(page + 1)}
            >
              Suivant
            </button>
          </div>
        </>
      )}
      {tab === "products" && (
        <>
          <div class="row spread">
            <h2>Le catalogue</h2>
            <button
              class="primary"
              onClick={() =>
                setEditing({
                  name: "",
                  description: "",
                  category_id: categories[0]?.id || "femme",
                  condition: "neuf",
                  image_url: "",
                  price: 0,
                  compare_price: null,
                  flash_price: null,
                  flash_start: null,
                  flash_end: null,
                  active: true,
                  demo: true,
                  variants: [{ label: "Taille unique", stock: 1 }],
                })
              }
            >
              Ajouter un article +
            </button>
          </div>
          <p class="muted">
            Photos réelles HTTPS, idéalement WebP/AVIF de moins de 70 Ko. Aucun
            secret dans les liens. Jusqu’à 500 produits affichés dans cette
            administration.
          </p>
          <div class="admin-products">
            {products.map((p) => (
              <div class="admin-product">
                <div class="cart-thumb">
                  <Photo url={p.image_url} name={p.name} />
                </div>
                <div>
                  <b>{p.name}</b>
                  <small>
                    {p.condition} · {p.demo ? "Démo" : "Réel"} ·{" "}
                    {p.active ? "Actif" : "Masqué"}
                  </small>
                  <span>
                    {money(p.price)} · stock{" "}
                    {p.variants.reduce((s: number, v: any) => s + v.stock, 0)}
                  </span>
                </div>
                <button
                  class="secondary"
                  onClick={() => setEditing(structuredClone(p))}
                >
                  Modifier
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {tab === "delivery" && delivery && (
        <form
          class="settings-form"
          onSubmit={async (e) => {
            e.preventDefault();
            await mutate("/delivery", "PUT", delivery);
          }}
        >
          <h2>Point de retrait & délai</h2>
          <p>
            Placez le point exact de départ à Sicap Mbao. Les frais sont
            calculés à vol d’oiseau depuis cette position.
          </p>
          <label>
            Nom du point de retrait
            <input
              required
              maxLength={160}
              value={delivery.originLabel}
              onInput={(e) =>
                setDelivery({ ...delivery, originLabel: e.currentTarget.value })
              }
            />
          </label>
          <Suspense fallback={<p>Chargement de la carte…</p>}>
            <LocationPicker
              lat={delivery.originLat}
              lon={delivery.originLon}
              onChange={(lat, lon) =>
                setDelivery({ ...delivery, originLat: lat, originLon: lon })
              }
            />
          </Suspense>
          <label>
            Délai indicatif
            <input
              required
              maxLength={120}
              value={delivery.eta}
              onInput={(e) =>
                setDelivery({ ...delivery, eta: e.currentTarget.value })
              }
            />
          </label>
          <table>
            <caption>Grille validée</caption>
            <thead>
              <tr>
                <th>Distance à vol d’oiseau</th>
                <th>Frais</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["0 à 5 km", "1 000 FCFA"],
                ["Plus de 5 à 10 km", "1 500 FCFA"],
                ["Plus de 10 à 15 km", "2 000 FCFA"],
                ["Plus de 15 à 20 km", "2 500 FCFA"],
                ["Plus de 20 à 30 km", "3 000 FCFA"],
                ["Au-delà de 30 km", "Sur devis"],
              ].map((r) => (
                <tr>
                  <td>{r[0]}</td>
                  <td>{r[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            class="primary"
            disabled={
              busy || delivery.originLat === null || delivery.originLon === null
            }
          >
            Enregistrer le point de retrait
          </button>
        </form>
      )}
      {editing && (
        <Dialog
          title={editing.id ? "Modifier le produit" : "Nouvel article"}
          wide
          onClose={() => setEditing(null)}
        >
          <ProductForm
            product={editing}
            categories={categories}
            busy={busy}
            onSave={async (p) => {
              setBusy(true);
              try {
                await request("/products", "POST", p);
                setEditing(null);
                setMessage("Article enregistré.");
                await load();
              } finally {
                setBusy(false);
              }
            }}
          />
        </Dialog>
      )}
    </div>
  );
}
function OrderCard({
  order: o,
  disabled,
  mutate,
}: {
  order: any;
  disabled: boolean;
  mutate: (path: string, method: string, data: any) => Promise<boolean>;
}) {
  const [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [date, setDate] = useState(o.scheduled_at || ""),
    [slot, setSlot] = useState(o.slot || ""),
    [confirmCancel, setConfirmCancel] = useState(false),
    [localError, setLocalError] = useState("");
  const closed = ["livree", "annulee"].includes(o.status);
  const change = (data: any) => mutate(`/orders/${o.id}`, "PATCH", data);
  return (
    <article class="order-card">
      <div class="row spread wrap-row">
        <div>
          <h3>
            {o.customer_name} {o.demo && <span class="status">Démo</span>}
          </h3>
          <small>
            {new Date(o.created_at * 1000).toLocaleString("fr-FR", {
              timeZone: "Africa/Dakar",
            })}{" "}
            · <code>{o.id}</code>
          </small>
        </div>
        <b>{money(o.total)}</b>
      </div>
      <div class="row wrap-row">
        <span class="status">{labels[o.status]}</span>
        <span class="status">
          {labels[o.payment_status]} ·{" "}
          {o.method === "cash" ? "Espèces" : "Wave manuel"}
        </span>
      </div>
      <p>
        <a href={`tel:${o.phone}`}>{o.phone}</a>
        <br />
        {o.address}
        <br />
        <a
          href={`https://www.openstreetmap.org/?mlat=${o.latitude}&mlon=${o.longitude}#map=16/${o.latitude}/${o.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Voir la destination
        </a>{" "}
        · {o.distance_km} km · Livraison {money(o.delivery_fee)}
      </p>
      <details>
        <summary>Articles commandés</summary>
        {o.items.map((i: any) => (
          <p>
            {i.quantity} × {i.name} · {i.variant_label} · {money(i.unit_price)}
          </p>
        ))}
      </details>
      {!closed && (
        <div class="order-actions">
          {o.payment_status === "pending" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setLocalError("");
                if (!confirmed) {
                  setLocalError("Vérifiez les fonds reçus avant de confirmer.");
                  return;
                }
                change({ action: "paid", reference });
              }}
            >
              <h4>
                Vérifier l’encaissement{" "}
                {o.method === "cash" ? "en espèces" : "Wave"}
              </h4>
              <label>
                Référence Wave ou reçu espèces
                <input
                  required
                  minLength={3}
                  maxLength={100}
                  value={reference}
                  onInput={(e) => setReference(e.currentTarget.value)}
                />
              </label>
              <label class="checkbox">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.currentTarget.checked)}
                />
                <span>J’ai vérifié la réception effective de l’argent.</span>
              </label>
              <button class="secondary" disabled={disabled || !confirmed}>
                Confirmer le paiement reçu
              </button>
            </form>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              change({ action: "delivery", scheduled_at: date, slot });
            }}
          >
            <h4>Planifier la livraison Papisko</h4>
            <div class="two">
              <label>
                Date prévue
                <input
                  type="date"
                  required
                  min={new Date().toISOString().slice(0, 10)}
                  value={date}
                  onInput={(e) => setDate(e.currentTarget.value)}
                />
              </label>
              <label>
                Créneau
                <input
                  required
                  minLength={3}
                  maxLength={60}
                  placeholder="Ex. 14 h – 18 h"
                  value={slot}
                  onInput={(e) => setSlot(e.currentTarget.value)}
                />
              </label>
            </div>
            <button class="secondary" disabled={disabled}>
              Enregistrer le créneau
            </button>
          </form>
          <div class="row wrap-row">
            {["en_attente", "payee"].includes(o.status) && (
              <button
                class="primary"
                disabled={
                  disabled ||
                  (o.method === "wave_manual" && o.payment_status !== "paid")
                }
                onClick={() => change({ action: "status", status: "expediee" })}
              >
                Marquer expédiée
              </button>
            )}
            {o.status === "expediee" && (
              <button
                class="primary"
                disabled={disabled || o.payment_status !== "paid"}
                onClick={() => change({ action: "status", status: "livree" })}
              >
                Marquer livrée
              </button>
            )}
            {o.status === "en_attente" && o.payment_status === "pending" && (
              <button
                class="danger secondary"
                disabled={disabled}
                onClick={() => setConfirmCancel(!confirmCancel)}
              >
                Annuler la commande
              </button>
            )}
          </div>
          {confirmCancel && (
            <p class="hint">
              Cette annulation remettra les articles en stock.{" "}
              <button
                class="danger"
                disabled={disabled}
                onClick={() => change({ action: "status", status: "annulee" })}
              >
                Confirmer l’annulation
              </button>
            </p>
          )}
        </div>
      )}
      {localError && (
        <p class="error" role="alert">
          {localError}
        </p>
      )}
      {o.scheduled_at && (
        <p class="notice">
          Livraison : {o.scheduled_at}, {o.slot}
        </p>
      )}
      {o.payment_status === "paid" && !closed && (
        <p class="muted">
          Pour annuler une commande déjà payée, traiter d’abord le remboursement
          avec le client. Aucun remboursement automatique n’est intégré.
        </p>
      )}
    </article>
  );
}
function ProductForm({
  product,
  categories,
  busy,
  onSave,
}: {
  product: any;
  categories: any[];
  busy: boolean;
  onSave: (p: any) => Promise<void>;
}) {
  const [p, setP] = useState(product),
    [error, setError] = useState("");
  const field = (key: string, value: any) => setP({ ...p, [key]: value });
  const date = (n: number | null) =>
    n
      ? new Date(n * 1000 - new Date(n * 1000).getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16)
      : "";
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await onSave(p);
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <div class="two">
        <label>
          Nom
          <input
            required
            minLength={2}
            maxLength={140}
            value={p.name}
            onInput={(e) => field("name", e.currentTarget.value)}
          />
        </label>
        <label>
          Catégorie
          <select
            value={p.category_id}
            onChange={(e) => field("category_id", e.currentTarget.value)}
          >
            {categories.map((c) => (
              <option value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Description, matière, mesures et défauts éventuels
        <textarea
          required
          minLength={5}
          maxLength={2000}
          rows={4}
          value={p.description}
          onInput={(e) => field("description", e.currentTarget.value)}
        />
      </label>
      <label>
        État
        <select
          value={p.condition}
          onChange={(e) => field("condition", e.currentTarget.value)}
        >
          <option value="neuf">Neuf</option>
          <option value="friperie">Friperie</option>
        </select>
      </label>
      <label>
        Photo réelle — URL HTTPS
        <input
          type="url"
          maxLength={1000}
          placeholder="https://…/article.webp"
          value={p.image_url}
          onInput={(e) => field("image_url", e.currentTarget.value)}
        />
      </label>
      <div class="two">
        <label>
          Prix FCFA
          <input
            type="number"
            required
            min={100}
            max={2000000}
            step={1}
            value={p.price}
            onInput={(e) => field("price", Number(e.currentTarget.value))}
          />
        </label>
        <label>
          Ancien prix réel (facultatif)
          <input
            type="number"
            min={p.price + 1}
            max={3000000}
            step={1}
            value={p.compare_price ?? ""}
            onInput={(e) =>
              field(
                "compare_price",
                e.currentTarget.value ? Number(e.currentTarget.value) : null,
              )
            }
          />
        </label>
      </div>
      <p class="muted">
        Le prix barré doit correspondre à un prix de référence réel.
      </p>
      <fieldset>
        <legend>Vente flash facultative</legend>
        <label>
          Prix promotionnel FCFA
          <input
            type="number"
            min={1}
            max={p.price - 1}
            value={p.flash_price ?? ""}
            onInput={(e) =>
              field(
                "flash_price",
                e.currentTarget.value ? Number(e.currentTarget.value) : null,
              )
            }
          />
        </label>
        {p.flash_price !== null && (
          <div class="two">
            <label>
              Début (heure de votre appareil)
              <input
                type="datetime-local"
                required
                value={date(p.flash_start)}
                onInput={(e) =>
                  field(
                    "flash_start",
                    Math.floor(
                      new Date(e.currentTarget.value).getTime() / 1000,
                    ),
                  )
                }
              />
            </label>
            <label>
              Fin (heure de votre appareil)
              <input
                type="datetime-local"
                required
                value={date(p.flash_end)}
                onInput={(e) =>
                  field(
                    "flash_end",
                    Math.floor(
                      new Date(e.currentTarget.value).getTime() / 1000,
                    ),
                  )
                }
              />
            </label>
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend>Tailles, couleurs et stock</legend>
        {p.variants.map((v: any, i: number) => (
          <div class="variant-fields">
            <label>
              Taille / couleur
              <input
                required
                maxLength={80}
                value={v.label}
                onInput={(e) =>
                  field(
                    "variants",
                    p.variants.map((x: any, j: number) =>
                      i === j ? { ...x, label: e.currentTarget.value } : x,
                    ),
                  )
                }
              />
            </label>
            <label>
              Stock
              <input
                required
                type="number"
                min={0}
                max={10000}
                step={1}
                value={v.stock}
                onInput={(e) =>
                  field(
                    "variants",
                    p.variants.map((x: any, j: number) =>
                      i === j
                        ? { ...x, stock: Number(e.currentTarget.value) }
                        : x,
                    ),
                  )
                }
              />
            </label>
          </div>
        ))}
        <button
          type="button"
          class="secondary"
          disabled={p.variants.length >= 20}
          onClick={() =>
            field("variants", [...p.variants, { label: "", stock: 0 }])
          }
        >
          Ajouter une variante +
        </button>
        <p class="muted">
          Pour une pièce unique de friperie : stock 1. Pour retirer une variante
          existante : stock 0.
        </p>
      </fieldset>
      <div class="row wrap-row">
        <label class="checkbox">
          <input
            type="checkbox"
            checked={!!p.active}
            onChange={(e) => field("active", e.currentTarget.checked)}
          />{" "}
          Article visible
        </label>
        <label class="checkbox">
          <input
            type="checkbox"
            checked={!!p.demo}
            onChange={(e) => field("demo", e.currentTarget.checked)}
          />{" "}
          Démonstration
        </label>
      </div>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      <button class="primary full" disabled={busy}>
        {busy ? "Enregistrement…" : "Enregistrer l’article"}
      </button>
    </form>
  );
}
