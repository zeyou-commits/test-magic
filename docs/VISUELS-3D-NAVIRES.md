# Visuels 3D des navires

La première intégration utilise `public/vessel-visuals/rosalind-franklin.jpeg`, le rendu fourni pour **Rosalind Franklin**. Il s'affiche uniquement si le nom du navire dans la table `vessels` est « Rosalind Franklin » (accents et ponctuation sont normalisés). Aucun navire ni départ n'est créé par ce ZIP. Vérifiez que ce nom correspond bien au bateau représenté et que vous avez le droit de publier le rendu et ses photos sources.

Une seconde image, `public/vessel-visuals/rosalind-franklin-map.png`, sert d'icône sur la carte. Elle montre le navire de dessus, proue vers le haut, avec un véritable canal alpha. La carte la tourne selon le cap enregistré. Le marqueur générique apparaît le temps que l'image charge ou si elle échoue. Le rendu de profil reste dans la fiche et dans la bulle de survol.

Pour ajouter un navire :

1. Produisez une vue lisible sur fond clair, idéalement du même angle avant trois quarts pour toute la flotte. Le bateau doit correspondre au nom, à la livrée et à la période représentée. Évitez de générer ou de conserver de faux logos et détails techniques.
2. Exportez en WebP ou JPEG, largeur conseillée 1400–1800 px, poids cible inférieur à 400 Ko. Un PNG transparent convient aussi, avec un poids raisonnable. Optimisez le fichier avant le dépôt Git.
3. Placez-le dans `public/vessel-visuals/`, avec un nom stable, par exemple `jean-nicoli.webp`.
4. Ajoutez une ligne dans `src/lib/ferry/vesselVisuals.ts` : `"jean nicoli": "/vessel-visuals/jean-nicoli.webp",`. La clé est le **nom exact normalisé** de la ligne `vessels`, jamais celui d'une autre compagnie ou d'un autre bateau.
5. Pour remplacer aussi son icône, fournissez une seconde image carrée sur fond transparent, en vue plongeante et proue dirigée vers le haut. Ajoutez son chemin, un identifiant unique et la correspondance de nom dans `vesselVisuals.ts`, puis enregistrez l'image dans `shipIcons.ts` comme pour Rosalind Franklin.
6. Vérifiez sur mobile la fiche du navire, l'onglet « À bord » et la carte sur ordinateur. La carte doit conserver la bonne orientation selon le cap.

Le rendu est indiqué comme « Illustration 3D » afin de ne pas le faire passer pour une photographie documentaire ou pour une vue 3D orientable. La fiche conserve les autres photos comme solution de repli lorsque aucun rendu n'est enregistré. Les départs et positions restent issus des données de traversée et d'AIS ; le visuel ne modifie pas leur fiabilité.

Déposez les fichiers complets du ZIP en conservant les dossiers. Cette livraison part du code de la refonte mobile/navires/communauté précédente ; déposez son ZIP en premier si ce n'est pas encore fait. Aucun changement Supabase n'est nécessaire pour les visuels. Si Rosalind Franklin n'existe pas encore dans la table `vessels`, le fichier reste disponible mais ne s'affiche pas jusqu'à l'ajout du vrai navire dans le référentiel.
