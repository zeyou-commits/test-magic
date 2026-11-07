import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CircleAlert, Heart, Ship, Ticket, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { TicketImport } from "@/components/tickets/TicketImport";
import { supabase } from "@/integrations/supabase/client";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { companiesQuery, portsQuery, routesQuery, upcomingDeparturesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { useVesselAlert } from "@/lib/ferry/vesselAlerts";
import { ReturnDepartureSearch } from "@/components/panel/ReturnDepartureSearch";
import { formatDateTime } from "@/lib/ferry/format";
import { portTimeZone } from "@/lib/ferry/time";
import type { TravelAction } from "@/lib/notifications/actions";

type Follow = Extract<TravelAction, { type: "follow" }>;
type Stage = "intent" | "date" | "leg" | "return";

/** Le cœur sert au voyageur, à un proche et au simple amateur de navires. */
export function TripQuestion({ action, onAnswer, onDone }: { action: Follow; onAnswer: (next: Follow) => void; /** Billet enregistré : tout est rempli, on ferme. */ onDone?: (() => void) | undefined }) {
  const { data: upcoming = [] } = useQuery(upcomingDeparturesQuery());
  const vesselId = action.kind === "vessel" ? action.targetId : upcoming.find((d) => d.id === action.targetId)?.vessel_id;
  const alert = useVesselAlert(vesselId);
  return <>
    {alert ? <p role="alert" className="bw-trip-question__alert"><CircleAlert size={16} aria-hidden /><span><strong>{alert.label}.</strong> Vérifiez auprès de la compagnie avant de partir. Vous pouvez tout de même enregistrer votre traversée pour recevoir les informations.</span></p> : null}
    <TripSteps action={action} onAnswer={onAnswer} onDone={onDone} />
  </>;
}

function TripSteps({ action, onAnswer, onDone }: { action: Follow; onAnswer: (next: Follow) => void; onDone?: (() => void) | undefined }) {
  const { user } = useAuth();
  const [ticket, setTicket] = useState(false);
  const { data: upcoming = [] } = useQuery(upcomingDeparturesQuery());
  const [stage, setStage] = useState<Stage>(!action.upgrade ? "intent" : action.kind === "vessel" ? "date" : "leg");
  const [chosen, setChosen] = useState<string | null>(null);
  const [chosenReturn, setChosenReturn] = useState<string | null>(null);
  const [datePurpose, setDatePurpose] = useState<"voyageur" | "proche">("voyageur");
  // Venu d'une traversée précise (?select=departure) : elle est proposée seule, les autres dates
  // restent à un clic. Sinon : les 3 prochaines, puis « Voir plus ».
  const [contextDeparture] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("select") === "departure" ? params.get("id") : null;
  });
  const [showAll, setShowAll] = useState(false);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { trip: myTrip } = useMyTrip();
  // La traversée d'où l'on vient (même déjà en mer, absente des « prochains départs »).
  const ownDeparture = useQuery({
    queryKey: ["trip-question-departure", action.targetId],
    enabled: action.kind === "departure",
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("departures")
        .select("id,departure_at,route_id,status,company_id,vessel_id,reliability").eq("id", action.targetId).maybeSingle();
      return data ?? null;
    },
  });
  // Les autres dates possibles : même navire (cœur d'un navire) ou même ligne (cœur d'une traversée).
  const departures = useQuery({
    queryKey: ["trip-question-dates", action.kind, action.targetId, ownDeparture.data?.route_id],
    enabled: stage === "date" && (action.kind === "vessel" || Boolean(ownDeparture.data)),
    queryFn: async () => {
      let query = supabase.from("departures")
        .select("id,departure_at,route_id,status,company_id,vessel_id,reliability")
        .neq("status", "cancelled").eq("is_demo", false)
        .gte("departure_at", new Date(Date.now() - 12 * 3_600_000).toISOString());
      query = action.kind === "vessel" ? query.eq("vessel_id", action.targetId) : query.eq("route_id", ownDeparture.data!.route_id);
      const { data, error } = await query.order("departure_at").limit(14);
      if (error) throw error;
      const list = data ?? [];
      const own = ownDeparture.data;
      return own && !list.some((item) => item.id === own.id)
        ? [own, ...list].sort((a, b) => Date.parse(a.departure_at) - Date.parse(b.departure_at))
        : list;
    },
  });
  /** Traversée retenue : celle d'où l'on vient, sauf si l'on en choisit une autre. */
  const preset = action.kind === "departure" ? action.targetId : contextDeparture;
  const selected = chosen ?? (action.kind === "departure" ? action.targetId : null);
  const routeInfo = (routeId: string) => {
    const route = routes.find((item) => item.id === routeId);
    const from = ports.find((port) => port.id === route?.departure_port_id);
    const to = ports.find((port) => port.id === route?.arrival_port_id);
    return { label: `${from?.name ?? "Départ"} → ${to?.name ?? "Arrivée"}`, zone: portTimeZone(from) };
  };
  const all = departures.data ?? [];
  const pickedDeparture = all.find((item) => item.id === selected)
    ?? upcoming.find((item) => item.id === selected)
    ?? (ownDeparture.data?.id === selected ? ownDeparture.data : undefined);
  const confirm = (leg: "outbound" | "inbound", returnDepartureId?: string) => {
    const changed = action.kind === "departure" && selected && selected !== action.targetId;
    onAnswer({ ...action, traveller: true, purpose: "voyageur", journeyLeg: leg,
      ...(changed && pickedDeparture ? { targetId: selected, label: routeInfo(pickedDeparture.route_id).label } : {}),
      ...(action.kind === "vessel" && selected ? { departureId: selected } : {}),
      ...(returnDepartureId ? { returnDepartureId } : {}),
    });
  };

  if (ticket) return <TicketImport open onOpenChange={(value) => { if (!value) setTicket(false); }} onSaved={onDone} />;

  if (stage === "date") {
    const known = preset ? all.find((item) => item.id === preset) : undefined;
    const first = known ?? all[0];
    if (first && !chosen) queueMicrotask(() => setChosen(first.id));
    const shown = showAll ? all : first ? [first] : [];
    return <div className="bw-trip-question">
      <p className="bw-trip-question__title"><CalendarDays size={18} aria-hidden /> {datePurpose === "proche" ? "La traversée de votre proche" : "Votre traversée"}</p>
      {departures.isPending || (ownDeparture.isPending && action.kind === "departure") ? <p className="text-sm text-muted-foreground">Recherche des départs…</p>
        : departures.isError ? <p role="alert">Départs indisponibles pour le moment.</p>
        : all.length ? <div className="bw-trip-dates" role="radiogroup" aria-label="Choisir ma traversée">
          {shown.map((departure) => {
            const info = routeInfo(departure.route_id);
            const meta = [companies.find((c) => c.id === departure.company_id)?.name, vessels.find((v) => v.id === departure.vessel_id)?.name].filter(Boolean).join(" · ");
            return <label key={departure.id} className="bw-trip-question__date" data-on={chosen === departure.id || undefined}>
              <input type="radio" name="trip-date" checked={chosen === departure.id} onChange={() => setChosen(departure.id)} />
              <span>
                <strong>{formatDateTime(departure.departure_at, info.zone)}{departure.id === preset ? <em className="bw-trip-dates__here">celle que vous regardez</em> : null}</strong>
                <small>{info.label}{meta ? ` · ${meta}` : ""}{departure.reliability === "to_verify" ? " · horaire estimé" : ""}</small>
              </span>
            </label>;
          })}
        </div> : <p>Aucun départ publié pour ce bateau. Vous pouvez le suivre sans déclarer de voyage.</p>}
      {all.length > 1 ? <button type="button" className="bw-trip-dates__more" onClick={() => setShowAll(!showAll)}>
        {showAll ? "Masquer les autres dates" : `Une autre date ? ${all.length - 1} autre${all.length > 2 ? "s" : ""} départ${all.length > 2 ? "s" : ""}`}
      </button> : null}
      <button type="button" className="bw-action-primary w-full" disabled={!chosen} onClick={() => {
        if (datePurpose === "proche" && chosen) {
          const picked = all.find((item) => item.id === chosen);
          onAnswer({ ...action, kind: "departure", targetId: chosen, label: picked ? routeInfo(picked.route_id).label : action.label, traveller: false, purpose: "proche" });
        }
        else setStage("leg");
      }}>Continuer</button>
      {user && datePurpose === "voyageur" ? <button type="button" className="bw-trip-ticket" onClick={() => setTicket(true)}>
        <Ticket size={18} aria-hidden /><span><strong>Vous avez votre billet ?</strong><small>Ajoutez-le : l’aller et le retour se remplissent tout seuls.</small></span>
      </button> : null}
      <button type="button" className="w-full py-2 text-sm text-muted-foreground" onClick={() => setStage("intent")}>Retour</button>
    </div>;
  }

  // Europe → Algérie : le plus souvent un aller ; Algérie → Europe : un retour. On le suggère, sans l'imposer.
  const pickedRoute = routes.find((item) => item.id === pickedDeparture?.route_id);
  const country = (id?: string) => ports.find((port) => port.id === id)?.country_code;
  const toDz = country(pickedRoute?.arrival_port_id) === "DZ" && country(pickedRoute?.departure_port_id) !== "DZ";
  const fromDz = country(pickedRoute?.departure_port_id) === "DZ" && country(pickedRoute?.arrival_port_id) !== "DZ";

  if (stage === "leg") return <div className="bw-trip-question">
    <p className="bw-trip-question__title">À quelle étape de votre voyage correspond-elle ?</p>
    {myTrip && myTrip.departure.id !== selected ? <p className="rounded-lg bg-secondary px-3 py-2 text-xs leading-relaxed">
      <strong>Vous avez déjà une traversée :</strong> {myTrip.from?.name ?? "Votre voyage"} → {myTrip.to?.name ?? ""}, {formatDateTime(myTrip.departure.departure_at, portTimeZone(myTrip.from))}. « Ma traversée » est unique (un aller, ou un aller-retour) : si celle-ci est un nouvel aller, l’ancienne reste suivie par curiosité. Si c’est le retour de ce voyage, les deux sont conservées.
    </p> : null}
    <button type="button" className="bw-trip-question__choice" data-suggested={toDz || undefined} onClick={() => setStage("return")}><Ship size={20} aria-hidden /><span><strong>C’est mon aller{toDz ? <em>le plus courant</em> : null}</strong><small>Je peux ajouter mon retour maintenant ou plus tard.</small></span></button>
    <button type="button" className="bw-trip-question__choice" data-suggested={fromDz || undefined} onClick={() => confirm("inbound")}><Ship size={20} aria-hidden /><span><strong>C’est mon retour{fromDz ? <em>le plus courant</em> : null}</strong><small>J’ai déjà fait l’aller ou je ne souhaite suivre que le retour.</small></span></button>
    <button type="button" className="w-full py-2 text-sm text-muted-foreground" onClick={() => setStage(action.upgrade && action.kind === "departure" ? "intent" : "date")}>{action.upgrade && action.kind === "departure" ? "Autre raison de suivre" : "Retour"}</button>
  </div>;

  if (stage === "return") return <div className="bw-trip-question">
    <p className="bw-trip-question__title"><CalendarDays size={18} aria-hidden /> Et votre retour ?</p>
    {selected ? <ReturnDepartureSearch departureId={selected} selectedId={chosenReturn} onChoose={setChosenReturn} outboundAt={pickedDeparture?.departure_at} /> : null}
    {chosenReturn ? <button type="button" className="bw-action-primary w-full" onClick={() => confirm("outbound", chosenReturn)}>Suivre l’aller et le retour</button> : null}
    <button type="button" className={chosenReturn ? "w-full py-2 text-sm font-semibold text-primary" : "bw-action-secondary w-full"} onClick={() => confirm("outbound")}>Je n’ai pas encore la date</button>
    <button type="button" className="w-full py-2 text-sm text-muted-foreground" onClick={() => setStage("leg")}>Retour</button>
  </div>;

  return <div className="bw-trip-question">
    <p className="bw-trip-question__title">Pourquoi souhaitez-vous suivre {action.kind === "vessel" ? "ce bateau" : "cette traversée"} ?</p>
    <button type="button" className="bw-trip-question__choice" onClick={() => { setDatePurpose("voyageur"); setStage("date"); }}><Ship size={20} aria-hidden /><span><strong>Je voyage à bord</strong><small>Mon aller ou mon retour, avec les informations pour me préparer.</small></span></button>
    <button type="button" className="bw-trip-question__choice" onClick={() => { if (action.kind === "vessel") { setDatePurpose("proche"); setStage("date"); } else onAnswer({ ...action, traveller: false, purpose: "proche" }); }}><Users size={20} aria-hidden /><span><strong>Je suis un proche</strong><small>Départ, changements et arrivée, sans préparatifs personnels.</small></span></button>
    <button type="button" className="bw-trip-question__choice" onClick={() => onAnswer({ ...action, traveller: false, purpose: "curieux" })}><Heart size={20} aria-hidden /><span><strong>{action.kind === "vessel" ? "Je suis ce navire par intérêt" : "Je suis ce départ par intérêt"}</strong><small>{action.kind === "vessel" ? "Retrouver le navire et ses prochaines traversées." : "Voir les informations sans créer de voyage personnel."}</small></span></button>
  </div>;
}
