# Accueil, départs et fiches port

Déposez les fichiers complets du ZIP à la racine du dépôt en conservant les dossiers. Si la livraison « mobile, navires et communauté » n'est pas encore sur `main`, déposez-la d'abord : ce ZIP s'appuie sur ces fichiers. Aucun changement Supabase supplémentaire n'est nécessaire pour cette refonte.

Pour revenir totalement sur l'essai du navire 3D, supprimez aussi ces quatre anciens fichiers de GitHub s'ils y ont été déposés :

- `public/vessel-visuals/rosalind-franklin.jpeg`
- `public/vessel-visuals/rosalind-franklin-map.png`
- `src/lib/ferry/vesselVisuals.ts`
- `docs/VISUELS-3D-NAVIRES.md`

Le code de cette livraison ne référence plus ces fichiers. Les marqueurs de carte reviennent au pictogramme maritime orienté selon le cap. Les fiches gardent leurs photos issues du back-office ou de Wikimedia Commons.

À l'ouverture de la carte, la recherche est en aller simple et liste les quatre prochains départs connus. Le choix aller-retour est conservé dans un lien partagé avec `way=2`; les anciens liens qui portent une date `ret` continuent à ouvrir l'aller-retour. Les listes ne créent aucun départ fictif.

Les services renseignés du port apparaissent en format réduit dans l'onglet Avis, avant les commentaires. « Disponible » et « Oui » ne sont plus répétés ; les précisions utiles, comme « gare à proximité » ou « limité », restent visibles. Les valeurs explicitement absentes ne figurent pas parmi les services proposés.

Les badges publics précédemment libellés « Démonstration » portent « À confirmer » : le statut des données non vérifiées reste visible sans ce libellé. Le champ `is_demo` du référentiel et ses contrôles ne sont pas supprimés.

L'illustration du désert et du dromadaire a été générée pour BledWay et placée dans `public/images/bledway-horizon-algerien.png`. Elle est décorative ; elle ne représente pas un itinéraire ni une position de bateau. La section sous la carte est resserrée et reste responsive.
