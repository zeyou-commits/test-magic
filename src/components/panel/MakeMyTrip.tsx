import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Ship } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import { useTravelAction } from "@/hooks/useTravelAction";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useMyTrip } from "@/lib/ferry/myTrip";
import type { Selection } from "@/lib/ferry/types";

const supabase = typedSupabase as unknown as SupabaseClient;

/**
 * « C'est votre traversée ? » sur les fiches, en une ligne discrète : le navire de ma traversée y
 * mène directement, les autres proposent de la déclarer. Le parcours guide le remplacement.
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
  if (trip && kind === "vessel" && trip.vessel?.id === targetId)
    return onSelect ? (
      <button
        type="button"
        className="bw-make-trip"
        onClick={() => onSelect({ type: "departure", id: trip.departure.id })}
      >
        <Ship size={14} aria-hidden /> Le navire de votre traversée · <b>Voir ma traversée</b>
        <ArrowRight size={13} aria-hidden />
      </button>
    ) : null;
  const active = follow.data?.active ? follow.data : null;
  // Déjà « Ma traversée », ou suivi déclaré pour un proche : rien à proposer.
  if (active?.follow_purpose === "proche" || (kind === "departure" && active?.traveller))
    return null;
  return (
    <button
      type="button"
      className="bw-make-trip"
      onClick={() => request({ type: "follow", kind, targetId, label, upgrade: true })}
    >
      <Ship size={14} aria-hidden /> C’est votre traversée ?{" "}
      <b>{kind === "vessel" ? "Voir ses traversées" : "En faire ma traversée"}</b>
      <ArrowRight size={13} aria-hidden />
    </button>
  );
}
