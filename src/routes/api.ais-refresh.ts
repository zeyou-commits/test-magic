import { createFileRoute } from "@tanstack/react-router";

// GET /api/ais-refresh : écoute AIS ciblée, appelée par Supabase toutes les 10 minutes.
export const Route = createFileRoute("/api/ais-refresh")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
          return new Response("Unauthorized", { status: 401 });
        try {
          const { targetedRefresh } = await import("@/lib/tracking/refresh.server");
          return Response.json(await targetedRefresh(), {
            headers: { "cache-control": "no-store" },
          });
        } catch (error) {
          console.error("[ais-refresh]", error);
          return Response.json({ error: "Écoute AIS indisponible" }, { status: 500 });
        }
      },
    },
  },
});
