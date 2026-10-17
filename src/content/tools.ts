export const toolsCatalog = [
  {
    slug: "age-vehicule",
    title: "Âge du véhicule à la déclaration",
    description:
      "Comparer la première mise en circulation à la date de déclaration envisagée et repérer la limite de trois ans.",
    guide: "calcul-age-voiture-importation",
  },
  {
    slug: "budget-importation",
    title: "Budget complet d'importation",
    description:
      "Additionner achat, transport, frais et fiscalité saisie en DZD, avec une réserve et des hypothèses visibles.",
    guide: "budget-importation-voiture-algerie",
  },
  {
    slug: "budget-voyage",
    title: "Comparer deux budgets de voyage",
    description:
      "Comparer deux solutions porte à porte : billet pour le groupe, route, péages, hébergement et autres dépenses.",
    guide: "prix-billet-ferry-algerie",
  },
  {
    slug: "partage-frais",
    title: "Partager les frais de la route",
    description:
      "Répartir carburant, péages et parking entre les occupants, conducteur compris, avant de rejoindre le port.",
    guide: "covoiturage-avant-ferry",
  },
] as const;
export type ToolSlug = (typeof toolsCatalog)[number]["slug"];
