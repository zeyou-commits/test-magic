import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TEAM_ROLES = ["admin", "editor", "moderator"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export interface TeamMember {
  id: string;
  email: string | null;
  displayName: string | null;
  roles: TeamRole[];
  createdAt: string;
  lastSignInAt: string | null;
  confirmed: boolean;
}

/** Vérifie côté serveur que l'appelant est administrateur (via sa propre session, RLS appliquée). */
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("Accès réservé aux administrateurs.");
}

export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: usersData, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw new Error(error.message);
    const [{ data: roles }, { data: profiles }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("profiles").select("id, display_name"),
    ]);
    const members: TeamMember[] = usersData.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      displayName: profiles?.find((p) => p.id === u.id)?.display_name ?? null,
      roles: (roles ?? [])
        .filter((r) => r.user_id === u.id && r.role !== "user")
        .map((r) => r.role as TeamRole),
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      confirmed: Boolean(u.email_confirmed_at),
    }));
    return members.sort((a, b) => b.roles.length - a.roles.length || a.createdAt.localeCompare(b.createdAt));
  });

export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(TEAM_ROLES),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId && data.role === "admin" && !data.enabled) {
      throw new Error("Vous ne pouvez pas retirer vos propres droits d'administrateur.");
    }
    // Écriture avec la session de l'admin : RLS + journal d'audit s'appliquent.
    if (data.enabled) {
      const { error } = await context.supabase
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        role: z.enum(TEAM_ROLES),
        redirectTo: z.string().url().max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: data.redirectTo,
    });
    if (error) {
      if (error.message.toLowerCase().includes("already")) {
        throw new Error("Un compte existe déjà : attribuez-lui le rôle depuis la liste.");
      }
      throw new Error(error.message);
    }
    const { error: roleError } = await context.supabase
      .from("user_roles")
      .upsert({ user_id: invited.user.id, role: data.role }, { onConflict: "user_id,role", ignoreDuplicates: true });
    if (roleError) throw new Error(roleError.message);
    return { ok: true };
  });
