# Lien de suivi dans la confirmation client

Les nouvelles commandes du site créent leur lien de suivi dans la même transaction D1 que la commande et ses lignes. Un échec annule tout le lot. La fonction utilise le flag existant ORDER_TRACKING_ENABLED et la table order_tracking existante : aucune migration ni nouveau secret.

Le serveur génère 32 octets aléatoires et ne stocke que SHA-256. Le token et sa date d'expiration sont renvoyés une seule fois dans la réponse de création, avec no-store. Les commandes admin et les anciens clients continuent à fonctionner. Aucune génération à partir de l'identifiant de commande et aucune récupération publique d'un token existant.

La confirmation affiche un lien FR/Darija et un bouton de copie avec sélection manuelle si le presse-papiers est indisponible. L'origine du lien est fixe ; les tokens et dates sont validés avant affichage ; aucun HTML client n'est injecté. Le récapitulatif WhatsApp contient aussi ce lien. Quand un lien de suivi est disponible, la confirmation reste affichée : le client choisit le bouton WhatsApp au lieu d'une redirection automatique. Sans nouveau lien, le parcours précédent est conservé. L'envoi reste manuel. Aucun stockage du token ou de la réponse en localStorage/sessionStorage, aucun cache de réponses API.

Une répétition idempotente ne crée pas de second ordre, ne révèle pas le token et ne réactive pas un lien révoqué. Si la toute première réponse réseau est perdue ou si la confirmation disparaît après rechargement, le token n'est pas récupérable : l'administration peut fournir un nouveau lien via ses outils existants. On privilégie la non-divulgation et le respect de la révocation à une régénération silencieuse.

Déploiement après accord : Workers public et privé depuis les sources revues, puis index.html/storefront.js/sw.js sur Pages. Conserver la migration, les flags, les secrets, Access et les limites existantes. Le nouveau cache PWA renouvelle le script storefront ; aucun changement de catalogue ou de données client existantes. Repli : revenir aux sources précédentes ; les liens déjà émis et les commandes restent valables.

Tests : création avec lecture anonyme, retries, révocation, transaction annulée en cas d'échec, validation de l'URL, copie et fallback ; suite historique conservée. Recette visuelle avec données fictives uniquement, aucun message WhatsApp envoyé.
