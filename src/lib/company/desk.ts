/**
 * Lot 3 de l'espace compagnie, côté navigateur : réponses aux avis et aux signalements,
 * propositions de fiche, galeries photos et outils du responsable. Tout passe par
 * /api/company-access ; le serveur et la base revérifient chaque droit.
 */
import type { CompanyLevel, MemberStatus } from "./access";

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
  submitted: { label: "En relecture", tone: "warn" },
  published: { label: "Publiée" },
  acknowledged: { label: "Prise en compte" },
  refused: { label: "Refusée", tone: "bad" },
  withdrawn: { label: "Retirée", tone: "mute" },
  replaced: { label: "Remplacée", tone: "mute" },
  removed: { label: "Retirée par BledWay", tone: "bad" },
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
    label: "Présentation",
    hint: "Quelques phrases neutres : lignes desservies, services. 1 000 caractères au plus.",
  },
  { key: "website_url", label: "Site officiel", hint: "Adresse complète en https://" },
  { key: "booking_url", label: "Page de réservation", hint: "Adresse complète en https://" },
  { key: "contact_url", label: "Page de contact", hint: "Adresse complète en https://" },
  { key: "claims_url", label: "Réclamations", hint: "Adresse complète en https://" },
  { key: "phone", label: "Téléphone voyageurs", hint: "Avec l'indicatif, par exemple +33 4 …" },
  { key: "contact_email", label: "E-mail voyageurs", hint: "Adresse publique de la compagnie" },
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number]["key"];
export type ProfileValues = Record<ProfileField, string | null>;

export type ProposalStatus = "submitted" | "applied" | "refused" | "stale" | "withdrawn";
export const PROPOSAL_STATUS: Record<ProposalStatus, { label: string; tone?: string }> = {
  submitted: { label: "En relecture", tone: "warn" },
  applied: { label: "Appliquée" },
  refused: { label: "Refusée", tone: "bad" },
  stale: { label: "Dépassée", tone: "mute" },
  withdrawn: { label: "Retirée", tone: "mute" },
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
  pending: { label: "En relecture", tone: "warn" },
  published: { label: "Publiée" },
  refused: { label: "Refusée", tone: "bad" },
  withdrawn: { label: "Retirée", tone: "mute" },
  removed: { label: "Retirée par BledWay", tone: "bad" },
};
export interface CompanyPhoto {
  id: string;
  vesselId: string | null;
  vesselName: string | null;
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
export const GALLERY_LIMIT = 12;

/** Contrôles du navigateur, identiques à ceux de la base (qui les refait). */
export function profileFieldError(key: ProfileField, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (key === "description") return v.length > 1000 ? "1 000 caractères au plus." : null;
  if (key === "phone")
    return /^\+?[0-9 ().-]{6,40}$/.test(v) ? null : "Chiffres, espaces et + seulement.";
  if (key === "contact_email")
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 255 ? null : "Adresse illisible.";
  return /^https:\/\/[^\s/]+\.[^\s]+$/.test(v) && v.length <= 300
    ? null
    : "Adresse complète en https:// attendue.";
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
