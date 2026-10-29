# Bouton Commander dans l'application installée Safari

La PWA installée utilise un viewport et des zones de sécurité différents de Safari. La hauteur fixe `100vh` du panier pouvait placer son pied hors de la surface visible. Le correctif utilise la hauteur visible `visualViewport.height` (avec repli `innerHeight` et CSS `100dvh`), mise à jour au redimensionnement, rotation, clavier et retour dans l'application. Le zoom volontaire est préservé.

Le panier garde une liste défilante et un pied accessible avec marge pour l'indicateur d'accueil iPhone. Sur une fenêtre très courte, le pied défile également et le bouton reste collant en bas de cette zone. Le formulaire a une seule zone de défilement bornée à l'espace visible, avec marges de sécurité. Les champs à 16px évitent le zoom automatique iOS lors de la saisie.

Le parcours reste : enregistrement privé, puis ouverture du message WhatsApp. Aucun changement de backend ni de données. Nouvelle version du service worker pour renouveler le cache de l'application installée.

Validation : test de hauteur visible simulant clavier, rotation, absence de VisualViewport et zoom ; contrôle visuel navigateur aux tailles téléphone et fenêtre courte. Un appareil iPhone physique reste nécessaire pour attester le comportement exact du clavier et des safe areas de la PWA installée.

Après publication, fermer complètement l'application et la rouvrir connectée ; si la barre « Mettre à jour / حدّث » apparaît, l'utiliser pour charger la nouvelle version.
