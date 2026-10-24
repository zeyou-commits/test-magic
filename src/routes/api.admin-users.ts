import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/admin-users")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const [{ supabaseAdmin }, { handleUsersAdmin }] = await Promise.all([
            import("@/integrations/supabase/client.server"),
            import("@/lib/admin/users.server"),
          ]);
          return await handleUsersAdmin(request, supabaseAdmin);
        } catch {
          return Response.json(
            { error: "Le service de gestion des comptes est indisponible." },
            { status: 503, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
