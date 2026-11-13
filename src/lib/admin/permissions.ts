/**
 * Catalogue des rôles de l'espace équipe : source unique du menu, du badge « Votre rôle »,
 * du tableau « Qui peut faire quoi » et des confirmations d'attribution.
 * La base applique les mêmes règles (private.bw_staff_permission, politiques RLS).
 */
export const STAFF_ROLES = ["admin", "editor", "moderator"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

const editorial = new Set([
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
  "alerts",
  "data",
  "flash",
  "signals",
  "places",
  "illustrations",
  "library",
  "walletMedia",
  "health",
  "tickets",
]);
const moderation = new Set(["reviews", "community", "reports"]);

export const ROLE_CATALOG: Record<
  StaffRole,
  {
    label: string;
    /** Ce que la personne fait, en une phrase. */
    summary: string;
    /** Rubrique ouverte à l'arrivée quand aucune n'est demandée. */
    home: string;
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
    home: "departures",
    tabs: editorial,
  },
  moderator: {
    label: "Modérateur",
    summary: "Les contributions des voyageurs : avis, photos, signalements et erreurs signalées.",
    home: "reviews",
    tabs: moderation,
  },
};

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

export function roleCanUseTab(role: StaffRole, tab: string) {
  const tabs = ROLE_CATALOG[role].tabs;
  return tabs === "all" || tabs.has(tab);
}

export function canUseAdminTab(roles: readonly string[], tab: string) {
  return roles.some((role) => isStaffRole(role) && roleCanUseTab(role, tab));
}

/** Rôles qui ouvrent une rubrique, du plus restreint au plus large (pour « réservée aux… »). */
export function rolesForTab(tab: string): StaffRole[] {
  return STAFF_ROLES.filter((role) => roleCanUseTab(role, tab)).reverse();
}

/** Rôles d'équipe d'un compte, dans l'ordre du catalogue. */
export function staffRoles(roles: readonly string[]): StaffRole[] {
  return STAFF_ROLES.filter((role) => roles.includes(role));
}

/** Rubrique d'arrivée : celle du rôle le plus large. */
export function roleHome(roles: readonly string[]) {
  const first = staffRoles(roles)[0];
  return first ? ROLE_CATALOG[first].home : "overview";
}
