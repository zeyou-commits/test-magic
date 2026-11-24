import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Anchor, Ship } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { activeAlerts, communityKey, communityQuery, reportFromHere } from "@/lib/ferry/community";
import { portsQuery } from "@/lib/ferry/queries";
import { tr } from "@/lib/i18n";

/**
 * Navire en retard, sans départ constaté : les voyageurs sur place complètent le signal. Leurs
 * réponses s'affichent comme telles et ne remplacent jamais l'horaire ni l'estimation.
 */
export function VesselStateAsk({
  vesselId,
  vesselName,
  departureId,
}: {
  vesselId: string;
  vesselName: string;
  departureId: string;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [message, setMessage] = useState("");
  const feed = useQuery(communityQuery("vessel", vesselId, false, user?.id));
  const { data: ports = [] } = useQuery(portsQuery);
  const answers = activeAlerts(feed.data?.alerts ?? []).filter(
    (alert) => alert.category === "state" && alert.departure_id === departureId,
  );
  const count = (detail: string) =>
    answers
      .filter((alert) => alert.detail === detail)
      .reduce((sum, alert) => sum + 1 + alert.confirmations, 0);
  const send = useMutation({
    mutationFn: (detail: string) =>
      reportFromHere(
        { kind: "vessel", target: vesselId, category: "state", delay: null, detail, departureId },
        ports,
      ),
    onSuccess: async (result) => {
      setMessage(
        !result.error
          ? tr("ui.vesselStateAsk.merciVotreReponseAideLes")
          : /sur place|position/.test(result.error.message)
            ? result.error.message
            : tr("ui.vesselStateAsk.votreReponseNAPas"),
      );
      await client.invalidateQueries({ queryKey: communityKey });
    },
    onError: () => setMessage(tr("ui.vesselStateAsk.votreReponseNAPas2")),
  });
  const options = [
    { detail: "state_quay", label: tr("ui.vesselStateAsk.encoreAQuai"), icon: Anchor },
    { detail: "state_departed", label: tr("ui.vesselStateAsk.ilEstParti"), icon: Ship },
  ];
  return (
    <div className="bw-state-ask">
      <p>{tr("ui.vesselStateAsk.vousEtesSurPlaceLe")}{vesselName}{tr("ui.vesselStateAsk.estIlParti")}</p>
      {user ? (
        <div className="bw-state-ask__choices">
          {options.map(({ detail, label, icon: Icon }) => (
            <button
              key={detail}
              type="button"
              disabled={send.isPending}
              onClick={() => send.mutate(detail)}
            >
              <Icon size={14} aria-hidden /> {label}
              {count(detail) ? <b>{count(detail)}</b> : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="bw-state-ask__hint">
          {answers.length
            ? tr("ui.vesselStateAsk.voyageursEncoreAQuaiParti", { count: count("state_quay"), count2: count("state_departed") })
            : ""}
          <a href="/auth">{tr("ui.vesselStateAsk.connectezVousPourRepondre")}</a>
        </p>
      )}
      {message ? (
        <p role="status" className="bw-state-ask__hint">
          {message}
        </p>
      ) : null}
    </div>
  );
}
