# Intégration Wave directe — en attente d’accès

Le propriétaire a demandé l’accès à l’API Wave. Cette version n’inclut **aucun appel de paiement réel**, aucune clé Wave ni faux environnement « sandbox ».

Documentation officielle : [Checkout](https://docs.wave.com/checkout), [Wave Business](https://www.wave.com/fr/business/). L’API Checkout nécessite un portefeuille marchand autorisé ; les clés se gèrent par un administrateur dans le portail Business. L’accès développeur peut devoir être activé par Wave.

## Quand Wave répondra

1. Obtenir les conditions tarifaires **de l’API Checkout** et les possibilités exactes de test. La gratuité quotidienne et le taux de 1 % annoncés pour les paiements physiques de l’application Business ne garantissent pas les mêmes conditions pour Checkout.
2. Faire confirmer par Wave le mécanisme de test disponible pour ce compte. Ne pas fabriquer de préfixe `test` ou d’URL sandbox : les simulations locales peuvent tester notre logique, mais ne prouvent pas une intégration fournisseur.
3. Ajouter des secrets Cloudflare pour la clé API et les secrets de signature concernés, distincts par environnement. Aucun secret fourni dans le chat ou dans le navigateur.
4. Étendre le schéma des méthodes de commande et paiements par une migration, ajouter les tentatives de paiement et identifiants d’événements uniques. Conserver l’option manuelle.
5. Créer `POST /v1/checkout/sessions` **côté serveur**, montant XOF entier recalculé et référence Papisko, puis rediriger le navigateur vers `wave_launch_url`. Ne pas capturer cette URL dans une webview.
6. Implémenter le webhook selon la documentation Wave alors applicable : authentifier le corps brut et le timestamp avec le secret webhook, refuser les signatures invalides et rejouées. La signature des requêtes sortantes, si activée, est un mécanisme distinct.
7. Lire la session depuis l’API Wave et vérifier montant, devise, référence et paiement réussi avant de changer le statut en base. Un retour navigateur de succès ne vaut pas preuve de paiement.
8. Tester échec, abandon, expiration, double clic, notification répétée, mauvais montant, faux webhook et réponse réseau perdue. Vérifier reprise et rapprochement des paiements en attente.
9. Présenter les résultats au propriétaire et demander son **accord explicite** avant toute transaction ou activation de production.

Le `external_reference` unique des paiements manuels et les transitions protégées en D1 constituent une première base, pas une intégration API complète. Les reversements multi-vendeurs et remboursements automatiques restent un chantier séparé.
