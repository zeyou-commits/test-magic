import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { adminRequest } from "@/lib/admin/request";

const uuid = z.string().uuid();
/** Qui prévenir : les comptes qui suivent la cible (voyageurs et proches), jamais une liste saisie à la main. */
export const audienceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("departure"),
    departureId: uuid,
    who: z.enum(["travellers", "everyone"]),
  }),
  z.object({ kind: z.literal("vessel"), vesselId: uuid }),
  // Seulement ceux qui suivent le bateau lui-même : les voyageurs sont prévenus date par date.
  z.object({ kind: z.literal("vessel_followers"), vesselId: uuid }),
  z.object({
    kind: z.literal("port_day"),
    portId: uuid,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  z.object({ kind: z.literal("route"), routeId: uuid }),
  // Un port sur toute la période à venir (fermeture, travaux) : départs et arrivées.
  z.object({ kind: z.literal("port"), portId: uuid }),
  z.object({ kind: z.literal("all") }),
]);
export type Audience = z.infer<typeof audienceSchema>;
export type AudienceKind = Audience["kind"];

/** Éléments connus de la cible, pour pré-remplir le message. */
export type AudienceContext = {
  subject: string;
  from?: string;
  to?: string;
  port?: string;
  vessel?: string;
  /** « le mar. 4 nov. à 19:00 », à l'heure du port de départ. */
  when?: string;
  url: string;
  urlLabel: string;
};
export type AudiencePreview = {
  label: string;
  context: AudienceContext;
  relevantUntil: string | null;
  /** Comptes concernés, puis ceux qui acceptent ce type de message, puis leurs téléphones. */
  accounts: number;
  reachable: number;
  devices: number;
  travellers: number | null;
  relatives: number | null;
  duplicates: { title: string; status: MessageStatus; at: string }[];
  schedulerActive: boolean;
  /** false tant que le script 20261104120000 n'est pas exécuté. */
  ready: boolean;
};
/** Un compte destinataire, pour vérifier qui sera prévenu. */
export type AudienceRecipient = {
  id: string;
  name: string;
  email: string;
  /** Pourquoi il est prévenu. */
  via: "traveller" | "relative" | "departure" | "vessel" | "watch" | "account";
  devices: number;
  /** A désactivé ce type de message : il ne recevra rien. */
  excluded: boolean;
};
export const audienceRecipientsQuery = (userId: string | undefined, audience: Audience | null) =>
  queryOptions({
    queryKey: ["admin", "message-recipients", userId, audience],
    enabled: Boolean(userId && audience),
    queryFn: () =>
      messageAction<{ recipients: AudienceRecipient[]; total: number }>({
        action: "message-recipients",
        audience,
      }),
    staleTime: 20_000,
    retry: false,
  });
export type MessageStatus = "scheduled" | "sending" | "sent" | "cancelled" | "failed";
export type AdminMessage = {
  id: string;
  audience: Audience;
  audience_label: string;
  template: TemplateId;
  title: string;
  body: string;
  url: string;
  scheduled_at: string;
  status: MessageStatus;
  recipients: number | null;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  news_id: string | null;
  /** Jusqu'à quand le message part aussi vers ceux qui rejoignent la cible ensuite. */
  valid_until?: string | null;
  late_recipients?: number | null;
};

export const TITLE_MAX = 80;
export const BODY_MAX = 300;
/** Au-delà, le téléphone coupe le texte de la notification repliée. */
export const TITLE_SHOWN = 50;
export const BODY_SHOWN = 120;

export type TemplateId =
  | "immobilized"
  | "delay"
  | "cancel"
  | "reschedule"
  | "port_access"
  | "port_closed"
  | "documents"
  | "free";
export const templateIds: TemplateId[] = [
  "immobilized",
  "delay",
  "cancel",
  "reschedule",
  "port_access",
  "port_closed",
  "documents",
  "free",
];
export const templateLabels: Record<TemplateId, string> = {
  immobilized: "Navire immobilisé",
  delay: "Retard",
  cancel: "Annulation",
  reschedule: "Nouvel horaire",
  port_access: "Accès au port",
  port_closed: "Port fermé",
  documents: "Rappel documents",
  free: "Message libre",
};
/**
 * Rattrapage : jusqu'à quand un message part aussi vers les nouveaux abonnés de la cible.
 * Traversée : jusqu'à 2 h après le départ. Port un jour : fin du jour. Bateau, ligne, port :
 * 48 h (7 jours pour un port fermé). Tout le monde : jamais (un nouveau compte n'est pas concerné).
 */
export function catchUpUntil(
  kind: AudienceKind,
  template: TemplateId | null,
  start: Date,
  relevantUntil: string | null,
): Date | null {
  if (kind === "all") return null;
  const end = relevantUntil
    ? new Date(relevantUntil)
    : new Date(start.getTime() + (template === "port_closed" ? 7 * 24 : 48) * 3_600_000);
  return end.getTime() > start.getTime() ? end : null;
}

/** Modèles qui méritent aussi un Flash info visible de tous. */
export const flashByDefault = new Set<TemplateId>([
  "immobilized",
  "delay",
  "cancel",
  "port_access",
  "port_closed",
]);

/** oldTime : l'ancien horaire, quand le départ vient d'être déplacé dans l'admin (« when » est alors le nouveau). */
export type TemplateFields = { minutes: string; newTime: string; oldTime: string };
export function templateText(
  template: TemplateId,
  context: AudienceContext,
  fields: TemplateFields,
): { title: string; body: string } {
  const subject = context.subject;
  const when = context.when ? ` ${context.when}` : "";
  const single = Boolean(context.when && context.from);
  switch (template) {
    case "immobilized":
      return {
        title: `${context.vessel ?? subject} · navire immobilisé`,
        body: `Le navire est annoncé immobilisé${when ? `, traversée prévue${when}` : ""}. Vérifiez votre réservation auprès de la compagnie avant de partir pour le port.`,
      };
    case "delay": {
      const minutes = Number(fields.minutes);
      const about =
        minutes > 0 ? ` d’environ ${minutes >= 60 ? hoursLabel(minutes) : `${minutes} min`}` : "";
      return {
        title: `${subject} · retard${about}`,
        body: single
          ? `Le départ prévu${when} est annoncé avec un retard${about}. Vérifiez auprès de la compagnie avant de partir pour le port.`
          : `Des retards${about} sont annoncés${when}. Vérifiez votre traversée auprès de la compagnie avant de partir pour le port.`,
      };
    }
    case "cancel":
      return {
        title: `${subject} · ${single ? "traversée annulée" : "traversées annulées"}`,
        body: single
          ? `La traversée prévue${when} est annulée. Contactez la compagnie pour un report ou un remboursement.`
          : `Des traversées sont annulées${when}. Vérifiez la vôtre et contactez la compagnie pour un report ou un remboursement.`,
      };
    case "reschedule": {
      const check = "Vérifiez votre billet auprès de la compagnie.";
      return {
        title: `${subject} · nouvel horaire`,
        body: !single
          ? `Des horaires changent${when}. ${check}`
          : fields.newTime
            ? `Le départ prévu${when} est déplacé à ${fields.newTime}. ${check}`
            : `Nouvel horaire : départ${when}${fields.oldTime ? ` (au lieu de ${fields.oldTime})` : ""}. ${check}`,
      };
    }
    case "port_access":
      return {
        title: `${context.port ?? subject} · accès au port perturbé`,
        body: `L’accès au port est perturbé${when}. Prévoyez de la marge et suivez les indications sur place.`,
      };
    case "port_closed":
      return {
        title: `${context.port ?? subject} · port fermé temporairement`,
        body: "Le port est fermé temporairement. Votre traversée peut être déplacée ou annulée : vérifiez auprès de la compagnie avant de partir.",
      };
    case "documents":
      return {
        title: `${subject} · vos documents`,
        body: "Avant de partir : billets, pièces d’identité, carte grise et assurance du véhicule. Présentez-vous en avance à l’enregistrement.",
      };
    default:
      return { title: "", body: "" };
  }
}
function hoursLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** Heures calmes (22 h – 7 h, heure de Paris) : un message non urgent attend le matin. */
export function inQuietHours(date: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("fr-FR", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Europe/Paris",
    })
      .format(date)
      .replace(/\D/g, ""),
  );
  return hour >= 22 || hour < 7;
}

export function messageAction<T>(input: Record<string, unknown>): Promise<T> {
  return adminRequest<T>("/api/push-admin", input);
}
export const adminMessagesQuery = (userId?: string) =>
  queryOptions({
    queryKey: ["admin", "messages", userId],
    enabled: Boolean(userId),
    queryFn: () =>
      messageAction<{ messages: AdminMessage[]; ready: boolean }>({ action: "messages" }),
    staleTime: 10_000,
    refetchInterval: 60_000,
    retry: false,
  });
export const audiencePreviewQuery = (userId: string | undefined, audience: Audience | null) =>
  queryOptions({
    queryKey: ["admin", "message-audience", userId, audience],
    enabled: Boolean(userId && audience),
    queryFn: () => messageAction<AudiencePreview>({ action: "message-preview", audience }),
    staleTime: 20_000,
    retry: false,
  });

/** « Prévenir les voyageurs » depuis une autre rubrique : le message à pré-remplir. */
export type MessagePrefill = {
  audience: Audience;
  template: TemplateId;
  fields?: Partial<TemplateFields>;
};
const PREFILL_KEY = "bledway:message-prefill";
export function storeMessagePrefill(prefill: MessagePrefill) {
  try {
    sessionStorage.setItem(PREFILL_KEY, JSON.stringify(prefill));
  } catch {
    // Stockage indisponible : l'admin choisira la cible lui-même.
  }
  window.dispatchEvent(new Event(PREFILL_KEY));
}
export function takeMessagePrefill(): MessagePrefill | null {
  try {
    const raw = sessionStorage.getItem(PREFILL_KEY);
    sessionStorage.removeItem(PREFILL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MessagePrefill;
    const audience = audienceSchema.safeParse(parsed.audience);
    return audience.success && templateIds.includes(parsed.template)
      ? { ...parsed, audience: audience.data }
      : null;
  } catch {
    return null;
  }
}
export const MESSAGE_PREFILL_EVENT = PREFILL_KEY;
