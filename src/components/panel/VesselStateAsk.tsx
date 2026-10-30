import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Anchor, Ship } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { activeAlerts, communityKey, communityQuery, reportTravel } from "@/lib/ferry/community";

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
  const answers = activeAlerts(feed.data?.alerts ?? []).filter(
    (alert) => alert.category === "state" && alert.departure_id === departureId,
  );
  const count = (detail: string) =>
    answers
      .filter((alert) => alert.detail === detail)
      .reduce((sum, alert) => sum + 1 + alert.confirmations, 0);
  const send = useMutation({
    mutationFn: (detail: string) =>
      reportTravel({
        kind: "vessel",
        target: vesselId,
        category: "state",
        delay: null,
        detail,
        position: null,
        departureId,
      }),
    onSuccess: async (result) => {
      setMessage(
        result.error
          ? "Votre réponse n'a pas pu être enregistrée, ou vous avez déjà répondu."
          : "Merci, votre réponse aide les autres voyageurs.",
      );
      await client.invalidateQueries({ queryKey: communityKey });
    },
    onError: () => setMessage("Votre réponse n'a pas pu être enregistrée. Réessayez."),
  });
  const options = [
    { detail: "state_quay", label: "Encore à quai", icon: Anchor },
    { detail: "state_departed", label: "Il est parti", icon: Ship },
  ];
  return (
    <div className="bw-state-ask">
      <p>Vous êtes sur place : le {vesselName} est-il parti ?</p>
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
            ? `Voyageurs : ${count("state_quay")} encore à quai, ${count("state_departed")} parti. `
            : ""}
          <a href="/auth">Connectez-vous pour répondre</a>
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
