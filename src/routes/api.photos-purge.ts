import { createFileRoute } from "@tanstack/react-router";

// GET /api/photos-purge : ménage de nuit des photos (fichiers supprimés ou jamais rattachés),
// appelé par Supabase avec la clé du coffre (script « photos »).
export const Route = createFileRoute("/api/photos-purge")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
          return new Response("Unauthorized", { status: 401 });
        try {
          const { purgePhotos } = await import("@/lib/photos/purge.server");
          return Response.json(await purgePhotos(), { headers: { "cache-control": "no-store" } });
        } catch (error) {
          console.error("[photos-purge]", error);
          return Response.json({ error: "Ménage des photos indisponible" }, { status: 500 });
        }
      },
    },
  },
});
