# Connexion autorisée de la boutique

Le propriétaire a approuvé le raccordement public après la recette privée. Cette intégration garde la présentation française/arabe, les photos approuvées et les qoffas.

Le Worker public `freshsouk-shop-api` utilise la même D1 que l'administration. Il ne sert que le catalogue public, la création de commandes et le healthcheck. Il ne possède ni assets administrateur ni secrets Access ; toutes les routes privées renvoient 404. Le Worker d'administration reste entièrement protégé par Access et MFA. Aucune commande n'est copiée dans GitHub Pages.

Le catalogue est relu à l'ouverture, au retour sur la page et chaque minute. Les prix, photos approuvées, archivages et disponibilités proviennent de D1. Le panier est réconcilié avant validation : si le prix ou les articles changent, le client doit vérifier puis confirmer à nouveau. Hors ligne, la consultation reste possible mais l'envoi est bloqué.

Les commandes ordinaires utilisent une clé d'idempotence stable, Turnstile géré avec le hostname exact et l'action `freshsouk-order`, validation serveur et rate limiting. Le secret Turnstile reste un binding serveur. Le reçu public ne contient que référence, statut et total en centimes. L'interface confirme l'enregistrement uniquement après réponse valide ; elle ne demande plus un second envoi WhatsApp. Les demandes d'abonnement restent le parcours d'enquête WhatsApp existant avec consentement explicite, sans faux enregistrement automatique.

`SHOP_SYNC_ENABLED=true` dans le Worker privé active le message « Boutique connectée » seulement après publication de l'adaptateur frontend. Le flag n'accorde aucun accès supplémentaire. Les configurations commitées restent génériques et n'activent pas un déploiement automatique.

## Validation

- 16 tests locaux : protection privée, prix serveur, transactions/réservations/restitution, idempotence, contrat frontend, refus des réponses sans reçu valide et séparation de l'entrée publique.
- API distante : 32 produits sans champs internes ; `/admin/` et `/api/admin/orders` refusés en 404.
- Navigateur local, SQLite et Turnstile simulés explicitement : une commande fictive d'un kilo de tomates produit un reçu de 28 DH, vide le panier après succès seulement et ne déclenche aucune notification externe.
- Le manifeste `public-sync-blobs.json` liste les trois fichiers publics existants modifiés intentionnellement ; les 93 autres blobs d'origine restent identiques.

La vérification du formulaire avec le vrai hostname et Turnstile, la visibilité des nouvelles commandes dans l'administration et le contrôle du site publié se font après déploiement. Les tests ne sollicitent aucun client réel. Tout exemple de recette est clairement marqué TEST et doit être annulé dans l'espace privé.

## Retour arrière

Désactiver l'intake du Worker public puis revenir au frontend précédent via une PR de revert, sans supprimer les commandes reçues. Ne pas modifier les protections Access. La base historique n'est ni migrée ni utilisée par cette intégration.
