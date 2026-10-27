import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("overview") }),
  // Diagnostic de l'envoi push, envoi immédiat de tout ce qui attend, notification de test.
  z.object({ action: z.literal("diagnose") }),
  z.object({ action: z.literal("dispatch") }),
  z.object({ action: z.literal("test") }),
  z.object({ action: z.literal("send"), campaignId: z.string().uuid() }),
  z.object({ action: z.literal("dismiss"), campaignId: z.string().uuid() }),
]);
export const Route = createFileRoute("/api/push-admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const [{ supabaseAdmin: typedDb }, { verifyAdminSession }] = await Promise.all([
            import("@/integrations/supabase/client.server"),
            import("@/lib/admin/session.server"),
          ]);
          const db = typedDb as unknown as import("@supabase/supabase-js").SupabaseClient;
          const session = await verifyAdminSession(request, typedDb);
          if (session.response) return session.response;
          const auth = { user: session.user! };
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
          if (action.action === "diagnose") {
            const env = process.env;
            type Filter = { column: string; op: "eq" | "is" | "gte"; value: string | null };
            const count = async (table: string, filter?: Filter) => {
              const base = db.from(table).select("*", { count: "exact", head: true });
              const query = !filter
                ? base
                : filter.op === "eq"
                  ? base.eq(filter.column, filter.value)
                  : filter.op === "is"
                    ? base.is(filter.column, null)
                    : base.gte(filter.column, filter.value);
              const { count: total, error } = await query;
              return error ? null : (total ?? 0);
            };
            const failures = await db
              .from("bw_push_deliveries")
              .select("last_error")
              .is("sent_at", null)
              .not("last_error", "is", null)
              .limit(50);
            return Response.json(
              {
                // Clés VAPID côté serveur (envoi) et côté site (abonnement des téléphones).
                serverKeys: Boolean(env["VAPID_PUBLIC_KEY"] && env["VAPID_PRIVATE_KEY"] && env["VAPID_SUBJECT"]),
                siteKey: Boolean(env["VITE_VAPID_PUBLIC_KEY"]),
                keysMatch:
                  !env["VITE_VAPID_PUBLIC_KEY"] || !env["VAPID_PUBLIC_KEY"]
                    ? null
                    : env["VITE_VAPID_PUBLIC_KEY"] === env["VAPID_PUBLIC_KEY"],
                cronSecret: Boolean(env["CRON_SECRET"]),
                subscriptions: await count("bw_push_subscriptions"),
                mySubscriptions: await count("bw_push_subscriptions", {
                  column: "user_id",
                  op: "eq",
                  value: auth.user.id,
                }),
                pending: await count("bw_push_deliveries", { column: "sent_at", op: "is", value: null }),
                sent24h: await count("bw_push_deliveries", {
                  column: "sent_at",
                  op: "gte",
                  value: new Date(Date.now() - 24 * 3_600_000).toISOString(),
                }),
                errors: [...new Set((failures.data ?? []).map((row) => String(row.last_error)))].slice(0, 5),
              },
              { headers: { "cache-control": "no-store" } },
            );
          }
          if (action.action === "dispatch" || action.action === "test") {
            if (action.action === "test") {
              // Notification de test pour l'administrateur, mise en file sur ses téléphones abonnés.
              const notice = await db
                .from("bw_notifications")
                .insert({
                  user_id: auth.user.id,
                  event_key: `test:${Date.now()}`,
                  title: "Test BledWay",
                  body: "Si vous lisez ceci sur votre téléphone, les notifications fonctionnent.",
                  url: "/compte",
                })
                .select("id")
                .single();
              if (notice.error) throw notice.error;
              const devices = await db
                .from("bw_push_subscriptions")
                .select("id")
                .eq("user_id", auth.user.id);
              if (devices.error) throw devices.error;
              for (const device of devices.data ?? []) {
                const queued = await db
                  .from("bw_push_deliveries")
                  .insert({ notification_id: notice.data.id, subscription_id: device.id });
                if (queued.error) throw queued.error;
              }
            }
            const { dispatchPush } = await import("@/lib/notifications/dispatch.server");
            return Response.json(await dispatchPush(), { headers: { "cache-control": "no-store" } });
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
