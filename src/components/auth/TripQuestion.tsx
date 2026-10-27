import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Heart, Ship } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { portsQuery, routesQuery } from "@/lib/ferry/queries";
import { formatDateTime } from "@/lib/ferry/format";
import { portTimeZone } from "@/lib/ferry/time";
import type { TravelAction } from "@/lib/notifications/actions";

type Follow = Extract<TravelAction, { type: "follow" }>;

/**
 * « Vous voyagez sur ce bateau ? » : posé une fois au moment de suivre.
 * Oui → la traversée devient « Ma traversée » (on choisit la date) ; non → un proche qui suit.
 */
export function TripQuestion({ action, onAnswer }: { action: Follow; onAnswer: (next: Follow) => void }) {
  const [pickDate, setPickDate] = useState(false);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const departures = useQuery({
    queryKey: ["vessel-next-departures", action.targetId],
    enabled: action.kind === "vessel" && pickDate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departures")
        .select("id,departure_at,route_id,status")
        .eq("vessel_id", action.targetId)
        .neq("status", "cancelled")
        .gte("departure_at", new Date(Date.now() - 12 * 3_600_000).toISOString())
        .order("departure_at")
        .limit(6);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const [chosen, setChosen] = useState<string | null>(null);
  const label = (routeId: string) => {
    const route = routes.find((item) => item.id === routeId);
    const name = (id?: string) => ports.find((port) => port.id === id)?.name ?? "?";
    return { text: `${name(route?.departure_port_id)} → ${name(route?.arrival_port_id)}`, zone: portTimeZone(ports.find((port) => port.id === route?.departure_port_id)) };
  };
  const list = departures.data ?? [];
  const selected = chosen ?? list[0]?.id ?? null;

  if (pickDate)
    return (
      <div className="bw-trip-question">
        <p className="bw-trip-question__title">
          <CalendarDays size={18} aria-hidden /> Quelle traversée ?
        </p>
        {departures.isPending ? (
          <p className="text-sm text-muted-foreground">Recherche des prochains départs…</p>
        ) : list.length ? (
          <div className="grid gap-2" role="radiogroup" aria-label="Choisir la traversée">
            {list.map((departure) => {
              const info = label(departure.route_id);
              return (
                <label key={departure.id} className="bw-trip-question__date" data-on={selected === departure.id || undefined}>
                  <input
                    type="radio"
                    name="trip-date"
                    checked={selected === departure.id}
                    onChange={() => setChosen(departure.id)}
                  />
                  <span>
                    <strong>{formatDateTime(departure.departure_at, info.zone)}</strong>
                    <small>{info.text}</small>
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucune traversée programmée pour ce bateau pour le moment. Vous pourrez choisir la date
            plus tard, depuis sa fiche.
          </p>
        )}
        <button
          type="button"
          className="bw-action-primary w-full"
          onClick={() =>
            onAnswer(
              selected
                ? { ...action, traveller: true, departureId: selected }
                : { ...action, traveller: true },
            )
          }
        >
          {selected ? "C’est ma traversée" : "Suivre ce bateau"}
        </button>
        <button type="button" className="w-full py-2 text-sm text-muted-foreground" onClick={() => setPickDate(false)}>
          Retour
        </button>
      </div>
    );

  return (
    <div className="bw-trip-question">
      <p className="bw-trip-question__title">
        {action.kind === "vessel" ? "Vous voyagez sur ce bateau ?" : "C’est votre traversée ?"}
      </p>
      <button
        type="button"
        className="bw-trip-question__choice"
        onClick={() =>
          action.kind === "vessel" ? setPickDate(true) : onAnswer({ ...action, traveller: true })
        }
      >
        <Ship size={20} aria-hidden />
        <span>
          <strong>Oui, c’est ma traversée</strong>
          <small>Compte à rebours, étapes du voyage et infos du port de départ.</small>
        </span>
      </button>
      <button
        type="button"
        className="bw-trip-question__choice"
        onClick={() => onAnswer({ ...action, traveller: false })}
      >
        <Heart size={20} aria-hidden />
        <span>
          <strong>Non, je suis un proche</strong>
          <small>Départ, retard et arrivée, pour suivre ceux qui voyagent.</small>
        </span>
      </button>
    </div>
  );
}
