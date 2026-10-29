import { render } from "preact";
import { useEffect, useState, useRef } from "preact/hooks";
import { lazy, Suspense } from "preact/compat";
import {
  api,
  ApiError,
  money,
  labels,
  type Product,
  type CartLine,
} from "./api";
import { Dialog, Icon, Photo } from "./components";
import "./style.css";
const LocationPicker = lazy(() => import("./LocationPicker"));
const Admin = lazy(() => import("./admin"));
function readCart(): CartLine[] {
  try {
    const c = JSON.parse(localStorage.getItem("papisko.cart") || "[]");
    return Array.isArray(c)
      ? c
          .filter(
            (x) =>
              typeof x.variantId === "string" &&
              Number.isInteger(x.quantity) &&
              x.quantity > 0 &&
              x.quantity <= 10 &&
              typeof x.name === "string" &&
              typeof x.price === "number",
          )
          .slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
function Countdown({ end, now }: { end: number; now: number }) {
  const left = Math.max(0, end - now);
  return (
    <span
      class="timer"
      aria-label={`Fin dans ${Math.floor(left / 3600)} heures et ${Math.floor((left % 3600) / 60)} minutes`}
    >
      {[Math.floor(left / 3600), Math.floor((left % 3600) / 60), left % 60]
        .map((v) => String(v).padStart(2, "0"))
        .join(" : ")}
    </span>
  );
}
function App() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [condition, setCondition] = useState(""),
    [page, setPage] = useState(1);
  const [cart, setCart] = useState<CartLine[]>(readCart),
    [drawer, setDrawer] = useState(false),
    [selected, setSelected] = useState<Product | null>(null),
    [variant, setVariant] = useState(""),
    [toast, setToast] = useState(""),
    [tick, setTick] = useState(Math.floor(Date.now() / 1000));
  const [view, setView] = useState(
      location.pathname.startsWith("/admin") ? "admin" : "shop",
    ),
    [order, setOrder] = useState<any>(null),
    [privacy, setPrivacy] = useState(false);
  const clockOffset = useRef(0);
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (view === "admin") return;
    let stale = false;
    setLoading(true);
    setError("");
    api(
      `/catalog?${new URLSearchParams({ q: search, category, condition, page: String(page) })}`,
    )
      .then((d) => {
        if (!stale) {
          setData((old: any) => ({
            ...d,
            products:
              page === 1
                ? d.products
                : [...(old?.products || []), ...d.products],
          }));
          clockOffset.current = d.serverTime - Math.floor(Date.now() / 1000);
          setTick(d.serverTime);
        }
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [search, category, condition, page, view]);
  useEffect(() => {
    try {
      localStorage.setItem("papisko.cart", JSON.stringify(cart));
    } catch {}
  }, [cart]);
  useEffect(() => {
    const id = setInterval(
      () => setTick(Math.floor(Date.now() / 1000) + clockOffset.current),
      1000,
    );
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    const f = () =>
      setView(location.pathname.startsWith("/admin") ? "admin" : "shop");
    addEventListener("popstate", f);
    return () => removeEventListener("popstate", f);
  }, []);
  function navigate(path: string) {
    history.pushState(null, "", path);
    setView(path === "/admin" ? "admin" : "shop");
    window.scrollTo(0, 0);
  }
  function add(p: Product) {
    const v = p.variants.find((v) => v.id === variant);
    if (!v) return;
    const existing = cart.find((c) => c.variantId === v.id);
    if ((existing?.quantity || 0) >= Math.min(10, v.stock)) {
      setToast("Stock maximum atteint.");
      return;
    }
    if (!existing && cart.length >= 20) {
      setToast("Maximum 20 articles différents par commande.");
      return;
    }
    setCart(
      existing
        ? cart.map((c) =>
            c.variantId === v.id ? { ...c, quantity: c.quantity + 1 } : c,
          )
        : [
            ...cart,
            {
              variantId: v.id,
              quantity: 1,
              name: p.name,
              label: v.label,
              price: p.price,
              image: p.image_url,
              demo: p.demo,
            },
          ],
    );
    setToast("Article ajouté au panier");
    setSelected(null);
  }
  function openProduct(p: Product) {
    setSelected(p);
    setVariant(p.variants.find((v) => v.stock > 0)?.id || "");
  }
  async function resume() {
    try {
      const pendingKey = localStorage.getItem("papisko.pendingKey");
      let saved = JSON.parse(localStorage.getItem("papisko.order") || "null");
      if (pendingKey) {
        saved = await api("/orders/recover", {
          headers: { Authorization: `Bearer ${pendingKey}` },
        });
        localStorage.setItem("papisko.order", JSON.stringify(saved));
        localStorage.removeItem("papisko.pendingKey");
        sessionStorage.removeItem("papisko.pending");
        setCart([]);
      }
      if (!saved) {
        setToast("Aucune commande enregistrée sur cet appareil.");
        return;
      }
      const o = await api(`/orders/${saved.id}`, {
        headers: { Authorization: `Bearer ${saved.accessToken}` },
      });
      setOrder(o);
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  const count = cart.reduce((a, c) => a + c.quantity, 0);
  const flash = data?.products.filter(
    (p: Product) => p.flash_end && p.flash_end > tick,
  );
  const flashEnd = flash?.length
    ? Math.min(...flash.map((p: Product) => p.flash_end))
    : null;
  return (
    <>
      <a class="skip" href="#contenu">
        Aller au contenu
      </a>
      <div class="topline">
        <span>Dakar, on arrive chez vous.</span>
        <span>Livraison indicative : 24–48 h</span>
      </div>
      <header class="header">
        <div class="header-inner">
          <a
            class="brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
          >
            papisko<span>●</span>
            <small>LE STYLE, À VOTRE PORTÉE.</small>
          </a>
          {view === "shop" && (
            <form
              class="search"
              role="search"
              onSubmit={(e) => e.preventDefault()}
            >
              <Icon name="search" />
              <input
                type="search"
                placeholder="Une robe, une belle trouvaille…"
                value={q}
                onInput={(e) => setQ(e.currentTarget.value)}
                aria-label="Rechercher un article"
              />
            </form>
          )}
          <div class="header-actions">
            <button
              class="icon-button theme"
              aria-label="Changer le thème clair ou sombre"
              onClick={() => {
                const dark =
                  document.documentElement.dataset.theme !== "dark" &&
                  (document.documentElement.dataset.theme === "light" ||
                    !matchMedia("(prefers-color-scheme: dark)").matches);
                document.documentElement.dataset.theme = dark
                  ? "dark"
                  : "light";
                try {
                  localStorage.setItem(
                    "papisko.theme",
                    dark ? "dark" : "light",
                  );
                } catch {}
              }}
            >
              <Icon name="sun" />
            </button>
            {view === "shop" ? (
              <button class="cart-button" onClick={() => setDrawer(true)}>
                <Icon name="bag" />
                <span>Panier</span>
                <b>{count}</b>
              </button>
            ) : (
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/");
                }}
              >
                La boutique <Icon name="arrow" />
              </a>
            )}
          </div>
        </div>
      </header>
      {view === "admin" ? (
        <main id="contenu" class="shell">
          <Suspense fallback={<p>Chargement de l’administration…</p>}>
            <Admin />
          </Suspense>
        </main>
      ) : (
        <main id="contenu" class="shell">
          {data?.demo && (
            <p class="demo-banner">
              <strong>Boutique de démonstration.</strong> Articles et prix
              fictifs, aucun paiement automatique. Les commandes sont des
              essais.
            </p>
          )}
          <section class="hero">
            <div class="hero-copy">
              <span class="eyebrow">NEUF & FRIPERIE · DAKAR</span>
              <h1>
                Du style.
                <br />
                Des trouvailles.
                <br />
                <em>Tout simplement.</em>
              </h1>
              <p>
                Des vêtements neufs aux pièces de seconde main, trouvez votre
                prochain coup de cœur chez Papisko.
              </p>
              <a class="primary" href="#catalogue">
                Explorer la collection <Icon name="arrow" />
              </a>
              <div class="hero-foot">
                <span class="dot" /> Pensé pour vous, livré à Dakar
              </div>
            </div>
            <div class="hero-art" aria-hidden="true">
              <div class="art-circle" />
              <div class="art-shirt">
                <svg viewBox="0 0 240 260">
                  <path
                    d="m78 44-58 32 28 61 26-15-4 120h104l-4-120 26 15 28-61-58-32c-10 30-78 30-88 0Z"
                    fill="#f4e4c7"
                  />
                  <path
                    d="M99 53l21 28 24-28m-24 28v161M78 132l-3 93m92-93 3 93"
                    fill="none"
                    stroke="#b49c76"
                    stroke-width="2"
                  />
                  <path
                    d="M132 107h25v22h-25z"
                    fill="none"
                    stroke="#b49c76"
                    stroke-width="2"
                  />
                </svg>
              </div>
              <div class="art-label">
                La bonne pièce.
                <br />
                <b>Le bon prix.</b>
              </div>
              <div class="art-bubble">
                <Icon name="leaf" size={26} />
                <span>
                  Une seconde vie,
                  <br />
                  autant de style.
                </span>
              </div>
              <span class="art-note">
                Illustration · les vrais articles arrivent
              </span>
            </div>
          </section>
          <div class="benefits">
            <span>
              <Icon name="truck" /> Livraison partout à Dakar
            </span>
            <span>
              <Icon name="bag" /> Wave ou espèces à la livraison
            </span>
            <span>
              <Icon name="heart" /> Neuf & seconde main
            </span>
          </div>
          <section id="catalogue" class="catalogue">
            <div class="section-heading">
              <div>
                <span class="eyebrow">LE VESTIAIRE PAPISKO</span>
                <h2>À chacun sa trouvaille.</h2>
              </div>
              <span class="collection-note">Le style commence ici.</span>
            </div>
            <div
              class="condition-tabs"
              role="group"
              aria-label="État des vêtements"
            >
              {[
                ["", "Tout découvrir"],
                ["neuf", "Vêtements neufs"],
                ["friperie", "Friperie ♻"],
              ].map(([id, label]) => (
                <button
                  aria-pressed={condition === id}
                  onClick={() => {
                    setCondition(id);
                    setPage(1);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div class="category-chips" role="group" aria-label="Catégories">
              <button
                aria-pressed={!category}
                onClick={() => {
                  setCategory("");
                  setPage(1);
                }}
              >
                Tout
              </button>
              {data?.categories.map((c: any) => (
                <button
                  aria-pressed={category === c.id}
                  onClick={() => {
                    setCategory(c.id);
                    setPage(1);
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {flashEnd && (
              <div class="flash-banner">
                <div>
                  <span class="eyebrow">LES PETITS PRIX N’ATTENDENT PAS</span>
                  <h3>
                    Ventes flash <span>↗</span>
                  </h3>
                </div>
                <div>
                  <small>Fin de la prochaine offre</small>
                  <Countdown end={flashEnd} now={tick} />
                </div>
              </div>
            )}
            {error && (
              <p class="error" role="alert">
                {error}{" "}
                <button
                  onClick={() => {
                    setView("loading");
                    setTimeout(() => setView("shop"), 0);
                  }}
                >
                  Réessayer
                </button>
              </p>
            )}
            <div class="product-grid" aria-busy={loading}>
              {data?.products.map((p: Product) => {
                const expired = !!p.flash_end && p.flash_end <= tick;
                const price = expired ? p.base_price : p.price;
                const compare = expired ? null : p.compare_price;
                const stock = p.variants.reduce((s, v) => s + v.stock, 0);
                return (
                  <article class="product" key={p.id}>
                    <button
                      class="product-open"
                      onClick={() =>
                        openProduct({ ...p, price, compare_price: compare })
                      }
                      aria-label={`Voir ${p.name}`}
                    >
                      <div class="product-image">
                        <Photo
                          url={p.image_url}
                          name={p.name}
                          kind={p.condition}
                        />
                        {compare && (
                          <span class="discount">
                            −{Math.round((1 - price / compare) * 100)} %
                          </span>
                        )}
                        <span class={`condition ${p.condition}`}>
                          {p.condition === "friperie" ? "Friperie" : "Neuf"}
                        </span>
                      </div>
                      <div class="product-info">
                        <small>
                          {p.demo ? "DÉMONSTRATION" : p.seller_name}
                        </small>
                        <h3>{p.name}</h3>
                        <div class="prices">
                          <strong>{money(price)}</strong>
                          {compare && <s>{money(compare)}</s>}
                        </div>
                      </div>
                    </button>
                    <button
                      class="product-add"
                      onClick={() =>
                        openProduct({ ...p, price, compare_price: compare })
                      }
                      disabled={!stock}
                    >
                      {stock ? "Choisir ma taille" : "Épuisé"} <span>+</span>
                    </button>
                  </article>
                );
              })}
            </div>
            {loading && (
              <p class="muted" role="status">
                Chargement des articles…
              </p>
            )}
            {!loading && !error && !data?.products.length && (
              <div class="empty">
                <Icon name="search" size={36} />
                <h3>Aucune trouvaille pour le moment</h3>
                <p>
                  Essayez une autre recherche ou revenez bientôt découvrir les
                  nouveaux articles.
                </p>
              </div>
            )}
            {data?.hasMore && (
              <button
                class="secondary load-more"
                disabled={loading}
                onClick={() => setPage(page + 1)}
              >
                Voir plus d’articles <Icon name="arrow" />
              </button>
            )}
          </section>
          <section class="story">
            <Icon name="leaf" size={38} />
            <div>
              <span class="eyebrow">UNE AUTRE FAÇON DE TROUVER SON STYLE</span>
              <h2>
                Neuf ou déjà aimé.
                <br />
                Toujours votre prochain favori.
              </h2>
              <p>
                Une section friperie pour donner une seconde vie aux vêtements.
                Des pièces neuves pour compléter votre vestiaire.
              </p>
            </div>
            <button
              class="secondary"
              onClick={() => {
                setCondition("friperie");
                setPage(1);
                document.getElementById("catalogue")?.scrollIntoView();
              }}
            >
              Découvrir la friperie <Icon name="arrow" />
            </button>
          </section>
        </main>
      )}
      <footer class="footer">
        <div class="shell footer-inner">
          <div>
            <a class="brand" href="/">
              papisko<span>●</span>
            </a>
            <p>Votre prochain coup de cœur, à Dakar.</p>
          </div>
          <div class="footer-links">
            <button onClick={resume}>Suivre ma dernière commande</button>
            <a
              href={`https://wa.me/${data?.whatsapp || "221762466785"}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Nous écrire sur WhatsApp
            </a>
            <button onClick={() => setPrivacy(true)}>Confidentialité</button>
            <a
              href="/admin"
              onClick={(e) => {
                e.preventDefault();
                navigate("/admin");
              }}
            >
              Administration
            </a>
          </div>
          <small>
            © {new Date().getFullYear()} Papisko · Sicap Mbao, Dakar
          </small>
        </div>
      </footer>
      <div class="toast" role="status" aria-live="polite">
        {toast}
      </div>
      {selected && (
        <Dialog title={selected.name} onClose={() => setSelected(null)}>
          <Photo
            url={selected.image_url}
            name={selected.name}
            kind={selected.condition}
          />
          <p class="eyebrow">
            {selected.condition === "friperie"
              ? "FRIPERIE · SECONDE MAIN"
              : "VÊTEMENT NEUF"}
            {selected.demo ? " · DÉMONSTRATION" : ""}
          </p>
          <p class="description">{selected.description}</p>
          <div class="prices">
            <strong>{money(selected.price)}</strong>
            {selected.compare_price && <s>{money(selected.compare_price)}</s>}
          </div>
          <label>
            Taille / couleur
            <select
              value={variant}
              onChange={(e) => setVariant(e.currentTarget.value)}
            >
              {selected.variants.map((v) => (
                <option value={v.id} disabled={!v.stock}>
                  {v.label}{" "}
                  {v.stock
                    ? `· ${v.stock} disponible${v.stock > 1 ? "s" : ""}`
                    : "· Épuisé"}
                </option>
              ))}
            </select>
          </label>
          <button
            class="primary full"
            disabled={!variant}
            onClick={() => add(selected)}
          >
            Ajouter au panier <Icon name="bag" />
          </button>
        </Dialog>
      )}
      {drawer && (
        <Dialog title="Mon panier" onClose={() => setDrawer(false)}>
          <Checkout
            cart={cart}
            setCart={setCart}
            data={data}
            onDone={(o) => {
              setOrder(o);
              setDrawer(false);
            }}
          />
        </Dialog>
      )}
      {order && (
        <Dialog title="Votre commande" onClose={() => setOrder(null)}>
          <OrderSummary order={order} onRefresh={resume} />
        </Dialog>
      )}
      {privacy && (
        <Dialog title="Vos données" onClose={() => setPrivacy(false)}>
          <p>
            Papisko utilise votre nom, téléphone, adresse et position de
            livraison pour préparer et livrer votre commande. Les coordonnées ne
            servent qu’au calcul des frais et à la livraison.
          </p>
          <p>
            Le panier et l’accès à la dernière commande sont conservés sur cet
            appareil. Un envoi en cours est conservé temporairement dans
            l’onglet pour pouvoir réessayer sans doublon en cas de coupure.
            Aucun traceur publicitaire n’est installé. La carte utilise les
            tuiles OpenStreetMap : leur chargement transmet votre adresse IP à
            ce service.
          </p>
          <p>
            Pour demander l’accès ou la suppression de vos données, contactez
            Papisko au +221 76 246 67 85. La durée de conservation des commandes
            et les mentions du responsable seront précisées avant l’ouverture
            commerciale.
          </p>
          <button
            class="secondary"
            onClick={() => {
              localStorage.removeItem("papisko.cart");
              localStorage.removeItem("papisko.order");
              localStorage.removeItem("papisko.pendingKey");
              sessionStorage.removeItem("papisko.pending");
              setCart([]);
              setToast("Données locales effacées.");
            }}
          >
            Effacer le panier et le suivi sur cet appareil
          </button>
        </Dialog>
      )}
    </>
  );
}
function readPending() {
  try {
    return JSON.parse(sessionStorage.getItem("papisko.pending") || "null");
  } catch {
    return null;
  }
}
function Checkout({
  cart,
  setCart,
  data,
  onDone,
}: {
  cart: CartLine[];
  setCart: (c: CartLine[]) => void;
  data: any;
  onDone: (o: any) => void;
}) {
  const restored = useRef(readPending());
  const draft = restored.current?.payload;
  const [step, setStep] = useState(!!draft),
    [form, setForm] = useState(
      draft
        ? {
            name: draft.name,
            phone: draft.phone,
            address: draft.address,
            method: draft.method,
          }
        : { name: "", phone: "", address: "", method: "wave_manual" },
    ),
    [pos, setPos] = useState<{ lat: number | null; lon: number | null }>({
      lat: draft?.latitude ?? null,
      lon: draft?.longitude ?? null,
    }),
    [shipping, setShipping] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [quoting, setQuoting] = useState(false),
    [accepted, setAccepted] = useState(false);
  const pending = useRef<{ key: string; payload: any } | null>(
    restored.current,
  );
  const [locked, setLocked] = useState(!!restored.current);
  const [created, setCreated] = useState<{
    id: string;
    accessToken: string;
  } | null>(null);
  const subtotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  useEffect(() => {
    if (pos.lat === null || pos.lon === null) return;
    let stale = false;
    setShipping(null);
    setQuoting(true);
    setError("");
    const t = setTimeout(
      () =>
        api("/delivery/quote", {
          method: "POST",
          body: JSON.stringify({ latitude: pos.lat, longitude: pos.lon }),
        })
          .then((s) => {
            if (!stale) setShipping(s);
          })
          .catch((e) => {
            if (!stale) setError(e.message);
          })
          .finally(() => {
            if (!stale) setQuoting(false);
          }),
      350,
    );
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [pos.lat, pos.lon]);
  if (!cart.length && !created)
    return (
      <div class="empty">
        <Icon name="bag" size={48} />
        <h3>Votre panier attend ses trouvailles.</h3>
        <p>Choisissez un article et sa taille pour commencer.</p>
      </div>
    );
  async function finish(receipt: { id: string; accessToken: string }) {
    try {
      localStorage.setItem("papisko.order", JSON.stringify(receipt));
      localStorage.removeItem("papisko.pendingKey");
      sessionStorage.removeItem("papisko.pending");
    } catch {}
    const result = await api(`/orders/${receipt.id}`, {
      headers: { Authorization: `Bearer ${receipt.accessToken}` },
    });
    setCart([]);
    onDone(result);
  }
  async function submit(e: Event) {
    let savedReceipt = created;
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (created) {
        await finish(created);
        return;
      }
      if (!pending.current) {
        if (!shipping || shipping.fee === null)
          throw new Error(
            "Choisissez une position et attendez le calcul des frais.",
          );
        pending.current = {
          key: crypto.randomUUID(),
          payload: {
            ...form,
            latitude: pos.lat,
            longitude: pos.lon,
            items: cart.map((c) => ({
              variantId: c.variantId,
              quantity: c.quantity,
            })),
            expectedTotal: subtotal + shipping.fee,
          },
        };
      }
      try {
        sessionStorage.setItem(
          "papisko.pending",
          JSON.stringify(pending.current),
        );
        localStorage.setItem("papisko.pendingKey", pending.current.key);
      } catch {}
      setLocked(true);
      const result = await api("/orders", {
        method: "POST",
        body: JSON.stringify({
          ...pending.current.payload,
          idempotencyKey: pending.current.key,
        }),
      });
      savedReceipt = result;
      setCreated(result);
      await finish(result);
    } catch (e) {
      setError((e as Error).message);
      if (
        !savedReceipt &&
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500
      ) {
        pending.current = null;
        setLocked(false);
        sessionStorage.removeItem("papisko.pending");
        localStorage.removeItem("papisko.pendingKey");
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div class="checkout-steps">
        <b>01 · Panier</b>
        <span>→</span>
        <b class={step ? "" : "muted"}>02 · Livraison & paiement</b>
      </div>
      <div class="cart-lines">
        {cart.map((c) => (
          <div class="cart-line" key={c.variantId}>
            <div class="cart-thumb">
              <Photo url={c.image} name={c.name} />
            </div>
            <div>
              <strong>{c.name}</strong>
              <small>
                {c.label}
                {c.demo ? " · Démo" : ""}
              </small>
              <b>{money(c.price)}</b>
            </div>
            <div class="quantity">
              <button
                aria-label={`Retirer un ${c.name}`}
                disabled={locked || busy}
                onClick={() =>
                  setCart(
                    cart
                      .map((x) =>
                        x.variantId === c.variantId
                          ? { ...x, quantity: x.quantity - 1 }
                          : x,
                      )
                      .filter((x) => x.quantity > 0),
                  )
                }
              >
                −
              </button>
              <span>{c.quantity}</span>
              <button
                aria-label={`Ajouter un ${c.name}`}
                disabled={c.quantity >= 10 || locked || busy}
                onClick={() =>
                  setCart(
                    cart.map((x) =>
                      x.variantId === c.variantId
                        ? { ...x, quantity: x.quantity + 1 }
                        : x,
                    ),
                  )
                }
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <div class="total-line">
        <span>Sous-total estimé</span>
        <b>{money(subtotal)}</b>
      </div>
      <p class="muted">
        Les prix et disponibilités sont vérifiés lors de la commande.
      </p>
      {!step ? (
        <button class="primary full" onClick={() => setStep(true)}>
          Livraison & paiement <Icon name="arrow" />
        </button>
      ) : (
        <form onSubmit={submit}>
          {data?.demo && (
            <p class="demo-banner">
              Commande de démonstration : utilisez des coordonnées fictives.
              Aucun transfert Wave à effectuer.
            </p>
          )}
          <fieldset disabled={locked || busy}>
            <legend>Vos coordonnées</legend>
            <label>
              Nom complet
              <input
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                value={form.name}
                onInput={(e) =>
                  setForm({ ...form, name: e.currentTarget.value })
                }
              />
            </label>
            <label>
              Téléphone mobile
              <input
                required
                type="tel"
                maxLength={24}
                autoComplete="tel"
                placeholder="+221 7X XXX XX XX"
                value={form.phone}
                onInput={(e) =>
                  setForm({ ...form, phone: e.currentTarget.value })
                }
              />
            </label>
            <label>
              Quartier, rue et repère de livraison
              <textarea
                required
                minLength={5}
                maxLength={300}
                autoComplete="street-address"
                value={form.address}
                onInput={(e) =>
                  setForm({ ...form, address: e.currentTarget.value })
                }
              />
            </label>
            <h3>Où vous livrer ?</h3>
            <p class="muted">
              Frais calculés à vol d’oiseau depuis Sicap Mbao. Jusqu’à 30 km : 1
              000 à 3 000 FCFA.
            </p>
            <Suspense fallback={<p>Chargement…</p>}>
              <LocationPicker
                lat={pos.lat}
                lon={pos.lon}
                onChange={(lat, lon) => setPos({ lat, lon })}
              />
            </Suspense>
          </fieldset>
          {quoting && <p role="status">Calcul des frais…</p>}
          {shipping && (
            <div class="shipping-summary">
              <div class="total-line">
                <span>Livraison · {shipping.distanceKm} km</span>
                <b>
                  {shipping.fee === null ? "Sur devis" : money(shipping.fee)}
                </b>
              </div>
              <small>{shipping.eta}. Créneau confirmé par Papisko.</small>
              {shipping.requiresQuote && (
                <p>
                  Au-delà de 30 km,{" "}
                  <a
                    href="https://wa.me/221762466785"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    contactez Papisko pour un devis
                  </a>{" "}
                  avant de commander.
                </p>
              )}
            </div>
          )}
          <fieldset disabled={locked || busy}>
            <legend>Paiement</legend>
            <div class="payment-options">
              <label class={form.method === "wave_manual" ? "chosen" : ""}>
                <input
                  type="radio"
                  name="method"
                  value="wave_manual"
                  checked={form.method === "wave_manual"}
                  onChange={() => setForm({ ...form, method: "wave_manual" })}
                />
                <span>
                  <b>Wave</b>
                  <small>Confirmation manuelle</small>
                </span>
              </label>
              <label class={form.method === "cash" ? "chosen" : ""}>
                <input
                  type="radio"
                  name="method"
                  value="cash"
                  checked={form.method === "cash"}
                  onChange={() => setForm({ ...form, method: "cash" })}
                />
                <span>
                  <b>Espèces</b>
                  <small>À la livraison</small>
                </span>
              </label>
            </div>
            <p class="hint">
              {form.method === "wave_manual"
                ? "Après enregistrement, contactez Papisko pour obtenir les instructions Wave. Le paiement est confirmé après vérification des fonds reçus."
                : "Votre commande est enregistrée directement. Vous payez Papisko à la réception."}
            </p>
            <label class="checkbox">
              <input
                type="checkbox"
                required
                checked={accepted}
                onChange={(e) => setAccepted(e.currentTarget.checked)}
              />
              <span>
                J’accepte l’utilisation de mes coordonnées et de ma position
                pour traiter et livrer cette commande.
              </span>
            </label>
          </fieldset>
          {shipping?.fee !== null && shipping && (
            <div class="total-line grand-total">
              <span>Total à payer</span>
              <b>{money(subtotal + shipping.fee)}</b>
            </div>
          )}
          {error && (
            <p class="error" role="alert">
              {error}
            </p>
          )}
          {locked && !created && error && (
            <p class="hint">
              La connexion a pu couper après l’enregistrement. Réessayez la même
              commande sans créer de doublon, ou utilisez « Suivre ma dernière
              commande » pour récupérer son reçu.
            </p>
          )}
          <button
            class="primary full"
            type="submit"
            disabled={
              busy ||
              (!locked &&
                (!shipping || shipping.fee === null || quoting || !accepted))
            }
          >
            {busy
              ? "Enregistrement…"
              : created
                ? "Afficher la commande"
                : locked
                  ? "Réessayer la même commande"
                  : data?.demo
                    ? "Enregistrer une commande de démonstration"
                    : "Confirmer la commande"}{" "}
            <Icon name="check" />
          </button>
        </form>
      )}
    </>
  );
}
function OrderSummary({
  order: o,
  onRefresh,
}: {
  order: any;
  onRefresh: () => void;
}) {
  const text = `Bonjour Papisko, concernant ma commande ${o.id} (${money(o.total)}), ${o.method === "wave_manual" ? "je souhaite les instructions de paiement Wave." : "je souhaite confirmer la livraison."}`;
  return (
    <div class="order-summary">
      <div class="success-icon">
        <Icon name="check" size={34} />
      </div>
      <h3>Commande enregistrée{o.demo ? " · Démonstration" : ""}</h3>
      <p class="muted">
        Référence : <code>{o.id}</code>
      </p>
      <div class="row wrap-row">
        <span class="status">{labels[o.status]}</span>
        <span class="status">Paiement : {labels[o.payment_status]}</span>
      </div>
      {o.items.map((i: any) => (
        <div class="total-line">
          <span>
            {i.quantity} × {i.name}
            <small>{i.variant_label}</small>
          </span>
          <b>{money(i.quantity * i.unit_price)}</b>
        </div>
      ))}
      <div class="total-line">
        <span>Livraison</span>
        <b>{money(o.delivery_fee)}</b>
      </div>
      <div class="total-line grand-total">
        <span>Total</span>
        <b>{money(o.total)}</b>
      </div>
      <p>
        {o.method === "cash"
          ? "Paiement en espèces à la livraison."
          : "Le paiement Wave reste en attente jusqu’à vérification par Papisko."}
      </p>
      <p>
        {o.scheduled_at
          ? `Livraison prévue le ${new Date(o.scheduled_at + "T12:00:00Z").toLocaleDateString("fr-FR", { timeZone: "Africa/Dakar" })}, ${o.slot}.`
          : "Livraison indicative sous 24 à 48 heures après confirmation. Papisko vous communiquera le créneau."}
      </p>
      {!o.demo && o.status !== "annulee" && (
        <a
          class="primary full"
          href={`https://wa.me/${o.whatsapp}?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Contacter Papisko sur WhatsApp <Icon name="arrow" />
        </a>
      )}
      {o.demo && (
        <p class="demo-banner">
          Ne transférez pas d’argent pour cette commande fictive.
        </p>
      )}
      <button class="secondary full" onClick={onRefresh}>
        Actualiser le suivi
      </button>
      <p class="muted">
        Le suivi reste disponible dans le pied de page sur cet appareil. Ne
        partagez pas son accès.
      </p>
    </div>
  );
}
try {
  const theme = localStorage.getItem("papisko.theme");
  if (theme === "dark" || theme === "light")
    document.documentElement.dataset.theme = theme;
} catch {}
render(<App />, document.getElementById("app")!);
