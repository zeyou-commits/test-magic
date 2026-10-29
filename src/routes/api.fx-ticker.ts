import { createFileRoute } from "@tanstack/react-router";
import { FX_OFFICIAL_URL, parseFxTicker } from "@/lib/fx/ticker";

// Relais du flux Square Algérie pour l'indicateur de la carte, complété du cours officiel de la
// Banque d'Algérie. Le cache CDN (15 min) fait qu'un seul appel part vers chaque source par quart
// d'heure, quel que soit le nombre de visiteurs.
const SOURCE = "https://squarealgerie.com/api/rates";

async function official() {
  try {
    const { fetchBankOfAlgeria } = await import("@/lib/fx/bankOfAlgeria.server");
    const html = await fetchBankOfAlgeria(FX_OFFICIAL_URL, 8000);
    // Premier tableau de la page : date de cotation en en-tête, puis « code | cours » par ligne.
    const day = html.match(/<th[^>]*>\s*(\d{2})-(\d{2})-(\d{4})\s*<\/th>/i);
    const table = html.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1] ?? "";
    const values: Record<string, number> = {};
    for (const row of table.matchAll(
      /<td[^>]*>\s*([A-Z]{3})\s*<\/td>\s*<td[^>]*>\s*([0-9]+(?:[.,][0-9]+)?)\s*<\/td>/gi,
    )) {
      values[row[1]!] = Number(row[2]!.replace(",", "."));
    }
    if (!day || !values["EUR"]) return null;
    return {
      date: `${day[3]}-${day[2]}-${day[1]}`,
      values: values as Record<string, number | undefined>,
    };
  } catch {
    return null; // le taux officiel est un plus : son absence ne masque pas l'indicateur
  }
}

export const Route = createFileRoute("/api/fx-ticker")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const [response, bank] = await Promise.all([
            fetch(SOURCE, {
              signal: AbortSignal.timeout(8000),
              headers: { accept: "application/json" },
            }),
            official(),
          ]);
          if (!response.ok) throw new Error(`Source indisponible (${response.status})`);
          const ticker = parseFxTicker(await response.json());
          if (!ticker) throw new Error("Flux de taux invalide");
          const body = bank
            ? {
                ...ticker,
                officialDate: bank.date,
                currencies: ticker.currencies.map((quote) =>
                  bank.values[quote.code] ? { ...quote, official: bank.values[quote.code] } : quote,
                ),
              }
            : ticker;
          return Response.json(body, {
            headers: {
              "cache-control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600",
            },
          });
        } catch (error) {
          console.error("[fx-ticker]", error);
          return Response.json(null, {
            status: 503,
            headers: { "cache-control": "public, max-age=60" },
          });
        }
      },
    },
  },
});
