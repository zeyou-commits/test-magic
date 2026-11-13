import {
  Bell,
  Building2,
  CalendarDays,
  CalendarRange,
  Database,
  FileSpreadsheet,
  Flag,
  LayoutDashboard,
  LineChart,
  Radio,
  MapPin,
  MessageSquare,
  Route,
  Ship,
  Star,
  Users,
  Zap,
  Fuel,
  Images,
  Smile,
  Megaphone,
  TriangleAlert,
  Newspaper,
  Ticket,
} from "lucide-react";

/**
 * Groupes du menu, dans l'ordre d'affichage. Le premier (sans titre) réunit le travail
 * quotidien ; les suivants se replient pour garder le menu court.
 */
export const adminGroups = ["", "Planning détaillé", "Réseau", "Voyageurs", "Contrôles", "Équipe"];
export const adminSections = [
  {
    id: "overview",
    label: "Aujourd'hui",
    description: "Ce qui demande votre attention, classé par urgence. Chaque point se règle ici.",
    group: "",
    icon: LayoutDashboard,
  },
  {
    id: "planning",
    label: "Traversées",
    description: "Le planning de la semaine : une ligne par ligne, une colonne par jour.",
    group: "",
    icon: CalendarDays,
  },
  {
    id: "vessels",
    label: "Flotte & compagnies",
    description:
      "Une compagnie à gauche, ses navires à droite. Ajouter, archiver, remplacer ou fusionner un navire.",
    group: "",
    icon: Ship,
  },
  {
    id: "import",
    label: "Import de saison",
    description: "Contrôlez les lignes de votre fichier avant de les publier.",
    group: "",
    icon: FileSpreadsheet,
  },
  {
    id: "assign",
    label: "Affectation auto",
    description:
      "Les règles qui choisissent le navire d'une traversée, et compagnie par compagnie : automatique, proposé ou manuel.",
    group: "",
    icon: Zap,
  },
  {
    id: "incidents",
    label: "Navires immobilisés",
    description:
      "Source, vérification, départs concernés, messages à préparer et signalements à traiter.",
    group: "",
    icon: TriangleAlert,
  },
  {
    id: "watch",
    label: "Veille actualité",
    description:
      "Ce que Claude a repéré dans la presse et chez les compagnies : approuvez, refusez ou mettez en attente. Rien n'est appliqué sans vous.",
    group: "",
    icon: Newspaper,
  },
  {
    id: "commercial",
    label: "Programmes par compagnie",
    description: "Liaisons commerciales, départs, navires et sources officielles au même endroit.",
    group: "Planning détaillé",
    icon: CalendarRange,
  },
  {
    id: "schedules",
    label: "Calendriers récurrents",
    description: "Gérez les programmes et les fréquences des lignes.",
    group: "Planning détaillé",
    icon: CalendarRange,
  },
  {
    id: "departures",
    label: "Liste des départs",
    description: "Retrouvez un départ par sa date et mettez à jour ses informations.",
    group: "Planning détaillé",
    icon: CalendarDays,
  },
  {
    id: "ports",
    label: "Ports",
    description: "Accès, informations pratiques et points sur la carte.",
    group: "Réseau",
    icon: MapPin,
  },
  {
    id: "routes",
    label: "Liaisons",
    description: "Les lignes entre les deux rives.",
    group: "Réseau",
    icon: Route,
  },
  {
    id: "companies",
    label: "Fiches compagnies",
    description: "Logo, site, description, fusion des doublons et suppression des compagnies.",
    group: "Réseau",
    icon: Building2,
  },
  {
    id: "places",
    label: "Lieux pratiques",
    description: "Stations-service, change, distributeurs autour des ports.",
    group: "Réseau",
    icon: Fuel,
  },
  {
    id: "illustrations",
    label: "Illustrations",
    description: "Avatars, personnages, humeurs et icônes : remplacer une image ou la renommer.",
    group: "Voyageurs",
    icon: Images,
  },
  {
    id: "library",
    label: "Emojis et avatars",
    description:
      "Ajouter des emojis et avatars, créer et ordonner les thématiques, ranger chaque image.",
    group: "Voyageurs",
    icon: Smile,
  },
  {
    id: "walletMedia",
    label: "Mes dinars : images et voix",
    description: "Choisissez les photos des billets et enregistrez les montants à l’oral.",
    group: "Voyageurs",
    icon: Images,
  },
  {
    id: "flash",
    label: "Flash info",
    description: "Actualités et perturbations Europe ↔ Algérie, sourcées.",
    group: "Voyageurs",
    icon: Zap,
  },
  {
    id: "signals",
    label: "Catalogue des signalements",
    description: "Situations, choix et services proposés aux voyageurs dans « Que voyez-vous ? ».",
    group: "Voyageurs",
    icon: Megaphone,
  },
  {
    id: "community",
    label: "Modération voyageurs",
    description: "Avis sur les navires et signalements en cours, à vérifier ou à clore.",
    group: "Voyageurs",
    icon: MessageSquare,
  },
  {
    id: "tickets",
    label: "Billets des voyageurs",
    description:
      "Écarts d’horaire relevés sur les billets et agences émettrices, sans donnée personnelle.",
    group: "Voyageurs",
    icon: Ticket,
  },
  {
    id: "reviews",
    label: "Avis et photos",
    description: "Relisez les avis et les photos des voyageurs avant de les rendre publics.",
    group: "Voyageurs",
    icon: Star,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Préparez, vérifiez et diffusez les ouvertures de traversées.",
    group: "Voyageurs",
    icon: Bell,
  },
  {
    id: "alerts",
    label: "Alertes planning",
    description: "Les anomalies du calendrier à vérifier avant publication.",
    group: "Contrôles",
    icon: Flag,
  },
  {
    id: "reports",
    label: "Erreurs signalées",
    description:
      "Horaires ou fiches à corriger, remontés par les voyageurs (« Signaler une erreur »).",
    group: "Contrôles",
    icon: TriangleAlert,
  },
  {
    id: "data",
    label: "Qualité des données",
    description: "Contrôlez la cohérence des informations publiées.",
    group: "Contrôles",
    icon: Database,
  },
  {
    id: "health",
    label: "Santé technique",
    description: "Le signal des navires et les fiches sans identifiant.",
    group: "Contrôles",
    icon: Radio,
  },
  {
    id: "usage",
    label: "Mesure d'usage",
    description: "Les pages vues et ce que devient une recherche, sur 7 jours.",
    group: "Contrôles",
    icon: LineChart,
  },
  {
    id: "users",
    label: "Utilisateurs",
    description: "Gérez les comptes voyageurs, les rôles et les accès de votre équipe.",
    group: "Équipe",
    icon: Users,
  },
];

export type AdminSection = (typeof adminSections)[number];

/** Libellé d'une rubrique, tel qu'affiché dans le menu. */
export const sectionLabel = (id: string) =>
  adminSections.find((section) => section.id === id)?.label ?? id;
