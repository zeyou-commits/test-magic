import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Tables communautaires pas encore présentes dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;
import { communityKey, communityQuery } from "@/lib/ferry/community";
import { vesselsQuery, portsQuery } from "@/lib/ferry/queries";
import { Button } from "@/components/ui/button";
import { alertLabel, useSignalCatalog } from "@/lib/ferry/community";

export function CommunityModeration() {
  const { user } = useAuth();
  useSignalCatalog();
  const client = useQueryClient();
  const feed = useQuery(communityQuery(undefined, undefined, true, user?.id));
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const anomalies = useQuery({
    queryKey: ["admin", "report-anomalies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bw_report_anomalies")
        .select("id,vessel_id,departure_id,category,detail,reason,status,created_at")
        .eq("status", "pending").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as { id: string; vessel_id: string; departure_id: string | null; category: string; detail: string | null; reason: string; status: string; created_at: string }[];
    },
    retry: false,
  });
  const triage = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "handled" | "dismissed" }) => {
      const { error } = await supabase.from("bw_report_anomalies")
        .update({ status, handled_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["admin", "report-anomalies"] }),
  });
  const publish = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("bw_anomaly_publish", { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "report-anomalies"] });
      void client.invalidateQueries({ queryKey: communityKey });
    },
  });
  const action = useMutation({
    mutationFn: async (
      input:
        | { type: "review"; id: string; status: string }
        | { type: "alert"; id: string; verdict: "resolve" | "validate" },
    ) => {
      const { error } =
        input.type === "review"
          ? await supabase.rpc("bw_moderate_review", { p_review: input.id, p_status: input.status })
          : await supabase.rpc("bw_alert_action", { p_alert: input.id, p_action: input.verdict });
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
        <h2 className="mb-2 text-lg font-semibold">Observations à vérifier · {anomalies.data?.length ?? 0}</h2>
        <p className="mb-4 text-sm text-muted-foreground">Ces observations contredisent l’horaire ou la position connue. Elles ne sont ni publiées ni envoyées par notification.</p>
        {anomalies.isError ? <p role="alert">File indisponible : appliquez la migration des signalements par traversée.</p> : null}
        {anomalies.isPending ? <p>Chargement…</p> : null}
        {anomalies.data?.length === 0 ? <p>Aucune observation à vérifier.</p> : null}
        <ul className="space-y-3">
          {anomalies.data?.map((item) => (
            <li key={item.id} className="rounded-xl border bg-card p-4">
              <strong>{vessels.find((v) => v.id === item.vessel_id)?.name ?? "Bateau"} · {item.category}</strong>
              <p className="text-sm">{item.detail ? `${item.detail} · ` : ""}{item.reason}</p>
              <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString("fr-FR")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.departure_id ? <a className="text-sm underline" href={`/?select=departure&id=${item.departure_id}`}>Voir la traversée</a> : null}
                <Button size="sm" disabled={publish.isPending || !item.departure_id} onClick={() => publish.mutate(item.id)}>Valider et publier</Button>
                <Button size="sm" variant="outline" disabled={triage.isPending} onClick={() => triage.mutate({ id: item.id, status: "handled" })}>Traité</Button>
                <Button size="sm" variant="outline" disabled={triage.isPending} onClick={() => triage.mutate({ id: item.id, status: "dismissed" })}>Écarter</Button>
              </div>
            </li>
          ))}
        </ul>
        {triage.isError ? <p role="alert">La mise à jour a échoué.</p> : null}
        {publish.isError ? <p role="alert">{publish.error.message}</p> : null}
      </section>
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
                  {a.validated ? " · validé par l’équipe" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {a.validated ? null : (
                  <Button
                    size="sm"
                    disabled={action.isPending}
                    onClick={() => action.mutate({ type: "alert", id: a.id, verdict: "validate" })}
                  >
                    Valider
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ type: "alert", id: a.id, verdict: "resolve" })}
                >
                  Retirer
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {action.isError ? <p role="alert">{action.error.message}</p> : null}
    </div>
  );
}
