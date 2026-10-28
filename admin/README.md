# FreshSOUK — Administration privée

Proposition sur la branche `codex/freshsouk-admin`, basée sur le site publié `main@2e1a874f940dbe3b61ecb06b682db68ef6469add`. Les 96 fichiers d’origine, y compris le site public, ses images, son service worker et l’ancien dossier `backend/`, sont conservés.

## Fonctionnalités

- Dashboard : commandes du jour à Casablanca, statuts, chiffre d’affaires et panier moyen des commandes livrées, alertes de stock, produits livrés les plus demandés.
- Commandes : recherche, dates, statuts, pagination, détail, historique, saisie manuelle privée et export CSV plafonné à 5 000 lignes, avec neutralisation des formules.
- Produits : création, noms/descriptions français-arabe, prix, catégorie, photo du catalogue, archivage, suivi facultatif du stock, seuil d’alerte et historique des ajustements. L’unité d’une référence existante est immuable pour préserver les commandes.
- Stocks : réservation atomique lors de la création d’une commande, contrôle de version, prévention de la survente, restitution une seule fois à l’annulation. Les commandes livrées/annulées sont terminales.

Les prix, frais (20 DH, gratuits dès 200 DH) et totaux sont calculés par le serveur, jamais acceptés depuis le navigateur. Les lignes conservent une copie du nom, de l’unité et du prix au moment de la commande. Les historiques ne dupliquent pas les coordonnées clients.

## Architecture et accès

Worker Cloudflare distinct + nouvelle base D1 privée. Aucune base, commande ou clé secrète n’est un asset. L’interface et **toutes** les routes privées, y compris CSS/JS/images et alias HTML, passent par une validation cryptographique Cloudflare Access RS256 (signature, issuer, audience, durée, identité applicative) et par une liste exacte d’e-mails autorisés, stockée côté serveur. Il n’existe ni compte administrateur prédéfini, ni mot de passe dans le code, ni option de contournement en production.

L’administration est servie sur le même domaine que son API privée. Les mutations nécessitent une origine identique, un type JSON et un en-tête anti-CSRF ; aucune autorisation CORS de l’API privée pour GitHub Pages. Les réponses sont `no-store`, sans cadrage externe, avec CSP sans scripts/styles inline. Aucun token ou renseignement client n’est conservé dans localStorage/IndexedDB/service worker.

**MFA, politique Access et domaine privé restent à configurer à l’extérieur**, avant tout usage réel. Les comptes admis ont tous le rôle administrateur ; cette première version ne propose pas de rôles employés distincts. Voir [configuration et plan progressif](../docs/admin/SETUP.md).

## Prévisualisation et tests

Node.js 24 requis.

```sh
cd admin
npm ci
npm run build
npm run check
npm test
npm run preview
```

Prévisualisation : `http://127.0.0.1:8788/admin/`. Elle est exclusivement locale, en mémoire, avec six clients et des stocks **fictifs**. Son serveur de test fabrique des JWT temporaires RSA et simule uniquement le certificat de son émetteur de test ; il utilise les mêmes validations cryptographiques que le Worker. Il n’est pas dans le bundle de production et ne doit jamais être hébergé. Le Worker n’a pas de mode « désactiver l’authentification ».

Les tests utilisent SQLite réel (`node:sqlite`), les mêmes schémas/triggers et de vrais JWT signés, plutôt qu’un mock qui accepterait n’importe quelle requête SQL. Une validation Cloudflare en environnement de préproduction reste nécessaire : ce ne sont pas des tests sur une base D1 distante.

Le workflow `admin-ci.yml` n’utilise aucun secret : vérification du site d’origine, build des assets autorisés, tests, compilation Wrangler **en mode dry-run uniquement**. Aucun déploiement automatique et aucune fusion automatique.

## Intégration publique différée

Le site public et `ORDER_API_URL` ne sont pas modifiés. Les produits de la base sont initialisés à partir des 32 produits publics ; le suivi du stock est désactivé tant qu’un administrateur n’a pas renseigné les quantités réelles.

La route publique d’envoi est désactivée (`PUBLIC_ORDER_INTAKE_ENABLED=false`). Son activation future nécessite un accord séparé, un domaine vérifié, Turnstile (action `freshsouk-order` et hostname vérifiés), le rate limiter et une intégration frontend dans une autre PR. Les reçus anonymes contiennent seulement identifiant/statut/total, jamais nom, téléphone, adresse ou contenu du panier. Une clé d’idempotence réutilisée avec un contenu différent est refusée.

Le dossier historique `backend/` n’est ni migré ni déployé par cette proposition. Ne réutilisez pas sa configuration ou sa base pour ce nouveau service.
