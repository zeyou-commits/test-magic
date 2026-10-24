import { useQuery } from "@tanstack/react-query";
import { BellRing, Check } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Tables communautaires pas encore présentes dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;
import type { VehicleKind } from "@/components/panel/TripProfile";
import { useAuth } from "@/hooks/useAuth";
import { useTravelAction } from "@/hooks/useTravelAction";

export function ItineraryAlertForm({
  routeId,
  from,
  to,
  period,
  origin,
  destination,
  vehicle,
  adults,
  children,
}: {
  routeId: string;
  from: string;
  to: string;
  period: string;
  origin: string;
  destination: string;
  vehicle: VehicleKind;
  adults: number;
  children: number;
}) {
  const { user } = useAuth();
  const request = useTravelAction();
  const { data: active } = useQuery({
    queryKey: ["my-itinerary-watches", user?.id, routeId, period],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bw_itinerary_watches")
        .select("active")
        .eq("user_id", user!.id)
        .eq("route_id", routeId)
        .eq("period_month", `${period}-01`)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data?.active);
    },
  });
  return (
    <div className="mt-3 border-t border-border pt-2" onClick={(event) => event.stopPropagation()}>
      {active ? (
        <a
          href="/compte#notifications"
          className="inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-primary"
        >
          <Check className="size-4" /> Alerte activée · Gérer mon suivi
        </a>
      ) : (
        <button
          type="button"
          onClick={() =>
            request({
              type: "opening",
              routeId,
              from,
              to,
              period,
              origin,
              destination,
              vehicle,
              adults,
              children,
            })
          }
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary/5 px-2 text-xs font-bold text-primary hover:bg-primary/10"
        >
          <BellRing className="size-4" aria-hidden />
          M’avertir à l’ouverture des traversées
        </button>
      )}
    </div>
  );
}
