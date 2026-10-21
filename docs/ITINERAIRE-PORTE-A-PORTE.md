# Itinéraire porte à porte — première version

La fonctionnalité s'ouvre depuis le bouton « Itinéraire depuis chez moi » dans le volet de recherche de la carte principale. Sur mobile, elle est également accessible dans « Plus ». Après activation, l'utilisateur peut partager sa position ou saisir une adresse européenne ; la destination est limitée à l'Algérie. Elle compare les traversées Europe → Algérie en voiture et dessine l'option recommandée sur la carte. Changer le classement ou choisir une autre option met immédiatement à jour le tracé et le cadrage.

## Activation

Sans configuration supplémentaire, l'application interroge le serveur OSRM public pour les distances, durées et géométries routières. Si OSRM ne répond pas, la comparaison utilise une estimation : distance directe majorée de 32 % et vitesse moyenne de 68 km/h. La carte garde alors un tracé approximatif en pointillés pour les segments terrestres. Si seul le chargement de la géométrie échoue, les distances, durées et coûts déjà calculés restent inchangés.

Pour héberger OSRM plus tard avec les données OpenStreetMap des pays de départ et de l'Algérie, définir `OSRM_BASE_URL` côté serveur Vercel (ex. `https://routing.bledway.example`). Le service doit exposer `/table/v1/driving` et `/route/v1/driving` sur ce domaine. Redéployer après l'ajout de la variable. Aucun jeton API n'est nécessaire pour un OSRM auto-hébergé ; protéger le service par réseau, quota ou proxy adapté à son exploitation.

Le serveur public `router.project-osrm.org` reste un service de démonstration sans garantie de disponibilité. Son règlement demande un usage raisonnable, limité à une requête par seconde. L'application espace ses appels au sein d'une instance serveur, mais plusieurs instances Vercel peuvent appeler en parallèle : cette temporisation ne garantit pas un plafond global. Surveiller l'usage et basculer vers un serveur dédié si le trafic augmente.

L'autocomplétion d'adresses passe par la démonstration publique de Photon, avec une temporisation côté interface et un cache mémoire pour les recherches complètes. L'utilisateur sélectionne une suggestion afin de fixer exactement les coordonnées utilisées. Les coordonnées « latitude, longitude » sont également acceptées. Pour un trafic important, héberger Photon ou choisir un service contractuel : le serveur public ne garantit ni disponibilité ni quota de production. Aucun changement de schéma Supabase n'est requis.

## Ce que compare la première version

- Trajet depuis l'adresse saisie vers chaque port européen desservant l'Algérie.
- Traversées à venir disponibles dans la base BledWay, avec 2 h de marge avant embarquement.
- Trajet depuis chaque port d'arrivée algérien vers l'adresse finale.
- Classements « moins cher », « plus rapide » et « moins de conduite ».
- Coût estimatif : estimation ferry déjà utilisée par BledWay + carburant selon la consommation et le prix saisis + provision de péages par kilomètre.

Le temps « porte à porte » inclut le trajet jusqu'au port, l'attente jusqu'au départ programmé, le ferry et le dernier trajet routier. Le classement « moins cher » ne prétend pas refléter un prix de billet en temps réel. L'écran affiche les hypothèses et renvoie vers l'offre de la compagnie pour vérification.

Les recherches d'adresses sont envoyées à Photon pendant la saisie pour l'autocomplétion et lors du calcul si aucune suggestion n'a été choisie. Les coordonnées du trajet sont envoyées à OSRM ; le trajet sélectionné est dessiné sur le réseau routier lorsqu'une géométrie valide est disponible. Documentation : https://github.com/komoot/photon et https://project-osrm.org/docs/v5.24.0/api/.

## Évolutions à préciser

- Tarifs de ferry réels par date, nombre de voyageurs, type et dimensions du véhicule, cabine et promotions : il faudra une source commerciale ou un partenariat API.
- Péages exacts, restrictions routières, pauses, trafic et temps de contrôle au port : la première version les estime ou les exclut explicitement.
- Sens Algérie → Europe, aller-retour et préférences (éviter la conduite de nuit, accessibilité, animaux, port favori).
- Sélection explicite parmi plusieurs correspondances d'adresse lorsque le géocodeur hésite.
