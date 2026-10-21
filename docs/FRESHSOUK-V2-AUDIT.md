# FreshSOUK V2.0 — Audit initial

Date de l’audit : 21 octobre 2026  
Branche de travail : [feature/freshsouk-v2]
Base examinée : [main]

> Cet audit décrit l’état réel du dépôt. Aucun changement n’est publié sur le site de production depuis cette branche.

## Résumé

Le dépôt est un site statique compatible GitHub Pages, construit autour de [index.html] et [products.json]. Il comprend déjà le catalogue, le panier, le formulaire de commande, la génération du message WhatsApp, la vidéo de marque, la recherche et les filtres, ainsi qu’un formulaire d’avis WhatsApp.

Le catalogue contient **31 références** : **3 paniers, 17 légumes et 11 fruits**. Le compteur se base sur les données du catalogue et non sur les résultats actuellement filtrés.

## Éléments confirmés dans le code

- La configuration [CONFIG_BOUTIQUE] centralise WhatsApp [212643880485], les frais de livraison à **20 DH** et la livraison gratuite dès **200 DH**.
- Le panier est conservé dans le navigateur avec [localStorage]. Les tarifs et totaux sont calculés côté navigateur.
- La commande complète est envoyée à un formulaire Google Forms public en écriture, puis WhatsApp s’ouvre avec le récapitulatif. Le classeur Google Sheets n’est pas rendu public par ce mécanisme.
- Le code attend le chargement de l’iframe après l’envoi, mais ne peut pas lire la réponse privée de Google Forms pour prouver que la ligne a bien été enregistrée. L’interface doit donc éviter de présenter ce chargement comme une confirmation serveur certaine.
- Le bouton de commande rapide d’un produit ne possède pas les coordonnées client nécessaires pour enregistrer une commande complète. Il ouvre un message WhatsApp prérempli; ce message n’est pas une confirmation d’envoi ou d’enregistrement.
- Les avis sont préparés dans WhatsApp. Ils ne sont ni enregistrés automatiquement, ni publiés sur le site; la vérification manuelle est cohérente avec le texte affiché.
- Aucune page ou API d’administration, authentification propriétaire, gestion de statut, abonnement hebdomadaire ou programme de fidélité n’est présente dans le dépôt.
- Il n’y a ni serveur ni service backend dans le dépôt. Un code secret ne doit pas être ajouté au HTML public.

## Audit des images

- Il y a **31 produits**, et chaque fiche possède une image principale ainsi qu’une URL de secours.
- Les chemins principaux du catalogue pointent vers [images/products/…], mais ce répertoire n’existe pas dans l’arborescence actuelle. Les photos de secours sont des URL Unsplash; elles nécessitent donc une connexion Internet et le chargement du fournisseur distant.
- Le dépôt contient trois photos de paniers au format JPG à la racine, le logo officiel, et la vidéo du site. Les images locales ne sont pas encore harmonisées en WebP.
- Vérification navigateur effectuée lors du contrôle précédent : les **31 images** de la page publiée se chargeaient avec leurs secours, y compris le brocoli après correction. Cela confirme l’affichage actuel, mais ne transforme pas les URLs distantes en fichiers locaux sous licence documentée.
- Les images de paniers disponibles dans le dossier de travail ne portent pas le logo officiel sur la face de la selila. Elles ne doivent pas être présentées comme des visuels FreshSOUK marqués avant superposition fidèle du logo.

## Risques et corrections recommandées

1. **Confirmation de commande** : remplacer l’iframe Google Forms par une réponse backend vérifiable; montrer « enregistrée » seulement après un reçu serveur.
2. **Sécurité des commandes** : déplacer le calcul des prix et la validation vers le backend; ajouter un identifiant de requête pour éviter les doubles commandes.
3. **Administration** : héberger l’API privée et protéger l’espace admin par une véritable authentification côté serveur. Un mot de passe caché dans le JavaScript public n’est pas une protection.
4. **Photos** : ajouter les fichiers WebP sous [images/products/], conserver un secours explicite et documenter la provenance/licence des images.
5. **Abonnements** : stocker l’accord du client, sa prochaine date et son statut dans un backend; demander une confirmation avant chaque commande planifiée. Sans intégration WhatsApp officielle, seuls des rappels manuels préremplis sont possibles.
6. **Fidélité** : ne pas activer la règle d’exemple « 1 DH = 1 point / 500 points = 20 DH » sans validation du propriétaire. Les crédits doivent provenir d’un paiement livré et confirmé.
7. **Paniers repas** : conserver les recettes en brouillon jusqu’à validation des quantités; calculer les estimations à partir du catalogue existant et ne pas créer de prix fixes arbitraires.

## Vérifications déjà effectuées

- Comptage du catalogue JSON : **31** (3 packs, 17 légumes, 11 fruits).
- Page publiée : compteur, filtres de catégorie, avis, ajout/suppression panier et affichage des 31 images avec secours.
- Contrôle des fichiers connus à la racine : page HTML, JSON, logo, 3 JPG de paniers et dossier vidéo.
- Pas de test d’une vraie commande : cela créerait des données client réelles. La réussite d’écriture dans Google Sheets n’est pas vérifiable depuis le navigateur public.
- Pas de test d’administration, d’abonnement ou de fidélité : ces modules n’existent pas encore.

## Périmètre restant pour V2.0

Cette branche démarre par l’audit. Les phases suivantes nécessitent des modifications distinctes et des contrôles : photos WebP locales, configurateur de paniers repas, backend de commandes et d’administration, abonnements avec rappels manuels, puis programme de fidélité désactivé jusqu’à validation des règles. Tout reste hors production tant que la branche n’est pas fusionnée et que le déploiement n’est pas autorisé.

## Décisions requises avant les modules sensibles

- Choisir le backend à utiliser pour les données privées (par exemple Google Apps Script sécurisé associé à la feuille existante, ou un backend dédié).
- Confirmer si les villes autorisées restent celles du code actuel ou si la zone doit être limitée à Casablanca, Bouskoura et Mohammedia.
- Valider les quantités des paniers Tajine, Salade, Couscous et Jus.
- Valider séparément les règles du programme FreshSOUK Club.
