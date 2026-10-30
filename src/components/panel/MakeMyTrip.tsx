import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Ship } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import { useTravelAction } from "@/hooks/useTravelAction";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useMyTrip } from "@/lib/ferry/myTrip";

const supabase = typedSupabase as unknown as SupabaseClient;

/** Un suivi par curiosité peut devenir « Ma traversée » : le parcours guide le remplacement. */
export function MakeMyTrip({
  kind,
  targetId,
  label,
}: {
  kind: "vessel" | "departure";
  targetId: string;
  label: string;
}) {
  const { user } = useAuth();
  const request = useTravelAction();
  const { trip } = useMyTrip();
  const { data: follow } = useQuery({
    queryKey: ["follow", user?.id, kind, targetId, "purpose"],
    enabled: Boolean(user),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bw_follows")
        .select("active,follow_purpose")
        .eq("user_id", user!.id)
        .eq("target_kind", kind)
        .eq("target_id", targetId)
        .maybeSingle();
      if (error) throw error;
      return data as { active: boolean; follow_purpose: string | null } | null;
    },
  });
  if (!follow?.active || follow.follow_purpose !== "curieux") return null;
  // Le bateau de « Ma traversée » n'a rien à proposer de plus.
  if (kind === "vessel" && trip?.vessel?.id === targetId) return null;
  return (
    <div className="bw-make-trip">
      <Ship size={18} aria-hidden />
      <span className="min-w-0 flex-1">
        <strong>
          Vous voyagez {kind === "vessel" ? "sur ce bateau" : "sur cette traversée"} ?
        </strong>
        <small>
          {trip
            ? `Vous suivez déjà ${trip.from?.name ?? "un voyage"} → ${trip.to?.name ?? ""} : nous vous guidons pour choisir.`
            : "Checklist, heure au port et alertes prioritaires."}
        </small>
      </span>
      <button
        type="button"
        onClick={() => request({ type: "follow", kind, targetId, label, upgrade: true })}
      >
        En faire ma traversée <ArrowRight size={14} aria-hidden />
      </button>
    </div>
  );
}
