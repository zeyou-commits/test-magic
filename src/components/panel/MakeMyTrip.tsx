import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Ship } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import { useTravelAction } from "@/hooks/useTravelAction";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/ferry/format";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { portTimeZone } from "@/lib/ferry/time";
import type { Selection } from "@/lib/ferry/types";

const supabase = typedSupabase as unknown as SupabaseClient;

/**
 * « C'est votre traversée ? » sur les fiches : le bateau de ma traversée y mène directement, les
 * autres proposent de la déclarer. Le parcours guide le remplacement d'une traversée existante.
 */
export function MakeMyTrip({
  kind,
  targetId,
  label,
  onSelect,
}: {
  kind: "vessel" | "departure";
  targetId: string;
  label: string;
  onSelect?: ((selection: Selection) => void) | undefined;
}) {
  const { user } = useAuth();
  const request = useTravelAction();
  const { trip } = useMyTrip();
  const follow = useQuery({
    queryKey: ["follow", user?.id, kind, targetId, "purpose"],
    enabled: Boolean(user),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bw_follows")
        .select("active,traveller,follow_purpose")
        .eq("user_id", user!.id)
        .eq("target_kind", kind)
        .eq("target_id", targetId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        active: boolean;
        traveller: boolean | null;
        follow_purpose: string | null;
      } | null;
    },
  });
  if (user && follow.isPending) return null;
  const route = trip ? `${trip.from?.name ?? "Départ"} → ${trip.to?.name ?? "Arrivée"}` : "";
  if (trip && kind === "vessel" && trip.vessel?.id === targetId)
    return (
      <div className="bw-make-trip">
        <Ship size={18} aria-hidden />
        <span className="min-w-0 flex-1">
          <strong>C’est le bateau de votre traversée</strong>
          <small>
            {route}, {formatDateTime(trip.departure.departure_at, portTimeZone(trip.from))}
          </small>
        </span>
        {onSelect ? (
          <button
            type="button"
            onClick={() => onSelect({ type: "departure", id: trip.departure.id })}
          >
            Voir ma traversée <ArrowRight size={14} aria-hidden />
          </button>
        ) : null}
      </div>
    );
  const active = follow.data?.active ? follow.data : null;
  // Déjà « Ma traversée », ou suivi déclaré pour un proche : rien à proposer.
  if (active?.follow_purpose === "proche" || (kind === "departure" && active?.traveller))
    return null;
  return (
    <div className="bw-make-trip">
      <Ship size={18} aria-hidden />
      <span className="min-w-0 flex-1">
        <strong>C’est votre traversée ?</strong>
        <small>
          {trip
            ? `Vous avez déjà ${route} : nous vous guidons pour choisir.`
            : "Checklist, heure au port et alertes prioritaires."}
        </small>
      </span>
      <button
        type="button"
        onClick={() => request({ type: "follow", kind, targetId, label, upgrade: true })}
      >
        {kind === "vessel" ? "Voir ses traversées" : "En faire ma traversée"}{" "}
        <ArrowRight size={14} aria-hidden />
      </button>
    </div>
  );
}
