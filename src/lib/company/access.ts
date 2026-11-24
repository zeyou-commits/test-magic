import { adminRequest } from "@/lib/admin/request";
import { tr } from "@/lib/i18n/translate";

/** Niveaux d'accès d'un collaborateur de compagnie (séparés des rôles d'équipe BledWay). */
export const COMPANY_LEVELS = ["read", "operations"] as const;
export type CompanyLevel = (typeof COMPANY_LEVELS)[number];

export const LEVEL_CATALOG: Record<CompanyLevel, { label: string; summary: string }> = {
  read: {
    get label() { return tr("ui.libCompanyAccess.lecture"); },
    get summary() { return tr("ui.libCompanyAccess.consulteLesTraverseesLaFlotte"); },
  },
  operations: {
    get label() { return tr("ui.libCompanyAccess.operations"); },
    get summary() { return tr("ui.libCompanyAccess.lecturePlusLesChangementsDe"); },
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
  audience: (userId: string, companyId: string) =>
    ["company-access", userId, "audience", companyId] as const,
  queue: (userId: string) => ["company-access", userId, "queue"] as const,
};

export const LOG_LABELS: Record<string, string> = {
  get company_invite_created() { return tr("ui.libCompanyAccess.invitationCreee"); },
  get company_invite_revoked() { return tr("ui.libCompanyAccess.invitationAnnulee"); },
  get company_invite_accepted() { return tr("ui.libCompanyAccess.invitationAcceptee"); },
  get company_invite_wrong_account() { return tr("ui.libCompanyAccess.lienOuvertDepuisUnAutre"); },
  get company_member_level() { return tr("ui.libCompanyAccess.niveauModifie"); },
  get company_member_suspend() { return tr("ui.libCompanyAccess.accesSuspendu"); },
  get company_member_resume() { return tr("ui.libCompanyAccess.accesReactive"); },
  get company_member_revoke() { return tr("ui.libCompanyAccess.accesRetire"); },
  get company_space_suspended() { return tr("ui.libCompanyAccess.espaceSuspendu"); },
  get company_space_active() { return tr("ui.libCompanyAccess.espaceReactive"); },
};

// ─── Lot 2 : changements de traversée et annonces, publiés par la compagnie ────────────────────────

export type RequestKind = "delay" | "cancel" | "vessel" | "time";
export type RequestStatus = "draft" | "submitted" | "applied" | "refused" | "stale" | "withdrawn";
export type AnnouncementReason = "delay" | "vessel_change" | "boarding" | "other";
export type AnnouncementStatus =
  "draft" | "submitted" | "approved" | "refused" | "stale" | "withdrawn";

export const REQUEST_KINDS: Record<RequestKind, { label: string; hint: string }> = {
  delay: {
    get label() { return tr("ui.libCompanyAccess.retard"); },
    get hint() { return tr("ui.libCompanyAccess.leDepartEtLArrivee"); },
  },
  time: {
    get label() { return tr("ui.libCompanyAccess.nouvelHoraire"); },
    get hint() { return tr("ui.libCompanyAccess.nouvelleHeureDeDepartEt"); },
  },
  vessel: {
    get label() { return tr("ui.libCompanyAccess.changementDeNavire"); },
    get hint() { return tr("ui.libCompanyAccess.unAutreNavireDeVotre"); },
  },
  cancel: { get label() { return tr("ui.libCompanyAccess.annulation"); }, get hint() { return tr("ui.libCompanyAccess.laTraverseeNAuraPas"); } },
};
export const REQUEST_STATUS: Record<RequestStatus, { label: string; tone?: string }> = {
  draft: { get label() { return tr("ui.libCompanyAccess.brouillon"); }, tone: "mute" },
  submitted: { get label() { return tr("ui.libCompanyAccess.enAttente"); }, tone: "warn" },
  applied: { get label() { return tr("ui.libCompanyAccess.appliquee"); } },
  refused: { get label() { return tr("ui.libCompanyAccess.refusee"); }, tone: "bad" },
  stale: { get label() { return tr("ui.libCompanyAccess.depassee"); }, tone: "mute" },
  withdrawn: { get label() { return tr("ui.libCompanyAccess.retiree"); }, tone: "mute" },
};
export const ANNOUNCEMENT_REASONS: Record<AnnouncementReason, string> = {
  get delay() { return tr("ui.libCompanyAccess.retard"); },
  get vessel_change() { return tr("ui.libCompanyAccess.changementDeNavire"); },
  get boarding() { return tr("ui.libCompanyAccess.consigneDEmbarquement"); },
  get other() { return tr("ui.libCompanyAccess.autreInformation"); },
};
export const ANNOUNCEMENT_STATUS: Record<AnnouncementStatus, { label: string; tone?: string }> = {
  draft: { get label() { return tr("ui.libCompanyAccess.brouillon"); }, tone: "mute" },
  submitted: { get label() { return tr("ui.libCompanyAccess.enAttente"); }, tone: "warn" },
  approved: { get label() { return tr("ui.libCompanyAccess.envoyee"); } },
  refused: { get label() { return tr("ui.libCompanyAccess.refusee"); }, tone: "bad" },
  stale: { get label() { return tr("ui.libCompanyAccess.depassee"); }, tone: "mute" },
  withdrawn: { get label() { return tr("ui.libCompanyAccess.retiree"); }, tone: "mute" },
};
/** État d'envoi d'une annonce validée (statut du message de l'équipe). */
export const DELIVERY_LABEL: Record<string, string> = {
  get scheduled() { return tr("ui.libCompanyAccess.envoiEnPreparation"); },
  get sending() { return tr("ui.libCompanyAccess.envoiEnCours"); },
  get sent() { return tr("ui.libCompanyAccess.envoyee"); },
  get failed() { return tr("ui.libCompanyAccess.envoiEnEchec"); },
  get cancelled() { return tr("ui.libCompanyAccess.envoiAnnule"); },
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
  get created() { return tr("ui.libCompanyAccess.creee"); },
  get edited() { return tr("ui.libCompanyAccess.modifiee"); },
  get submitted() { return tr("ui.libCompanyAccess.envoyeeABledway"); },
  get withdrawn() { return tr("ui.libCompanyAccess.retiree"); },
  // Depuis le 22/11/2026, « applied » et « sent » sont faits par la compagnie elle-même.
  get applied() { return tr("ui.libCompanyAccess.appliquee"); },
  get sent() { return tr("ui.libCompanyAccess.envoyeeAuxVoyageurs"); },
  get published() { return tr("ui.libCompanyAccess.publiee"); },
  get approved() { return tr("ui.libCompanyAccess.valideeParBledway"); },
  get refused() { return tr("ui.libCompanyAccess.refuseeParBledway"); },
  get stale() { return tr("ui.libCompanyAccess.depassee"); },
};

/**
 * Personnes qui suivent les traversées à venir (90 jours, hors annulées) : des chiffres calculés
 * par la base, sans aucun compte. Une personne suivant plusieurs traversées compte une fois.
 */
export interface CompanyAudience {
  total: number;
  /** Dont les personnes qui ont indiqué voyager (les autres suivent pour un proche). */
  travellers: number;
  departures: number;
  byDeparture: Record<string, number>;
}

/** Signature montrée aux voyageurs ; la base la calcule de la même façon. */
export const announcementTitle = (companyName: string) =>
  tr("ui.libCompanyAccess.informationDe", { companyName }).slice(0, 80);

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
  if (kind === "delay") return tr("ui.libCompanyAccess.retardDe", { formatMinutes: formatMinutes(proposed.minutes ?? 0) });
  if (kind === "cancel") return tr("ui.libCompanyAccess.annulation");
  if (kind === "vessel") return tr("ui.libCompanyAccess.navire", { vesselName: vesselName(proposed.vessel_id ?? null) });
  const start = proposed.departure_at ? timeLabel(proposed.departure_at) : "—";
  const end = proposed.arrival_at ? tr("ui.libCompanyAccess.arrivee", { timeLabel: timeLabel(proposed.arrival_at) }) : "";
  return tr("ui.libCompanyAccess.depart", { start, end });
}
