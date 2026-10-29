# Vérification locale — 25 octobre 2026

Environnement : Node 22, Wrangler 4.152.0, D1 local, Chrome headless installé sur le poste. Aucun déploiement distant, paiement réel ou appel à l’API Wave.

- Build de production et vérification TypeScript : réussis.
- 10 tests unitaires : réussis (tarifs aux frontières, distance, promotions, mobiles sénégalais, coordonnées, transitions, validation, origine HTTP, secret administrateur).
- 26 vérifications API sous Wrangler : réussies, dont stock unique concurrent, prix falsifié, soumission idempotente, récupération après coupure, accès privé, CSRF, annulation et stock, encaissement, créneau et clôture de livraison, limitation de débit et révocation de session.
- Chrome 390 px et 1280 px : pas de débordement horizontal, pas d’erreur JavaScript. Recherche, filtres neuf/friperie, sélection de variante, panier, connexion/déconnexion admin, saisie de destination, commande et suivi vérifiés.
- Coupure réseau simulée **après l’écriture serveur** : reçu récupéré après rechargement sans nouvelle commande.
- Mode sombre : capture et inspection visuelle.
- Carte : chargement à la demande implémenté ; le test de commande utilise les coordonnées manuelles. Les tuiles et la géolocalisation réelle restent à vérifier sur téléphone en conditions réelles.

Build : environ 23 Ko gzip pour HTML/CSS/JS initiaux, hors photos ; administration et carte séparées. La cible des photos réelles reste à vérifier après leur ajout.

Les secrets locaux de test sont temporaires ; générer son propre mot de passe avant d’utiliser l’administration. Le point de retrait de test a été rétabli à son état initial vide. Les essais sont marqués démonstration et certains restent visibles dans la base locale.

Limites : aucune mesure de CPU en Cloudflare distant, aucun test d’argent réel, pas de validation juridique des conditions de vente, pas de photos commerciales fournies. Le déploiement et l’ouverture sont décrits dans le README.
