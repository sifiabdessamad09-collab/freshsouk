# Plan de recette privée Admin V2 — à approuver avant exécution distante

## Périmètre proposé

- Une nouvelle base D1 : `freshsouk-admin-v2-review`, uniquement données fictives identifiables TEST/NE PAS LIVRER. Aucune copie de commandes ou coordonnées réelles.
- Un Worker privé : `freshsouk-admin-v2-review`, destiné à `freshsouk-admin-v2-review.freshsouk.workers.dev/admin/`. Le sous-domaine dépend de la vérification du compte avant activation ; cette URL est une cible, pas une publication existante.
- Un Worker API de recette : `freshsouk-api-v2-review`, même nouvelle D1. Sans Assets admin, sans route publique et sans intake au départ. Son exposition ultérieure demande une origine boutique de recette et Turnstile vérifiés.
- Une application Access dédiée à la revue privée : seul propriétaire existant autorisé, MFA exigé, aucun Bypass/Everyone, aucune augmentation des permissions d’autres utilisateurs. Ne pas réutiliser l’audience de production sans vérification.
- Aucun changement du Worker historique `freshsouk-admin-staging`, de `freshsouk-shop-api`, de leur D1, de GitHub Pages, du DNS, du domaine ou des droits de l’admin réel.

## Préparation disponible

Depuis la racine du dépôt :

```powershell
node admin/scripts/build-assets.mjs
node admin/scripts/prepare-v2-review.mjs
node --test --test-isolation=none admin/tests/*.test.mjs
```

Configurations produites dans `.local/v2-review` ignoré par Git. Routes, previews, V2, intake et suivi OFF, identifiant D1 nul et paramètres Access non renseignés : elles ne sont pas des configurations prêtes à publier. Aucun secret produit. `REVIEW_DATABASE_ID` n’est accepté que sur inventaire privé Cloudflare valide depuis moins d’une heure et distinct des bases utilisées par les services actuels.

## Exécution après autorisation précise du propriétaire

1. Vérifier le compte et le plan/quotas en lecture seule. Aucun achat ou activation payante. Si une étape nécessite une offre payante, arrêter avant acceptation et expliquer le besoin.
2. Résoudre la différence entre la redirection Access vivante et la liste API vide, puis vérifier l’email propriétaire et la méthode MFA. Ne pas prétendre que le MFA est validé par le simple test JWT local.
3. Créer uniquement la nouvelle D1 et la protection Access de revue approuvées. Ne pas modifier la protection des services actuels.
4. Sur cette D1 uniquement, installer le schéma historique et le catalogue initial de test, créer des commandes fictives peuplées, puis appliquer 0004 et comparer intégralement lignes/stock/audit/suivi avant-après. Pas de seed de production, pas de migration sur la D1 réelle.
5. Finaliser bindings, secrets et configurations de revue dans `.local`, compiler les deux Workers avec un build vérifié. Le CLI local rencontre `spawn EPERM` ; la compilation esbuild directe fonctionne. Le dry-run CLI peut être validé en CI ; un déploiement par l’API Workers officielle avec les bundles compilés et les mêmes contrôles constitue une alternative après approbation. Ne pas élargir les privilèges du système par défaut.
6. Activer V2 après migration validée. Publier le Worker privé uniquement derrière Access déjà configuré ; ouvrir sa route seulement après vérification de la policy. Vérifier anonyme/identité non autorisée refusés et propriétaire avec MFA autorisé.
7. API de revue : laisser sans route/intake tant qu’une origine de boutique et Turnstile de recette ne sont pas définis. Ne pas pointer la vraie boutique vers la D1 de test. Les liens client de suivi existants pointent vers la boutique réelle par défaut : ne pas les diffuser pendant la revue tant que l’origine de suivi de recette n’est pas adaptée.
8. Fournir le lien privé réel et les résultats de recette. Demander une validation distincte avant toute fusion/publication de production.

## Coût et arrêt

Objectif : aucune offre payante et aucune nouvelle facturation autorisée. Vérifier la consommation et les limites du compte avant création. Existence d’offres gratuites dans les documentations [Workers](https://developers.cloudflare.com/workers/platform/pricing/) et [D1](https://developers.cloudflare.com/d1/platform/pricing/) ne prouve pas le plan ou l’usage réel du compte. Aucune garantie de gratuité illimitée.

Si Access ne peut pas être validé, ne pas exposer l’admin. Si la migration échoue, ne pas activer V2 et conserver la D1 de test pour diagnostic. Si aucun chemin de build et de publication contrôlé n’est validé, ne pas déclarer la recette distante terminée. La suppression éventuelle des ressources de revue sera une action séparée, pas une suppression automatique de données.
