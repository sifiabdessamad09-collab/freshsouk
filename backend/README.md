# FreshSOUK backend séparé — commandes privées

**Statut : préparation uniquement.** Ce service n'est pas déployé et le site public ne lui envoie pas encore les commandes. Les commandes continuent donc d'utiliser le flux actuellement configuré dans le site. Ne pas annoncer au client qu'une commande est enregistrée par ce backend avant d'avoir terminé le raccordement et les essais.

## Fichiers

- worker.js : API Cloudflare Worker. Vérifie les produits et les prix côté serveur, calcule la livraison, vérifie le JWT Cloudflare Access et utilise une clé d'idempotence contre les doublons.
- schema.sql : tables privées des commandes et de leur historique.
- wrangler.toml : modèle de configuration avec identifiants à remplacer dans le compte Cloudflare.

La base D1 reste privée. Aucun mot de passe ou jeton n'est inclus dans le navigateur. L'envoi public des commandes est limité; la consultation et le changement de statut exigent un JWT Access valide. La règle Cloudflare Access doit aussi être limitée à ton compte.

## Mise en service (dans ton compte Cloudflare)

1. Crée une base D1 nommée freshsouk-orders, copie son identifiant dans wrangler.toml puis exécute le schéma : npx wrangler d1 execute freshsouk-orders --remote --file=backend/schema.sql
2. Remplace les valeurs REPLACE_WITH dans wrangler.toml par l'identifiant D1, le domaine de ton équipe Access et l'audience de l'application. Garde la politique Access réservée à ton compte.
3. Depuis la racine du dépôt, déploie avec npx wrangler deploy --config backend/wrangler.toml. Configure la liaison des assets selon la version Wrangler utilisée si Cloudflare signale un chemin invalide.
4. Vérifie /api/health puis prépare une commande de test avec des données fictives. Vérifie qu'un même Idempotency-Key ne crée pas une seconde ligne, que le Worker recalcule les prix/livraison et qu'un appel admin sans JWT reçoit 401.
5. Ajoute l'URL du Worker au site et raccorde le checkout : envoyer customer et items avec productId/quantity ainsi que Idempotency-Key. Le site ne doit vider le panier ni annoncer une commande enregistrée qu'après la réponse ok:true.
6. Crée et protège l'écran d'administration avec Cloudflare Access; ne renvoie jamais les données admin à une page non authentifiée.

## Reste à faire avant production

- créer la base et les règles Access dans ton compte;
- déployer le Worker et tester les liaisons D1/assets;
- raccorder le checkout et créer un tableau de bord admin privé;
- ajouter quartier, identifiant, statistiques et export CSV dans le dashboard;
- tester l'enregistrement et le refus d'accès sans authentification;
- configurer domaine, cookies et CORS. Si les cookies Access sont bloqués depuis github.io, utiliser un domaine personnalisé servi via Cloudflare.

Les paniers repas sur la branche sont des estimations éditables basées sur les prix actuels; ils ne changent pas les prix des packs existants. Fidélité et commandes hebdomadaires restent désactivées jusqu'à validation et intégration.
