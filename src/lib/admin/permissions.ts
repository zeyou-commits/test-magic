/**
 * Catalogue des rôles de l'espace équipe : source unique du menu, du badge « Votre rôle »,
 * du tableau « Rôles et droits » et des confirmations d'attribution.
 *
 * Deux étages :
 * - le cadre de chaque rôle (ROLE_CATALOG.tabs) : ce que la base de données autorise à ce rôle
 *   (private.bw_staff_permission, politiques RLS) ;
 * - le réglage de l'administrateur (RoleConfig, table bw_staff_role_config) : à l'intérieur de
 *   ce cadre, il retire des rubriques à un rôle, lui en ouvre d'autres et choisit son arrivée.
 *   La base applique le même réglage (private.bw_staff_can).
 */
export const STAFF_ROLES = ["admin", "editor", "moderator"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
/** Rôles dont l'administrateur peut affiner les droits (l'administrateur garde tout). */
export const TUNABLE_ROLES = ["editor", "moderator"] as const;
export type TunableRole = (typeof TUNABLE_ROLES)[number];

const editorial = new Set([
  "overview",
  "planning",
  "assign",
  "incidents",
  "watch",
  "commercial",
  "departures",
  "schedules",
  "import",
  "vessels",
  "ports",
  "routes",
  "companies",
  "companyRequests",
  "alerts",
  "data",
  "flash",
  "emails",
  "signals",
  "places",
  "illustrations",
  "library",
  "walletMedia",
  "health",
  "tickets",
]);
const moderation = new Set(["overview", "reviews", "community", "reports", "companyRequests"]);

/** Rubriques qu'on ne retire jamais : l'accueil de chacun. */
export const LOCKED_TABS: ReadonlySet<string> = new Set(["overview"]);
/**
 * Rubriques que l'administrateur ne peut pas ouvrir à un autre rôle : comptes, rôles, diffusion
 * aux voyageurs, données de référence. Identique à private.bw_admin_only_tabs() en base.
 */
export const ADMIN_ONLY_TABS: ReadonlySet<string> = new Set([
  "overview",
  "users",
  "roles",
  "notifications",
  "reference",
]);

export const ROLE_CATALOG: Record<
  StaffRole,
  {
    label: string;
    /** Ce que la personne fait, en une phrase. */
    summary: string;
    /** Rubrique ouverte à l'arrivée quand aucune n'est demandée (réglable pour éditeur et modérateur). */
    home: string;
    /** Le cadre du rôle : ce que la base de données lui permet. */
    tabs: ReadonlySet<string> | "all";
  }
> = {
  admin: {
    label: "Administrateur",
    summary: "Tout l'espace équipe, dont les comptes, les rôles et l'envoi de notifications.",
    home: "overview",
    tabs: "all",
  },
  editor: {
    label: "Éditeur",
    summary:
      "Le contenu : traversées, flotte, ports, liaisons, imports, illustrations et Flash info.",
    home: "overview",
    tabs: editorial,
  },
  moderator: {
    label: "Modérateur",
    summary: "Les contributions des voyageurs : avis, photos, signalements et erreurs signalées.",
    home: "overview",
    tabs: moderation,
  },
};

/**
 * Ce que chaque rubrique permet de faire, en verbes : c'est ce qui s'affiche dans le tableau
 * comparatif. Une rubrique sans entrée affiche sa description.
 */
export const TAB_ACTIONS: Record<string, string> = {
  overview: "Voir les chiffres du jour et les points à traiter",
  usage: "Lire la mesure d'usage sur 7 jours",
  health: "Surveiller le signal des navires et les fiches sans identifiant",
  planning: "Voir et corriger le planning de la semaine",
  departures: "Retrouver un départ, changer son heure, son navire ou son statut",
  schedules: "Créer et modifier les calendriers récurrents",
  commercial: "Tenir les programmes et sources officielles d'une compagnie",
  import: "Importer un fichier de saison et le publier",
  assign: "Régler l'affectation automatique des navires, annuler un passage",
  alerts: "Vérifier les anomalies du calendrier avant publication",
  vessels: "Ajouter, archiver, remplacer ou fusionner un navire",
  companies: "Modifier une fiche compagnie, fusionner ou supprimer",
  companyRequests: "Accepter ou refuser les demandes envoyées par les compagnies",
  ports: "Modifier un port : accès, infos pratiques, point sur la carte",
  routes: "Créer et modifier les liaisons",
  places: "Ajouter et corriger les lieux pratiques autour des ports",
  incidents: "Déclarer un navire immobilisé et préparer les messages",
  community: "Vérifier ou clore les signalements, modérer les avis navires",
  reviews: "Publier, masquer ou refuser les avis et les photos",
  reports: "Traiter les erreurs d'horaire ou de fiche signalées",
  tickets: "Lire les écarts relevés sur les billets",
  watch: "Approuver, refuser ou mettre en attente ce que la veille repère",
  flash: "Rédiger, publier et retirer un Flash info",
  emails: "Modifier les textes des e-mails, s'envoyer un essai",
  notifications: "Préparer, valider et diffuser une notification aux voyageurs",
  signals: "Modifier le catalogue « Que voyez-vous ? »",
  illustrations: "Remplacer ou renommer une illustration",
  library: "Ajouter des emojis et avatars, ranger les thématiques",
  walletMedia: "Choisir les photos des billets, enregistrer les voix",
  users: "Inviter, suspendre ou supprimer un compte, donner un rôle",
  roles: "Comparer les rôles et régler leurs droits",
  reference: "Approuver les vacances scolaires, consulats et lien hôtel",
  data: "Contrôler la cohérence des informations publiées",
};

/**
 * Réglage de l'administrateur, rôle par rôle : rubriques du cadre fermées, rubriques hors cadre
 * ouvertes en plus, page d'arrivée. Absent = cadre complet, arrivée sur l'accueil.
 */
export type RoleSetting = {
  removed: readonly string[];
  added: readonly string[];
  home: string | null;
};
export type RoleConfig = Partial<Record<TunableRole, RoleSetting>>;

/**
 * Vues externes envisagées, pas encore attribuables (aucune valeur en base) :
 * elles apparaissent seulement comme « à venir » dans le tableau des droits.
 */
export const FUTURE_ROLES = [
  {
    id: "company",
    label: "Compagnie",
    summary: "Une compagnie maritime tient à jour ses propres départs, navires et annonces.",
  },
  {
    id: "agency",
    label: "Agence",
    summary: "Une agence de voyages suit les traversées et les alertes de ses clients.",
  },
  {
    id: "partner",
    label: "Partenaire",
    summary: "Un partenaire (port, service, sponsor) gère sa fiche et ses lieux pratiques.",
  },
] as const;

export const isStaffRole = (role: string): role is StaffRole =>
  (STAFF_ROLES as readonly string[]).includes(role);
export const isTunableRole = (role: string): role is TunableRole =>
  (TUNABLE_ROLES as readonly string[]).includes(role);

/** La rubrique fait-elle partie du cadre du rôle (ce que la base lui permet) ? */
export function roleAllowsTab(role: StaffRole, tab: string) {
  const tabs = ROLE_CATALOG[role].tabs;
  return tabs === "all" || tabs.has(tab);
}

/** L'administrateur peut-il ouvrir cette rubrique en plus à ce rôle ? */
export function roleCanBeGranted(role: StaffRole, tab: string) {
  return isTunableRole(role) && !roleAllowsTab(role, tab) && !ADMIN_ONLY_TABS.has(tab);
}

/** Le rôle ouvre-t-il la rubrique, réglage de l'administrateur compris ? */
export function roleCanUseTab(role: StaffRole, tab: string, config?: RoleConfig) {
  if (!roleAllowsTab(role, tab))
    return (
      roleCanBeGranted(role, tab) && Boolean(config?.[role as TunableRole]?.added.includes(tab))
    );
  if (!isTunableRole(role) || LOCKED_TABS.has(tab)) return true;
  return !config?.[role]?.removed.includes(tab);
}

export function canUseAdminTab(roles: readonly string[], tab: string, config?: RoleConfig) {
  return roles.some((role) => isStaffRole(role) && roleCanUseTab(role, tab, config));
}

/** Rôles qui ouvrent une rubrique, du plus restreint au plus large (pour « réservée aux… »). */
export function rolesForTab(tab: string, config?: RoleConfig): StaffRole[] {
  return STAFF_ROLES.filter((role) => roleCanUseTab(role, tab, config)).reverse();
}

/** Rôles d'équipe d'un compte, dans l'ordre du catalogue. */
export function staffRoles(roles: readonly string[]): StaffRole[] {
  return STAFF_ROLES.filter((role) => roles.includes(role));
}

/** Page d'arrivée d'un rôle : son réglage s'il reste ouvert, sinon l'accueil. */
export function homeForRole(role: StaffRole, config?: RoleConfig) {
  const chosen = isTunableRole(role) ? config?.[role]?.home : null;
  return chosen && roleCanUseTab(role, chosen, config) ? chosen : ROLE_CATALOG[role].home;
}

/** Rubrique d'arrivée : celle du rôle le plus large. */
export function roleHome(roles: readonly string[], config?: RoleConfig) {
  const first = staffRoles(roles)[0];
  return first ? homeForRole(first, config) : "overview";
}
