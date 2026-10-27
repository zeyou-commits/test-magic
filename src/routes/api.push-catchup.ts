import { createFileRoute } from "@tanstack/react-router";

// Un appel toutes les 15 secondes au plus par compte et par instance du serveur.
const lastCall = new Map<string, number>();

/**
 * Rattrapage d'un compte, appelé par le site juste après un suivi ou l'activation d'un téléphone :
 * ce qui est encore d'actualité pour ses suivis lui est envoyé sans attendre le passage automatique.
 * Le compte est vérifié par sa session ; seul ce compte est concerné.
 */
export const Route = createFileRoute("/api/push-catchup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const [{ supabaseAdmin }, { verifyAdminSession }] = await Promise.all([
            import("@/integrations/supabase/client.server"),
            import("@/lib/admin/session.server"),
          ]);
          // Vérifie seulement la session (pas de rôle admin requis).
          const session = await verifyAdminSession(request, supabaseAdmin);
          if (session.response) return session.response;
          const userId = session.user!.id;
          const now = Date.now();
          if (now - (lastCall.get(userId) ?? 0) < 15_000)
            return Response.json({ skipped: true }, { headers: { "cache-control": "no-store" } });
          lastCall.set(userId, now);
          const { dispatchPush } = await import("@/lib/notifications/dispatch.server");
          const result = await dispatchPush({ userId });
          return Response.json(
            { created: result.created, pushed: result.pushed },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          console.error("[push-catchup]", error);
          return Response.json({ error: "Rattrapage impossible." }, { status: 500 });
        }
      },
    },
  },
});
