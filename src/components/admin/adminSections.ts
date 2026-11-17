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
  BookCheck,
  Gauge,
  Settings2,
  PenSquare,
  Network,
  type LucideIcon,
} from "lucide-react";

/**
 * Les six espaces du menu, rangés par métier : piloter, programmer les traversées, tenir le
 * réseau, répondre aux voyageurs, publier, régler. Chaque rubrique appartient à un seul espace.
 */
export const adminSpaces: { id: string; label: string; tagline: string; icon: LucideIcon }[] = [
  { id: "Pilotage", label: "Pilotage", tagline: "Ce qui demande votre attention", icon: Gauge },
  {
    id: "Traversées",
    label: "Traversées",
    tagline: "Planning, départs et imports",
    icon: CalendarDays,
  },
  {
    id: "Réseau",
    label: "Réseau",
    tagline: "Flotte, compagnies, ports et liaisons",
    icon: Network,
  },
  {
    id: "Voyageurs",
    label: "Voyageurs",
    tagline: "Avis, signalements et erreurs",
    icon: MessageSquare,
  },
  {
    id: "Contenus",
    label: "Contenus",
    tagline: "Veille, actus, notifications, images",
    icon: PenSquare,
  },
  { id: "Réglages", label: "Réglages", tagline: "Équipe, droits et données", icon: Settings2 },
];
export const adminGroups = adminSpaces.map((space) => space.id);
export type AdminSectionDef = {
  id: string;
  label: string;
  /** Libellé court pour les onglets d'un espace. */
  short?: string;
  description: string;
  group: string;
  icon: LucideIcon;
};
export const adminSections: AdminSectionDef[] = [
  {
    id: "overview",
    label: "Aujourd'hui",
    description: "Ce qui demande votre attention, classé par urgence. Chaque point se règle ici.",
    group: "Pilotage",
    icon: LayoutDashboard,
  },
  {
    id: "usage",
    label: "Mesure d'usage",
    description: "Les pages vues et ce que devient une recherche, sur 7 jours.",
    group: "Pilotage",
    short: "Usage",
    icon: LineChart,
  },
  {
    id: "health",
    label: "Santé technique",
    description: "Le signal des navires et les fiches sans identifiant.",
    group: "Pilotage",
    short: "Santé technique",
    icon: Radio,
  },
  {
    id: "planning",
    label: "Traversées",
    description: "Le planning de la semaine : une ligne par ligne, une colonne par jour.",
    group: "Traversées",
    short: "Planning",
    icon: CalendarDays,
  },
  {
    id: "departures",
    label: "Liste des départs",
    description: "Retrouvez un départ par sa date et mettez à jour ses informations.",
    group: "Traversées",
    short: "Départs",
    icon: CalendarDays,
  },
  {
    id: "schedules",
    label: "Calendriers récurrents",
    description: "Gérez les programmes et les fréquences des lignes.",
    group: "Traversées",
    short: "Calendriers",
    icon: CalendarRange,
  },
  {
    id: "commercial",
    label: "Programmes par compagnie",
    description: "Liaisons commerciales, départs, navires et sources officielles au même endroit.",
    group: "Traversées",
    short: "Par compagnie",
    icon: CalendarRange,
  },
  {
    id: "import",
    label: "Import de saison",
    description: "Contrôlez les lignes de votre fichier avant de les publier.",
    group: "Traversées",
    short: "Import",
    icon: FileSpreadsheet,
  },
  {
    id: "assign",
    label: "Affectation auto",
    description:
      "Les règles qui choisissent le navire d'une traversée, et compagnie par compagnie : automatique, proposé ou manuel.",
    group: "Traversées",
    short: "Affectation",
    icon: Zap,
  },
  {
    id: "alerts",
    label: "Alertes planning",
    description: "Les anomalies du calendrier à vérifier avant publication.",
    group: "Traversées",
    short: "Alertes",
    icon: Flag,
  },
  {
    id: "vessels",
    label: "Flotte & compagnies",
    description:
      "Une compagnie à gauche, ses navires à droite. Ajouter, archiver, remplacer ou fusionner un navire.",
    group: "Réseau",
    short: "Flotte",
    icon: Ship,
  },
  {
    id: "companies",
    label: "Fiches compagnies",
    description:
      "Logo, site, description, accès professionnels, fusion des doublons et suppression des compagnies.",
    group: "Réseau",
    short: "Compagnies",
    icon: Building2,
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
    id: "places",
    label: "Lieux pratiques",
    description: "Stations-service, change, distributeurs autour des ports.",
    group: "Réseau",
    short: "Lieux",
    icon: Fuel,
  },
  {
    id: "incidents",
    label: "Navires immobilisés",
    description:
      "Source, vérification, départs concernés, messages à préparer et signalements à traiter.",
    group: "Réseau",
    short: "Immobilisés",
    icon: TriangleAlert,
  },
  {
    id: "community",
    label: "Modération voyageurs",
    description: "Avis sur les navires et signalements en cours, à vérifier ou à clore.",
    group: "Voyageurs",
    short: "Modération",
    icon: MessageSquare,
  },
  {
    id: "reviews",
    label: "Avis et photos",
    description: "Relisez les avis et les photos des voyageurs avant de les rendre publics.",
    group: "Voyageurs",
    icon: Star,
  },
  {
    id: "reports",
    label: "Erreurs signalées",
    description:
      "Horaires ou fiches à corriger, remontés par les voyageurs (« Signaler une erreur »).",
    group: "Voyageurs",
    short: "Erreurs",
    icon: TriangleAlert,
  },
  {
    id: "tickets",
    label: "Billets des voyageurs",
    description:
      "Écarts d’horaire relevés sur les billets et agences émettrices, sans donnée personnelle.",
    group: "Voyageurs",
    short: "Billets",
    icon: Ticket,
  },
  {
    id: "watch",
    label: "Veille actualité",
    description:
      "Ce que Claude a repéré dans la presse et chez les compagnies : approuvez, refusez ou mettez en attente. Rien n'est appliqué sans vous.",
    group: "Contenus",
    short: "Veille",
    icon: Newspaper,
  },
  {
    id: "flash",
    label: "Flash info",
    description: "Actualités et perturbations Europe ↔ Algérie, sourcées.",
    group: "Contenus",
    icon: Zap,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Préparez, vérifiez et diffusez les ouvertures de traversées.",
    group: "Contenus",
    icon: Bell,
  },
  {
    id: "signals",
    label: "Catalogue des signalements",
    description: "Situations, choix et services proposés aux voyageurs dans « Que voyez-vous ? ».",
    group: "Contenus",
    short: "Signalements",
    icon: Megaphone,
  },
  {
    id: "illustrations",
    label: "Illustrations",
    description: "Avatars, personnages, humeurs et icônes : remplacer une image ou la renommer.",
    group: "Contenus",
    icon: Images,
  },
  {
    id: "library",
    label: "Emojis et avatars",
    description:
      "Ajouter des emojis et avatars, créer et ordonner les thématiques, ranger chaque image.",
    group: "Contenus",
    short: "Emojis",
    icon: Smile,
  },
  {
    id: "walletMedia",
    label: "Mes dinars : images et voix",
    description: "Choisissez les photos des billets et enregistrez les montants à l’oral.",
    group: "Contenus",
    short: "Mes dinars",
    icon: Images,
  },
  {
    id: "users",
    label: "Utilisateurs",
    description: "Gérez les comptes voyageurs, les rôles et les accès de votre équipe.",
    group: "Réglages",
    icon: Users,
  },
  {
    id: "reference",
    label: "Données de référence",
    description:
      "Vacances scolaires et consulats en Europe : un rappel quand le relevé est à refaire, puis vous approuvez la mise à jour. Et le lien hôtel proposé dans Préparer.",
    group: "Réglages",
    short: "Référence",
    icon: BookCheck,
  },
  {
    id: "data",
    label: "Qualité des données",
    description: "Contrôlez la cohérence des informations publiées.",
    group: "Réglages",
    short: "Qualité",
    icon: Database,
  },
];

export type AdminSection = (typeof adminSections)[number];

/** Libellé d'une rubrique, tel qu'affiché dans le menu. */
export const sectionLabel = (id: string) =>
  adminSections.find((section) => section.id === id)?.label ?? id;
