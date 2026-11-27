import { QueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { companiesQuery, portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { llmsText, type LlmsData } from "@/lib/seo/llms";

async function readData(): Promise<LlmsData | null> {
  try {
    const client = new QueryClient();
    const [ports, routes, companies, vessels] = await Promise.all([
      client.fetchQuery(portsQuery),
      client.fetchQuery(routesQuery),
      client.fetchQuery(companiesQuery),
      client.fetchQuery(vesselsQuery).catch(() => []),
    ]);
    return { ports, routes, companies, vessels };
  } catch {
    // Sans la base, le sommaire éditorial reste disponible.
    return null;
  }
}

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async () => {
        const data = await readData();
        return new Response(llmsText(data), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": data ? "public, max-age=3600" : "no-store",
          },
        });
      },
    },
  },
});
