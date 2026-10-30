import { verifyAdminSession } from "./session.server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const target = {
  userId: z.string().uuid(),
  confirmation: z.string().trim().min(1).max(320),
  reason: z.string().trim().min(3).max(500),
};
export const usersActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("list"),
    search: z.string().trim().max(150).default(""),
    page: z.number().int().min(1).max(100000).default(1),
    filter: z.enum(["all", "team", "travellers", "banned"]).default("all"),
  }),
  z.object({ action: z.literal("invite"), email: z.string().trim().email().max(255) }),
  z.object({ action: z.literal("stats") }),
  z.object({ action: z.literal("audit") }),
  z.object({ action: z.literal("detail"), userId: z.string().uuid() }),
  z.object({ action: z.literal("export"), userId: z.string().uuid() }),
  z.object({
    action: z.literal("role"),
    ...target,
    role: z.enum(["admin", "editor", "moderator"]),
    enabled: z.boolean(),
  }),
  z.object({ action: z.literal("ban"), ...target, duration: z.enum(["24h", "168h", "876000h"]) }),
  z.object({ action: z.literal("unban"), ...target }),
  z.object({ action: z.literal("delete"), ...target }),
]);

// Le client privilégié n'est importé que par la route serveur. Paramètre injectable pour tester sans compte réel.
export async function handleUsersAdmin(request: Request, db: SupabaseClient<Database>) {
  const respond = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "cache-control": "no-store" } });
  const session = await verifyAdminSession(request, db);
  if (session.response) return session.response;
  const auth = { user: session.user! };
  const { data: role, error: roleError } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (roleError || !role) return respond({ error: "Accès réservé aux administrateurs." }, 403);
  const parsed = usersActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return respond({ error: "Formulaire incomplet ou action invalide." }, 400);
  const input = parsed.data;
  // Fonctions ajoutées par la migration ; aucune liste Auth ni clé privilégiée côté navigateur.
  const rpc = db.rpc.bind(db) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const page = await rpc("bw_admin_users_page", {
    _actor: auth.user.id,
    _search: input.action === "list" ? input.search : "",
    _page: input.action === "list" ? input.page : 1,
    _filter: input.action === "list" ? input.filter : "all",
  });
  if (page.error)
    return respond(
      {
        error:
          "Gestion des comptes indisponible : vérifiez la migration utilisateurs et votre session.",
      },
      503,
    );
  if (input.action === "list") return respond(page.data);
  // Lectures (chiffres, historique, fiche, export) : fonctions de la migration « utilisateurs ».
  if (
    input.action === "stats" ||
    input.action === "audit" ||
    input.action === "detail" ||
    input.action === "export"
  ) {
    const read =
      input.action === "stats"
        ? await rpc("bw_admin_users_stats", { _actor: auth.user.id })
        : input.action === "audit"
          ? await rpc("bw_admin_audit_page", { _actor: auth.user.id, _limit: 60 })
          : await rpc(input.action === "detail" ? "bw_admin_user_detail" : "bw_admin_user_export", {
              _actor: auth.user.id,
              _target: input.userId,
            });
    if (read.error)
      return respond(
        {
          error:
            "Information indisponible : exécutez le script SQL « utilisateurs » (supabase/migrations/20261110160000_utilisateurs.sql) dans Supabase.",
        },
        503,
      );
    if (input.action === "export") {
      await rpc("bw_admin_user_audit", {
        _actor: auth.user.id,
        _target: input.userId,
        _action: "export_completed",
        _details: {},
      });
    }
    return respond(read.data);
  }
  const audit = async (
    action: string,
    id: string | null,
    details: Record<string, unknown> = {},
  ) => {
    const result = await rpc("bw_admin_user_audit", {
      _actor: auth.user!.id,
      _target: id,
      _action: action,
      _details: details,
    });
    if (result.error) throw new Error("Le journal de contrôle est indisponible.");
  };
  try {
    if (input.action === "invite") {
      // Invitation sans privilège : le rôle est attribué séparément après création du compte.
      await audit("invitation_requested", null);
      const { data, error } = await db.auth.admin.inviteUserByEmail(input.email, {
        redirectTo: `${new URL(request.url).origin}/auth?mode=reset`,
      });
      if (error)
        return respond(
          {
            error:
              "Invitation impossible. Vérifiez si le compte existe déjà et la configuration des e-mails Supabase.",
          },
          409,
        );
      await audit("invitation_sent", data.user.id);
      return respond({ ok: true });
    }
    if (input.userId === auth.user.id)
      return respond(
        { error: "Vous ne pouvez pas modifier votre propre compte depuis cet écran." },
        409,
      );
    const { data: found, error: findError } = await db.auth.admin.getUserById(input.userId);
    if (findError || !found.user) return respond({ error: "Compte introuvable." }, 404);
    if (input.confirmation.toLowerCase() !== (found.user.email ?? found.user.id).toLowerCase())
      return respond({ error: "La confirmation ne correspond pas au compte sélectionné." }, 400);
    const { data: roles, error: rolesError } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", input.userId);
    if (rolesError) throw rolesError;
    if (
      (input.action === "ban" || input.action === "delete") &&
      roles?.some((r) => r.role === "admin")
    )
      return respond(
        {
          error:
            "Retirez d’abord le rôle administrateur de ce compte. Le dernier administrateur reste protégé.",
        },
        409,
      );
    await audit(`${input.action}_requested`, input.userId, { reason: input.reason });
    if (input.action === "role") {
      const result = await rpc("bw_admin_set_user_role", {
        _actor: auth.user.id,
        _target: input.userId,
        _role: input.role,
        _enabled: input.enabled,
      });
      if (result.error)
        return respond(
          {
            error:
              "Modification refusée : vérifiez que le compte est actif et qu’un autre administrateur actif restera en place.",
          },
          409,
        );
    } else if (input.action === "delete") {
      // Supabase refuse de supprimer un propriétaire d'objets Storage : retirer ses seuls avatars.
      const { data: files, error: filesError } = await db.storage
        .from("bledway-avatars")
        .list(input.userId, { limit: 1000 });
      if (filesError) throw filesError;
      if (files?.length) {
        const removed = await db.storage
          .from("bledway-avatars")
          .remove(files.map((f) => `${input.userId}/${f.name}`));
        if (removed.error) throw removed.error;
      }
      const result = await db.auth.admin.deleteUser(input.userId);
      if (result.error)
        return respond(
          {
            error:
              "Suppression non aboutie. Les avatars ont pu être retirés ; vérifiez les autres fichiers et dépendances du compte avant de réessayer.",
          },
          409,
        );
    } else {
      const result = await db.auth.admin.updateUserById(input.userId, {
        ban_duration: input.action === "ban" ? input.duration : "none",
      });
      if (result.error)
        return respond(
          { error: "Changement d’état refusé. Vérifiez les droits et les protections du compte." },
          409,
        );
    }
    await audit(
      `${input.action}_completed`,
      input.userId,
      input.action === "role" ? { role: input.role, enabled: input.enabled } : {},
    );
    return respond({ ok: true });
  } catch {
    return respond(
      {
        error:
          "Opération non confirmée. Rechargez la liste pour vérifier l’état du compte avant de réessayer.",
      },
      500,
    );
  }
}
