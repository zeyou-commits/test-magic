import type { VesselDossier } from "./types";
export const vesselDossiers: VesselDossier[] = [
  {
    slug: "jean-nicoli",
    name: "Jean Nicoli",
    company: "CORSICA linea",
    summary:
      "Un navire mixte avec cabines et salons fauteuils. La fiche officielle française annonce 1 600 passagers et 600 voitures ; ces capacités ne donnent pas les places restantes sur un départ.",
    specs: [
      { label: "Mise en service", value: "1998" },
      { label: "Longueur", value: "200,65 m" },
      { label: "Largeur", value: "25,8 m" },
      { label: "Passagers annoncés", value: "1 600" },
      { label: "Garage annoncé", value: "600 voitures" },
      { label: "Vitesse publiée", value: "22 nœuds" },
    ],
    sections: [
      {
        id: "confort",
        title: "Cabines, fauteuils et vie à bord",
        paragraphs: [
          "La compagnie présente des cabines de plusieurs catégories, des salons fauteuils, des espaces de restauration, un espace enfants et un accès Wi-Fi par forfait. Vérifiez ce que votre réservation inclut : un service disponible à bord peut rester payant.",
          "Pour choisir, commencez par le nombre de couchages, les sanitaires et les besoins du groupe. La capacité générale du navire ne permet pas de déduire la disponibilité d'une cabine familiale ou adaptée.",
        ],
      },
      {
        id: "voyage",
        title: "Les questions à poser avant le départ",
        paragraphs: [
          "Demandez le navire prévu sur votre traversée, la catégorie d'installation réservée et les consignes pour le véhicule. En cas de changement de bateau, faites reconfirmer les prestations importantes pour votre voyage.",
          "La vitesse technique publiée n'est pas une durée de trajet. Utilisez les horaires et la durée annoncés pour la traversée retenue, puis ajoutez le temps de présentation et de sortie du port.",
        ],
      },
    ],
    sources: ["nicoli"],
  },
  {
    slug: "danielle-casanova",
    name: "Danielle Casanova",
    company: "CORSICA linea",
    summary:
      "Un car-ferry avec plusieurs catégories de cabines et des salons fauteuils. La fiche officielle consultée annonce 2 400 passagers et un garage de 650 voitures.",
    specs: [
      { label: "Mise en service", value: "2002" },
      { label: "Longueur", value: "176 m" },
      { label: "Largeur", value: "30,4 m" },
      { label: "Passagers annoncés", value: "2 400" },
      { label: "Garage annoncé", value: "650 voitures" },
      { label: "Vitesse publiée", value: "24 nœuds" },
    ],
    sections: [
      {
        id: "confort",
        title: "Comparer la catégorie exacte de cabine",
        paragraphs: [
          "La compagnie présente des cabines, des suites et des salons fauteuils. Les sanitaires et la télévision varient selon la catégorie. Lisez les prestations de l'installation proposée, plutôt que d'appliquer à toutes les cabines ce que montre une photo.",
          "La page de l'opérateur décrit aussi des espaces de restauration, un bar panoramique, un espace enfants et des forfaits Wi-Fi. Leur présence ne signifie pas que tous les services sont inclus dans le billet.",
        ],
      },
      {
        id: "capacite",
        title: "Pourquoi les chiffres diffèrent parfois",
        paragraphs: [
          "Des fiches anciennes ou tierces peuvent afficher un autre nombre de voitures. Batogo retient ici la fiche officielle française consultée et indique sa source. Ce nombre de présentation n'est ni le nombre de places libres ni une garantie pour un véhicule de dimensions particulières.",
          "La disponibilité réelle, l'affectation et les prestations se confirment auprès du transporteur pour la date et le sens du voyage choisis.",
        ],
      },
    ],
    sources: ["casanova"],
  },
  {
    slug: "mediterranee",
    name: "Méditerranée",
    company: "CORSICA linea",
    summary:
      "Un car-ferry proposant des cabines et un salon fauteuil. L'opérateur publie une capacité de 2 800 passagers et de 690 voitures.",
    specs: [
      { label: "Mise en service", value: "1989" },
      { label: "Longueur", value: "165 m" },
      { label: "Largeur", value: "27,5 m" },
      { label: "Passagers annoncés", value: "2 800" },
      { label: "Garage annoncé", value: "690 voitures" },
      { label: "Vitesse publiée", value: "24 nœuds" },
    ],
    sections: [
      {
        id: "cabines",
        title: "Bien lire la description de l'installation",
        paragraphs: [
          "La présentation officielle distingue notamment des cabines avec sanitaires privés et des catégories avec lavabo. Vérifiez le couchage, les sanitaires et l'occupation privative ou partagée avant de comparer les prix.",
          "La compagnie décrit un salon fauteuil, des espaces de restauration et de détente, un espace enfants et un Wi-Fi par forfait. Demandez les services réellement proposés sur votre départ et les éventuels suppléments.",
        ],
      },
      {
        id: "preparer",
        title: "Préparer la traversée à bord",
        paragraphs: [
          "Conservez dans votre sac les affaires nécessaires jusqu'au débarquement. Repérez le pont de votre voiture, les escaliers et votre installation. Pour une demande d'assistance, faites confirmer la prise en charge avant le jour du voyage.",
          "Une fiche descriptive ne confirme pas la présence du bateau sur une ligne précise. Contrôlez votre réservation et les communications de la compagnie en cas de modification.",
        ],
      },
    ],
    sources: ["mediterranee"],
  },
  {
    slug: "badji-mokhtar-iii",
    name: "Badji Mokhtar III",
    company: "Algérie Ferries",
    summary:
      "Un projet RoPax de 2021 documenté par son concepteur OSK Design pour Algérie Ferries. Cette fiche distingue la conception du navire de son affectation et de sa disponibilité actuelles.",
    specs: [
      { label: "Année du projet publiée", value: "2021" },
      { label: "Catégorie", value: "RoPax, passagers et véhicules" },
      { label: "Client du concepteur", value: "Algérie Ferries" },
      { label: "Concepteur référencé", value: "OSK Design" },
      {
        label: "Capacités et dimensions",
        value: "À confirmer sur une fiche technique primaire actualisée",
      },
      { label: "Affectation du jour", value: "À confirmer auprès de la compagnie" },
    ],
    sections: [
      {
        id: "conception",
        title: "Ce que documente la source du concepteur",
        paragraphs: [
          "OSK Design présente un travail portant sur le concept, l'analyse des lignes, l'architecture extérieure et intérieure et l'assistance au projet. La conception prend en compte les flux de passagers et de véhicules entre l'Algérie et l'Europe du Sud.",
          "Cette présentation du projet ne sert pas de suivi d'exploitation. Batogo n'en déduit ni un départ à venir, ni une reprise de service, ni une position en direct.",
        ],
      },
      {
        id: "confirmer",
        title: "Les informations à obtenir pour votre voyage",
        paragraphs: [
          "Avant de réserver pour voyager sur ce bateau, demandez à Algérie Ferries le navire prévu, l'installation proposée, les conditions de transport de la voiture et les services disponibles. Faites préciser les conséquences d'une substitution de navire.",
          "Les dimensions et capacités ne sont pas reproduites ici à partir de fiches commerciales contradictoires. Elles pourront être ajoutées avec une référence technique primaire datée. Pour préparer le voyage dès maintenant, utilisez la checklist véhicule et la comparaison cabine/fauteuil.",
        ],
      },
    ],
    sources: ["badji"],
  },
];
