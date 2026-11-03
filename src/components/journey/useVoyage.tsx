import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import { CrossingCard } from "@/components/panel/CrossingCard";
import { RateStars } from "@/components/panel/RateStars";
import { TripStatusPicker } from "@/components/panel/TripPresence";
import { useLiveInfo } from "@/components/panel/LivePulse";
import { useAuth } from "@/hooks/useAuth";
import type { FleetShip } from "@/lib/ferry/fleet";
import type { ItineraryMapPreview } from "@/lib/ferry/itinerary";
import { tripEnd } from "@/lib/ferry/myTrip";
import { roomMoment } from "@/lib/ferry/portPassage";
import { entityReviewsQuery } from "@/lib/ferry/entityReviews";
import { myTripStatusQuery, presenceQuery } from "@/lib/ferry/presence";
import { presetRating } from "@/lib/ferry/reviewCriteria";
import {
  defaultProfile,
  preparationKey,
  preparationQuery,
  profileLabels,
  savePreparation,
  tripDirection,
  type Preparation,
} from "@/lib/ferry/preparation";
import {
  JOURNEY_STEPS,
  RELATIVE_STEPS,
  STEP_STATUSES,
  currentStep,
  durationLabel,
  journeyTimeline,
  stepGuide,
  stepItems,
  stepLabel,
  stepMoment,
  stepState,
  type JourneyStepId,
  type TravelStatus,
} from "@/lib/ferry/journeySteps";
import {
  presentationQuery,
  readPlaces,
  writePlaces,
  type JourneyPlaces,
} from "@/lib/ferry/journeyTrips";
import { crossingProgress } from "@/lib/ferry/crossingProgress";
import { companiesQuery, upcomingDeparturesQuery } from "@/lib/ferry/queries";
import { useLiveShips } from "@/lib/ferry/useLiveShips";
import { portTimeZone } from "@/lib/ferry/time";
import type { Departure, Selection } from "@/lib/ferry/types";
import type { VoyageTrip } from "@/lib/ferry/voyageTrip";
import type { FriezeStep } from "./JourneyFrieze";
import { JourneyPlacesEntry } from "./JourneyPlacesForm";
import { JourneyStepPanel } from "./JourneyStepPanel";

/**
 * « Mon voyage », mode de la carte d'accueil : tout ce qu'il faut pour la frise, le volet d'étape,
 * le cadrage de la carte et le salon. Sans voyage (trip null), ne fait rien et ne renvoie rien.
 */
export function useVoyage(
  trip: VoyageTrip | null,
  {
    isMobile,
    fleet,
    onSelect,
    onAsk,
  }: {
    isMobile: boolean;
    fleet: FleetShip[];
    onSelect: (selection: Selection) => void;
    onAsk: () => void;
  },
) {
  const { user } = useAuth();
  const client = useQueryClient();
  const departureId = trip?.departure.id ?? "";
  const traveller = trip?.audience === "traveller";
  const { data: companies = [] } = useQuery(companiesQuery);
  const departures = useQuery(upcomingDeparturesQuery()).data;
  // Le signal du navire, pour l'avancement de la traversée (actualisé chaque minute).
  const liveShips = useLiveShips();
  const presentation = useQuery({ ...presentationQuery(departureId), enabled: Boolean(trip) }).data;
  // Compteurs anonymes de « Où en êtes-vous ? » : combien de voyageurs à chaque étape.
  const presence = useQuery({ ...presenceQuery, enabled: Boolean(trip) }).data;
  const status =
    useQuery({ ...myTripStatusQuery(departureId, user?.id), enabled: traveller && Boolean(user) })
      .data ?? null;
  const prep = useQuery({
    ...preparationQuery(departureId, user?.id),
    enabled: traveller && Boolean(user),
  });
  const preparation: Preparation = prep.data ?? { profile: defaultProfile, done: [] };

  const [places, setPlaces] = useState<JourneyPlaces | null>(null);
  useEffect(() => setPlaces(departureId ? readPlaces(departureId) : null), [departureId]);
  // Une minute suffit : l'étape du moment avance avec l'heure.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [hover, setHover] = useState<JourneyStepId | null>(null);
  const [pinned, setPinned] = useState<JourneyStepId | null>(null);
  const [closed, setClosed] = useState(false);
  const [storyIndex, setStoryIndex] = useState<number | null>(null);
  useEffect(() => {
    setPinned(null);
    setClosed(false);
    setStoryIndex(null);
  }, [departureId]);

  const from = trip?.from;
  const to = trip?.to;
  const direction = tripDirection(from);
  const outbound = direction === "outbound";
  const roadMin = places ? (outbound ? places.europeMin : places.algeriaMin) : null;
  const lastMin = places ? (outbound ? places.algeriaMin : places.europeMin) : null;
  const showRoadsFor = (step: JourneyStepId | null) =>
    Boolean(places) && (step === "road" || step === "last");

  // Le tracé porte à porte, si le voyageur a donné ses villes.
  const routeId = trip?.route.id;
  const preview = useMemo<ItineraryMapPreview | null>(() => {
    if (!places || !from || !to || !routeId) return null;
    const fromPoint: [number, number] = [from.longitude, from.latitude];
    const toPoint: [number, number] = [to.longitude, to.latitude];
    const reverse = (line: [number, number][]) => [...line].reverse();
    const first = outbound ? places.europeLine : reverse(places.algeriaLine);
    const last = outbound ? places.algeriaLine : reverse(places.europeLine);
    return {
      key: 1,
      routeId,
      origin: outbound ? places.homePoint : places.bledPoint,
      destination: outbound ? places.bledPoint : places.homePoint,
      departurePort: fromPoint,
      arrivalPort: toPoint,
      roadToPort: first.length ? first : [outbound ? places.homePoint : places.bledPoint, fromPoint],
      roadDetailed: first.length > 0 && last.length > 0,
      ferry: [fromPoint, toPoint],
      roadFromPort: last.length ? last : [toPoint, outbound ? places.bledPoint : places.homePoint],
      alternatives: [],
    };
  }, [places, outbound, from, to, routeId]);

  const info = useLiveInfo({
    departureId: trip?.departure.id,
    routeIds: trip ? [trip.route.id] : [],
    portIds: from && to ? [from.id, to.id] : [],
    signalPortIds: from ? [from.id] : [],
    signalVesselIds: trip?.vessel ? [trip.vessel.id] : [],
    vesselId: trip?.departure.vessel_id,
  });

  if (!trip || !from || !to) return null;

  const { departure, route, vessel, audience } = trip;
  const steps = traveller ? JOURNEY_STEPS : RELATIVE_STEPS;
  const fromZone = portTimeZone(from);
  const toZone = portTimeZone(to);
  const presentationMinutes = departure.presentation_minutes ?? presentation ?? null;
  const companyName =
    companies.find(
      (company) =>
        company.id ===
        ((departures ?? []).find((item) => item.id === departure.id)?.company_id ??
          vessel?.company_id),
    )?.name ?? null;
  const departureMs = Date.parse(departure.departure_at);
  const endMs = tripEnd(departure);
  const timeline = journeyTimeline({
    departureMs,
    endMs,
    presentationMinutes,
    ...(lastMin ? { lastLegMs: lastMin * 60_000 } : {}),
  });
  const itemsOf = (step: JourneyStepId) =>
    traveller ? stepItems(step, preparation.profile, direction, companyName) : [];
  const completed = steps.filter((step) => {
    const items = itemsOf(step);
    return items.length > 0 && items.every((item) => preparation.done.includes(item.id));
  });
  const current = currentStep({ timeline, now, status: status as TravelStatus | null, steps, completed });
  // L'avancement du navire, le même calcul que la fiche de la traversée : il part à l'heure prévue
  // sans preuve contraire, et « Parti · en mer » s'affiche dès qu'il y en a une.
  const fullDeparture = ((departures ?? []).find((item) => item.id === departure.id) ??
    departure) as Departure;
  const live = liveShips.find((ship) => ship.departure.id === departure.id) ?? null;
  const progress = crossingProgress(fullDeparture, from, to, live, now);
  const atSea = progress.ratio !== null && now >= departureMs && now < endMs;
  // La carte d'avancement : de quelques heures avant le départ jusqu'au lendemain de l'arrivée.
  const tracking =
    departure.status !== "cancelled" && now >= departureMs - 6 * 3_600_000 && now <= endMs + 12 * 3_600_000;
  const openShip = () =>
    onSelect(
      departure.vessel_id
        ? { type: "vessel", id: departure.vessel_id }
        : { type: "departure", id: departure.id },
    );
  const subOf = (step: JourneyStepId) => {
    const items = itemsOf(step);
    const count = items.filter((item) => preparation.done.includes(item.id)).length;
    switch (step) {
      case "papers":
      case "vehicle":
        return items.length ? `${count}/${items.length} fait` : "prêt";
      case "road":
        return roadMin
          ? `≈ ${durationLabel(roadMin)}`
          : stepMoment(timeline.road.start, fromZone).split(" · ")[0]!;
      case "port":
        return stepMoment(timeline.port.start, fromZone);
      case "sea":
        // Pendant la traversée : où en est le navire, plutôt que l'heure de départ déjà passée.
        return atSea && progress.ratio !== null
          ? `${progress.trust === "live" || progress.trust === "observed" ? "" : "≈ "}${Math.round(progress.ratio * 100)} %`
          : stepMoment(departureMs, fromZone);
      case "arrival":
        return stepMoment(endMs, toZone);
      case "last":
        return lastMin ? `≈ ${durationLabel(lastMin)}` : "après le port";
      case "home":
        return audience === "relative" ? "fin du voyage" : "bien arrivé·e ?";
    }
  };
  const presenceRow = presence?.find((row) => row.departure_id === departure.id);
  const countOf = (step: JourneyStepId) => {
    if (!presenceRow) return 0;
    switch (step) {
      case "road":
        return presenceRow.en_route ?? 0;
      case "port":
        return presenceRow.at_port ?? 0;
      case "sea":
        return presenceRow.onboard ?? 0;
      case "arrival":
        return (presenceRow.landing ?? 0) + (presenceRow.controls ?? 0);
      case "last":
        return presenceRow.arrived ?? 0;
      default:
        return 0;
    }
  };
  const friezeSteps: FriezeStep[] = steps.map((step) => ({
    id: step,
    count: countOf(step),
    label: stepLabel(step, direction, audience),
    sub: subOf(step),
    state: stepState(step, current, steps),
    late:
      stepState(step, current, steps) === "done" &&
      itemsOf(step).length > 0 &&
      !completed.includes(step),
  }));
  const index = storyIndex ?? steps.indexOf(current);
  const shown: JourneyStepId | null = isMobile
    ? (steps[index] ?? current)
    : (hover ?? pinned ?? (closed ? null : current));

  // La carte suit l'étape regardée ; mon bateau est mis en avant où qu'il soit.
  const focusStep = shown ?? current;
  const showRoads = showRoadsFor(focusStep);
  const myShip =
    fleet.find((ship) => ship.departureId === departure.id) ??
    fleet.find((ship) => ship.vesselId && ship.vesselId === departure.vessel_id);
  const mapProps = {
    fitPortIds:
      focusStep === "port"
        ? [from.id]
        : focusStep === "arrival" || (focusStep === "last" && !showRoads)
          ? [to.id]
          : [from.id, to.id],
    focusRouteIds: [route.id],
    highlightedPortIds: [from.id, to.id],
    focusShipId: myShip?.id ?? null,
    itineraryPreview: showRoads ? preview : null,
  };

  const toggle = (id: string) => {
    if (!user) return;
    const done = preparation.done.includes(id)
      ? preparation.done.filter((item) => item !== id)
      : [...preparation.done, id];
    const next = { ...preparation, done };
    client.setQueryData(preparationQuery(departure.id, user.id).queryKey, next);
    savePreparation(departure.id, user.id, next).catch((cause: unknown) => {
      toast.error(cause instanceof Error ? cause.message : "Enregistrement impossible.");
      void client.invalidateQueries({ queryKey: preparationKey });
    });
  };
  const toggleProfile = (key: keyof Preparation["profile"]) => {
    if (!user) return;
    const next = {
      ...preparation,
      profile: { ...preparation.profile, [key]: !preparation.profile[key] },
    };
    client.setQueryData(preparationQuery(departure.id, user.id).queryKey, next);
    savePreparation(departure.id, user.id, next).catch(() => {
      void client.invalidateQueries({ queryKey: preparationKey });
    });
  };
  const updatePlaces = (next: JourneyPlaces | null) => {
    writePlaces(departure.id, next);
    setPlaces(next);
  };

  const renderPanel = (step: JourneyStepId, isPinned: boolean, onClose?: () => void): ReactNode => {
    const guide = stepGuide({
      step,
      direction,
      audience,
      from: from.name,
      to: to.name,
      vesselName: vessel?.name ?? null,
      presentationMinutes,
      departureMs,
      endMs,
      timeZone: fromZone,
      arrivalTimeZone: toZone,
      vehicle: preparation.profile.vehicle,
      roadMin,
      lastMin,
      destination: places ? ((outbound ? places.bled : places.home).split(",")[0] ?? null) : null,
    });
    const links = guide.links.map((link) =>
      link.href === "#port"
        ? { ...link, href: `/?select=port&id=${(step === "port" ? from : to).id}` }
        : link,
    );
    const before = (
      <>
        {traveller && step === "papers" ? (
          <div className="bw-journey-profile" role="group" aria-label="Mon voyage">
            {profileLabels.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={preparation.profile[key]}
                onClick={() => toggleProfile(key)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </>
    );
    // « J'y suis » : la déclaration se fait depuis l'étape, et la frise avance avec elle.
    const statuses = traveller ? STEP_STATUSES[step] : undefined;
    const picker = statuses ? (
      <TripStatusPicker
        departureId={departure.id}
        departureAt={departure.departure_at}
        arrivalAt={departure.arrival_at}
        fromPortId={from.id}
        only={statuses}
      />
    ) : null;
    // En mer et à l'arrivée : l'avancement du navire en tête de l'étape, sans quitter le voyage.
    const top =
      tracking && (step === "sea" || step === "arrival") ? (
        <>
          {/* Comme partout sur le site : le navire en mouvement ouvre sa fiche (retour au voyage). */}
          <div
            className="bw-step-tracker"
            role="button"
            tabIndex={0}
            aria-label={`Ouvrir la fiche ${vessel ? `du ${vessel.name}` : "de la traversée"}`}
            onClick={openShip}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              openShip();
            }}
          >
            <CrossingCard departure={fullDeparture} from={from} to={to} live={live} />
            <span className="bw-step-tracker__more" aria-hidden>
              Voir la fiche <ChevronRight size={14} />
            </span>
          </div>
          {picker}
        </>
      ) : (
        picker
      );
    // Noter sur le moment : le port en y arrivant, le navire et le port d'arrivée en débarquant.
    const rate = (kind: "port" | "vessel", id: string, label: string) => (
      <StepRate
        key={`${kind}:${id}`}
        kind={kind}
        id={id}
        label={label}
        onRate={(score) => {
          presetRating(kind, id, score);
          onSelect({ type: kind, id });
        }}
      />
    );
    const after = (
      <>
        {traveller && step === "port" ? rate("port", from.id, `Noter le port de ${from.name}`) : null}
        {traveller && step === "arrival" ? (
          <>
            {vessel ? rate("vessel", vessel.id, `Noter le ${vessel.name}`) : null}
            {rate("port", to.id, `Noter le port de ${to.name}`)}
          </>
        ) : null}
        {step === "home" && traveller ? (
          <div className="bw-step-panel__more">
            <button type="button" onClick={() => onSelect({ type: "departure", id: departure.id })}>
              Ajouter mon retour
            </button>
          </div>
        ) : step === "sea" && !tracking ? (
          <div className="bw-step-panel__more">
            <button type="button" onClick={() => onSelect({ type: "departure", id: departure.id })}>
              Toute la traversée en direct
            </button>
          </div>
        ) : null}
      </>
    );
    return (
      <JourneyStepPanel
        key={step}
        top={top}
        clampLead
        title={stepLabel(step, direction, audience)}
        state={stepState(step, current, steps)}
        index={steps.indexOf(step)}
        count={steps.length}
        // La carte d'avancement dit déjà tout pendant la traversée : pas de texte en double.
        lead={tracking && step === "sea" ? "" : guide.lead}
        links={links}
        items={itemsOf(step)}
        done={preparation.done}
        {...(traveller && user ? { onToggle: toggle } : {})}
        pinned={isPinned}
        {...(onClose ? { onClose } : {})}
        onAsk={onAsk}
        before={before}
        after={after}
        onNavigate={(href) => {
          const port = /^\/\?select=port&id=([^&]+)$/.exec(href)?.[1];
          if (port) onSelect({ type: "port", id: port });
          return Boolean(port);
        }}
      />
    );
  };

  const allItems = steps.flatMap((step) => itemsOf(step));
  const left = departureMs - now;
  const countdown =
    left > 0
      ? left > 48 * 3_600_000
        ? `${Math.floor(left / 86_400_000)} j ${Math.floor((left % 86_400_000) / 3_600_000)} h`
        : `${Math.floor(left / 3_600_000)} h ${String(Math.floor((left % 3_600_000) / 60_000)).padStart(2, "0")}`
      : null;

  return {
    trip,
    traveller,
    steps,
    friezeSteps,
    current,
    shown,
    index,
    pinned,
    hovering: hover !== null,
    setHover,
    pin: (step: JourneyStepId) => {
      setClosed(false);
      setHover(null);
      setPinned((value) => (value === step ? null : step));
    },
    close: () => {
      setPinned(null);
      setClosed(true);
    },
    setStoryIndex,
    mapProps,
    renderPanel,
    /** Le trajet sur mesure, en tête du voyage plutôt que dans une étape. */
    placesEntry: traveller ? (
      <JourneyPlacesEntry
        departureId={departure.id}
        europePort={outbound ? from : to}
        algeriaPort={outbound ? to : from}
        places={places}
        onChange={updatePlaces}
        invite={now < departureMs}
      />
    ) : null,
    /** Téléphone : le même accès au trajet sur mesure, en bouton rond dans l'en-tête. */
    placesButton: traveller ? (
      <JourneyPlacesEntry
        compact
        departureId={departure.id}
        europePort={outbound ? from : to}
        algeriaPort={outbound ? to : from}
        places={places}
        onChange={updatePlaces}
        invite={now < departureMs}
      />
    ) : null,
    info,
    /** Une info ou un signalement en cours : le bandeau « En direct » mérite sa place en tête. */
    liveAlert: info.official + info.travellers > 0,
    summary: {
      heading: traveller ? (outbound ? "Mon voyage · aller" : "Mon voyage · retour") : "Le voyage d'un proche",
      /** Le sens en un mot, pour l'en-tête du téléphone. */
      short: traveller ? (outbound ? "Aller" : "Retour") : "Voyage d'un proche",
      title: `${from.name} → ${to.name}`,
      vesselName: vessel?.name ?? null,
      countdown,
      cancelled: departure.status === "cancelled",
      done: allItems.filter((item) => preparation.done.includes(item.id)).length,
      total: allItems.length,
    },
    salon: {
      room: departure.id,
      title: `Salon ${from.name} → ${to.name}`,
      moment: roomMoment(departure.departure_at, departure.arrival_at, now),
      starterContext: {
        depart: from.name,
        arrivee: to.name,
        navire: vessel?.name ?? null,
        compagnie: companyName,
      },
    },
  };
}

export type Voyage = NonNullable<ReturnType<typeof useVoyage>>;

/** Une note en un geste depuis l'étape : l'étoile pré-remplit l'avis, la fiche s'ouvre dessus. */
function StepRate({
  kind,
  id,
  label,
  onRate,
}: {
  kind: "port" | "vessel";
  id: string;
  label: string;
  onRate: (score: number) => void;
}) {
  const feed = useQuery(entityReviewsQuery(kind, id)).data;
  return (
    <div className="bw-step-rate">
      <span>{label}</span>
      <RateStars
        average={feed?.average}
        count={feed?.count ?? 0}
        subject={kind === "vessel" ? "ce navire" : "ce port"}
        size={20}
        onRate={onRate}
      />
    </div>
  );
}
