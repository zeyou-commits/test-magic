# Itinéraire porte à porte — première version

La fonctionnalité s'ouvre depuis « De mon adresse jusqu'au Bled » dans le volet de recherche de la carte principale. Sur mobile, elle est également accessible dans « Plus ». Elle compare les traversées Europe → Algérie en voiture et dessine l'option recommandée sur la carte. Changer le classement ou choisir une autre option met immédiatement à jour le tracé et le cadrage.

## Activation

Sans configuration supplémentaire, l'application géocode les deux adresses au lancement de la recherche et propose un classement indicatif : distance directe majorée de 32 % et vitesse moyenne de 68 km/h. Le tracé terrestre est alors schématique et explicitement signalé comme tel.

Pour faire suivre **le réseau routier** aux tracés et obtenir les distances/durées routières, héberger OSRM avec les données OpenStreetMap des pays de départ et de l'Algérie, puis définir `OSRM_BASE_URL` côté serveur Vercel (ex. `https://routing.bledway.example`). Le service doit exposer `/table/v1/driving` et `/route/v1/driving` sur ce domaine. Ne pas utiliser le serveur de démonstration OSRM pour le trafic public. Redéployer après l'ajout de la variable. Aucun jeton API n'est nécessaire pour un OSRM auto-hébergé ; protéger le service par réseau, quota ou proxy adapté à son exploitation.

La recherche d'adresses passe par la démonstration publique de Photon, avec cache mémoire et espacement des requêtes dans chaque instance serveur. Les coordonnées « latitude, longitude » sont également acceptées et évitent ce géocodage. Pour un trafic important, héberger Photon ou choisir un service contractuel : le serveur public ne garantit ni disponibilité ni quota de production. Aucun changement de schéma Supabase n'est requis. Il n'y a pas d'autocomplétion d'adresse.

## Ce que compare la première version

- Trajet depuis l'adresse saisie vers chaque port européen desservant l'Algérie.
- Traversées à venir disponibles dans la base BledWay, avec 2 h de marge avant embarquement.
- Trajet depuis chaque port d'arrivée algérien vers l'adresse finale.
- Classements « moins cher », « plus rapide » et « moins de conduite ».
- Coût estimatif : estimation ferry déjà utilisée par BledWay + carburant selon la consommation et le prix saisis + provision de péages par kilomètre.

Le temps « porte à porte » inclut le trajet jusqu'au port, l'attente jusqu'au départ programmé, le ferry et le dernier trajet routier. Le classement « moins cher » ne prétend pas refléter un prix de billet en temps réel. L'écran affiche les hypothèses et renvoie vers l'offre de la compagnie pour vérification.

Les adresses sont envoyées à Photon uniquement lorsque l'utilisateur lance le calcul. Avec OSRM configuré, les coordonnées sont envoyées à votre serveur routier ; le trajet sélectionné est dessiné sur le réseau routier. Documentation : https://github.com/komoot/photon et https://project-osrm.org/docs/v5.24.0/api/.

## Évolutions à préciser

- Tarifs de ferry réels par date, nombre de voyageurs, type et dimensions du véhicule, cabine et promotions : il faudra une source commerciale ou un partenariat API.
- Péages exacts, restrictions routières, pauses, trafic et temps de contrôle au port : la première version les estime ou les exclut explicitement.
- Sens Algérie → Europe, aller-retour et préférences (éviter la conduite de nuit, accessibilité, animaux, port favori).
- Sélection explicite parmi plusieurs correspondances d'adresse lorsque le géocodeur hésite.
