// Navires muets : la porte de l'agent de contrôle. Lire qui chercher, déposer des indices, rien d'autre.
// Un indice devient une note de la veille : il ne touche ni aux positions ni aux traversées.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  CHECK_UNTIL_MS,
  parseClue,
  silentChecks,
  type PlannedCrossing,
  type SilentVessel,
} from "./checks.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

/** Source interne, jamais lue par le collecteur : elle rattache les indices au circuit de la veille. */
const SOURCE_URL = "https://www.bledway.com/interne/navires-muets";
const MAX_CLUES = 10;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

async function stamp(db: SupabaseClient, value: Record<string, unknown>) {
  await db.from("bw_admin_settings").upsert({
    key: "watch_silent",
    value: { last_seen: new Date().toISOString(), ...value },
    updated_at: new Date().toISOString(),
  });
}

async function internalSource(db: SupabaseClient): Promise<string> {
  const { data, error } = await db
    .from("bw_watch_sources")
    .upsert(
      {
        name: "Navires muets (recherche web)",
        url: SOURCE_URL,
        kind: "rss",
        tier: "media",
        active: false,
      },
      { onConflict: "url" },
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "source");
  return (data as { id: string }).id;
}

async function currentChecks(db: SupabaseClient, sourceId: string, now: number) {
  const since = new Date(now - 3 * 86_400_000).toISOString();
  const until = new Date(now + CHECK_UNTIL_MS).toISOString();
  const [vessels, departures, routes, ports, positions, incidents, items] = await Promise.all([
    db.from("vessels").select("id,name,mmsi,imo,status"),
    db
      .from("departures")
      .select("id,route_id,vessel_id,departure_at,arrival_at,status")
      .gte("departure_at", since)
      .lte("departure_at", until),
    db.from("routes").select("id,departure_port_id,arrival_port_id"),
    db.from("ports").select("id,name"),
    db.from("vessel_positions").select("mmsi,reported_at"),
    db.from("bw_vessel_incidents").select("vessel_id").in("status", ["verifying", "confirmed"]),
    db.from("bw_watch_items").select("excerpt").eq("source_id", sourceId).gte("found_at", since),
  ]);
  for (const result of [vessels, departures, routes, ports, positions, incidents, items]) {
    if (result.error) throw new Error(result.error.message);
  }
  const portName = new Map(
    (ports.data ?? []).map((p: { id: string; name: string }) => [p.id, p.name]),
  );
  const route = new Map(
    (routes.data ?? []).map(
      (r: { id: string; departure_port_id: string; arrival_port_id: string }) => [r.id, r],
    ),
  );
  const crossings: PlannedCrossing[] = (departures.data ?? []).map(
    (d: Omit<PlannedCrossing, "from_port" | "to_port"> & { route_id: string }) => {
      const r = route.get(d.route_id);
      return {
        ...d,
        from_port: r ? (portName.get(r.departure_port_id) ?? null) : null,
        to_port: r ? (portName.get(r.arrival_port_id) ?? null) : null,
      };
    },
  );
  return silentChecks({
    vessels: (vessels.data ?? []) as SilentVessel[],
    crossings,
    signals: new Map(
      (positions.data ?? []).map((p: { mmsi: number; reported_at: string | null }) => [
        Number(p.mmsi),
        p.reported_at,
      ]),
    ),
    incidents: new Set((incidents.data ?? []).map((i: { vessel_id: string }) => i.vessel_id)),
    known: new Set((items.data ?? []).map((i: { excerpt: string | null }) => i.excerpt ?? "")),
    now,
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
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const now = Date.now();
  try {
    const sourceId = await internalSource(db);
    const checks = await currentChecks(db, sourceId, now);
    if (request.method === "GET") {
      await stamp(db, { pending: checks.length });
      return json({ checks });
    }

    let body: { clues?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "JSON invalide" }, 400);
    }
    const raw = Array.isArray(body.clues) ? body.clues.slice(0, MAX_CLUES) : [];
    const proposals: Record<string, unknown>[] = [];
    let refused = 0;
    for (const entry of raw) {
      const clue = parseClue(entry, checks, now);
      if (!clue) {
        refused += 1;
        continue;
      }
      // Déjà lu : l'analyse de la veille ne doit pas reprendre cette page comme un article.
      const { data: item, error } = await db
        .from("bw_watch_items")
        .upsert(
          {
            source_id: sourceId,
            url: clue.url,
            title: clue.title,
            excerpt: clue.key,
            published_at: clue.event_at,
            analyzed_at: new Date(now).toISOString(),
          },
          { onConflict: "url" },
        )
        .select("id")
        .single();
      if (error || !item) {
        refused += 1;
        continue;
      }
      proposals.push({
        item_id: (item as { id: string }).id,
        kind: "note",
        title: clue.title,
        summary: clue.summary,
        confidence: clue.confidence,
        vessel_id: clue.check.vessel_id,
        departure_id: clue.check.departure_id,
      });
    }
    const { data, error } = await db.rpc("bw_watch_propose", {
      p_proposals: proposals,
      p_analyzed: [],
    });
    if (error) throw new Error(error.message);
    const result = { ...(data as Record<string, unknown>), refused };
    await stamp(db, { pending: 0, ...result });
    return json(result);
  } catch (error) {
    console.error("[watch-silent]", error instanceof Error ? error.message : error);
    return json({ error: "Contrôle indisponible" }, 500);
  }
});
