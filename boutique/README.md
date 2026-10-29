# Papisko

Boutique mobile en français pour **vêtements neufs et friperie**, avec livraison Papisko à Dakar depuis Sicap Mbao. Paiements : **Wave manuel** et **espèces à la livraison**. Pas d’Orange Money, de carte ni de PayDunya. L’API Wave directe sera ajoutée après activation du compte Business et validation de son environnement de test.

## Architecture

Vite + Preact + TypeScript produit des fichiers statiques pour Cloudflare Pages. Seules les routes `/api/*` invoquent Pages Functions. D1 contient catalogue, variantes et stocks, vendeurs, commandes, paiements, livraisons et sessions. Les photos sont des URL HTTPS externes (R2 possible). Aucun serveur permanent ni Docker requis.

Les vendeurs et leurs références sur les produits/lignes de commande sont préparés pour une évolution marketplace. Le lancement reste mono-vendeur : pas d’espace vendeur, de commission ou de reversement automatisé. Les paiements et la livraison ont des états distincts.

## Démarrage local

Prérequis : **Node.js 22.12+**, npm, Git. Wrangler est installé dans le dépôt et verrouillé par `package-lock.json`.

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run admin:password
```

Conserver le mot de passe aléatoire généré (43 caractères, 256 bits) dans un gestionnaire de mots de passe. Copier les deux valeurs de configuration générées (`ADMIN_PASSWORD_HASH` et `RATE_LIMIT_SECRET`) dans `.dev.vars`. Ce fichier est ignoré par Git. Redémarrer Wrangler après toute modification de `.dev.vars`. Seul son hash SHA-256 est stocké côté serveur. Cette vérification rapide est sûre ici grâce à l’entropie du secret généré ; elle ne doit pas être réutilisée pour un mot de passe humain. Le serveur refuse les secrets de format court. Le secret anti-spam doit rester stable : il sert aussi à récupérer les reçus des commandes après une coupure réseau.

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Ouvrir **http://127.0.0.1:8788**, puis **/admin** avec le mot de passe choisi. Les commandes utilisent bien le moteur Workers et D1 local de Wrangler. Les données locales se trouvent dans `.wrangler/`, hors Git.

**Avant le premier essai de commande :** Administration → Livraison → placer le **point exact** de retrait à Sicap Mbao, puis enregistrer. Il est vide par défaut : aucun emplacement approximatif n’est facturé. En local, utiliser un point fictif à Dakar et des coordonnées client fictives pour les tests, puis le remplacer avant ouverture.

Pour développer avec rechargement immédiat : conserver Wrangler sur 8788, lancer `npm run dev:ui` dans un second terminal et ouvrir l’URL Vite. Ses appels `/api` sont relayés vers Wrangler. Le parcours complet de référence reste l’URL Wrangler (notamment connexion admin/cookies).

## Parcours de vérification

1. Catalogue : filtrer neuf/friperie, catégorie et recherche ; ouvrir une fiche, choisir la taille et vérifier le stock. Les exemples affichent « Démonstration » et une illustration, jamais une photo présentée comme réelle.
2. Panier : modifier les quantités, recharger pour vérifier sa persistance. Les prix locaux restent indicatifs et ne sont pas acceptés par le serveur comme source de vérité.
3. Livraison : renseigner nom, mobile sénégalais et adresse ; choisir un point sur la carte, sa position ou saisir des coordonnées. Vérifier les frais avant confirmation.
4. Espèces : commander, retrouver la commande dans l’administration, fixer date/créneau, expédier, vérifier les espèces reçues puis marquer livrée.
5. Wave manuel : la commande est enregistrée, le vendeur transmet les instructions via WhatsApp et vérifie les fonds dans Wave. Une capture d’écran ne suffit pas. Saisir la référence de transaction et confirmer le paiement dans l’administration, puis expédier.
6. Annuler une commande non payée : les pièces reviennent en stock. Une commande payée ne peut pas être annulée automatiquement ; remboursement et procédure administrative restent à définir.
7. Suivi : le bouton du pied de page retrouve la dernière commande sur cet appareil. Son accès utilise une capacité secrète, jamais la référence seule. Le suivi ne renvoie pas le nom, téléphone ou adresse.

En démonstration, **ne transférer aucun argent**. Le numéro **+221 76 246 67 85** est celui de contact WhatsApp. Il n’est pas présenté comme un compte d’encaissement Wave : ce dernier reste à confirmer.

## Frais et délais de livraison

Calcul serveur par Haversine, **distance à vol d’oiseau**, depuis le point enregistré dans l’administration. Ce n’est pas une distance routière et aucun appel à une API d’itinéraire payante n’est nécessaire.

| Distance                  |                                        Frais |
| ------------------------- | -------------------------------------------: |
| Jusqu’à 5 km inclus       |                                   1 000 FCFA |
| Plus de 5 à 10 km inclus  |                                   1 500 FCFA |
| Plus de 10 à 15 km inclus |                                   2 000 FCFA |
| Plus de 15 à 20 km inclus |                                   2 500 FCFA |
| Plus de 20 à 30 km inclus |                                   3 000 FCFA |
| Au-delà de 30 km          | Devis : validation/paiement en ligne bloqués |

Délai initial : **24 à 48 heures après confirmation**, indicatif. Le vendeur fixe ensuite la date et le créneau. Les dates sont présentées au fuseau de Dakar ; les heures des promotions sont saisies selon le fuseau de l’appareil et stockées en timestamps UTC.

Une enveloppe géographique rejette les coordonnées manifestement hors Dakar. Elle ne constitue pas une frontière administrative précise : le vendeur doit vérifier les destinations, notamment les points placés en mer ou hors zone réelle. La destination reste accompagnée d’une adresse et d’un repère. Avant une ouverture couvrant toutes les communes de la région, valider précisément la zone et le traitement des livraisons sur devis.

## Sécurité et cohérence

- Requêtes SQL préparées ; types, tailles de corps et champs validés côté serveur.
- Total, prix promotionnels, disponibilité et livraison recalculés côté serveur ; confirmation refusée si le total affiché a changé.
- Réservation de stock et commande dans un batch transactionnel D1. Des triggers protègent contre rupture concurrente, changement de prix et transitions de statut incohérentes. Annulation non payée : remise en stock une seule fois.
- UUID de soumission et empreinte du contenu pour l’idempotence. Si le réseau coupe après l’écriture, le reçu est récupérable. Le formulaire en cours est conservé temporairement dans `sessionStorage`, sans traceur ; la capacité de récupération seule est conservée dans `localStorage`.
- Administration : cookie de session 8 h, `HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS, jeton CSRF et contrôle d’origine. Limitation des connexions, commandes et devis par IP pseudonymisée. Les compteurs expirent et sont nettoyés progressivement ; aucune IP brute n’est enregistrée par l’application.
- Historique des changements de statut, paiements et créneaux dans `order_history`.
- Aucune donnée bancaire collectée. Ne pas journaliser de clés, formulaires clients ou capacités de suivi. Les erreurs serveur restent génériques.
- Ne pas partager un navigateur administrateur. Changer le hash ne révoque pas les sessions existantes : pour une révocation immédiate, vider `admin_sessions` avec D1.

Le stockage local n’est pas un coffre : les capacités de suivi sont sensibles. La fonction « Effacer le panier et le suivi » les supprime de l’appareil. La suppression des commandes en base est une procédure administrative à définir selon la durée de conservation retenue.

## Tests

```bash
npm test
npm run build
```

Les tests unitaires couvrent les limites des tarifs, les promotions expirées, la validation, les transitions et la sécurité HTTP. Le build effectue aussi la vérification TypeScript.

Avec Wrangler en cours d’exécution, **sur la base locale de démonstration uniquement** :

```bash
# Le fichier contient le mot de passe de test en clair, permissions 600.
# Fournir ce fichier temporaire hors du dépôt ; ne pas utiliser un mot de passe réel.
PAPISKO_TEST_PASSWORD_FILE=/chemin/vers/mot-de-passe-test npm run test:integration
PAPISKO_TEST_PASSWORD_FILE=/chemin/vers/mot-de-passe-test \
PAPISKO_CHROME=/chemin/vers/chrome npm run test:browser
```

Le second test utilise `playwright-core` et un Chrome déjà installé, sans télécharger de navigateur. Il vérifie mobile/desktop/sombre, filtres, recherche, connexion admin, formulaire, commande et récupération après perte simulée de la réponse. Captures dans `/tmp/papisko-preview/`.

Les tests refusent un hôte distant et un catalogue en mode réel. Ils réinitialisent les compteurs anti-spam **locaux**, créent des articles/commandes explicitement techniques et remettent le point de retrait original. Les produits de test sont masqués après le test d’intégration ; les commandes fictives restent identifiables dans l’administration. Utiliser une base locale dédiée, pas un jeu local contenant des données métier à préserver.

## Variables

| Nom                   | Type              | Valeur / usage                                                                       |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------ |
| `DB`                  | Binding D1        | Base `papisko`                                                                       |
| `SHOP_MODE`           | Variable          | `demo` par défaut ; `live` masque les produits de démo et crée des commandes réelles |
| `WHATSAPP_NUMBER`     | Variable publique | `221762466785`, sans `+`                                                             |
| `ADMIN_PASSWORD_HASH` | Secret            | Généré par `npm run admin:password`                                                  |
| `RATE_LIMIT_SECRET`   | Secret            | Secret aléatoire stable pour anti-spam et récupération de reçus                      |

Pas de clé Wave, PayDunya, Orange Money ou carte dans cette version. `.dev.vars.example` contient uniquement des champs vides.

## Déployer sur Cloudflare Pages

Ces commandes sont fournies pour l’utilisateur ; aucun déploiement distant n’a été effectué par le développement local.

### 1. Connexion et D1

```bash
npx wrangler login
npx wrangler d1 create papisko
```

Remplacer l’UUID nul de `d1_databases[0].database_id` dans `wrangler.jsonc` par l’identifiant retourné. Le nom de base et le binding doivent rester cohérents.

```bash
npx wrangler d1 migrations apply papisko --remote
```

Les migrations ajoutent les catégories et le vendeur Papisko ; elles n’insèrent aucun article fictif. Pour une **base distante de démonstration seulement**, charger facultativement `seeds/demo.sql` avec `wrangler d1 execute papisko --remote --file seeds/demo.sql`. Ne pas importer de données clients locales.

### 2. Projet Pages et secrets

```bash
npx wrangler pages project create papisko --production-branch main
npx wrangler pages secret put ADMIN_PASSWORD_HASH --project-name papisko
npx wrangler pages secret put RATE_LIMIT_SECRET --project-name papisko
```

Saisir les valeurs générées dans les invites, jamais dans des arguments de commande ni dans Git. Pour les previews, employer une **autre base D1**, des secrets distincts et le mode `demo` ; ne pas connecter une preview publique aux commandes réelles.

### 3. Build et publication de démonstration

```bash
npm ci
npm run build
npx wrangler pages deploy dist --project-name papisko --branch main
```

Le déploiement CLI prend aussi les Functions du dossier `functions/`. Ne pas glisser-déposer uniquement `dist` dans le tableau de bord : cela omettrait le backend. Conserver `SHOP_MODE: "demo"` pour cette première publication. L’URL exacte `*.pages.dev` est retournée par Cloudflare ; le nom `papisko` peut être indisponible. Adapter le projet et les commandes au nom obtenu.

Alternative Git : pousser ce dépôt sur GitHub/GitLab, connecter le dépôt à Pages, branche `main`, build `npm run build`, sortie `dist`, Node 22. Configurer le binding D1 et les secrets, puis vérifier le premier build. Chaque push de code reconstruit le frontend ; un changement de produit dans D1 ne nécessite pas de build.

### 4. Vérification distante

- Ouvrir `/api/catalog`, puis `/admin` et régler le point exact de retrait.
- Essayer une commande fictive avec données fictives, contrôler D1 et la planification.
- Vérifier refus d’accès sans session, affichage mobile, carte et mode sombre.
- Tester le lien WhatsApp sur un téléphone. Son ouverture prépare un message, sans l’envoyer automatiquement.

### 5. Ouverture commerciale — validation du propriétaire requise

Après validation de la liste ci-dessous, passer explicitement `SHOP_MODE` à `live` dans `wrangler.jsonc`, puis redéployer. Ne jamais activer ce mode par défaut ni connecter un paiement réel sans accord. Le mode réel masque les démos mais ne les supprime pas. Le site demeure utilisable avec Wave manuel et espèces même sans API Wave.

### 6. Domaine plus tard

Acheter le domaine chez le registrar choisi. Pages → projet → **Custom domains** → ajouter le domaine. Suivre les enregistrements DNS indiqués par Cloudflare (pour un domaine racine, suivre les conditions de gestion DNS Pages). Attendre la validation HTTPS, puis vérifier navigation, cookies admin et futurs retours de paiement. Ne pas inventer un domaine avant son achat.

## Avant mise en production

- [ ] Ajouter photos **réelles**, prix, tailles, stocks, description des défauts de friperie et anciens prix justifiables ; retirer le drapeau démo de ces articles.
- [ ] Position exacte de retrait validée à Sicap Mbao ; tester quelques trajets réels et vérifier la rentabilité de la grille à vol d’oiseau.
- [ ] Confirmer les limites de livraison, le traitement des devis et le délai 24–48 h.
- [ ] Confirmer le compte d’encaissement Wave et les instructions envoyées au client. Le numéro WhatsApp n’est pas automatiquement ce compte.
- [ ] Remplacer tout secret local de test ; mot de passe fort et secrets Cloudflare renseignés ; previews isolées.
- [ ] Ajouter identité légale du vendeur, conditions de vente, retours/échanges, remboursement, contact et durée de conservation des commandes. Les promesses du prototype (« livraison gratuite », « échange 7 jours ») ne sont pas reprises sans validation.
- [ ] Définir la procédure de remboursement et d’annulation des commandes payées ; elle n’est pas automatisée.
- [ ] Définir sauvegarde/export D1, suppression des données anciennes et suivi des quotas.
- [ ] Vérifier les parcours complets avec le vendeur, dont espèces, stock unique et coupure réseau.
- [ ] Pour l’API Wave : accès marchand activé, tarifs et tests confirmés, webhook authentifié, contrôle serveur du montant/devise/référence, idempotence et accord explicite avant argent réel. Voir `docs/wave.md`.
- [ ] Accord explicite pour passer en `live` et ouvrir les commandes réelles.

## Limites gratuites et budget

Documentation officielle vérifiée le **25 octobre 2026** :

| Service                 | Quota gratuit pertinent                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| Pages                   | 500 builds/mois, requêtes statiques gratuites et illimitées            |
| Pages Functions         | Quota Workers Free partagé : 100 000 requêtes/jour                     |
| Workers Free            | 10 ms de CPU par invocation                                            |
| D1                      | 5 M lignes lues/jour, 100 000 écrites/jour, 500 Mo/base et 5 Go/compte |
| R2 Standard (optionnel) | 10 Go-mois, 1 M opérations A et 10 M B par mois ; egress gratuit       |

Sources : [Pages](https://developers.cloudflare.com/pages/platform/limits/), [Functions](https://developers.cloudflare.com/pages/functions/pricing/), [Workers](https://www.cloudflare.com/plans/), [D1 prix](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limites](https://developers.cloudflare.com/d1/platform/limits/), [R2](https://developers.cloudflare.com/r2/pricing/).

La conception vise ces quotas, sans promesse de trafic illimité pour l’API. Rester en Workers Free et surveiller D1 ; les requêtes dynamiques consomment les quotas, y compris les compteurs anti-spam. R2 n’est pas activé ici : sa franchise n’est pas un plafond de facturation. Les frais Wave et le domaine sont indépendants de l’hébergement. La vérification du secret aléatoire utilise un seul hash Web Crypto pour limiter le coût CPU ; vérifier les métriques du déploiement avant ouverture.

Les images réelles doivent être redimensionnées avant publication : viser 40–70 Ko par vignette, 12 articles/page, chargement différé, aucune police ou vidéo distante. L’objectif de moins de 1 Mo concerne la page catalogue initiale. L’ouverture volontaire de la carte ajoute Leaflet et les tuiles OpenStreetMap et peut dépasser ce budget. Respecter leur [politique de tuiles](https://operations.osmfoundation.org/policies/tiles/) : attribution visible, pas de téléchargement massif/offline ; pour un fort trafic, choisir un fournisseur adapté.

## Fichiers

- `src/` : boutique, administration et carte chargées à la demande.
- `functions/api/[[path]].ts` : point d’entrée API Pages.
- `server/` : validation métier, commandes, catalogue, sécurité, administration.
- `migrations/` : schéma et contrôles transactionnels.
- `seeds/` : démonstration facultative.
- `scripts/` et `tests/` : gestion du mot de passe, tests métier/API/navigateur.

Les notifications vendeur automatiques ne sont pas activées : les commandes et livraisons sont consultables dans l’administration. Le lien WhatsApp est une prise de contact facultative par le client. Un email automatique pourra être ajouté avec un fournisseur choisi ultérieurement.
