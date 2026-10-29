import { createFileRoute } from "@tanstack/react-router";
import type { RatesResponse } from "@/lib/wallet/wallet";

export const Route = createFileRoute("/api/wallet-rates")({
  server: { handlers: {
    GET: async () => {
      const empty: RatesResponse = { rates: {}, checkedAt: null };
      try {
        const [{ supabaseAdmin }, { refreshRates }] = await Promise.all([
          import("@/integrations/supabase/client.server"),
          import("@/lib/wallet/rates.server"),
        ]);
        const db = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
        const { data } = await db.from("bw_fx_cache").select("rates,checked_at").eq("id", "latest").maybeSingle();
        let snapshot: RatesResponse = data ? { rates: data.rates ?? {}, checkedAt: data.checked_at ?? null } : empty;
        if (!snapshot.checkedAt || Date.now() - Date.parse(snapshot.checkedAt) >= 12 * 3600_000) {
          const claim = await db.rpc("bw_claim_fx_refresh");
          if (claim.data === true) {
            const next = await refreshRates(snapshot);
            if (next.checkedAt !== snapshot.checkedAt) {
              await db.from("bw_fx_cache").upsert({ id: "latest", rates: next.rates, checked_at: next.checkedAt });
              snapshot = next;
            }
          }
        }
        return Response.json(snapshot, { headers: { "cache-control": "public, max-age=300, s-maxage=300" } });
      } catch (error) {
        console.error("[wallet-rates]", error);
        return Response.json(empty, { headers: { "cache-control": "public, max-age=60" } });
      }
    },
  } },
});
