# Réorganisation mobile de la carte Batogo

## Objectif
Reprendre la structure mobile montrée dans la référence, sans modifier le thème visuel actuel de Batogo.

## Changements prévus
- Conserver la carte en plein écran comme surface principale.
- Remplacer l’en-tête mobile actuel par une zone flottante compacte : identité Batogo, compte, puis deux champs côte à côte « Départ » et « Arrivée ».
- Relier ces deux champs aux filtres existants afin que la carte et les lignes affichées se mettent à jour immédiatement.
- Ajouter sous la recherche une rangée horizontale de raccourcis défilables, alimentée par les destinations et les prochains départs disponibles.
- Transformer le volet inférieur mobile en panneau à trois niveaux : replié, intermédiaire et plein écran.
- Permettre de changer de niveau par glissement vertical de la poignée, ainsi que par pression sur la poignée.
- Garder la présentation actuelle sur ordinateur et préserver le contenu complet du volet.
- Maintenir la barre de navigation mobile en bas et éviter tout chevauchement avec le volet.

## Détails techniques
- Créer une barre de recherche mobile dédiée, réutilisant les données de ports, lignes et départs déjà chargées.
- Piloter la hauteur du panneau par trois positions stables et des gestes tactiles bornés.
- Ajuster la carte lors des changements de hauteur pour conserver un affichage correct.
- Masquer la recherche redondante du volet uniquement sur mobile, sans supprimer les filtres avancés.
- Vérifier visuellement les états replié, intermédiaire et déplié sur un écran mobile étroit.
