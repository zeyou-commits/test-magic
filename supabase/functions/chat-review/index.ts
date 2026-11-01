// Salons : la porte de l'agent de modération. Lire les messages récents, en masquer, rien d'autre.
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

const MAX_ITEMS = 100;

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
    const { data, error } = await db
      .from("bw_chat_messages")
      .select("id,body")
      .is("reviewed_at", null)
      .is("hidden_at", null)
      .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString())
      .order("created_at")
      .limit(MAX_ITEMS);
    if (error) return json({ error: "Messages illisibles" }, 500);
    return json({ messages: data ?? [] });
  }

  if (request.method === "POST") {
    let body: { hide?: { id?: unknown; reason?: unknown }[]; reviewed?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "JSON invalide" }, 400);
    }
    const now = new Date().toISOString();
    let hidden = 0;
    for (const item of (Array.isArray(body.hide) ? body.hide : []).slice(0, MAX_ITEMS)) {
      if (typeof item?.id !== "string") continue;
      const reason = typeof item.reason === "string" ? item.reason.slice(0, 120) : "Modération";
      const { data } = await db
        .from("bw_chat_messages")
        .update({ hidden_at: now, hidden_reason: reason, reviewed_at: now })
        .eq("id", item.id)
        .is("hidden_at", null)
        .select("user_id")
        .maybeSingle();
      if (!data) continue;
      hidden += 1;
      await db
        .from("bw_chat_strikes")
        .insert({ user_id: (data as { user_id: string }).user_id, reason: "agent" });
    }
    const reviewed = (Array.isArray(body.reviewed) ? body.reviewed : [])
      .filter((id): id is string => typeof id === "string")
      .slice(0, MAX_ITEMS);
    if (reviewed.length) {
      await db.from("bw_chat_messages").update({ reviewed_at: now }).in("id", reviewed);
    }
    return json({ hidden, reviewed: reviewed.length });
  }
  return new Response("Method not allowed", { status: 405 });
});
