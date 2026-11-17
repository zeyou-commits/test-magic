import { adminRequest } from "@/lib/admin/request";

/** Niveaux d'accès d'un collaborateur de compagnie (séparés des rôles d'équipe BledWay). */
export const COMPANY_LEVELS = ["read", "operations"] as const;
export type CompanyLevel = (typeof COMPANY_LEVELS)[number];

export const LEVEL_CATALOG: Record<CompanyLevel, { label: string; summary: string }> = {
  read: {
    label: "Lecture",
    summary: "Consulte les traversées, la flotte, les avis et les signalements de la compagnie.",
  },
  operations: {
    label: "Opérations",
    summary:
      "Lecture, plus les demandes de modification et les annonces quand elles seront ouvertes (relues par BledWay).",
  },
};

export type MemberStatus = "active" | "suspended" | "revoked";
export type InviteState = "pending" | "accepted" | "revoked" | "expired";

/** Une compagnie à laquelle le compte connecté est rattaché. */
export interface MyCompanyAccess {
  companyId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  level: CompanyLevel;
  status: Exclude<MemberStatus, "revoked">;
  spaceStatus: "active" | "suspended";
  /** Calculé par la base : compte actif, accès actif, espace ouvert. */
  usable: boolean;
}

export interface TeamMate {
  name: string;
  level: CompanyLevel;
  since: string;
  you: boolean;
}

export interface AccessOverview {
  space: { status: "active" | "suspended"; reason: string | null; changedAt: string | null };
  members: {
    id: string;
    userId: string;
    email: string | null;
    name: string | null;
    level: CompanyLevel;
    status: MemberStatus;
    reason: string | null;
    grantedAt: string;
    grantedBy: string | null;
    statusChangedAt: string | null;
    lastSignInAt: string | null;
    accountActive: boolean;
  }[];
  invites: {
    id: string;
    email: string;
    level: CompanyLevel;
    verification: string;
    state: InviteState;
    expiresAt: string;
    createdAt: string;
    createdBy: string | null;
    acceptedAt: string | null;
    revokedAt: string | null;
    revokeReason: string | null;
  }[];
  log: {
    action: string;
    at: string;
    actor: string | null;
    target: string | null;
    level: string | null;
    reason: string | null;
  }[];
}

export type AcceptResult =
  | "accepted"
  | "already_accepted"
  | "already_member"
  | "not_found"
  | "used"
  | "revoked"
  | "expired"
  | "wrong_account"
  | "email_unconfirmed"
  | "account_inactive"
  | "suspended";

export const companyAccessRequest = <T>(input: Record<string, unknown>) =>
  adminRequest<T>("/api/company-access", input);

/** Clés de cache isolées par compte (et par compagnie) : rien ne survit à un changement de compte. */
export const companyAccessKeys = {
  me: (userId: string) => ["company-access", userId, "me"] as const,
  team: (userId: string, companyId: string) =>
    ["company-access", userId, "team", companyId] as const,
  overview: (userId: string, companyId: string) =>
    ["company-access", userId, "overview", companyId] as const,
};

export const LOG_LABELS: Record<string, string> = {
  company_invite_created: "Invitation créée",
  company_invite_revoked: "Invitation annulée",
  company_invite_accepted: "Invitation acceptée",
  company_invite_wrong_account: "Lien ouvert depuis un autre compte (refusé)",
  company_member_level: "Niveau modifié",
  company_member_suspend: "Accès suspendu",
  company_member_resume: "Accès réactivé",
  company_member_revoke: "Accès retiré",
  company_space_suspended: "Espace suspendu",
  company_space_active: "Espace réactivé",
};
