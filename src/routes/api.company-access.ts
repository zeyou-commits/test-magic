import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/company-access")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const [{ supabaseAdmin }, { handleCompanyAccess }] = await Promise.all([
            import("@/integrations/supabase/client.server"),
            import("@/lib/company/access.server"),
          ]);
          return await handleCompanyAccess(request, supabaseAdmin);
        } catch {
          return Response.json(
            { error: "Le service des accès professionnels est indisponible." },
            { status: 503, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
