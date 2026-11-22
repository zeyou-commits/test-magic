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
      "Lecture, plus les changements de traversée et les annonces aux passagers, publiés tout de suite.",
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
  /** Lot 3 : responsable de la compagnie (outils d'équipe). */
  manager?: boolean;
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
  activity: (userId: string, companyId: string) =>
    ["company-access", userId, "activity", companyId] as const,
  queue: (userId: string) => ["company-access", userId, "queue"] as const,
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

// ─── Lot 2 : changements de traversée et annonces, publiés par la compagnie ────────────────────────

export type RequestKind = "delay" | "cancel" | "vessel" | "time";
export type RequestStatus = "draft" | "submitted" | "applied" | "refused" | "stale" | "withdrawn";
export type AnnouncementReason = "delay" | "vessel_change" | "boarding" | "other";
export type AnnouncementStatus =
  "draft" | "submitted" | "approved" | "refused" | "stale" | "withdrawn";

export const REQUEST_KINDS: Record<RequestKind, { label: string; hint: string }> = {
  delay: {
    label: "Retard",
    hint: "Le départ et l'arrivée sont décalés du même nombre de minutes.",
  },
  time: {
    label: "Nouvel horaire",
    hint: "Nouvelle heure de départ, et d'arrivée si vous la connaissez.",
  },
  vessel: {
    label: "Changement de navire",
    hint: "Un autre navire de votre flotte assure la traversée.",
  },
  cancel: { label: "Annulation", hint: "La traversée n'aura pas lieu." },
};
export const REQUEST_STATUS: Record<RequestStatus, { label: string; tone?: string }> = {
  draft: { label: "Brouillon", tone: "mute" },
  submitted: { label: "En attente", tone: "warn" },
  applied: { label: "Appliquée" },
  refused: { label: "Refusée", tone: "bad" },
  stale: { label: "Dépassée", tone: "mute" },
  withdrawn: { label: "Retirée", tone: "mute" },
};
export const ANNOUNCEMENT_REASONS: Record<AnnouncementReason, string> = {
  delay: "Retard",
  vessel_change: "Changement de navire",
  boarding: "Consigne d'embarquement",
  other: "Autre information",
};
export const ANNOUNCEMENT_STATUS: Record<AnnouncementStatus, { label: string; tone?: string }> = {
  draft: { label: "Brouillon", tone: "mute" },
  submitted: { label: "En attente", tone: "warn" },
  approved: { label: "Envoyée" },
  refused: { label: "Refusée", tone: "bad" },
  stale: { label: "Dépassée", tone: "mute" },
  withdrawn: { label: "Retirée", tone: "mute" },
};
/** État d'envoi d'une annonce validée (statut du message de l'équipe). */
export const DELIVERY_LABEL: Record<string, string> = {
  scheduled: "Envoi en préparation",
  sending: "Envoi en cours",
  sent: "Envoyée",
  failed: "Envoi en échec",
  cancelled: "Envoi annulé",
};

export interface RequestProposal {
  minutes?: number;
  vessel_id?: string;
  departure_at?: string;
  arrival_at?: string | null;
}
export interface DepartureSnapshot {
  departure_at: string;
  arrival_at: string | null;
  vessel_id: string | null;
  status: string;
}
export interface CompanyRequest {
  id: string;
  departureId: string | null;
  kind: RequestKind;
  proposed: RequestProposal;
  message: string | null;
  urgent: boolean;
  status: RequestStatus;
  createdAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  departureAt: string | null;
  routeId: string | null;
  vesselId: string | null;
}
export interface CompanyAnnouncement {
  id: string;
  departureId: string | null;
  reason: AnnouncementReason;
  body: string;
  urgent: boolean;
  status: AnnouncementStatus;
  previewCount: number | null;
  createdAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  departureAt: string | null;
  routeId: string | null;
  delivery: string | null;
  recipients: number | null;
}
export interface CompanyActivity {
  requests: CompanyRequest[];
  announcements: CompanyAnnouncement[];
  events: {
    itemKind: "request" | "announcement";
    itemId: string;
    action: string;
    at: string;
    by: string;
  }[];
}

export interface QueueRequest {
  id: string;
  companyId: string;
  companyName: string;
  departureId: string | null;
  kind: RequestKind;
  proposed: RequestProposal;
  message: string | null;
  urgent: boolean;
  status: RequestStatus;
  snapshot: DepartureSnapshot | null;
  current: DepartureSnapshot | null;
  routeId: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  author: string | null;
  stale: boolean;
}
export interface QueueAnnouncement {
  id: string;
  companyId: string;
  companyName: string;
  departureId: string | null;
  reason: AnnouncementReason;
  body: string;
  urgent: boolean;
  status: AnnouncementStatus;
  previewCount: number | null;
  routeId: string | null;
  departureAt: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  author: string | null;
  messageId: string | null;
  delivery: string | null;
  recipients: number | null;
  lastError: string | null;
  stale: boolean;
  /** Comptages d'envoi ajoutés par le serveur (null si indisponibles). */
  inbox?: number | null;
  pushSent?: number | null;
  pushFailed?: number | null;
}
export interface CompanyQueue {
  requests: QueueRequest[];
  announcements: QueueAnnouncement[];
  pending: { requests: number; announcements: number; urgent: number };
}

export const EVENT_LABELS: Record<string, string> = {
  created: "Créée",
  edited: "Modifiée",
  submitted: "Envoyée à BledWay",
  withdrawn: "Retirée",
  // Depuis le 22/11/2026, « applied » et « sent » sont faits par la compagnie elle-même.
  applied: "Appliquée",
  sent: "Envoyée aux voyageurs",
  published: "Publiée",
  approved: "Validée par BledWay",
  refused: "Refusée par BledWay",
  stale: "Dépassée",
};

/** Signature montrée aux voyageurs ; la base la calcule de la même façon. */
export const announcementTitle = (companyName: string) =>
  `Information de ${companyName}`.slice(0, 80);

export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

/** Résumé lisible d'une demande : « Retard de 45 min », « Navire : … », « Départ … ». */
export function describeRequest(
  kind: RequestKind,
  proposed: RequestProposal,
  vesselName: (id: string | null) => string,
  timeLabel: (iso: string) => string,
): string {
  if (kind === "delay") return `Retard de ${formatMinutes(proposed.minutes ?? 0)}`;
  if (kind === "cancel") return "Annulation";
  if (kind === "vessel") return `Navire : ${vesselName(proposed.vessel_id ?? null)}`;
  const start = proposed.departure_at ? timeLabel(proposed.departure_at) : "—";
  const end = proposed.arrival_at ? `, arrivée ${timeLabel(proposed.arrival_at)}` : "";
  return `Départ ${start}${end}`;
}
