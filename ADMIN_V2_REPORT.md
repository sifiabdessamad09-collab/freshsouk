# FreshSOUK Admin V2 — rapport de préparation

Date : 5 novembre 2026. Branche : `codex/freshsouk-admin-v2`, issue de `origin/main` à `df8ef5842c4871d133654ec82ff41fa7a01321c9` (PR #10 vidéo publiée).

## État de livraison

**Implémentation et recette locales terminées. Aucune publication V2, migration distante, fusion, modification DNS, achat ou modification des droits effectuée.** Les URL Workers existantes ne sont pas des environnements de recette jetables : elles servent déjà le parcours de commandes actuel. Le nouveau code reste désactivé sans `ADMIN_V2_ENABLED=true` et sans migration 0004.

Le site public, son identité, ses produits, ses paniers personnalisables et la vidéo de 29 secondes sont conservés. Les seules adaptations publiques concernent les paramètres de livraison, la catégorie Herbes et l’actualisation PWA correspondante. Aucun prix réel n’a été modifié.

## Audit de l’existant

- Boutique HTML/CSS/JavaScript sur GitHub Pages. Pas de remplacement React/Next.js.
- `admin/src/worker.mjs` : administration et API privées, authentification JWT Cloudflare Access, vérification serveur de signature/issuer/audience/expiration/email, protection same-origin des écritures et header CSRF.
- `admin/src/public-worker.mjs` : liste fermée de routes publiques, sans accès aux endpoints privés.
- Une seule D1 partagée par ces deux services. Le répertoire historique `backend/` n’est pas activé comme second système de commandes.
- Les paramètres Wrangler versionnés sont des gabarits ; ils ne prouvent pas l’état déployé. Ils sont inchangés.
- L’audit distant actuel a rencontré un OAuth expiré (API Cloudflare 401) et des réponses anonymes HTTP 403 sans redirection Access exploitable. Cela ne prouve ni une panne du service ni la validation de toutes les politiques Access/MFA. **Vérification distante des paramètres et MFA à renouveler avant tout déploiement.** Aucun secret ni export clients n’est joint au rapport.

## Fonctions réalisées

| Module | Comportement implémenté |
| --- | --- |
| Dashboard | CA livré du jour/mois, commandes, six statuts, panier moyen, stocks, marge si coûts connus, graphique et filtre de période, dernières commandes |
| Commandes | Parcours existant préservé, prix unitaires, détails, confirmation/statuts manuels, historique, notes privées, quartier, livreur choisi manuellement, coûts réels, progression, suivi client existant |
| Produits/Stocks | Création et modification existantes, prix, catégories dont Herbes, photo parmi les médias approuvés, stock/rupture/réactivation, historique, coût d’achat privé et versionné |
| Clients | Regroupement du téléphone 0/+212, recherche, récurrence, achats livrés, dernière commande, historique paginé et notes privées |
| Livraisons | Commandes et statuts réels, adresse/créneau/zone, quartier, livreur facultatif, coût réel, gestion par les détails de commande |
| Finances | CA livré, frais facturés, coûts connus, dépenses avec idempotence, marge et résultat incomplets tant que coûts manquants |
| Rapports | Quotidien, semaine commençant lundi, mois, produits, catégories, zones ; CSV compatible Excel et protégé contre les formules ; export audité |
| Notifications | Nouvelles commandes, attente de confirmation, stock bas/rupture, lectures persistées par propriétaire ; rafraîchissement visible toutes les 60 s ; erreur de synchronisation affichée |
| Paramètres | Frais et seuil gratuit versionnés, Casablanca/Bouskoura/Mohammedia activables explicitement ; valeurs initiales 20 DH/gratuit dès 200 DH, Casablanca seule activée |

Light/Dark avec préférences système initiales, choix mémorisé avant affichage, menu repliable, menu mobile, focus et navigation clavier, cartes/tableaux mobiles. Animations courtes et finies, compteurs accessibles, réduction des mouvements respectée. Pas de dépendance UI distante supplémentaire.

Aucun envoi partenaire automatique. Les liens `wa.me` ouvrent un message prérempli ; le propriétaire doit appuyer sur Envoyer. Aucun message n’a été envoyé pendant la recette.

## Données et sécurité

La migration `admin/db/0004_admin_v2.sql` élargit les contraintes de catégorie/ville/livraison et conserve intégralement les lignes produits, commandes, articles, suivi et audit. Elle reconstruit les quatre tables liées ensemble avec clés étrangères différées, contrôle des comptes de lignes et réinstallation des triggers sans rejouer réservations ou événements d’audit.

Nouveaux espaces privés : `admin_settings`, `product_costs`, `order_item_costs`, `order_operations`, `customer_notes`, `expenses`, `notification_reads`. Aucune donnée client dans des assets publics. Coûts d’achat figés à la création des nouvelles commandes ; coûts historiques inconnus jusqu’à saisie manuelle d’un coût réel par commande. Les notes et acteurs privés ne rejoignent jamais l’historique public de suivi.

V2 exige exactement un email autorisé côté serveur. Les endpoints et assets privés exigent Access. Lecture/écriture/exports gardent `no-store` et les headers de sécurité existants. Écritures avec validation stricte, SQL paramétré, version optimiste ou clé d’idempotence. Le Worker public ne peut pas exposer les routes V2. MFA, cookies Access et limitation des connexions restent sous la responsabilité de la configuration Access ; leur activation réelle doit être contrôlée à distance.

## Résultats vérifiés

- **42/42 tests automatisés réussis**, dont les 32 tests existants et 10 nouveaux : auth/projection privée, CSRF/CORS, concurrence, sauvegarde des lignes lors de migration peuplée, rollback sur erreur, shipping et compatibilité ancien backend, coûts figés, résultat incomplet, dépenses idempotentes, clients/notes, notifications, rapports, refus HTML de connexion et restauration du focus.
- Build assets : 5 fichiers UI + 32 images approuvées + manifeste des images ; contrôle de frontière réussi. Aucun SQL, fixture, configuration serveur, clé ou donnée privée copié.
- Compilation locale esbuild : Worker privé 56,1 KiB et public 56,7 KiB, avant compression. Aucun déploiement. Syntaxe des scripts vérifiée.
- Conservation : 96 blobs legacy contrôlés, 4 intégrations publiques explicitement autorisées ; vidéo inchangée.
- Navigateurs : essai local lié boutique/admin, commande fictive #D11F4E3B de 28 DH, reçue à confirmer, confirmation manuelle visible sur le suivi public sans coordonnées. Aucun vrai client utilisé.
- UI locale : coût d’achat 4,50 DH enregistré/relu, note client privée, opérations privées versionnées, dépense fictive 12,50 DH, coût inconnu restant incomplet, thème conservé après reload, menu ouvert/fermé/replié, lecture de notification persistée.
- Produit local : passage 8→9 DH et stock 0, API catalogue `available=false`, puis retour à 8 DH et stock 5, API `available=true`. Prix de commande historique inchangé.
- Configuration locale : 25 DH/seuil 250 et trois zones testés via UI/API, puis retour aux défauts 20/200 et Casablanca. Aucun changement distant.
- CSV téléchargé réellement : 7 commandes, 1 livrée, 4100 centimes dans la fixture intégrée, cohérent avec Dashboard.
- Déconnexion locale : données effacées de l’interface ; trois routes privées sondées ensuite répondent 401 ; reconnexion de la fixture possible. Ce test ne remplace pas un login/MFA Access distant.
- Correctif trouvé pendant recette : fermeture d’une modale suivie du renouvellement du contenu pouvait bloquer les interactions. Restauration du focus vers le contrôle initial et renouvellement après sortie du modal ; réouverture/fermeture et édition suivantes vérifiées sans reload.
- Aucune erreur/warning console sur la session de recette finale.

| Largeur demandée | Largeur client utile / scrollWidth | Écran contrôlé |
| --- | --- | --- |
| 320 | 305 / 305 | Dashboard, menu mobile |
| 375 | 360 / 360 | Paramètres |
| 390 | 375 / 375 | Dashboard, produits en cartes, détail commande (dialogue 341 px) |
| 768 | 753 / 753 | Paramètres |
| 1024 | 1009 / 1009 | Rapports, export |
| 1440 | 1425 / 1425 | Dashboard, rapports, Light/Dark, sidebar |

La différence de 15 px correspond à la scrollbar du navigateur de test. Contraste calculé des couples principaux : texte clair 14,96:1, texte secondaire 6,08:1, bouton vert clair 4,55:1, texte sombre 12,51:1, secondaire sombre 7,68:1. Ce contrôle ciblé ne constitue pas un audit WCAG complet. iPhone physique/Safari VoiceOver et appareils modestes restent à tester. Aucun score Lighthouse inventé.

Captures locales dans `outputs/` du workspace FreshSOUK : `FRESHSOUK-admin-v2-light.jpg`, `FRESHSOUK-admin-v2-dark.jpg`, `FRESHSOUK-admin-v2-mobile.jpg`, `FRESHSOUK-admin-v2-order-mobile.jpg` (uniquement fixtures).

## Limites explicites

- Notifications visibles uniquement quand l’administration est ouverte. Pas de Web Push ou WhatsApp automatique.
- Au maximum 50 commandes récentes, 50 en attente et 50 alertes de stock dans le centre. Les comptes globaux sont séparés.
- Rapports : période maximale 366 jours, 5000 commandes/1000 dépenses ; erreur explicite si dépassement, réduire la période. Pagination clients/livraisons 25 lignes.
- Les cohortes des rapports sont basées sur la création de commande, CA uniquement des commandes livrées. CA jour/mois séparé selon date de mise à jour du statut livré. Les catégories reflètent la catégorie actuelle du produit ; pas de reconstruction historique inventée.
- Résultat estimé selon coûts et dépenses saisis, sans fiscalité ni charges absentes estimées. Ce n’est pas une comptabilité fiscale. Dépenses append-only ; correction par modification/suppression non implémentée.
- Photos : sélection du catalogue approuvé existant. Téléversement arbitraire de nouveaux médias non implémenté ; nécessite un pipeline de validation/stockage distinct.
- Export CSV, pas de fichier XLSX natif. Les montants exportés sont explicitement en centimes et quantités en milli-unités.
- D1 distante, Cloudflare Access/MFA et Safari physique non certifiés par les tests SQLite locaux. La recette D1 privée est une condition de publication.

## Étape suivante

Revoir la version locale et le guide `docs/admin/ADMIN-V2.md`. Ensuite seulement, autoriser une recette privée sur ressources isolées et des données fictives. L’autorisation de publication de la vidéo PR #10 ne couvre pas Admin V2. Ne pas appliquer 0004 à la base réelle et ne pas déployer sur le Worker actuellement nommé staging sans accord explicite et sauvegarde validée.

## Fichiers créés ou modifiés

- `.github/workflows/admin-ci.yml`
- `admin/package.json`
- `admin/scripts/build-assets.mjs`
- `admin/scripts/check-assets.mjs`
- `admin/scripts/preview.mjs`
- `admin/src/auth.mjs`
- `admin/src/domain.mjs`
- `admin/src/orders.mjs`
- `admin/src/public-worker.mjs`
- `admin/src/worker.mjs`
- `admin/tests/support.mjs`
- `admin/ui/app.css`
- `admin/ui/app.js`
- `admin/ui/index.html`
- `docs/admin/public-sync-blobs.json`
- `index.html`
- `redesign.js`
- `storefront.js`
- `sw.js`
- `ADMIN_V2_REPORT.md`
- `admin/db/0004_admin_v2.sql`
- `admin/src/admin-v2.mjs`
- `admin/src/shipping.mjs`
- `admin/tests/admin-v2-compat.test.mjs`
- `admin/tests/admin-v2-ui.test.mjs`
- `admin/tests/admin-v2.test.mjs`
- `admin/ui/app-v2.js`
- `admin/ui/theme.js`
- `docs/admin/ADMIN-V2.md`

Les répertoires ignorés `.local/`, `.assets/`, les exports privés et `.launch/` ne font pas partie de cette livraison. Les fichiers `admin/wrangler.toml` et `admin/wrangler.public.toml` restent inchangés.
