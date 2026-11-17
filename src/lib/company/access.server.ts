import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { verifyAdminSession } from "@/lib/admin/session.server";
import type { Audience, AudiencePreview } from "@/lib/notifications/messages";

/**
 * Accès professionnels des compagnies : une seule entrée serveur pour les deux côtés.
 * - Collaborateur : « me », « team », « accept ».
 * - Équipe BledWay (administrateurs) : actions « admin_* ».
 * - Lot 2 : demandes de changement de traversée et annonces aux passagers, soumises par la
 *   compagnie (niveau Opérations) puis relues par BledWay (« queue », « *_decide »).
 * L'identité vient uniquement du jeton vérifié auprès de Supabase Auth ; un identifiant de
 * compte envoyé par le navigateur n'est jamais lu. La base refait tous les contrôles
 * (fonctions bw_company_*, exécutables seulement par le serveur).
 */
const uuid = z.string().uuid();
const level = z.enum(["read", "operations"]);
const reason = z.string().trim().max(500);
const isoDate = z.string().datetime({ offset: true });
/** Contenu d'une demande : la base ne garde que le champ du sujet choisi et revérifie tout. */
const proposed = z.object({
  minutes: z.number().int().min(5).max(1440).optional(),
  vessel_id: uuid.optional(),
  departure_at: isoDate.optional(),
  arrival_at: isoDate.nullable().optional(),
});
export const companyAccessSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("me") }),
  z.object({ action: z.literal("team"), companyId: uuid }),
  z.object({ action: z.literal("accept"), token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
  z.object({ action: z.literal("admin_overview"), companyId: uuid }),
  z.object({
    action: z.literal("admin_invite"),
    companyId: uuid,
    email: z.string().trim().toLowerCase().email().max(255),
    level,
    verification: z.string().trim().min(3).max(500),
  }),
  z.object({ action: z.literal("admin_invite_revoke"), inviteId: uuid, reason: reason.optional() }),
  z.object({
    action: z.literal("admin_member"),
    memberId: uuid,
    change: z.enum(["level", "suspend", "resume", "revoke"]),
    level: level.optional(),
    reason: reason.optional(),
  }),
  z.object({
    action: z.literal("admin_space"),
    companyId: uuid,
    status: z.enum(["active", "suspended"]),
    reason: reason.optional(),
  }),
  // Lot 2, côté compagnie.
  z.object({ action: z.literal("activity"), companyId: uuid }),
  z.object({
    action: z.literal("request_save"),
    requestId: uuid.optional(),
    departureId: uuid,
    kind: z.enum(["delay", "cancel", "vessel", "time"]),
    proposed,
    message: reason.optional(),
    urgent: z.boolean().default(false),
    submit: z.boolean().default(false),
  }),
  z.object({ action: z.literal("request_withdraw"), requestId: uuid }),
  z.object({ action: z.literal("announce_preview"), departureId: uuid }),
  z.object({
    action: z.literal("announce_save"),
    id: uuid.optional(),
    departureId: uuid,
    reason: z.enum(["delay", "vessel_change", "boarding", "other"]),
    body: z.string().trim().min(10).max(280),
    urgent: z.boolean().default(false),
    submit: z.boolean().default(false),
  }),
  z.object({ action: z.literal("announce_withdraw"), id: uuid }),
  // Lot 2, côté équipe BledWay.
  z.object({ action: z.literal("queue") }),
  z.object({ action: z.literal("announce_check"), id: uuid }),
  z.object({
    action: z.literal("request_decide"),
    requestId: uuid,
    decision: z.enum(["apply", "refuse"]),
    note: reason.optional(),
  }),
  z.object({
    action: z.literal("announce_decide"),
    id: uuid,
    decision: z.enum(["approve", "refuse"]),
    note: reason.optional(),
    /** Nombre de destinataires montré à la personne qui valide : il doit être encore exact. */
    confirmCount: z.number().int().min(0).optional(),
  }),
]);
export type CompanyAccessInput = z.infer<typeof companyAccessSchema>;

/** Codes renvoyés par la base, traduits en réponses compréhensibles. */
const FAILURES: Record<string, { status: number; error: string }> = {
  BW_FORBIDDEN: { status: 403, error: "Cette action ne vous est pas ouverte." },
  BW_NOT_FOUND: { status: 404, error: "Élément introuvable. Rechargez la page." },
  BW_INVALID: {
    status: 400,
    error: "Demande incomplète ou déjà appliquée. Vérifiez puis réessayez.",
  },
  BW_ALREADY_MEMBER: {
    status: 409,
    error: "Ce compte a déjà un accès à cette compagnie : modifiez-le dans la liste.",
  },
  BW_INVITE_CLOSED: { status: 409, error: "Cette invitation est déjà close." },
  BW_MEMBER_REVOKED: {
    status: 409,
    error: "Cet accès a été retiré. Pour le rouvrir, envoyez une nouvelle invitation.",
  },
  BW_DEPARTURE_PAST: { status: 409, error: "Cette traversée est déjà partie." },
  BW_DEPARTURE_CANCELLED: { status: 409, error: "Cette traversée est déjà annulée." },
  BW_LOCKED: {
    status: 409,
    error: "Cette demande a déjà été envoyée ou traitée : elle ne peut plus être modifiée.",
  },
  BW_DUPLICATE: {
    status: 409,
    error: "Une demande du même type attend déjà la relecture de BledWay pour cette traversée.",
  },
  BW_NO_AUDIENCE: {
    status: 409,
    error: "Personne ne suit cette traversée pour l'instant : aucun message ne peut partir.",
  },
};

/** Ciblage unique des annonces : les personnes qui suivent cette traversée, rien d'autre. */
export const announcementAudience = (departureId: string): Audience => ({
  kind: "departure",
  departureId,
  who: "everyone",
});

/** Calcul des destinataires et envoi : mécanisme des messages de l'équipe, injecté pour les tests. */
export type CompanyNotifier = {
  preview: (audience: Audience) => Promise<AudiencePreview>;
  dispatch: (messageId: string) => Promise<unknown>;
};
const defaultNotifier: CompanyNotifier = {
  preview: async (audience) =>
    (await import("@/lib/notifications/messages.server")).previewAudience(audience),
  dispatch: async (messageId) =>
    (await import("@/lib/notifications/dispatch.server")).dispatchPush({ messageId }),
};

/** Rôles d'équipe admis par action (premier filtre ; la base revérifie). */
const STAFF_ACTIONS: Partial<Record<string, Database["public"]["Enums"]["app_role"][]>> = {
  queue: ["admin", "editor"],
  request_decide: ["admin", "editor"],
  announce_check: ["admin"],
  announce_decide: ["admin"],
};

export const hashInviteToken = (token: string) => createHash("sha256").update(token).digest("hex");

type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function handleCompanyAccess(
  request: Request,
  db: SupabaseClient<Database>,
  newToken: () => string = () => randomBytes(32).toString("base64url"),
  notifier: CompanyNotifier = defaultNotifier,
) {
  const respond = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "cache-control": "no-store" } });
  const session = await verifyAdminSession(request, db);
  if (session.response) return session.response;
  const me = session.user!.id;
  const parsed = companyAccessSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return respond({ error: "Demande incomplète ou action inconnue." }, 400);
  const input = parsed.data;

  if (input.action.startsWith("admin_")) {
    // Premier filtre rapide ; la base vérifie de nouveau (administrateur au compte actif).
    const { data: role, error } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", me)
      .eq("role", "admin")
      .maybeSingle();
    if (error || !role) return respond({ error: "Accès réservé aux administrateurs." }, 403);
  }
  const staffRoles = STAFF_ACTIONS[input.action];
  if (staffRoles) {
    const { data: role, error } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", me)
      .in("role", staffRoles)
      .limit(1)
      .maybeSingle();
    if (error || !role)
      return respond(
        {
          error:
            input.action === "announce_decide" || input.action === "announce_check"
              ? "La validation des annonces est réservée aux administrateurs."
              : "Accès réservé à l'équipe BledWay.",
        },
        403,
      );
  }

  const rpc = db.rpc.bind(db) as unknown as Rpc;
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await rpc(name, args);
    if (!result.error) return { data: result.data, response: null };
    const code = Object.keys(FAILURES).find((key) => result.error!.message.includes(key));
    const failure = code ? FAILURES[code]! : null;
    return {
      data: null,
      response: failure
        ? respond({ error: failure.error, code }, failure.status)
        : respond(
            {
              error:
                "Service indisponible : vérifiez que les scripts « espace compagnie » ont été exécutés dans Supabase.",
              code: "COMPANY_ACCESS_UNAVAILABLE",
            },
            503,
          ),
    };
  };

  let result;
  switch (input.action) {
    case "me":
      result = await call("bw_company_my_access", { _user: me });
      break;
    case "team":
      result = await call("bw_company_team", { _user: me, _company: input.companyId });
      break;
    case "accept":
      result = await call("bw_company_invite_accept", {
        _user: me,
        _token_hash: hashInviteToken(input.token),
      });
      break;
    case "admin_overview":
      result = await call("bw_company_access_overview", { _actor: me, _company: input.companyId });
      break;
    case "admin_invite": {
      const token = newToken();
      result = await call("bw_company_invite_create", {
        _actor: me,
        _company: input.companyId,
        _email: input.email,
        _level: input.level,
        _token_hash: hashInviteToken(token),
        _verification: input.verification,
      });
      if (result.response) return result.response;
      // Le lien n'est montré qu'ici, une seule fois : seule son empreinte est gardée en base.
      return respond({
        ...(result.data as Record<string, unknown>),
        link: `${new URL(request.url).origin}/rejoindre-compagnie#code=${token}`,
      });
    }
    case "admin_invite_revoke":
      result = await call("bw_company_invite_revoke", {
        _actor: me,
        _invite: input.inviteId,
        _reason: input.reason ?? null,
      });
      break;
    case "admin_member":
      result = await call("bw_company_member_update", {
        _actor: me,
        _member: input.memberId,
        _change: input.change,
        _level: input.level ?? null,
        _reason: input.reason ?? null,
      });
      break;
    case "admin_space":
      result = await call("bw_company_space_set", {
        _actor: me,
        _company: input.companyId,
        _status: input.status,
        _reason: input.reason ?? null,
      });
      break;
    case "activity":
      result = await call("bw_company_activity", { _user: me, _company: input.companyId });
      break;
    case "request_save":
      result = await call("bw_company_request_save", {
        _user: me,
        _request: input.requestId ?? null,
        _departure: input.departureId,
        _kind: input.kind,
        _proposed: input.proposed,
        _message: input.message ?? null,
        _urgent: input.urgent,
        _submit: input.submit,
      });
      break;
    case "request_withdraw":
      result = await call("bw_company_request_withdraw", { _user: me, _request: input.requestId });
      break;
    case "announce_preview": {
      // Droit vérifié AVANT tout calcul : rien n'est révélé sur la traversée d'une autre compagnie.
      const check = await call("bw_company_departure_check", {
        _user: me,
        _departure: input.departureId,
        _min: "operations",
      });
      if (check.response) return check.response;
      const count = await reachableCount(input.departureId);
      if (count === null) return audienceUnavailable();
      return respond({ reachable: count });
    }
    case "announce_save": {
      let count: number | null = null;
      if (input.submit) {
        const check = await call("bw_company_departure_check", {
          _user: me,
          _departure: input.departureId,
          _min: "operations",
        });
        if (check.response) return check.response;
        // Le nombre est recalculé ici ; celui affiché dans le navigateur n'est jamais repris.
        count = await reachableCount(input.departureId);
        if (count === null) return audienceUnavailable();
      }
      result = await call("bw_company_announcement_save", {
        _user: me,
        _id: input.id ?? null,
        _departure: input.departureId,
        _reason: input.reason,
        _body: input.body,
        _urgent: input.urgent,
        _submit: input.submit,
        _preview_count: count,
      });
      break;
    }
    case "announce_withdraw":
      result = await call("bw_company_announcement_withdraw", { _user: me, _id: input.id });
      break;
    case "queue": {
      result = await call("bw_company_queue", { _actor: me });
      if (result.response) return result.response;
      const data = result.data as { announcements?: QueueAnnouncement[] } | null;
      if (data?.announcements) await addDeliveryStats(db, data.announcements);
      break;
    }
    case "announce_check": {
      // Nombre à montrer avant la validation ; il est recalculé et comparé au moment d'envoyer.
      const { data: row, error } = await (db as unknown as SupabaseClient)
        .from("bw_company_announcements")
        .select("departure_id")
        .eq("id", input.id)
        .maybeSingle();
      if (error) return audienceUnavailable();
      const departureId = (row as { departure_id: string | null } | null)?.departure_id;
      if (!row) return failure("BW_NOT_FOUND");
      if (!departureId) return respond({ reachable: 0, label: null });
      try {
        const preview = await notifier.preview(announcementAudience(departureId));
        return respond({ reachable: preview.reachable, label: preview.label });
      } catch {
        return audienceUnavailable();
      }
    }
    case "request_decide":
      result = await call("bw_company_request_decide", {
        _actor: me,
        _request: input.requestId,
        _decision: input.decision,
        _note: input.note ?? null,
      });
      break;
    case "announce_decide": {
      if (input.decision === "refuse") {
        result = await call("bw_company_announcement_refuse", {
          _actor: me,
          _id: input.id,
          _note: input.note ?? null,
        });
        break;
      }
      const loose = db as unknown as SupabaseClient;
      const { data: row, error } = await loose
        .from("bw_company_announcements")
        .select("departure_id,status,message_id")
        .eq("id", input.id)
        .maybeSingle();
      if (error) return audienceUnavailable();
      const found = row as {
        departure_id: string | null;
        status: string;
        message_id: string | null;
      } | null;
      if (!found) return failure("BW_NOT_FOUND");
      // Déjà validée : on renvoie le message existant, sans recalcul ni second envoi.
      if (found.status === "approved" && found.message_id)
        return respond({ messageId: found.message_id, already: true });
      if (found.status !== "submitted") return failure("BW_LOCKED");
      const departure = found.departure_id
        ? await loose
            .from("departures")
            .select("departure_at")
            .eq("id", found.departure_id)
            .maybeSingle()
        : { data: null, error: null };
      if (departure.error) return audienceUnavailable();
      const at = (departure.data as { departure_at: string } | null)?.departure_at;
      if (!found.departure_id || !at || new Date(at).getTime() <= Date.now()) {
        // Traversée passée ou supprimée : la base classe l'annonce « périmée », rien n'est envoyé.
        result = await call("bw_company_announcement_approve", {
          _actor: me,
          _id: input.id,
          _audience: { kind: "departure", departureId: found.departure_id },
          _label: null,
          _url: null,
          _valid_until: null,
        });
        break;
      }
      const audience = announcementAudience(found.departure_id);
      let preview: AudiencePreview;
      try {
        preview = await notifier.preview(audience);
      } catch {
        return audienceUnavailable();
      }
      if (preview.reachable < 1) return failure("BW_NO_AUDIENCE");
      if (input.confirmCount !== preview.reachable)
        return respond(
          {
            error: `Le nombre de destinataires a changé : ${preview.reachable} personne(s) à prévenir. Vérifiez puis confirmez de nouveau.`,
            code: "COUNT_CHANGED",
            reachable: preview.reachable,
          },
          409,
        );
      result = await call("bw_company_announcement_approve", {
        _actor: me,
        _id: input.id,
        _audience: audience,
        _label: preview.label,
        _url: preview.context.url,
        _valid_until: validUntil(preview),
      });
      if (result.response) return result.response;
      const approved = result.data as { messageId?: string; already?: boolean; stale?: boolean };
      if (approved.stale || !approved.messageId || approved.already) return respond(approved);
      // Envoi immédiat ; s'il échoue, l'envoi programmé reprend le message, resté « prévu ».
      let sentNow = true;
      try {
        await notifier.dispatch(approved.messageId);
      } catch {
        sentNow = false;
      }
      return respond({ ...approved, reachable: preview.reachable, sentNow });
    }
  }
  if (result.response) return result.response;
  return respond(result.data ?? { ok: true });

  function failure(code: string) {
    const known = FAILURES[code]!;
    return respond({ error: known.error, code }, known.status);
  }
  async function reachableCount(departureId: string) {
    try {
      return (await notifier.preview(announcementAudience(departureId))).reachable;
    } catch {
      return null;
    }
  }
  function audienceUnavailable() {
    return respond(
      {
        error: "Le calcul des destinataires est indisponible. Réessayez dans un instant.",
        code: "AUDIENCE_UNAVAILABLE",
      },
      503,
    );
  }
}

/** Fin de validité du message : comme les messages de l'équipe, au plus tard la fin de la traversée. */
function validUntil(preview: AudiencePreview) {
  const now = Date.now();
  const end = preview.relevantUntil
    ? new Date(preview.relevantUntil).getTime()
    : now + 48 * 3_600_000;
  return end > now ? new Date(end).toISOString() : null;
}

type QueueAnnouncement = {
  messageId?: string | null;
  inbox?: number | null;
  pushSent?: number | null;
  pushFailed?: number | null;
};
/**
 * Suivi d'envoi des annonces validées : messages déposés dans les comptes, notifications
 * téléphone parties ou en échec. Des comptages seulement ; une erreur laisse les cases vides.
 */
async function addDeliveryStats(db: SupabaseClient<Database>, items: QueueAnnouncement[]) {
  const loose = db as unknown as SupabaseClient;
  const pushes = (key: string) =>
    loose
      .from("bw_push_deliveries")
      .select("notification_id,bw_notifications!inner(event_key)", { count: "exact", head: true })
      .eq("bw_notifications.event_key", key);
  await Promise.all(
    items
      .filter((item) => item.messageId)
      .slice(0, 20)
      .map(async (item) => {
        const key = `admin-msg:reminders:${item.messageId}`;
        try {
          const [inbox, sent, failed] = await Promise.all([
            loose
              .from("bw_notifications")
              .select("id", { count: "exact", head: true })
              .eq("event_key", key),
            pushes(key).not("sent_at", "is", null),
            pushes(key).is("sent_at", null).not("last_error", "is", null),
          ]);
          item.inbox = inbox.error ? null : (inbox.count ?? 0);
          item.pushSent = sent.error ? null : (sent.count ?? 0);
          item.pushFailed = failed.error ? null : (failed.count ?? 0);
        } catch {
          item.inbox = item.pushSent = item.pushFailed = null;
        }
      }),
  );
}
