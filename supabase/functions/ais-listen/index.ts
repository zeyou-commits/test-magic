// Écoute AIS longue : un navire à quai n'émet qu'environ toutes les 3 minutes. L'offre gratuite
// de Supabase coupe à 150 s, on garde donc de la marge pour enregistrer et répondre.
// Déploiement : le code partagé vit dans src/, à regrouper en un seul fichier avec esbuild :
//   npx esbuild supabase/functions/ais-listen/index.ts --bundle --format=esm --platform=neutral \
//     --external:npm:* --outfile=<dossier temporaire>/index.ts
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { listenToTargets } from "../../../src/lib/tracking/listen";

const LISTEN_MS = 130_000;

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

Deno.serve(async (request) => {
  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  ) as unknown as SupabaseClient;
  // Même secret que les autres tâches planifiées : il reste dans le coffre de la base.
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const { data: allowed } = await db.rpc("bw_cron_secret_ok", { p_token: token });
  if (allowed !== true) return new Response("Unauthorized", { status: 401 });
  try {
    return json(
      await listenToTargets(db, Deno.env.get("AISSTREAM_API_KEY") ?? "", LISTEN_MS, "supabase"),
    );
  } catch (error) {
    console.error("[ais-listen]", error);
    return json({ error: "Écoute AIS indisponible" }, 500);
  }
});
