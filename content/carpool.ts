import type { CarpoolPlace } from "./types";
export const carpoolPlaces: CarpoolPlace[] = [
  {
    slug: "grans-salon-a54",
    name: "Grans–Salon-de-Provence",
    road: "A54",
    area: "Bouches-du-Rhône",
    access:
      "Parking de covoiturage de Grans–Salon-de-Provence, sur l'axe A54. Vérifier l'entrée exacte dans la source du gestionnaire avant le rendez-vous.",
    relevance:
      "Un point à étudier pour réunir un groupe venant de l'ouest avant de poursuivre vers Marseille. Son intérêt dépend du détour et de votre accès final au port.",
    rendezvous:
      "Accordez-vous sur le parking précis, les valises et l'heure maximale de départ vers le terminal. N'utilisez pas une zone de péage ou une bretelle comme lieu d'attente.",
    source: "grans",
  },
  {
    slug: "gallargues-a9",
    name: "Gallargues-le-Montueux",
    road: "A9",
    area: "Gard · entre Montpellier et Nîmes",
    access:
      "Parking de covoiturage de Gallargues, documenté par VINCI Autoroutes sur l'A9 entre Montpellier et Nîmes. Vérifier les accès et le sens de circulation.",
    relevance:
      "Un repère possible pour organiser un regroupement sur l'axe de l'A9. Pour rejoindre Sète ou poursuivre vers Marseille, calculez le détour réel avant de fixer ce lieu.",
    rendezvous:
      "Partagez la localisation du parking à tous les passagers. Un point situé près de l'autoroute n'est pas forcément accessible directement depuis chaque sens.",
    source: "gallargues",
  },
  {
    slug: "avignon-nord-a7",
    name: "Avignon Nord",
    road: "A7",
    area: "Vaucluse",
    access:
      "Parking au niveau de l'échangeur d'Avignon Nord sur l'A7, présenté par VINCI Autoroutes en novembre 2024. Consulter l'accès publié avant le départ.",
    relevance:
      "Un point à envisager sur l'axe nord–sud pour un groupe poursuivant vers Marseille. Il faut encore prévoir le trajet jusqu'à la bonne porte du port et la présentation demandée par la compagnie.",
    rendezvous:
      "Gardez une marge après le regroupement. Si un passager arrive tard, le groupe doit avoir décidé à l'avance comment préserver le départ du ferry.",
    source: "avignon",
  },
  {
    slug: "narbonne",
    name: "Narbonne",
    road: "Secteur Narbonne",
    area: "Aude",
    access:
      "Aire de covoiturage référencée par Aude Tourisme à Narbonne. Utiliser la localisation de la fiche officielle pour distinguer ce lieu des autres parkings du secteur.",
    relevance:
      "Un point à étudier pour les voyageurs qui se regroupent dans le secteur de Narbonne avant de poursuivre vers un port. Ce guide ne présume pas d'un accès direct à une autoroute.",
    rendezvous:
      "Confirmez ensemble l'adresse et les conditions d'accès. Le nom d'une ville seul est insuffisant pour un rendez-vous avec plusieurs voitures et des bagages.",
    source: "narbonne",
  },
];
