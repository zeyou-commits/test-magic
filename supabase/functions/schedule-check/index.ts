// Vérification du planning : compare BledWay aux sources officielles et dépose des propositions
// dans la Veille de l'admin. Ne modifie jamais une traversée : l'équipe approuve ou refuse.
//   GET  (tâche planifiée, secret bledway_cron_secret) : Corsica Linea + capitaineries de Béjaïa et Annaba.
//   POST (agent compagnie, jeton de veille) : traversées relevées par un agent pour une compagnie ;
//        une source partielle ne propose jamais de retirer une traversée.
// Déploiement : le code partagé vit dans src/, à regrouper en un seul fichier avec esbuild :
//   npx esbuild supabase/functions/schedule-check/index.ts --bundle --format=esm --platform=neutral \
//     --external:npm:* --outfile=<dossier temporaire>/index.ts
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  compareSchedule,
  parseBerthed,
  parseCorsicaTimetable,
  portArrivals,
  portZone,
  type DepartureRow,
  type OfficialSailing,
  type PortRow,
  type Proposal,
  type RouteRow,
  type VesselRow,
} from "../../../src/lib/planning/officialSchedule";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const UA = "BledWay planning check (+https://www.bledway.com)";
const CORSICA_URL = "https://www.corsicalinea.com/infos-lignes-horaires/";
const BERTH_PAGES = [
  { port: "Béjaïa", url: "https://www.portdebejaia.dz/situation-des-navires/" },
  { port: "Annaba", url: "https://annaba-port.com/fr/situation-des-navires/quai" },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

async function page(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
  if (!response.ok) throw new Error(`${url} : HTTP ${response.status}`);
  return await response.text();
}

interface Reference {
  ports: PortRow[];
  routes: RouteRow[];
  vessels: VesselRow[];
  companies: { id: string; name: string }[];
}

async function reference(db: SupabaseClient): Promise<Reference> {
  const [ports, routes, vessels, companies] = await Promise.all([
    db.from("ports").select("id,name,country_code"),
    db.from("routes").select("id,departure_port_id,arrival_port_id"),
    db.from("vessels").select("id,name"),
    db.from("companies").select("id,name"),
  ]);
  return {
    ports: (ports.data ?? []) as PortRow[],
    routes: (routes.data ?? []) as RouteRow[],
    vessels: (vessels.data ?? []) as VesselRow[],
    companies: (companies.data ?? []) as { id: string; name: string }[],
  };
}

async function companyDepartures(db: SupabaseClient, companyId: string): Promise<DepartureRow[]> {
  const { data, error } = await db
    .from("departures")
    .select("id,route_id,vessel_id,departure_at,arrival_at,status")
    .eq("company_id", companyId)
    .gte("departure_at", new Date().toISOString())
    .order("departure_at")
    .limit(2000);
  if (error) throw new Error(`Traversées illisibles : ${error.message}`);
  return (data ?? []) as DepartureRow[];
}

async function deposit(
  db: SupabaseClient,
  source: { name: string; url: string },
  companyId: string | null,
  proposals: (Proposal | Record<string, unknown>)[],
  /** Source officielle complète : corrections, ajouts et arrivées constatées appliqués sans clic. */
  auto = false,
) {
  if (!proposals.length) return { inserted: 0, applied: 0, skipped: 0, known: 0 };
  const { data, error } = await db.rpc("bw_schedule_propose", {
    p_source_name: source.name,
    p_source_url: source.url,
    p_company: companyId,
    p_proposals: proposals,
    p_auto: auto,
  });
  if (error) throw new Error(`Dépôt refusé : ${error.message}`);
  return data as { inserted: number; applied: number; skipped: number; known: number };
}

async function checkCompany(
  db: SupabaseClient,
  ref: Reference,
  companyName: string,
  source: { name: string; url: string },
  sailings: OfficialSailing[],
  allowRemovals: boolean,
) {
  const company = ref.companies.find((c) => c.name.toLowerCase() === companyName.toLowerCase());
  if (!company) throw new Error(`Compagnie inconnue : ${companyName}`);
  const proposals = compareSchedule({
    companyName: company.name,
    sourceName: source.name,
    sailings,
    ports: ref.ports,
    routes: ref.routes,
    vessels: ref.vessels,
    departures: await companyDepartures(db, company.id),
    now: new Date(),
    allowRemovals,
  });
  return { found: proposals.length, ...(await deposit(db, source, company.id, proposals, allowRemovals)) };
}

async function checkBerths(db: SupabaseClient, ref: Reference) {
  const results: Record<string, unknown> = {};
  for (const { port, url } of BERTH_PAGES) {
    try {
      const row = ref.ports.find((p) => p.name === port);
      if (!row) continue;
      const berthed = parseBerthed(await page(url));
      const arrivalRoutes = ref.routes.filter((r) => r.arrival_port_id === row.id).map((r) => r.id);
      if (!arrivalRoutes.length) continue;
      const now = Date.now();
      const { data } = await db
        .from("departures")
        .select("id,vessel_id,arrival_at,web_arrived_at")
        .in("route_id", arrivalRoutes)
        .not("vessel_id", "is", null)
        .gte("arrival_at", new Date(now - 48 * 3_600_000).toISOString())
        .lte("arrival_at", new Date(now + 24 * 3_600_000).toISOString())
        .neq("status", "cancelled");
      const name = new Map(ref.vessels.map((v) => [v.id, v.name]));
      const expected = (data ?? []).map((d: Record<string, string | null>) => ({
        departure_id: d.id as string,
        vessel_id: d.vessel_id as string,
        vessel: name.get(d.vessel_id as string) ?? "",
        arrival_at: d.arrival_at as string,
        web_arrived_at: d.web_arrived_at,
      }));
      const found = portArrivals(port, portZone(row.country_code), berthed, expected).map((a) => ({
        kind: "crossing",
        field: "web_arrived_at",
        departure_id: a.departure_id,
        vessel_id: a.vessel_id,
        proposed_value: a.web_arrived_at,
        title: a.title,
        summary: a.summary,
      }));
      results[port] = {
        berthed: berthed.length,
        ...(await deposit(db, { name: `Capitainerie de ${port}`, url }, null, found, true)),
      };
    } catch (error) {
      results[port] = { error: (error as Error).message };
    }
  }
  return results;
}

Deno.serve(async (request) => {
  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  ) as unknown as SupabaseClient;
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");

  try {
    if (request.method === "GET") {
      const { data: allowed } = await db.rpc("bw_cron_secret_ok", { p_token: token });
      if (allowed !== true) return new Response("Unauthorized", { status: 401 });
      // ?scope=planning : une fois par jour (un planning ne bouge pas tous les jours, la veille et
      // l'AIS couvrent les imprévus). ?scope=ports : capitaineries, plusieurs fois par jour (jour J).
      const scope = new URL(request.url).searchParams.get("scope") ?? "all";
      const ref = await reference(db);
      const result: Record<string, unknown> = { scope };
      if (scope === "planning" || scope === "all") {
        try {
          result["Corsica Linea"] = await checkCompany(
            db,
            ref,
            "Corsica Linea",
            { name: "Planning officiel Corsica Linea", url: CORSICA_URL },
            parseCorsicaTimetable(await page(CORSICA_URL)),
            true,
          );
        } catch (error) {
          result["Corsica Linea"] = { error: (error as Error).message };
        }
      }
      if (scope === "ports" || scope === "all") result.ports = await checkBerths(db, ref);
      return json(result);
    }

    if (request.method === "POST") {
      const { data: allowed } = await db.rpc("bw_watch_token_ok", { p_token: token });
      if (allowed !== true) return new Response("Unauthorized", { status: 401 });
      const body = (await request.json().catch(() => null)) as {
        company?: string;
        source_name?: string;
        source_url?: string;
        sailings?: unknown;
      } | null;
      if (
        !body?.company ||
        !body.source_url?.startsWith("https://") ||
        !Array.isArray(body.sailings)
      ) {
        return json({ error: "Attendu : company, source_url (https), sailings[]" }, 400);
      }
      const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
      const sailings = (body.sailings as Record<string, unknown>[])
        .slice(0, 300)
        .filter(
          (s) =>
            typeof s.from === "string" &&
            typeof s.to === "string" &&
            local.test(String(s.departure_local)),
        )
        .map((s) => ({
          from: String(s.from),
          to: String(s.to),
          departureLocal: String(s.departure_local),
          arrivalLocal: local.test(String(s.arrival_local)) ? String(s.arrival_local) : null,
          vessel: typeof s.vessel === "string" && s.vessel.trim() ? s.vessel.trim() : null,
        }));
      const ref = await reference(db);
      return json(
        await checkCompany(
          db,
          ref,
          body.company,
          { name: (body.source_name ?? body.company).slice(0, 80), url: body.source_url },
          sailings,
          false,
        ),
      );
    }
    return new Response("Method not allowed", { status: 405 });
  } catch (error) {
    console.error("[schedule-check]", error);
    return json({ error: (error as Error).message }, 500);
  }
});
