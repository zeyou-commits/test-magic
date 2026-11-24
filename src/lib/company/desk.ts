/**
 * Lot 3 de l'espace compagnie, côté navigateur : réponses aux avis et aux signalements,
 * propositions de fiche, galeries photos et outils du responsable. Tout passe par
 * /api/company-access ; le serveur et la base revérifient chaque droit.
 */
import type { CompanyLevel, MemberStatus } from "./access";
import { tr } from "@/lib/i18n/translate";

export type ReplyTargetKind = "entity_review" | "vessel_review" | "alert";
export type ReplyKind = "reply" | "contest";
export type ReplyStatus =
  "submitted" | "published" | "acknowledged" | "refused" | "withdrawn" | "replaced" | "removed";

export interface FeedbackReview {
  kind: "entity_review" | "vessel_review";
  id: string;
  targetKind: "company" | "vessel";
  vesselId: string | null;
  vesselName: string | null;
  scores?: Record<string, number | null> | null;
  score?: number;
  comment: string | null;
  date: string;
}
export interface FeedbackAlert {
  kind: "alert";
  id: string;
  vesselId: string;
  vesselName: string;
  category: string;
  delayMinutes: number | null;
  detail: string | null;
  onSite: boolean | null;
  date: string;
  expiresAt: string;
  resolved: boolean;
  validated: boolean;
}
export interface CompanyReply {
  id: string;
  targetKind: ReplyTargetKind;
  targetId: string;
  kind: ReplyKind;
  body: string;
  status: ReplyStatus;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  author: string;
}
export interface CompanyFeedback {
  reviews: FeedbackReview[];
  alerts: FeedbackAlert[];
  replies: CompanyReply[];
}

export const REPLY_STATUS: Record<ReplyStatus, { label: string; tone?: string }> = {
  submitted: { get label() { return tr("ui.libCompanyDesk.enExamenParBledway"); }, tone: "warn" },
  published: { get label() { return tr("ui.libCompanyDesk.publiee"); } },
  acknowledged: { get label() { return tr("ui.libCompanyDesk.priseEnCompte"); } },
  refused: { get label() { return tr("ui.libCompanyDesk.refusee"); }, tone: "bad" },
  withdrawn: { get label() { return tr("ui.libCompanyDesk.retiree"); }, tone: "mute" },
  replaced: { get label() { return tr("ui.libCompanyDesk.remplacee"); }, tone: "mute" },
  removed: { get label() { return tr("ui.libCompanyDesk.retireeParBledway"); }, tone: "bad" },
};

/** Dernière réponse (ou contestation) utile pour un avis ou un signalement. */
export function latestReply(
  replies: CompanyReply[],
  targetId: string,
  kind: ReplyKind,
): CompanyReply | undefined {
  return replies.find(
    (reply) =>
      reply.targetId === targetId &&
      reply.kind === kind &&
      reply.status !== "withdrawn" &&
      reply.status !== "replaced",
  );
}

// ─── Fiche publique ──────────────────────────────────────────────────────────────────────────

export const PROFILE_FIELDS = [
  {
    key: "description",
    get label() { return tr("ui.libCompanyDesk.presentation"); },
    get hint() { return tr("ui.libCompanyDesk.quelquesPhrasesNeutresLignesDesservies"); },
  },
  { key: "website_url", get label() { return tr("ui.libCompanyDesk.siteOfficiel"); }, get hint() { return tr("ui.libCompanyDesk.adresseCompleteEnHttps"); } },
  { key: "booking_url", get label() { return tr("ui.libCompanyDesk.pageDeReservation"); }, get hint() { return tr("ui.libCompanyDesk.adresseCompleteEnHttps"); } },
  { key: "contact_url", get label() { return tr("ui.libCompanyDesk.pageDeContact"); }, get hint() { return tr("ui.libCompanyDesk.adresseCompleteEnHttps"); } },
  { key: "claims_url", get label() { return tr("ui.libCompanyDesk.reclamations"); }, get hint() { return tr("ui.libCompanyDesk.adresseCompleteEnHttps"); } },
  { key: "phone", get label() { return tr("ui.libCompanyDesk.telephoneVoyageurs"); }, get hint() { return tr("ui.libCompanyDesk.avecLIndicatifParExemple"); } },
  { key: "contact_email", get label() { return tr("ui.libCompanyDesk.eMailVoyageurs"); }, get hint() { return tr("ui.libCompanyDesk.adressePubliqueDeLaCompagnie"); } },
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number]["key"];
export type ProfileValues = Record<ProfileField, string | null>;

export type ProposalStatus = "submitted" | "applied" | "refused" | "stale" | "withdrawn";
export const PROPOSAL_STATUS: Record<ProposalStatus, { label: string; tone?: string }> = {
  submitted: { get label() { return tr("ui.libCompanyDesk.enAttente"); }, tone: "warn" },
  applied: { get label() { return tr("ui.libCompanyDesk.appliquee"); } },
  refused: { get label() { return tr("ui.libCompanyDesk.refusee"); }, tone: "bad" },
  stale: { get label() { return tr("ui.libCompanyDesk.depassee"); }, tone: "mute" },
  withdrawn: { get label() { return tr("ui.libCompanyDesk.retiree"); }, tone: "mute" },
};
export interface ProfileProposal {
  id: string;
  changes: Partial<Record<ProfileField, string>>;
  message: string | null;
  status: ProposalStatus;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

export type PhotoStatus = "pending" | "published" | "refused" | "withdrawn" | "removed";
export const PHOTO_STATUS: Record<PhotoStatus, { label: string; tone?: string }> = {
  pending: { get label() { return tr("ui.libCompanyDesk.enAttente"); }, tone: "warn" },
  published: { get label() { return tr("ui.libCompanyDesk.publiee"); } },
  refused: { get label() { return tr("ui.libCompanyDesk.refusee"); }, tone: "bad" },
  withdrawn: { get label() { return tr("ui.libCompanyDesk.retiree"); }, tone: "mute" },
  removed: { get label() { return tr("ui.libCompanyDesk.retireeParBledway"); }, tone: "bad" },
};
export interface CompanyPhoto {
  id: string;
  vesselId: string | null;
  vesselName: string | null;
  /** Absentes avant le script des galeries (22/11/2026) : « Autres », compagnie. */
  category?: string;
  source?: "company" | "team";
  caption: string;
  credit: string | null;
  status: PhotoStatus;
  /** Lien d'affichage : temporaire pour une photo en relecture. */
  url: string | null;
  width: number;
  height: number;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}
export interface CompanyProfile {
  fields: ProfileValues;
  proposals: ProfileProposal[];
  photos: CompanyPhoto[];
  fleet: { id: string; name: string }[];
}
/** Photos de la compagnie par galerie ; celles ajoutées par BledWay ne comptent pas. */
export const GALLERY_LIMIT = 24;

/** Contrôles du navigateur, identiques à ceux de la base (qui les refait). */
export function profileFieldError(key: ProfileField, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (key === "description") return v.length > 1000 ? tr("ui.libCompanyDesk.t1000CaracteresAuPlus") : null;
  if (key === "phone")
    return /^\+?[0-9 ().-]{6,40}$/.test(v) ? null : tr("ui.libCompanyDesk.chiffresEspacesEtSeulement");
  if (key === "contact_email")
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 255 ? null : tr("ui.libCompanyDesk.adresseIllisible");
  return /^https:\/\/[^\s/]+\.[^\s]+$/.test(v) && v.length <= 300
    ? null
    : tr("ui.libCompanyDesk.adresseCompleteEnHttpsAttendue");
}

// ─── Responsable de compagnie ────────────────────────────────────────────────────────────────

export interface ManagerOverview {
  members: {
    id: string;
    name: string;
    email: string;
    level: CompanyLevel;
    status: Exclude<MemberStatus, "revoked">;
    reason: string | null;
    manager: boolean;
    since: string;
    you: boolean;
  }[];
  invites: {
    id: string;
    email: string;
    level: CompanyLevel;
    expiresAt: string;
    createdAt: string;
  }[];
}

// ─── File de relecture de l'équipe BledWay ───────────────────────────────────────────────────

export interface QueueReply extends CompanyReply {
  companyId: string;
  companyName: string;
  targetStillThere: boolean | null;
  target: {
    scores?: Record<string, number | null> | null;
    score?: number;
    comment?: string | null;
    category?: string;
    delayMinutes?: number | null;
    detail?: string | null;
    vesselName?: string | null;
    date?: string | null;
    resolved?: boolean;
  } | null;
}
export interface QueueProfile extends ProfileProposal {
  companyId: string;
  companyName: string;
  snapshot: ProfileValues;
  current: ProfileValues;
  author: string;
}
export interface QueuePhoto extends CompanyPhoto {
  companyId: string;
  companyName: string;
  bytes: number;
  author: string;
}
export interface DeskQueue {
  replies: QueueReply[] | null;
  profiles: QueueProfile[] | null;
  photos: QueuePhoto[] | null;
  pending: { replies: number; profiles: number; photos: number };
}

/** Clés de cache isolées par compte (et par compagnie). */
export const deskKeys = {
  feedback: (userId: string, companyId: string) =>
    ["company-access", userId, "feedback", companyId] as const,
  profile: (userId: string, companyId: string) =>
    ["company-access", userId, "profile", companyId] as const,
  manager: (userId: string, companyId: string) =>
    ["company-access", userId, "manager", companyId] as const,
  queue: (userId: string) => ["company-access", userId, "desk-queue"] as const,
};

/** Lit un fichier (déjà préparé) en base64 sans préfixe, pour l'envoi au serveur. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
