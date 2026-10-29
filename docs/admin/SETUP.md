# Configuration externe et intégration progressive

Cette PR prépare du code, des tests et une prévisualisation locale. Elle ne crée aucun compte, domaine, application Access ou base distante, et ne publie rien. Ne pas fusionner ni déployer avant l’accord du propriétaire.

## 1. Source vérifiée

Site : https://sifiabdessamad09-collab.github.io/freshsouk/

Branche source correcte : `main`, commit `2e1a874f940dbe3b61ecb06b682db68ef6469add`. Le 28 octobre 2026, les octets de `index.html`, `redesign.css`, `redesign.js`, `products.json`, `manifest.json`, `sw.js`, `pwa.js`, `pwa.css` publiés ont été comparés aux blobs Git et correspondent exactement. Les autres branches iPhone/V2/vidéo ne constituent pas la base de cette administration. `source-tree.txt` contient les 96 blobs d’origine ; `npm run check` vérifie qu’ils restent identiques, en tenant compte des fins de ligne de checkout Windows.

## 2. Après accord : environnement de préproduction privé

Actions à effectuer dans les comptes du propriétaire, **pas exécutées par cette PR** :

1. Préparer un compte Cloudflare, un sous-domaine distinct pour l’administration et un projet Worker dédié. Imposer HTTPS et la redirection des accès HTTP dans Cloudflare. Vérifier les coûts/quotas du compte avant toute activation. `workers_dev=false` et `preview_urls=false` évitent des URL alternatives non protégées.
2. Créer une **nouvelle** base D1 privée `freshsouk-private-admin`, distincte du backend historique. Remplacer l’UUID nul dans `admin/wrangler.toml`. D1 est accessible au Worker par binding, sans API SQL ouverte aux navigateurs.
3. Créer une application Cloudflare Access pour les chemins `/admin`, `/admin/*` et `/api/admin/*` sur le domaine choisi. Préférer un domaine de préproduction entièrement protégé à cette étape. Autoriser uniquement les comptes nécessaires, sans règle Allow Everyone/Bypass et sans service token. Exiger MFA auprès de l’IdP/Access et une durée de session courte (ex. une heure). L’e-mail OTP seul n’est pas un remplacement d’une politique MFA.
4. Renseigner `ACCESS_TEAM_DOMAIN` et `ACCESS_AUD`, puis configurer `ADMIN_EMAILS` via les secrets Worker (adresses exactes séparées par des virgules). Aucun e-mail réel d’administrateur, token Cloudflare, JWT ou secret Turnstile ne doit être commité. Ne jamais fournir un token d’administration Cloudflare au frontend.
5. Examiner et appliquer les deux migrations D1 (`0001_admin.sql`, `0002_catalog.sql`) uniquement à la base dédiée. L’initialisation du catalogue est non destructive (`INSERT OR IGNORE`), sans coordonnées clients et sans quantités de stock inventées. Ne pas exécuter ces migrations sur la base historique.
6. Ajouter le domaine/route autorisé au Worker, puis déployer seulement après validation du propriétaire. Les ressources envoyées sont limitées par `build-assets.mjs` et vérifiées par `check-assets.mjs` ; le répertoire du dépôt entier n’est jamais une racine d’assets.

Exemples de commandes à exécuter **plus tard**, après contrôle des identifiants et accord :

```sh
cd admin
npx wrangler secret put ADMIN_EMAILS
npx wrangler d1 migrations apply freshsouk-private-admin --remote
# Aucun `wrangler deploy` automatique dans ce dépôt.
```

Une mauvaise configuration Access ou une liste d’administrateurs vide fait échouer l’accès ; elle n’ouvre jamais les données. Les pages statiques ne contiennent aucune donnée client initiale. N’activez pas de route statique servant directement `.assets` sans le Worker : `run_worker_first=true` est obligatoire.

## 3. Recette privée avant production

- Vérifier au niveau Cloudflare la redirection IdP/MFA, le refus des comptes non autorisés, l’expiration et la déconnexion, y compris via les alias HTML et chemins d’assets.
- Vérifier que l’accès direct au Worker et aux API privées sans JWT valide est refusé. Le simple fait de connaître une URL ne donne aucun droit.
- Appliquer les migrations sur D1 de préproduction, puis tester des commandes uniquement fictives, des créations simultanées, une rupture de stock, un double clic/retry, une annulation et un conflit de version entre deux administrateurs.
- Vérifier mobile, ordinateur, clavier, lecteurs d’écran, exports et restauration des sauvegardes. Aucun vrai client ne doit être sollicité pendant les tests.
- Définir les comptes autorisés et leurs accès Cloudflare, les durées de conservation/suppression des commandes et des sauvegardes, ainsi que l’accès aux exports. Conserver les sauvegardes et exports dans un stockage privé, jamais dans Git, une issue, un log CI ou GitHub Pages.

## 4. Boutique publique : une future PR séparée

Le site actuel continue à lire son `products.json` et à suivre son parcours habituel. Les modifications de prix/stock de cette administration ne modifient donc pas le site publié.

Après validation privée et **nouvel accord**, préparer une PR distincte pour :

1. Configurer un endpoint de catalogue public limité aux données produits et à la disponibilité (aucune quantité interne exacte ni identité client).
2. Ajouter Turnstile au formulaire de commande public. Configurer le sitekey public dans le frontend, le secret uniquement dans le Worker, le hostname exact et l’action `freshsouk-order`. Le sitekey n’est pas une clé secrète ; aucun secret n’est nécessaire dans Pages.
3. Garder le rate limiter lié à l’IP fournie par Cloudflare, vérifier le serveur Turnstile, activer explicitement `PUBLIC_ORDER_INTAKE_ENABLED=true`, puis adapter la soumission du site selon [API.md](API.md) et raccorder `ORDER_API_URL` dans une PR révisable. Le simple changement de cette URL ne suffit pas : champs, captcha et reçu en centimes nécessitent l’adaptateur frontend. La route ne sauvegarde rien lorsqu’elle n’est pas configurée.
4. Vérifier les totaux recalculés, les réceptions et les conflits de stock avant d’annoncer une commande enregistrée. Le service retourne un reçu minimal et ne publie aucun endpoint anonyme de consultation de commande.

## 5. Retour arrière

Avant intégration publique : retirer la route de préproduction ou désactiver l’application dédiée, garder la base privée pour vérification. Le site public n’a pas besoin d’un rollback puisqu’il n’a pas changé. Ne pas supprimer la base ou les sauvegardes sans décision explicite du propriétaire.

Après une éventuelle intégration ultérieure : désactiver d’abord l’intake public et revenir à la version frontend validée, sans supprimer les commandes déjà enregistrées. Les commandes privées ne doivent jamais être transférées vers des assets pour contourner une panne.

## Sources techniques

- [Validation JWT Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Payloads Access : identité et type](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)
- [Worker avant toutes les ressources](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
- [D1 batch et transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Validation Turnstile côté serveur](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
