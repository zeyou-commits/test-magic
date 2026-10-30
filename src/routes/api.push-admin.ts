import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  audienceSchema,
  BODY_MAX,
  catchUpUntil,
  templateIds,
  TITLE_MAX,
  type TemplateId,
} from "@/lib/notifications/messages";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("overview") }),
  // Diagnostic de l'envoi push, envoi immédiat de tout ce qui attend, notification de test.
  z.object({ action: z.literal("diagnose") }),
  z.object({ action: z.literal("dispatch") }),
  z.object({ action: z.literal("test") }),
  z.object({ action: z.literal("send"), campaignId: z.string().uuid() }),
  z.object({ action: z.literal("dismiss"), campaignId: z.string().uuid() }),
  // Messages de l'équipe : cible et nombre de destinataires, envoi ou planification, historique.
  z.object({ action: z.literal("message-preview"), audience: audienceSchema }),
  z.object({ action: z.literal("messages") }),
  z.object({ action: z.literal("message-recipients"), audience: audienceSchema }),
  z.object({
    action: z.literal("message-create"),
    audience: audienceSchema,
    template: z.enum(templateIds as [string, ...string[]]),
    title: z.string().trim().min(4).max(TITLE_MAX),
    body: z.string().trim().min(4).max(BODY_MAX),
    url: z
      .string()
      .regex(/^\/(?!\/)/)
      .max(300),
    sendAt: z.string().datetime().nullable(),
    flash: z.boolean(),
    catchUp: z.boolean().default(true),
    confirmCount: z.number().int().optional(),
    replaces: z.string().uuid().optional(),
  }),
  z.object({ action: z.literal("message-cancel"), id: z.string().uuid() }),
  // Ne plus envoyer un message aux nouveaux abonnés (l'information n'est plus d'actualité).
  z.object({ action: z.literal("message-stop"), id: z.string().uuid() }),
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
                serverKeys: Boolean(
                  env["VAPID_PUBLIC_KEY"] && env["VAPID_PRIVATE_KEY"] && env["VAPID_SUBJECT"],
                ),
                siteKey: Boolean(env["VITE_VAPID_PUBLIC_KEY"]),
                keysMatch:
                  !env["VITE_VAPID_PUBLIC_KEY"] || !env["VAPID_PUBLIC_KEY"]
                    ? null
                    : env["VITE_VAPID_PUBLIC_KEY"] === env["VAPID_PUBLIC_KEY"],
                cronSecret: Boolean(env["CRON_SECRET"]),
                scheduler: await db
                  .rpc("bw_push_scheduler_active")
                  .then(({ data, error }) => !error && data === true),
                catchUp: await db
                  .from("bw_admin_messages")
                  .select("valid_until")
                  .limit(1)
                  .then(({ error }) => !error),
                subscriptions: await count("bw_push_subscriptions"),
                mySubscriptions: await count("bw_push_subscriptions", {
                  column: "user_id",
                  op: "eq",
                  value: auth.user.id,
                }),
                pending: await count("bw_push_deliveries", {
                  column: "sent_at",
                  op: "is",
                  value: null,
                }),
                sent24h: await count("bw_push_deliveries", {
                  column: "sent_at",
                  op: "gte",
                  value: new Date(Date.now() - 24 * 3_600_000).toISOString(),
                }),
                errors: [
                  ...new Set((failures.data ?? []).map((row) => String(row.last_error))),
                ].slice(0, 5),
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
            return Response.json(await dispatchPush(), {
              headers: { "cache-control": "no-store" },
            });
          }
          if (action.action === "message-preview") {
            const { previewAudience } = await import("@/lib/notifications/messages.server");
            return Response.json(await previewAudience(action.audience), {
              headers: { "cache-control": "no-store" },
            });
          }
          if (action.action === "message-recipients") {
            const { listAudience } = await import("@/lib/notifications/messages.server");
            return Response.json(await listAudience(action.audience), {
              headers: { "cache-control": "no-store" },
            });
          }
          if (action.action === "message-stop") {
            const { error } = await db
              .from("bw_admin_messages")
              .update({
                valid_until: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", action.id);
            if (error) throw error;
            return Response.json({ stopped: true });
          }
          if (action.action === "messages") {
            const columns =
              "id,audience,audience_label,template,title,body,url,scheduled_at,status,recipients,last_error,created_at,sent_at,news_id";
            const list = (extra: string) =>
              db
                .from("bw_admin_messages")
                .select(columns + extra)
                .order("scheduled_at", { ascending: false })
                .limit(40);
            // Colonnes du rattrapage absentes tant que le script du 04/11 (13 h) n'est pas exécuté.
            let { data, error } = await list(",valid_until,late_recipients");
            if (error?.code === "42703") ({ data, error } = await list(""));
            if (error && ["PGRST205", "42P01"].includes(error.code))
              return Response.json({ messages: [], ready: false });
            if (error) throw error;
            return Response.json(
              { messages: data, ready: true },
              { headers: { "cache-control": "no-store" } },
            );
          }
          if (action.action === "message-cancel") {
            const { data, error } = await db
              .from("bw_admin_messages")
              .update({ status: "cancelled", updated_at: new Date().toISOString() })
              .eq("id", action.id)
              .eq("status", "scheduled")
              .select("news_id")
              .maybeSingle();
            if (error) throw error;
            if (!data)
              return Response.json(
                { error: "Ce message est déjà parti ou annulé." },
                { status: 409 },
              );
            // Le Flash info préparé avec le message disparaît avec lui.
            if (data.news_id)
              await db.from("bw_news").update({ published: false }).eq("id", data.news_id);
            return Response.json({ cancelled: true });
          }
          if (action.action === "message-create") {
            const { previewAudience } = await import("@/lib/notifications/messages.server");
            const preview = await previewAudience(action.audience);
            if (!preview.ready)
              return Response.json(
                {
                  error:
                    "Exécutez d’abord le script supabase/migrations/20261104120000_messages_admin.sql dans Supabase.",
                },
                { status: 409 },
              );
            if (!preview.reachable)
              return Response.json(
                { error: "Personne à prévenir pour cette cible." },
                { status: 409 },
              );
            if (action.audience.kind === "all" && action.confirmCount !== preview.reachable)
              return Response.json(
                {
                  error: `Le nombre de destinataires a changé (${preview.reachable}). Vérifiez et confirmez à nouveau.`,
                },
                { status: 409 },
              );
            const now = Date.now();
            const sendAt = action.sendAt ? Date.parse(action.sendAt) : null;
            if (sendAt !== null && (sendAt < now + 60_000 || sendAt > now + 60 * 86_400_000))
              return Response.json(
                { error: "Choisissez une heure d’envoi entre maintenant et 60 jours." },
                { status: 400 },
              );
            if (action.replaces) {
              const replaced = await db
                .from("bw_admin_messages")
                .update({ status: "cancelled", updated_at: new Date().toISOString() })
                .eq("id", action.replaces)
                .eq("status", "scheduled")
                .select("news_id")
                .maybeSingle();
              if (replaced.error) throw replaced.error;
              if (!replaced.data)
                return Response.json(
                  { error: "Le message d’origine est déjà parti : il ne peut plus être modifié." },
                  { status: 409 },
                );
              if (replaced.data.news_id)
                await db
                  .from("bw_news")
                  .update({ published: false })
                  .eq("id", replaced.data.news_id);
            }
            const startsAt = new Date(sendAt ?? now);
            let newsId: string | null = null;
            let flashSkipped = false;
            if (action.flash) {
              // Flash info visible de tous, rattaché à la ligne ou au port quand on les connaît.
              const routeIds: string[] = [];
              const portIds: string[] = [];
              if (action.audience.kind === "route") routeIds.push(action.audience.routeId);
              if (action.audience.kind === "port_day" || action.audience.kind === "port")
                portIds.push(action.audience.portId);
              if (action.audience.kind === "departure") {
                const departure = await db
                  .from("departures")
                  .select("route_id")
                  .eq("id", action.audience.departureId)
                  .maybeSingle();
                if (departure.data?.route_id) routeIds.push(departure.data.route_id as string);
              }
              const news = await db
                .from("bw_news")
                .insert({
                  kind:
                    action.template === "immobilized"
                      ? "alerte"
                      : ["delay", "cancel", "reschedule", "port_access", "port_closed"].includes(
                            action.template,
                          )
                        ? "perturbation"
                        : "info",
                  origin: "bledway",
                  title: action.title,
                  summary: action.body,
                  route_ids: routeIds,
                  port_ids: portIds,
                  starts_at: startsAt.toISOString(),
                  ends_at: new Date(startsAt.getTime() + 24 * 3_600_000).toISOString(),
                  published: true,
                  created_by: auth.user.id,
                })
                .select("id")
                .single();
              if (news.error) flashSkipped = true;
              else newsId = news.data.id as string;
            }
            const validUntil = action.catchUp
              ? catchUpUntil(
                  action.audience.kind,
                  action.template as TemplateId,
                  startsAt,
                  preview.relevantUntil,
                )
              : null;
            const row = {
              audience: action.audience,
              audience_label: preview.label.slice(0, 200),
              category: action.audience.kind === "all" ? "community" : "reminders",
              template: action.template,
              title: action.title,
              body: action.body,
              url: action.url,
              scheduled_at: startsAt.toISOString(),
              status: "scheduled",
              news_id: newsId,
              created_by: auth.user.id,
            };
            const insert = (values: Record<string, unknown>) =>
              db.from("bw_admin_messages").insert(values).select("id").single();
            let inserted = await insert({ ...row, valid_until: validUntil?.toISOString() ?? null });
            // Sans le script de rattrapage, le message part quand même (sans renvoi aux nouveaux).
            if (inserted.error?.code === "42703" || inserted.error?.code === "PGRST204")
              inserted = await insert(row);
            if (inserted.error) throw inserted.error;
            if (sendAt !== null)
              return Response.json({
                scheduled: true,
                at: startsAt.toISOString(),
                reachable: preview.reachable,
                schedulerActive: preview.schedulerActive,
                flashSkipped,
              });
            const { dispatchPush } = await import("@/lib/notifications/dispatch.server");
            const result = await dispatchPush({ messageId: inserted.data.id as string });
            return Response.json(
              { ...result, sent: true, reachable: preview.reachable, flashSkipped },
              { headers: { "cache-control": "no-store" } },
            );
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
