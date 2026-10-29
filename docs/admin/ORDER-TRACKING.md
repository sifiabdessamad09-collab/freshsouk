# Suivi client par lien privé — préparation, aucun déploiement

Cette PR ajoute le suivi sans modifier les configurations de production, les commandes existantes, les pages publiques actuelles ni les règles Cloudflare Access. `ORDER_TRACKING_ENABLED` est absent/désactivé par défaut. Le backend reste compatible avec une base sans cette migration tant que la fonction est désactivée. La migration porte le numéro 0003 ; ne pas appliquer la migration WhatsApp de l'ancienne branche locale abandonnée.

## Données et endpoints

`0003_order_tracking.sql` ajoute une table indépendante, sans backfill ni modification d'une commande. Le token est issu de 32 octets de `crypto.getRandomValues` (256 bits, base64url de 43 caractères). Seul le SHA-256 **du token brut** est stocké. Durée de validité : 30 jours. Une commande a un seul lien actif ; la régénération remplace le hash et invalide immédiatement l'ancien lien. La révocation efface le hash et conserve la version/date de révocation. Les versions empêchent une opération concurrente ou périmée d'annuler silencieusement un nouveau lien.

Dans les routes admin existantes, après vérification du JWT Access, de l'allowlist et des contrôles CSRF :

- `GET /api/admin/orders/:id/tracking` : métadonnées `active`, `version`, `expiresAt` seulement, jamais de token récupérable.
- `POST /api/admin/orders/:id/tracking`, JSON `{ "version": 0 }` pour une première création : renvoie le nouveau `token`, `expiresAt`, `version` **une seule fois**. Utiliser la version courante pour régénérer.
- `DELETE /api/admin/orders/:id/tracking`, JSON `{ "version": N }` : révoque la version courante.

`GET /api/track/:token` ne renvoie que `reference` (référence courte déjà utilisée par la boutique), `status`, `createdAt`, `updatedAt`, `history` (uniquement `status` et `at`). L'historique public est une projection explicite des changements de statut : ni acteur, notes, montants, produits, nom, téléphone, adresse, identifiant complet ou hash. Réponse 404 générique pour lien invalide/inconnu/expiré/révoqué. GET seulement, OPTIONS CORS, origine exacte autorisée, `Vary: Origin`, pas de credentials, `no-store` navigateur et CDN, `Referrer-Policy: no-referrer`. Rate limit via `TRACK_LIMITER` si configuré, sinon `ORDER_LIMITER` avec préfixe de clé `track:` ; sans limiter la lecture échoue en 503. Aucun nouvel accès anonyme à l'admin.

## Page et partage

`track.html#TOKEN`, `track.css`, `track.js` sont des fichiers statiques ne contenant aucun dossier client. Le token reste dans le **fragment** du lien : il n'est pas envoyé à GitHub Pages dans l'URL HTTP. Il est transmis à l'API dans le chemin demandé par la spécification ; les journaux réseau qui enregistrent des chemins doivent être traités comme sensibles et expurgés. La page ne charge aucun script, police, pixel ou outil analytique tiers ; elle n'enregistre ni le token ni la réponse en localStorage, sessionStorage, IndexedDB ou service worker. Le service worker actuel n'intercepte pas cette page ni les requêtes API. Le fragment permet de rouvrir le lien ou de le mettre en favori : il reste un secret partageable, visible dans l'adresse du navigateur.

Page FR/Darija, cinq étapes et état annulé séparé, historique limité aux statuts. Rafraîchissement toutes les 30 secondes uniquement quand elle est visible, reprise au retour et bouton manuel. Les lectures en cours sont annulées à la fermeture/masquage ou au changement de token. En cas d'erreur/révocation, l'ancien contenu est masqué, sans prétendre à une nouvelle confirmation.

Les boutons sont dans les détails de commande du dashboard existant, visibles seulement si la session annonce la fonction activée. Le lien brut reste uniquement dans le dialogue courant. Après fermeture/rechargement, il faut en régénérer un pour le recopier ; l'ancien est alors invalidé. « Envoyer sur WhatsApp » ouvre un lien `wa.me` au numéro de la commande avec une référence et un texte Darija. **L'administrateur doit décider d'ouvrir le message et d'appuyer sur Envoyer.** Aucun envoi automatique, API payante ou réception garantie. Les tests ne doivent jamais cliquer Envoyer dans WhatsApp.

## Prérequis pour une activation ultérieure, après revue

1. Vérifier le snapshot/restauration de la D1 **partagée actuelle**, puis appliquer et enregistrer uniquement `0003_order_tracking.sql`. Ne pas toucher à l'ancienne D1 `freshsouk-orders`. Aucune migration distante dans cette PR.
2. Compiler puis déployer les modules des Workers public/privé et les assets admin ; conserver exactement la politique propriétaire Access + MFA et les secrets actuels. Aucune exception Access publique à créer.
3. Publier `track.html`, `track.css`, `track.js` sur GitHub Pages à côté de la boutique, avec les bons types MIME. Les deux URLs d'origine dans les scripts correspondent aux hôtes FreshSOUK actuels ; adapter en revue si changement de domaine. Configurer en hébergement `Cache-Control: no-store` pour la page si possible. Le fragment n'est pas un mécanisme d'authentification admin.
4. Vérifier que les caches/CDN n'enregistrent pas `/api/track/*`. Ne pas activer de logs de chemin complets ni de traces contenant des tokens ; restreindre/rédiger les éventuels logs d'infrastructure. Un token est une autorisation de lecture des seuls statuts, même sans cookie.
5. Vérifier le rate limiter (partagé par défaut, 2 requêtes/minute/page à 30s ; prévoir un binding dédié si la charge l'exige). Activer explicitement `ORDER_TRACKING_ENABLED=true` sur les deux Workers uniquement après la migration et les tests de préproduction. Les fichiers wrangler et la production ne sont pas modifiés ici.
6. Recette avec un ordre fictif : créer/copier, consulter anonyme, changer le statut, annuler, révoquer/régénérer, vérifier les anciens liens 404 et le téléphone physique. L'envoi d'un vrai message nécessite une approbation séparée.

Retour arrière : retirer le flag sur les deux Workers, laisser la table et les commandes intactes. Les nouvelles routes retourneront 404 ; les fonctionnalités existantes continueront à fonctionner. Un token brut ne peut pas être restauré depuis la base.

## Validation locale

`node scripts/build-assets.mjs`, `node scripts/check-assets.mjs`, `node --test --test-isolation=none tests/*.test.mjs`, vérification de préservation des 96 fichiers d'origine, compilation esbuild des deux entrées Worker. Les fixtures SQLite sont en mémoire avec JWT RSA fictif, jamais déployées.

Prévisualisation facultative locale uniquement (PowerShell) : définir `PREVIEW_PORT=8794` et `TRACKING_PREVIEW=1`, puis exécuter `node admin/scripts/preview.mjs` depuis le dépôt après le build. Le serveur reste lié à `127.0.0.1`, simule l'authentification existante et adapte les URLs vers la boucle locale. Ne jamais héberger ce serveur ni réutiliser sa configuration de test en production.

Résultat de recette : 26 tests automatisés réussis ; build de 36 assets privés validé ; bundles des deux Workers compilés. Navigateur local : génération, copie confirmée, lecture anonyme, passage pending -> confirmed -> cancelled, révocation (ancien lien indisponible) et régénération vérifiés sans ouvrir WhatsApp. Page client à 390px sans débordement (375px utiles), admin mobile dialogue341px, bureau1280px. Console client sans erreur. Captures de travail : FRESHSOUK-tracking-desktop.jpg, FRESHSOUK-tracking-mobile.jpg, FRESHSOUK-tracking-admin-mobile.jpg dans outputs/ du workspace. Aucun test sur téléphone physique ni de livraison WhatsApp effective revendiqué.
