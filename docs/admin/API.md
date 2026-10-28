# Contrats de l’API proposée

L’API de ce dossier est indépendante du backend historique. Ne pas simplement modifier `ORDER_API_URL` du site existant : le frontend futur doit adapter ses champs, intégrer Turnstile, utiliser les centimes du reçu et gérer les conflits 409. Aucun changement du site n’est inclus dans cette PR.

## Accès privé

Toutes les routes `/api/admin/*` et `/admin*` sont contrôlées par Cloudflare Access puis par la liste `ADMIN_EMAILS` côté serveur. Les secrets et les JWT ne sont jamais envoyés par le code frontend. Access injecte lui-même le JWT signé après connexion. Le navigateur utilise son cookie Access, en même origine ; pas de token dans localStorage.

Mutations : `Content-Type: application/json`, `X-Freshsouk-Admin: 1` et origine strictement identique. Un en-tête d’e-mail ne constitue pas une preuve d’identité. Aucun appel cross-origin à l’API privée depuis GitHub Pages n’est autorisé.

| Route | Méthode | Fonction |
|---|---|---|
| `/api/admin/session` | GET | E-mail autorisé et expiration, sans JWT |
| `/api/admin/dashboard` | GET | Indicateurs agrégés, journée à Casablanca |
| `/api/admin/orders` | GET | Filtres `q`, `status`, `from`, `to`, `page`, 25 lignes/page |
| `/api/admin/orders` | POST | Saisie manuelle privée, clé d’idempotence requise |
| `/api/admin/orders/:uuid` | GET | Détail, lignes figées, historique et prochaines étapes autorisées |
| `/api/admin/orders/:uuid/status` | PATCH | `{status,version}` ; conflit si version obsolète |
| `/api/admin/orders/export.csv` | GET | Mêmes filtres, 5 000 lignes max, centimes explicites, formules neutralisées, export audité |
| `/api/admin/products` | GET/POST | Catalogue privé avec stocks / création |
| `/api/admin/products/:id` | PATCH | Mise à jour complète validée, version et motif obligatoires |
| `/api/admin/products/:id/history` | GET | 100 derniers changements conservés dans la base |

L’archivage utilise `active=false`. Aucune suppression permanente de produit, commande ou historique n’est exposée. L’unité d’un produit existant ne change pas. Les coordonnées d’une commande créée ne sont pas modifiables dans cette première version.

## Données produits

Les objets de mutation produit comprennent `id`, `nameFr`, `nameAr`, `category`, `unit`, `descriptionFr`, `descriptionAr`, `priceCents`, `active`, `trackStock`, `stockMilli`, `lowStockMilli`, `imageKey`, `reason`, et `version` lors d’une mise à jour. `priceCents` est un entier ; `stockMilli=1500` représente 1,5 kg ou unités. Les kg progressent par 500, les unités/bottes/packs par 1 000. Les photos sont limitées aux clés des ressources approuvées, ou `leaf` pour un pictogramme neutre. Les champs inconnus sont rejetés.

Chaque mise à jour incrémente la version ; les réservations/restitutions de stock font aussi évoluer la version du produit. Les ajustements manuels ne peuvent donc pas écraser silencieusement un mouvement intervenu entre-temps.

## Commande (exemple fictif)

```json
{
  "customer": {
    "name": "Client fictif",
    "phone": "0600000000",
    "city": "Casablanca",
    "address": "Adresse fictive pour test",
    "slot": "09h00 - 12h00"
  },
  "items": [{ "productId": "tomates", "quantity": 2 }],
  "note": ""
}
```

En-tête `Idempotency-Key` : UUID aléatoire créé une seule fois par demande et réutilisé pour les retries identiques. Le serveur calcule les prix et réserve les quantités dans une même transaction. Un retry identique ne réserve pas deux fois ; un contenu différent avec la même clé reçoit 409. Les champs de prix/total fournis par le client sont rejetés.

Une réponse réussie contient `{ok:true,order:{id,status,totalCents}}`. Elle ne contient pas de nom, téléphone, adresse, note ni liste d’articles. Aucun endpoint public de consultation de commande n’existe.

## Endpoints publics, non raccordés au site

`GET /api/catalog` expose uniquement les données produits publiques et une disponibilité booléenne, sans quantités de stock exactes, identité d’opérateur ou données clients.

`POST /api/orders` est désactivé par défaut. Il exige, une fois activé explicitement, l’origine publique prévue, le rate limiter et `turnstileToken` dans le corps, avec vérification serveur du hostname et de l’action `freshsouk-order`. Les nouveaux enregistrements ne passent jamais sans validation anti-abus. Un retry d’une demande déjà enregistrée et dont le contenu normalisé correspond peut recevoir son reçu minimal sans créer de nouvel enregistrement.

## États et erreurs

`pending → confirmed → preparing → out_for_delivery → delivered`, avec annulation possible avant livraison. `delivered` et `cancelled` sont terminaux. L’annulation restitue atomiquement les quantités effectivement réservées, une seule fois. Les mouvements ne dépendent pas d’un appel du navigateur après changement de statut.

400 : saisie invalide ; 401 : JWT absent/invalide ; 403 : compte/origine non autorisé ; 409 : conflit de version, stock, clé ou transition ; 413 : JSON supérieur à 32 Kio ; 429 : limite d’envoi ; 503 : configuration/validation externe indisponible. Les erreurs internes ne révèlent ni SQL, ni coordonnées, ni token. Toutes les réponses sont `no-store`.
