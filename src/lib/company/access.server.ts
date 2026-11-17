import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { verifyAdminSession } from "@/lib/admin/session.server";

/**
 * Accès professionnels des compagnies : une seule entrée serveur pour les deux côtés.
 * - Collaborateur : « me », « team », « accept ».
 * - Équipe BledWay (administrateurs) : actions « admin_* ».
 * L'identité vient uniquement du jeton vérifié auprès de Supabase Auth ; un identifiant de
 * compte envoyé par le navigateur n'est jamais lu. La base refait tous les contrôles
 * (fonctions bw_company_*, exécutables seulement par le serveur).
 */
const uuid = z.string().uuid();
const level = z.enum(["read", "operations"]);
const reason = z.string().trim().max(500);
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
                "Service indisponible : vérifiez que le script « espace compagnie, accès » a été exécuté dans Supabase.",
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
  }
  if (result.response) return result.response;
  return respond(result.data ?? { ok: true });
}
