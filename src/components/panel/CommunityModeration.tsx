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
import { ReviewAuthor, useReviewAuthors } from "@/components/admin/ReviewAuthor";
import { tr } from "@/lib/i18n";
import { ObservationCard, ObservationHistory, useObservationContext, type Observation } from "@/components/admin/ObservationReview";

export function CommunityModeration() {
  const { user } = useAuth();
  useSignalCatalog();
  const client = useQueryClient();
  const feed = useQuery(communityQuery(undefined, undefined, true, user?.id));
  const vesselAuthors = useReviewAuthors(
    "vessel_review",
    (feed.data?.reviews ?? []).map((review) => review.id),
  );
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const anomalies = useQuery({
    queryKey: ["admin", "report-anomalies"],
    queryFn: async () => {
      const read = (columns: string) =>
        supabase.from("bw_report_anomalies").select(columns)
          .eq("status", "pending").order("created_at", { ascending: false }).limit(100);
      const base = "id,user_id,vessel_id,departure_id,category,detail,delay_minutes,reason,status,created_at";
      let { data, error } = await read(`${base},port_id`);
      if (error) ({ data, error } = await read(base));
      if (error) throw error;
      return data as unknown as Observation[];
    },
    retry: false,
  });
  // Trace : les dernières décisions (qui, quand, laquelle) ; colonnes ajoutées par le script du 02/01/2027.
  const decided = useQuery({
    queryKey: ["admin", "report-anomalies", "decided"],
    queryFn: async () => {
      const read = (columns: string) =>
        supabase.from("bw_report_anomalies").select(columns)
          .neq("status", "pending").order("handled_at", { ascending: false, nullsFirst: false }).limit(15);
      const base = "id,user_id,vessel_id,port_id,departure_id,category,detail,delay_minutes,reason,status,created_at,handled_at";
      let { data, error } = await read(`${base},handled_by,decision`);
      if (error) ({ data, error } = await read(base));
      if (error) throw error;
      return data as unknown as Observation[];
    },
    retry: false,
  });
  const pendingIds = (anomalies.data ?? []).map((item) => item.id);
  const decidedIds = (decided.data ?? []).filter((row) => row.handled_by).map((row) => row.id);
  const context = useObservationContext([...pendingIds, ...decidedIds]);
  // Sans le script : historique de l'auteur calculé à partir des observations seulement.
  const authorIds = [...new Set((anomalies.data ?? []).map((item) => item.user_id).filter(Boolean))] as string[];
  const fallbackHistory = useQuery({
    queryKey: ["admin", "report-anomalies", "authors", authorIds.sort().join(",")],
    enabled: authorIds.length > 0 && context.isError,
    queryFn: async () => {
      const { data, error } = await supabase.from("bw_report_anomalies")
        .select("id,user_id,status").in("user_id", authorIds).limit(1000);
      if (error) throw error;
      return data as { id: string; user_id: string; status: string }[];
    },
  });
  const historyOf = (item: Observation) => {
    if (!fallbackHistory.data) return undefined;
    const others = fallbackHistory.data.filter((row) => row.user_id === item.user_id && row.id !== item.id);
    return {
      total: others.length,
      handled: others.filter((row) => row.status === "handled").length,
      dismissed: others.filter((row) => row.status === "dismissed").length,
      pending: others.filter((row) => row.status === "pending").length,
    };
  };
  const placeOf = (item: Observation) =>
    item.port_id
      ? `Port de ${ports.find((p) => p.id === item.port_id)?.name ?? "?"}`
      : (vessels.find((v) => v.id === item.vessel_id)?.name ?? tr("ui.communityModeration.bateau"));
  const triage = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "handled" | "dismissed" }) => {
      const { error } = await supabase.from("bw_report_anomalies")
        .update({ status, handled_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "report-anomalies"] });
      void client.invalidateQueries({ queryKey: ["admin", "anomaly-context"] });
    },
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
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: communityKey });
      // Un signalement validé corrige les horaires et la position du navire.
      void client.invalidateQueries({ queryKey: ["departures"] });
      void client.invalidateQueries({ queryKey: ["my-trips"] });
    },
  });
  if (feed.isPending) return <p role="status">{tr("ui.communityModeration.chargementDeLaCommunaute")}</p>;
  if (feed.isError)
    return (
      <p role="alert">
        {tr("ui.communityModeration.laCommunauteEstIndisponible")}{" "}
        <button type="button" onClick={() => void feed.refetch()}>
          {tr("ui.communityModeration.reessayer")}
        </button>
      </p>
    );
  if (!feed.data)
    return (
      <p className="p-4 text-sm">
        {tr("ui.communityModeration.activezLaMigration20261021120000Vessel")}
      </p>
    );
  return (
    <div className="space-y-6 py-4">
      <section>
        <h2 className="mb-2 text-lg font-semibold">{tr("ui.communityModeration.observationsAVerifier")}{anomalies.data?.length ?? 0}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{tr("ui.communityModeration.cesObservationsContredisentLHoraire")}</p>
        {anomalies.isError ? <p role="alert">{tr("ui.communityModeration.fileIndisponibleAppliquezLaMigration")}</p> : null}
        {anomalies.isPending ? <p>{tr("ui.communityModeration.chargement")}</p> : null}
        {anomalies.data?.length === 0 ? <p>{tr("ui.communityModeration.aucuneObservationAVerifier")}</p> : null}
        <ul className="space-y-3">
          {anomalies.data?.map((item) => (
            <ObservationCard
              key={item.id}
              item={item}
              place={placeOf(item)}
              context={context.data?.[item.id]}
              contextMissing={context.isError}
              fallbackHistory={historyOf(item)}
              busy={publish.isPending || triage.isPending}
              canPublish={Boolean(item.departure_id || item.port_id)}
              onPublish={() => publish.mutate(item.id)}
              onTriage={(status) => triage.mutate({ id: item.id, status })}
            />
          ))}
        </ul>
        <ObservationHistory rows={decided.data ?? []} placeOf={placeOf} context={context.data} />
        {triage.isError ? <p role="alert">{tr("ui.communityModeration.laMiseAJourA")}</p> : null}
        {publish.isError ? <p role="alert">{publish.error.message}</p> : null}
      </section>
      <section>
        <h2 className="text-lg font-semibold">{tr("ui.communityModeration.avisNaviresModeration")}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {tr("ui.communityModeration.lesContributionsRestentPriveesJusqu")}
        </p>
        {!feed.data.reviews.length ? <p>{tr("ui.communityModeration.aucunAvisRecu")}</p> : null}
        <ul className="space-y-3">
          {feed.data.reviews.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <strong>
                  {vessels.find((v) => v.id === r.vessel_id)?.name ?? tr("ui.communityModeration.navire")} · {r.score}/5
                </strong>
                <span className="text-sm">
                  {r.status === "pending"
                    ? tr("ui.communityModeration.aRelire")
                    : r.status === "published"
                      ? tr("ui.communityModeration.publie")
                      : tr("ui.communityModeration.masque")}
                </span>
              </div>
              <ReviewAuthor info={vesselAuthors?.[r.id]} />
              <p className="my-3 whitespace-pre-wrap break-words text-sm">{r.comment}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={action.isPending || r.status === "published"}
                  onClick={() => action.mutate({ type: "review", id: r.id, status: "published" })}
                >
                  {tr("ui.communityModeration.publier")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action.isPending || r.status === "hidden"}
                  onClick={() => action.mutate({ type: "review", id: r.id, status: "hidden" })}
                >
                  {tr("ui.communityModeration.masquer")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">{tr("ui.communityModeration.informationsVoyageursActives")}</h2>
        {!feed.data.alerts.length ? <p>{tr("ui.communityModeration.aucunSignalementActif")}</p> : null}
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
                  {alertLabel(a)} · {1 + a.confirmations}{tr("ui.communityModeration.voyageurS")}
                  {a.validated ? tr("ui.communityModeration.valideParLEquipe") : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {a.validated ? null : (
                  <Button
                    size="sm"
                    disabled={action.isPending}
                    onClick={() => action.mutate({ type: "alert", id: a.id, verdict: "validate" })}
                  >
                    {tr("ui.communityModeration.valider")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ type: "alert", id: a.id, verdict: "resolve" })}
                >
                  {tr("ui.communityModeration.retirer")}
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
