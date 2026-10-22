import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("overview") }),
  z.object({ action: z.literal("send"), campaignId: z.string().uuid() }),
  z.object({ action: z.literal("dismiss"), campaignId: z.string().uuid() }),
]);
export const Route = createFileRoute("/api/push-admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
        if (!token) return Response.json({ error: "Connexion requise." }, { status: 401 });
        try {
          const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
          const { data: auth, error: authError } = await db.auth.getUser(token);
          if (authError || !auth.user)
            return Response.json({ error: "Session expirée." }, { status: 401 });
          const { data: role, error: roleError } = await db
            .from("user_roles")
            .select("role")
            .eq("user_id", auth.user.id)
            .eq("role", "admin")
            .maybeSingle();
          if (roleError || !role)
            return Response.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
          const parsed = actionSchema.safeParse(await request.json().catch(() => null));
          if (!parsed.success) return Response.json({ error: "Action invalide." }, { status: 400 });
          const action = parsed.data;
          if (action.action === "overview") {
            const { notificationOverview } = await import("@/lib/notifications/admin.server");
            return Response.json(await notificationOverview(), {
              headers: { "cache-control": "no-store" },
            });
          }
          if (action.action === "refresh") {
            const { data, error } = await db.rpc("bw_prepare_opening_campaigns", {});
            if (error) throw error;
            return Response.json({ prepared: data }, { headers: { "cache-control": "no-store" } });
          }
          const { data: campaign, error: readError } = await db
            .from("bw_notification_campaigns")
            .select("id,status")
            .eq("id", action.campaignId)
            .single();
          if (readError || !campaign)
            return Response.json({ error: "Campagne introuvable." }, { status: 404 });
          if (!["pending", "approved"].includes(campaign.status))
            return Response.json({ error: "Cette campagne est déjà traitée." }, { status: 409 });
          const { error } = await db
            .from("bw_notification_campaigns")
            .update(
              action.action === "dismiss"
                ? { status: "dismissed", updated_at: new Date().toISOString() }
                : {
                    status: "approved",
                    approved_by: auth.user.id,
                    approved_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    last_error: null,
                  },
            )
            .eq("id", campaign.id)
            .in("status", ["pending", "approved"]);
          if (error) throw error;
          if (action.action === "dismiss") return Response.json({ dismissed: true });
          const { dispatchPush } = await import("@/lib/notifications/dispatch.server");
          return Response.json(
            await dispatchPush({ openingCampaignId: campaign.id, onlyOpenings: true }),
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          console.error("[push-admin]", error);
          return Response.json(
            {
              error:
                "Traitement impossible. Vérifiez les migrations et les journaux serveur. Une campagne validée sera reprise par le traitement automatique.",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
