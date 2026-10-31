// Veille : la seule porte de Claude. Lire les articles à analyser, déposer des propositions, rien d'autre.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

async function stamp(db: SupabaseClient, value: Record<string, unknown>) {
  await db.from("bw_admin_settings").upsert({
    key: "watch_claude",
    value: { last_seen: new Date().toISOString(), ...value },
    updated_at: new Date().toISOString(),
  });
}

Deno.serve(async (request) => {
  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  ) as unknown as SupabaseClient;
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const { data: allowed } = await db.rpc("bw_watch_token_ok", { p_token: token });
  if (allowed !== true) return new Response("Unauthorized", { status: 401 });

  if (request.method === "GET") {
    const { data: items, error } = await db
      .from("bw_watch_items")
      .select("id,url,title,excerpt,published_at,bw_watch_sources(name,tier)")
      .is("analyzed_at", null)
      .order("found_at")
      .limit(15);
    if (error) return json({ error: "Articles illisibles" }, 500);
    if (!items?.length) {
      await stamp(db, { pending: 0 });
      return json({ items: [] });
    }
    const now = Date.now();
    const [departures, vessels, companies, routes, ports] = await Promise.all([
      db
        .from("departures")
        .select("id,route_id,company_id,vessel_id,departure_at,arrival_at,status")
        .gte("departure_at", new Date(now - 2 * 86_400_000).toISOString())
        .lte("departure_at", new Date(now + 30 * 86_400_000).toISOString())
        .order("departure_at"),
      db.from("vessels").select("id,name,status"),
      db.from("companies").select("id,name"),
      db.from("routes").select("id,departure_port_id,arrival_port_id"),
      db.from("ports").select("id,name"),
    ]);
    const portName = new Map((ports.data ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));
    const routeName = new Map(
      (routes.data ?? []).map(
        (r: { id: string; departure_port_id: string; arrival_port_id: string }) => [
          r.id,
          `${portName.get(r.departure_port_id)} → ${portName.get(r.arrival_port_id)}`,
        ],
      ),
    );
    await stamp(db, { pending: items.length });
    return json({
      items,
      vessels: vessels.data ?? [],
      companies: companies.data ?? [],
      departures: (departures.data ?? []).map((d: Record<string, unknown>) => ({
        ...d,
        route: routeName.get(d.route_id as string) ?? null,
        route_id: undefined,
      })),
    });
  }

  if (request.method === "POST") {
    let body: { proposals?: unknown; analyzed?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "JSON invalide" }, 400);
    }
    const { data, error } = await db.rpc("bw_watch_propose", {
      p_proposals: Array.isArray(body.proposals) ? body.proposals : [],
      p_analyzed: Array.isArray(body.analyzed) ? body.analyzed : [],
    });
    if (error) {
      console.error("[watch-api]", error.message);
      return json({ error: "Dépôt refusé" }, 400);
    }
    await stamp(db, { ...(data as Record<string, unknown>), pending: 0 });
    return json(data);
  }
  return new Response("Method not allowed", { status: 405 });
});
