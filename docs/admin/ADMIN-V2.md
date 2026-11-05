# FreshSOUK Admin V2 — exécution, staging et récupération

## Local, aucune ressource Cloudflare

Node 24 requis. Depuis le dossier `admin` :

```powershell
npm ci
npm run build
npm run check
npm test
node scripts/check-assets.mjs
$env:PREVIEW_PORT='8812'
$env:STOREFRONT_PREVIEW='1'
node scripts/preview.mjs
```

Administration : `http://127.0.0.1:8812/admin/`. Boutique et suivi : même origine. SQLite uniquement en mémoire avec fixtures, fausses signatures Access et vérification Turnstile locale. Perte de toutes les données fictives au redémarrage prévue. Serveur lié exclusivement à 127.0.0.1, refus de NODE_ENV=production, jamais le déployer. Pas de service worker en preview intégrée. `STOREFRONT_PREVIEW` et `TRACKING_PREVIEW` sont des options du script local, jamais des paramètres Worker.

Pour la seule UI admin, `npm run preview` (port 8788 par défaut). Construire les assets après changement UI, redémarrer le serveur après changement backend. Le local n’est pas une preuve de déploiement ni de MFA distant.

## Variables et frontières

| Élément | Worker privé | Worker public |
| --- | --- | --- |
| DB | D1 partagée de l’environnement | Exactement la même D1 de cet environnement |
| ASSETS | `.assets`, worker-first pour toutes les routes | Aucun asset admin |
| ADMIN_V2_ENABLED | `true` seulement après migration vérifiée | Même valeur, uniquement pour paramètres/calculs publics |
| SHOP_SYNC_ENABLED | Valeur existante conservée ; `true` pour recette liée | Conserver le parcours public existant |
| PUBLIC_ORDER_INTAKE_ENABLED | Conserver désactivé sur la surface privée si non utilisée | `true` seulement quand anti-abus/CORS opérationnels |
| ORDER_TRACKING_ENABLED | Conserver l’existant ; `true` pour recette suivi | Même fonction et même D1 |
| ACCESS_TEAM_DOMAIN / ACCESS_AUD | Valeurs de l’application Access privée exacte | Non nécessaires, ne donnent aucun accès public |
| ADMIN_EMAILS | Secret, exactement l’email propriétaire en V2 | Ne pas fournir |
| ALLOWED_ORIGIN | Origine exacte de la boutique, sans chemin | Même origine exacte |
| TURNSTILE_HOSTNAME | Si intake activé | Hôte exact de la boutique |
| TURNSTILE_SECRET | Secret serveur si intake activé | Secret serveur |
| ORDER_LIMITER / TRACK_LIMITER | Conserver les bindings nécessaires | Conserver les bindings anti-abus ; suivi utilise son limiter ou fallback existant |

Aucun secret dans HTML, Git, `.assets` ou les documents. Le sitekey Turnstile est public par conception. Aucun stockage de clients en localStorage ; seules préférences d’apparence persistées. La fiche publique `/api/shop-settings` expose uniquement version/frais/seuil/zones ; les coûts, notes et clients restent privés.

## Séquence de recette privée — autorisation nécessaire avant ressources/distants

1. Renouveler l’accès Cloudflare existant sans élargir les scopes ; vérifier le compte, les services réellement utilisés, bindings DB, configuration Access complète et contraintes du plan. Ne pas prendre les gabarits Wrangler pour la production.
2. Ne pas utiliser aveuglément `freshsouk-admin-staging` : ce nom historique est connecté au circuit actuel. Préparer deux noms Worker de revue et une D1 **isolée de test**, avec fixtures synthétiques exclusivement. Copier les gabarits Wrangler vers des fichiers ignorés dans `.local/`, renseigner noms/DB/Access/origines uniquement dans ces fichiers. Aucun identifiant de production réutilisé pour cette recette.
3. Protéger toute la surface privée (UI, assets et `/api/admin/*`) par Access : email propriétaire exact, MFA obligatoire, aucune règle Bypass/Everyone, durée de session appropriée ; vérifier anonymes et autre identité refusés. Désactiver routes de preview alternatives non protégées. Vérification serveur JWT obligatoire en plus d’Access.
4. Migrer la D1 de test avec l’historique 0001,0002,0003,0004 dans l’ordre. Ne pas lancer le seed sur la base réelle. Tester la migration sur une copie **synthétique peuplée** avec suivi actif, stock réservé et audit. Comparer contenu complet des quatre tables et audit avant/après, clés étrangères et ledger ; contrôler remboursement du stock sur annulation après migration.
5. Builder et compiler les deux Workers sans publier d’abord : depuis `admin`, `npx wrangler deploy --dry-run --outdir .dry-run` et `npx wrangler deploy --config wrangler.public.toml --dry-run --outdir .dry-run-public`. Ces gabarits n’activent pas V2 et ne pointent pas la vraie base. La CI ne déploie jamais.
6. Après accord sur ces ressources privées précises, publier avec les configurations ignorées de revue, secrets via Wrangler secret put, D1 identique pour les deux Workers de revue. Préparer l’origine exacte et les hôtes Turnstile de test ; ne pas réutiliser des clés qui n’autorisent pas cet hôte. Ne pas ouvrir l’admin en contournant Access.
7. Tester à distance la matrice du rapport : login+MFA/logout, anonyme/identité non autorisée, commande fictive, idempotence, statut/cancel, stock, paramètres, suivi/révocation, export, notes/coûts absents des projections publiques, six tailles et Safari physique. Captures expurgées des credentials/PII.
8. Demander validation du propriétaire sur la revue concrète avant production. Pas de modification DNS nécessaire pour la préparation locale.

Une base de test isolée n’est pas un second système de commandes réel ; ne jamais y faire arriver des clients. Aucune ressource privée distante V2 n’a été créée à ce stade. Ne pas supposer que la consommation restera gratuite ; vérifier les quotas du compte avant création.

## Sauvegarde et préflight production — après accord explicite uniquement

- Capturer les versions exactes Workers, assets et commit Pages ; enregistrer séparément settings/bindings et policy Access sans exposer les secrets.
- Export D1 complet dans un emplacement privé ignoré/chiffré, vérifier qu’il est lisible et restaurable sur environnement isolé. Noter l’horodatage et le bookmark de récupération disponibles. Aucune sauvegarde clients dans Git.
- Inventorier tables, FK, triggers, ledger de migration et taille réelle. 0004 couvre le graphe actuel products/orders/order_items/order_tracking ; toute extension inconnue impose révision préalable. Les copies temporaires demandent de la capacité et du temps : valider sur D1 de test, pas seulement SQLite.
- Suspendre temporairement les écritures de la boutique ET de l’admin pendant la migration approuvée, conserver les paniers et expliquer la maintenance. Aucun ordre de test réel et aucune suppression/reset/seed.
- Appliquer 0004 par le système de migrations D1, vérifier sa transaction atomique sur le service, les mêmes comptes et valeurs/versions/stock/hash de suivi/audit, absence d’orphelins et triggers présents. `defer_foreign_keys=ON` sert à conserver les contraintes, pas à les désactiver.
- Publier d’abord backend et assets compatibles avec feature flag off, puis frontend avec fallback. N’activer ADMIN_V2_ENABLED sur les deux Workers qu’après validation de la migration et d’un ADMIN_EMAILS propriétaire unique. Conserver 20/200 et zones existantes. Réouvrir les écritures et faire les contrôles non destructifs.

Références techniques : [D1 clés étrangères](https://developers.cloudflare.com/d1/sql-api/foreign-keys/) et [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/). La migration réelle reste une étape à valider à distance.

## Retour arrière

Avant toute écriture post-migration, une transaction en échec doit être annulée intégralement ; ne pas marquer le ledger comme appliqué. La suite locale teste explicitement ce rollback.

Après migration réussie, préférer **désactivation de la fonction et rollback du code**, conserver les tables et données ajoutées. Revenir aux versions Workers/Pages/asset capturées et rétablir les réglages compatibles, avec maintenance si nécessaire. Le flag off retrouve 20/200/Casablanca : ne pas le basculer silencieusement après adoption de nouveaux frais/zones.

**Ne jamais exécuter un down SQL destructif ou restaurer un ancien export au-dessus de nouvelles commandes.** Si des écritures ont eu lieu : suspendre, sauvegarder l’état actuel, conserver les commandes et événements depuis le bookmark, restaurer d’abord dans une base isolée pour comparaison, préparer une migration correctrice ou une réconciliation approuvée. Une restauration de production exige une nouvelle validation et un plan explicite sans perte. Le code ancien peut ne pas gérer les nouvelles villes/catégories pour les opérations ultérieures : ne pas rouvrir les écritures avant contrôle de compatibilité.

## Reste externe

Autorisation propriétaire pour recette distante isolée, accès Cloudflare renouvelé, vérification Access/MFA/limites, D1 réelle de test et sauvegarde/restauration vérifiées, hôtes Turnstile de recette, test physique Safari. Aucune fusion/publication autorisée par le seul message « KAMAL ».
