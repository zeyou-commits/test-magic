import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Tables communautaires pas encore présentes dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;
import { communityKey, communityQuery } from "@/lib/ferry/community";
import { vesselsQuery, portsQuery } from "@/lib/ferry/queries";
import { Button } from "@/components/ui/button";
import { alertLabel } from "@/lib/ferry/community";

export function CommunityModeration() {
  const { user } = useAuth();
  const client = useQueryClient();
  const feed = useQuery(communityQuery(undefined, undefined, true, user?.id));
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const action = useMutation({
    mutationFn: async (
      input: { type: "review"; id: string; status: string } | { type: "alert"; id: string },
    ) => {
      const { error } =
        input.type === "review"
          ? await supabase.rpc("bw_moderate_review", { p_review: input.id, p_status: input.status })
          : await supabase.rpc("bw_alert_action", { p_alert: input.id, p_action: "resolve" });
      if (error) throw new Error("La modification a échoué. Vérifiez vos droits et réessayez.");
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: communityKey }),
  });
  if (feed.isPending) return <p role="status">Chargement de la communauté…</p>;
  if (feed.isError)
    return (
      <p role="alert">
        La communauté est indisponible.{" "}
        <button type="button" onClick={() => void feed.refetch()}>
          Réessayer
        </button>
      </p>
    );
  if (!feed.data)
    return (
      <p className="p-4 text-sm">
        Activez la migration 20261021120000_vessel_community.sql pour gérer les avis navires et les
        informations voyageurs.
      </p>
    );
  return (
    <div className="space-y-6 py-4">
      <section>
        <h2 className="text-lg font-semibold">Avis navires · modération</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Les contributions restent privées jusqu’à leur publication.
        </p>
        {!feed.data.reviews.length ? <p>Aucun avis reçu.</p> : null}
        <ul className="space-y-3">
          {feed.data.reviews.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <strong>
                  {vessels.find((v) => v.id === r.vessel_id)?.name ?? "Navire"} · {r.score}/5
                </strong>
                <span className="text-sm">
                  {r.status === "pending"
                    ? "À relire"
                    : r.status === "published"
                      ? "Publié"
                      : "Masqué"}
                </span>
              </div>
              <p className="my-3 whitespace-pre-wrap break-words text-sm">{r.comment}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={action.isPending || r.status === "published"}
                  onClick={() => action.mutate({ type: "review", id: r.id, status: "published" })}
                >
                  Publier
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action.isPending || r.status === "hidden"}
                  onClick={() => action.mutate({ type: "review", id: r.id, status: "hidden" })}
                >
                  Masquer
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Informations voyageurs actives</h2>
        {!feed.data.alerts.length ? <p>Aucun signalement actif.</p> : null}
        <ul className="space-y-3">
          {feed.data.alerts.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
            >
              <div>
                <strong>
                  {[...vessels, ...ports].find((e) => e.id === a.target_id)?.name ?? a.target_kind}
                </strong>
                <p className="text-sm">
                  {alertLabel(a)} · {1 + a.confirmations} voyageur(s)
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={action.isPending}
                onClick={() => action.mutate({ type: "alert", id: a.id })}
              >
                Retirer
              </Button>
            </li>
          ))}
        </ul>
      </section>
      {action.isError ? <p role="alert">{action.error.message}</p> : null}
    </div>
  );
}
