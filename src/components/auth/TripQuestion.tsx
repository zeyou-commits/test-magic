import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CircleAlert, Heart, Ship, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { portsQuery, routesQuery, upcomingDeparturesQuery } from "@/lib/ferry/queries";
import { useVesselAlert } from "@/lib/ferry/vesselAlerts";
import { ReturnDepartureSearch } from "@/components/panel/ReturnDepartureSearch";
import { formatDateTime } from "@/lib/ferry/format";
import { portTimeZone } from "@/lib/ferry/time";
import type { TravelAction } from "@/lib/notifications/actions";

type Follow = Extract<TravelAction, { type: "follow" }>;
type Stage = "intent" | "date" | "leg" | "returnAsk" | "return";

/** Le cœur sert au voyageur, à un proche et au simple amateur de navires. */
export function TripQuestion({ action, onAnswer }: { action: Follow; onAnswer: (next: Follow) => void }) {
  const { data: upcoming = [] } = useQuery(upcomingDeparturesQuery());
  const vesselId = action.kind === "vessel" ? action.targetId : upcoming.find((d) => d.id === action.targetId)?.vessel_id;
  const alert = useVesselAlert(vesselId);
  return <>
    {alert ? <p role="alert" className="bw-trip-question__alert"><CircleAlert size={16} aria-hidden /><span><strong>{alert.label}.</strong> Vérifiez auprès de la compagnie avant de partir. Vous pouvez tout de même enregistrer votre traversée pour recevoir les informations.</span></p> : null}
    <TripSteps action={action} onAnswer={onAnswer} />
  </>;
}

function TripSteps({ action, onAnswer }: { action: Follow; onAnswer: (next: Follow) => void }) {
  const [stage, setStage] = useState<Stage>(!action.upgrade ? "intent" : action.kind === "vessel" ? "date" : "leg");
  const [chosen, setChosen] = useState<string | null>(null);
  const [chosenReturn, setChosenReturn] = useState<string | null>(null);
  const [datePurpose, setDatePurpose] = useState<"voyageur" | "proche">("voyageur");
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { trip: myTrip } = useMyTrip();
  const departures = useQuery({
    queryKey: ["vessel-next-departures", action.targetId],
    enabled: action.kind === "vessel" && stage === "date",
    queryFn: async () => {
      const { data, error } = await supabase.from("departures")
        .select("id,departure_at,route_id,status")
        .eq("vessel_id", action.targetId).neq("status", "cancelled")
        .eq("is_demo", false)
        .gte("departure_at", new Date(Date.now() - 12 * 3_600_000).toISOString())
        .order("departure_at").limit(12);
      if (error) throw error;
      return data ?? [];
    },
  });
  const selected = action.kind === "departure" ? action.targetId : chosen;
  const routeInfo = (routeId: string) => {
    const route = routes.find((item) => item.id === routeId);
    const from = ports.find((port) => port.id === route?.departure_port_id);
    const to = ports.find((port) => port.id === route?.arrival_port_id);
    return { label: `${from?.name ?? "Départ"} → ${to?.name ?? "Arrivée"}`, zone: portTimeZone(from) };
  };
  const confirm = (leg: "outbound" | "inbound", returnDepartureId?: string) => {
    onAnswer({ ...action, traveller: true, purpose: "voyageur", journeyLeg: leg,
      ...(action.kind === "vessel" && selected ? { departureId: selected } : {}),
      ...(returnDepartureId ? { returnDepartureId } : {}),
    });
  };

  if (stage === "date") return <div className="bw-trip-question">
    <p className="bw-trip-question__title"><CalendarDays size={18} aria-hidden /> {datePurpose === "proche" ? "Quelle traversée suit votre proche ?" : "Quelle traversée est la vôtre ?"}</p>
    {departures.isPending ? <p>Recherche des prochains départs…</p> : departures.isError ? <p role="alert">Départs indisponibles pour le moment.</p> : departures.data?.length ? <div className="grid max-h-64 gap-2 overflow-y-auto" role="radiogroup" aria-label="Choisir ma traversée">
      {departures.data.map((departure) => { const info = routeInfo(departure.route_id); return <label key={departure.id} className="bw-trip-question__date" data-on={chosen === departure.id || undefined}>
        <input type="radio" name="trip-date" checked={chosen === departure.id} onChange={() => setChosen(departure.id)} />
        <span><strong>{formatDateTime(departure.departure_at, info.zone)}</strong><small>{info.label}</small></span>
      </label>; })}
    </div> : <p>Aucun départ publié pour ce bateau. Vous pouvez le suivre sans déclarer de voyage.</p>}
    <button type="button" className="bw-action-primary w-full" disabled={!chosen} onClick={() => {
      if (datePurpose === "proche" && chosen) {
        const picked = departures.data?.find((item) => item.id === chosen);
        onAnswer({ ...action, kind: "departure", targetId: chosen, label: picked ? routeInfo(picked.route_id).label : action.label, traveller: false, purpose: "proche" });
      }
      else setStage("leg");
    }}>Continuer</button>
    <button type="button" className="w-full py-2 text-sm text-muted-foreground" onClick={() => setStage("intent")}>Retour</button>
  </div>;

  if (stage === "leg") return <div className="bw-trip-question">
    <p className="bw-trip-question__title">À quelle étape de votre voyage correspond-elle ?</p>
    {myTrip && myTrip.departure.id !== selected ? <p className="rounded-lg bg-secondary px-3 py-2 text-xs leading-relaxed">
      <strong>Vous avez déjà une traversée :</strong> {myTrip.from?.name ?? "Votre voyage"} → {myTrip.to?.name ?? ""}, {formatDateTime(myTrip.departure.departure_at, portTimeZone(myTrip.from))}. « Ma traversée » est unique (un aller, ou un aller-retour) : si celle-ci est un nouvel aller, l’ancienne reste suivie par curiosité. Si c’est le retour de ce voyage, les deux sont conservées.
    </p> : null}
    <button type="button" className="bw-trip-question__choice" onClick={() => setStage("returnAsk")}><Ship size={20} aria-hidden /><span><strong>C’est mon aller</strong><small>Je peux ajouter mon retour maintenant ou plus tard.</small></span></button>
    <button type="button" className="bw-trip-question__choice" onClick={() => confirm("inbound")}><Ship size={20} aria-hidden /><span><strong>C’est mon retour</strong><small>J’ai déjà fait l’aller ou je ne souhaite suivre que le retour.</small></span></button>
    <button type="button" className="w-full py-2 text-sm text-muted-foreground" onClick={() => setStage(action.kind === "vessel" ? "date" : "intent")}>{action.upgrade && action.kind === "departure" ? "Autre raison de suivre" : "Retour"}</button>
  </div>;

  if (stage === "returnAsk") return <div className="bw-trip-question">
    <p className="bw-trip-question__title"><CalendarDays size={18} aria-hidden /> Voulez-vous ajouter votre retour ?</p>
    <p className="text-sm text-muted-foreground">Vous pourrez aussi le faire plus tard, depuis Ma traversée.</p>
    <button type="button" className="bw-action-primary w-full" onClick={() => setStage("return")}>Oui, ajouter mon retour</button>
    <button type="button" className="bw-action-secondary w-full" onClick={() => confirm("outbound")}>Plus tard</button>
    <button type="button" className="w-full py-2 text-sm text-muted-foreground" onClick={() => setStage("leg")}>Retour</button>
  </div>;

  if (stage === "return") return <div className="bw-trip-question">
    <p className="bw-trip-question__title"><CalendarDays size={18} aria-hidden /> Quel jour rentrez-vous ?</p>
    {selected ? <ReturnDepartureSearch departureId={selected} selectedId={chosenReturn} onChoose={setChosenReturn} /> : null}
    {chosenReturn ? <button type="button" className="bw-action-primary w-full" onClick={() => confirm("outbound", chosenReturn)}>Suivre l’aller et le retour</button> : null}
    <button type="button" className="w-full py-2 text-sm text-muted-foreground" onClick={() => setStage("returnAsk")}>Retour</button>
  </div>;

  return <div className="bw-trip-question">
    <p className="bw-trip-question__title">Pourquoi souhaitez-vous suivre {action.kind === "vessel" ? "ce bateau" : "cette traversée"} ?</p>
    <button type="button" className="bw-trip-question__choice" onClick={() => { setDatePurpose("voyageur"); setStage(action.kind === "vessel" ? "date" : "leg"); }}><Ship size={20} aria-hidden /><span><strong>Je voyage à bord</strong><small>Mon aller ou mon retour, avec les informations pour me préparer.</small></span></button>
    <button type="button" className="bw-trip-question__choice" onClick={() => { if (action.kind === "vessel") { setDatePurpose("proche"); setStage("date"); } else onAnswer({ ...action, traveller: false, purpose: "proche" }); }}><Users size={20} aria-hidden /><span><strong>Je suis un proche</strong><small>Départ, changements et arrivée, sans préparatifs personnels.</small></span></button>
    <button type="button" className="bw-trip-question__choice" onClick={() => onAnswer({ ...action, traveller: false, purpose: "curieux" })}><Heart size={20} aria-hidden /><span><strong>{action.kind === "vessel" ? "Je suis ce navire par intérêt" : "Je suis ce départ par intérêt"}</strong><small>{action.kind === "vessel" ? "Retrouver le navire et ses prochaines traversées." : "Voir les informations sans créer de voyage personnel."}</small></span></button>
  </div>;
}
