# Commande enregistrée + récapitulatif WhatsApp

Choix final du propriétaire : conserver le parcours WhatsApp classique, sans Meta Business API. La préparation automatique dans la branche locale `codex/freshsouk-whatsapp-alerts` est abandonnée et ne doit pas être déployée, fusionnée ni activée.

Le checkout annonce que les coordonnées et le récapitulatif seront transmis à WhatsApp. Après un reçu serveur valide seulement, le panier se vide et le navigateur ouvre `wa.me/212643880485` dans le même onglet avec le message prérempli. Le client doit appuyer sur **Envoyer** dans WhatsApp ; ouvrir l'application ne prouve jamais l'envoi ou la réception.

Le message reprend la référence de la commande déjà enregistrée, les produits, quantités, total serveur et coordonnées de livraison. La même référence permet de rapprocher WhatsApp et l'administration sans saisir une deuxième commande. Aucun token, clé, donnée client réelle de test ou nouveau backend n'est ajouté au site.

Si WhatsApp est absent, bloqué ou fermé sans envoi, la commande reste dans l'administration. Un lien dans le reçu permet de réouvrir le même message en revenant sur la page. Une erreur API ne vide pas le panier et n'ouvre pas WhatsApp. Les informations du reçu restent en mémoire dans la page : pas de nouvelle persistance des coordonnées dans localStorage.

Validation : tests du contrat backend existant, URL et caractères FR/AR, total provenant du serveur, ordre enregistrement puis navigation, conservation du panier sur échec et lien de reprise lorsque l'ouverture échoue. Recette physique WhatsApp iPhone/Android nécessaire pour attester l'ouverture de l'application ; ne pas envoyer un message réel au propriétaire pendant les tests automatisés.

Déploiement : frontend uniquement (index, storefront, version service worker). L'administration, la D1, Access et Turnstile restent ceux de la connexion publique déjà validée. Aucune configuration Meta requise.
