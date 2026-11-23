import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/company-access")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Le corps se lit une seule fois : une copie sert au second essai.
        const spare = request.clone();
        const run = async (req: Request) => {
          const [{ supabaseAdmin }, { handleCompanyAccess }] = await Promise.all([
            import("@/integrations/supabase/client.server"),
            import("@/lib/company/access.server"),
          ]);
          return handleCompanyAccess(req, supabaseAdmin);
        };
        try {
          return await run(request);
        } catch (first) {
          // Une coupure passagère (démarrage à froid, réseau vers Supabase) : on réessaie une fois,
          // et la cause est écrite dans les journaux de Vercel au lieu d'être perdue.
          console.error("[company-access] premier essai en échec", first);
          try {
            return await run(spare);
          } catch (second) {
            console.error("[company-access] second essai en échec", second);
            return Response.json(
              {
                error: "Le service des accès professionnels est indisponible.",
                code: "COMPANY_ACCESS_DOWN",
              },
              { status: 503, headers: { "cache-control": "no-store" } },
            );
          }
        }
      },
    },
  },
});
