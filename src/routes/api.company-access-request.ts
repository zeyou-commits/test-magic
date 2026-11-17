import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/company-access-request")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const [{ supabaseAdmin }, { handleCompanyAccessRequest }] = await Promise.all([
            import("@/integrations/supabase/client.server"),
            import("@/lib/company/accessRequest.server"),
          ]);
          return await handleCompanyAccessRequest(request, supabaseAdmin);
        } catch {
          return Response.json(
            { error: "Le service des demandes d'accès est indisponible." },
            { status: 503, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
