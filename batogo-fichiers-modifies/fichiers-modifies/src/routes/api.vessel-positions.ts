import { createFileRoute } from "@tanstack/react-router";

// GET /api/vessel-positions : positions des navires en cours de traversée (cache partagé de 20 min).
export const Route = createFileRoute("/api/vessel-positions")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { getPositions } = await import("@/lib/tracking/positions.server");
          const positions = await getPositions();
          return new Response(JSON.stringify({ positions }), {
            headers: {
              "content-type": "application/json; charset=utf-8",
              // Les navigateurs et le réseau de diffusion gardent la réponse 1 minute.
              "cache-control": "public, max-age=60, s-maxage=60",
            },
          });
        } catch (error) {
          console.error("[tracking] indisponible", error);
          // Le site continue de fonctionner sans le suivi : réponse vide, jamais d'erreur visible.
          return new Response(JSON.stringify({ positions: [] }), {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "public, max-age=30",
            },
          });
        }
      },
    },
  },
});
