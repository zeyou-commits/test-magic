import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ClientOnly, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Map as MapIcon, MessagesSquare, Minus, Route as RouteIcon } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteLayout";
import { QuickReport } from "@/components/map/QuickReport";
import { EmbeddedRoom } from "@/components/panel/LiveRoom";
import { LivePulse, useLiveInfo } from "@/components/panel/LivePulse";
import { TripStatusPicker } from "@/components/panel/TripPresence";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { JourneyFrieze, type FriezeStep } from "@/components/journey/JourneyFrieze";
import { JourneyStoryNav } from "@/components/journey/JourneyStoryNav";
import { JourneyStepPanel } from "@/components/journey/JourneyStepPanel";
import { JourneyPlacesForm } from "@/components/journey/JourneyPlacesForm";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFleet } from "@/lib/ferry/useFleet";
import { tripEnd, useMyTrip } from "@/lib/ferry/myTrip";
import { myTripStatusQuery } from "@/lib/ferry/presence";
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
  currentStep,
  durationLabel,
  journeyTimeline,
  stepGuide,
  stepItems,
  stepLabel,
  stepMoment,
  stepState,
  type JourneyAudience,
  type JourneyStepId,
  type TravelStatus,
} from "@/lib/ferry/journeySteps";
import {
  presentationQuery,
  readPlaces,
  relativeTripQuery,
  writePlaces,
  type JourneyDeparture,
  type JourneyPlaces,
} from "@/lib/ferry/journeyTrips";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { roomMoment } from "@/lib/ferry/portPassage";
import { journeyPortMeta } from "@/lib/ferry/journeyPortMeta";
import { portTimeZone } from "@/lib/ferry/time";
import type { ItineraryMapPreview } from "@/lib/ferry/itinerary";
import type { Port, RouteLine, Vessel } from "@/lib/ferry/types";
import { seoHead } from "@/lib/seo/site";

const FerryMap = lazy(() => import("@/components/map/FerryMap"));

export const Route = createFileRoute("/mon-voyage")({
  head: () =>
    seoHead(
      "Mon voyage — BledWay",
      "Votre route du bled étape par étape : préparatifs, route vers le port, traversée suivie en direct, arrivée et route au bled.",
      "/mon-voyage",
    ),
  component: MonVoyagePage,
});

function MonVoyagePage() {
  const { user, loading } = useAuth();
  const { trip, ready } = useMyTrip();
  const relative = useQuery(relativeTripQuery(user?.id));
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const waiting = loading || (user && (!ready || relative.isPending));

  let content: React.ReactNode;
  if (waiting) content = <p className="bw-journey-empty">Chargement de votre voyage…</p>;
  else if (!user) content = <JourneyEmpty signedIn={false} />;
  else if (trip?.route && trip.from && trip.to)
    content = (
      <Journey
        audience="traveller"
        departure={trip.departure}
        route={trip.route}
        from={trip.from}
        to={trip.to}
        vessel={trip.vessel}
      />
    );
  else if (relative.data) {
    const departure = relative.data;
    const route = routes.find((item) => item.id === departure.route_id);
    const from = ports.find((port) => port.id === route?.departure_port_id);
    const to = ports.find((port) => port.id === route?.arrival_port_id);
    content =
      route && from && to ? (
        <Journey
          audience="relative"
          departure={departure}
          route={route}
          from={from}
          to={to}
          vessel={vessels.find((vessel) => vessel.id === departure.vessel_id)}
        />
      ) : (
        <p className="bw-journey-empty">Chargement de la traversée…</p>
      );
  } else content = <JourneyEmpty signedIn />;

  return (
    <div className="bw-journey-page">
      <SiteHeader />
      <main id="contenu" tabIndex={-1} className="bw-journey">
        {content}
      </main>
    </div>
  );
}

/** Sans traversée suivie : la simulation reste ouverte à tous, le suivi en un geste. */
function JourneyEmpty({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="bw-journey-empty">
      <RouteIcon size={30} aria-hidden />
      <h1>Votre route du bled, étape par étape</h1>
      <p>
        {signedIn
          ? "Suivez votre traversée en tant que voyageur (ou celle d'un proche) : elle s'affichera ici, de la maison jusqu'au bled."
          : "Connectez-vous et suivez votre traversée : elle s'affichera ici, de la maison jusqu'au bled."}
      </p>
      <div>
        <Link
          to="/"
          className="bw-journey-empty__main"
          onClick={() => window.sessionStorage.setItem("bledway:open-home-action", "itinerary")}
        >
          Simuler mon trajet
        </Link>
        {signedIn ? (
          <Link to="/horaires">Choisir ma traversée</Link>
        ) : (
          <Link to="/auth" search={{ next: "/mon-voyage" } as never}>
            Me connecter
          </Link>
        )}
      </div>
    </section>
  );
}

function Journey({
  audience,
  departure,
  route,
  from,
  to,
  vessel,
}: {
  audience: Exclude<JourneyAudience, "simulation">;
  departure: JourneyDeparture;
  route: RouteLine;
  from: Port;
  to: Port;
  vessel: Vessel | undefined;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const traveller = audience === "traveller";
  const direction = tripDirection(from);
  const steps = traveller ? JOURNEY_STEPS : RELATIVE_STEPS;
  const fromZone = portTimeZone(from);
  const toZone = portTimeZone(to);

  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const upcoming = useQuery(upcomingDeparturesQuery()).data;
  const departures = useMemo(() => upcoming ?? [], [upcoming]);
  const fleet = useFleet();
  const presentation = useQuery(presentationQuery(departure.id)).data;
  const presentationMinutes = departure.presentation_minutes ?? presentation ?? null;
  const status =
    useQuery({ ...myTripStatusQuery(departure.id, user?.id), enabled: traveller && Boolean(user) })
      .data ?? null;
  const prep = useQuery({
    ...preparationQuery(departure.id, user?.id),
    enabled: traveller && Boolean(user),
  });
  const preparation: Preparation = prep.data ?? { profile: defaultProfile, done: [] };
  const companyName =
    companies.find(
      (company) =>
        company.id ===
        (departures.find((item) => item.id === departure.id)?.company_id ?? vessel?.company_id),
    )?.name ?? null;

  const [places, setPlaces] = useState<JourneyPlaces | null>(null);
  useEffect(() => setPlaces(readPlaces(departure.id)), [departure.id]);
  const updatePlaces = (next: JourneyPlaces | null) => {
    writePlaces(departure.id, next);
    setPlaces(next);
  };
  const outbound = direction === "outbound";
  const roadMin = places ? (outbound ? places.europeMin : places.algeriaMin) : null;
  const lastMin = places ? (outbound ? places.algeriaMin : places.europeMin) : null;

  // Une minute suffit : l'étape du moment avance avec l'heure.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
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
  const current = currentStep({
    timeline,
    now,
    status: status as TravelStatus | null,
    steps,
    completed,
  });

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
        return stepMoment(departureMs, fromZone);
      case "arrival":
        return stepMoment(endMs, toZone);
      case "last":
        return lastMin ? `≈ ${durationLabel(lastMin)}` : "après le port";
      case "home":
        return audience === "relative" ? "fin du voyage" : "bien arrivé·e ?";
    }
  };
  const friezeSteps: FriezeStep[] = steps.map((step) => ({
    id: step,
    label: stepLabel(step, direction, audience),
    sub: subOf(step),
    state: stepState(step, current, steps),
    late:
      stepState(step, current, steps) === "done" &&
      itemsOf(step).length > 0 &&
      !completed.includes(step),
  }));

  // Ordinateur : survol = aperçu ; clic = figé ; croix = fermé jusqu'au prochain geste.
  const [hover, setHover] = useState<JourneyStepId | null>(null);
  const [pinned, setPinned] = useState<JourneyStepId | null>(null);
  const [closed, setClosed] = useState(false);
  // Téléphone : la story affichée, et la carte dévoilée ou non.
  const [storyIndex, setStoryIndex] = useState<number | null>(null);
  const [mapMode, setMapMode] = useState(false);
  const [salonOpen, setSalonOpen] = useState(true);
  const [salonDialog, setSalonDialog] = useState(false);
  const index = storyIndex ?? steps.indexOf(current);
  const shown: JourneyStepId | null = isMobile
    ? (steps[index] ?? current)
    : (hover ?? pinned ?? (closed ? null : current));

  // Le cadrage de la carte suit l'étape regardée.
  const focusStep = shown ?? current;
  const showRoads = Boolean(places) && (focusStep === "road" || focusStep === "last");
  const fitPortIds =
    focusStep === "port"
      ? [from.id]
      : focusStep === "arrival" || (focusStep === "last" && !showRoads)
        ? [to.id]
        : [from.id, to.id];
  const preview = useMemo<ItineraryMapPreview | null>(() => {
    if (!places || !showRoads) return null;
    const fromPoint: [number, number] = [from.longitude, from.latitude];
    const toPoint: [number, number] = [to.longitude, to.latitude];
    const reverse = (line: [number, number][]) => [...line].reverse();
    const first = outbound ? places.europeLine : reverse(places.algeriaLine);
    const last = outbound ? places.algeriaLine : reverse(places.europeLine);
    return {
      key: 1,
      routeId: route.id,
      origin: outbound ? places.homePoint : places.bledPoint,
      destination: outbound ? places.bledPoint : places.homePoint,
      departurePort: fromPoint,
      arrivalPort: toPoint,
      roadToPort: first.length
        ? first
        : [outbound ? places.homePoint : places.bledPoint, fromPoint],
      roadDetailed: first.length > 0 && last.length > 0,
      ferry: [fromPoint, toPoint],
      roadFromPort: last.length ? last : [toPoint, outbound ? places.bledPoint : places.homePoint],
      alternatives: [],
    };
  }, [places, showRoads, outbound, from, to, route.id]);
  const portMeta = useMemo(
    () => journeyPortMeta([from.id, to.id], ports, routes, companies, departures),
    [from.id, to.id, ports, routes, companies, departures],
  );
  const myShip = fleet.find((ship) => ship.departureId === departure.id);
  const shipsOnLine = fleet.filter((ship) => ship.routeId === route.id);

  const info = useLiveInfo({
    departureId: departure.id,
    routeIds: [route.id],
    portIds: [from.id, to.id],
    signalPortIds: [from.id],
    signalVesselIds: vessel ? [vessel.id] : [],
    vesselId: departure.vessel_id,
  });
  const openDeparture = () =>
    void navigate({ to: "/", search: { select: "departure", id: departure.id } as never });
  const portHref = (port: Port) => `/?select=port&id=${port.id}`;

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

  const askSalon = () => (isMobile ? setSalonDialog(true) : setSalonOpen(true));
  const moment = roomMoment(departure.departure_at, departure.arrival_at, now);
  const vesselName = vessel?.name ?? null;
  const roomTitle = `Salon ${from.name} → ${to.name}`;
  const starterContext = {
    depart: from.name,
    arrivee: to.name,
    navire: vesselName,
    compagnie: companyName,
  };

  const renderPanel = (step: JourneyStepId, isPinned: boolean, onClose?: () => void) => {
    const guide = stepGuide({
      step,
      direction,
      audience,
      from: from.name,
      to: to.name,
      vesselName,
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
      link.href === "#port" ? { ...link, href: portHref(step === "port" ? from : to) } : link,
    );
    const europePort = outbound ? from : to;
    const algeriaPort = outbound ? to : from;
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
        {traveller && (step === "road" || step === "last") ? (
          <JourneyPlacesForm
            europePort={europePort}
            algeriaPort={algeriaPort}
            places={places}
            onChange={updatePlaces}
          />
        ) : null}
        {traveller &&
        step === current &&
        ["road", "port", "sea", "arrival", "last"].includes(step) ? (
          <TripStatusPicker
            departureId={departure.id}
            departureAt={departure.departure_at}
            arrivalAt={departure.arrival_at}
            fromPortId={from.id}
          />
        ) : null}
      </>
    );
    const after =
      step === "home" && traveller ? (
        <div className="bw-step-panel__more">
          {vessel ? (
            <Link to="/" search={{ select: "vessel", id: vessel.id } as never}>
              Noter le {vessel.name}
            </Link>
          ) : null}
          <button type="button" onClick={openDeparture}>
            Ajouter mon retour
          </button>
        </div>
      ) : step === "sea" ? (
        <div className="bw-step-panel__more">
          <button type="button" onClick={openDeparture}>
            Toute la traversée en direct
          </button>
        </div>
      ) : null;
    return (
      <JourneyStepPanel
        title={stepLabel(step, direction, audience)}
        state={stepState(step, current, steps)}
        index={steps.indexOf(step)}
        count={steps.length}
        lead={guide.lead}
        links={links}
        items={itemsOf(step)}
        done={preparation.done}
        {...(traveller && user ? { onToggle: toggle } : {})}
        pinned={isPinned}
        {...(onClose ? { onClose } : {})}
        onAsk={askSalon}
        before={before}
        after={after}
      />
    );
  };

  // Téléphone : la story recouvre le bas de la carte ; Signaler et le salon montent avec elle.
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const measure = () => setSheetHeight(Math.round(sheet.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [isMobile, mapMode]);

  const allItems = steps.flatMap((step) => itemsOf(step));
  const doneCount = allItems.filter((item) => preparation.done.includes(item.id)).length;
  const left = departureMs - now;
  const countdown =
    left > 0
      ? left > 48 * 3_600_000
        ? `${Math.floor(left / 86_400_000)} j ${Math.floor((left % 86_400_000) / 3_600_000)} h`
        : `${Math.floor(left / 3_600_000)} h ${String(Math.floor((left % 3_600_000) / 60_000)).padStart(2, "0")}`
      : null;
  const cancelled = departure.status === "cancelled";
  const heading = traveller
    ? outbound
      ? "MON VOYAGE · ALLER"
      : "MON VOYAGE · RETOUR"
    : "LE VOYAGE D'UN PROCHE";

  return (
    <div
      className="bw-journey-shell"
      data-mobile={isMobile || undefined}
      style={{ "--journey-fab": `${sheetHeight + 64}px` } as React.CSSProperties}
    >
      {!isMobile ? (
        <>
          <section className="bw-journey-hero" aria-label="Ma traversée">
            <div>
              <span>{heading}</span>
              <h1>
                {from.name} → {to.name}
                {vesselName ? ` · ${vesselName}` : ""}
              </h1>
              <p>
                Départ{" "}
                {new Date(departureMs).toLocaleString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: fromZone,
                })}{" "}
                (heure de {from.name})
                {cancelled ? <b className="bw-journey-hero__cancel"> · Annulée</b> : null}
              </p>
            </div>
            <LivePulse info={info} onOpen={openDeparture} />
            <dl>
              {countdown ? (
                <div>
                  <dd>{countdown}</dd>
                  <dt>avant le départ</dt>
                </div>
              ) : null}
              {traveller && allItems.length ? (
                <div>
                  <dd>
                    {doneCount}/{allItems.length}
                  </dd>
                  <dt>actions faites</dt>
                </div>
              ) : null}
            </dl>
          </section>
          <section className="bw-journey-frieze" aria-label="Les étapes du voyage">
            <JourneyFrieze
              steps={friezeSteps}
              shownId={shown}
              pinnedId={pinned}
              onHover={setHover}
              onPin={(step) => {
                setClosed(false);
                setHover(null);
                setPinned((value) => (value === step ? null : step));
              }}
              hereLabel={traveller ? "Vous êtes ici" : "En ce moment"}
            />
          </section>
        </>
      ) : (
        <div className="bw-journey-top">
          <p>
            <b>{heading}</b> · {from.name} → {to.name}
            {countdown ? ` · départ dans ${countdown}` : ""}
          </p>
          <JourneyStoryNav
            steps={friezeSteps}
            index={index}
            onChange={(next) => setStoryIndex(next)}
          />
        </div>
      )}

      <div className="bw-journey-map">
        <ClientOnly fallback={<div className="bw-journey-map__wait" />}>
          <Suspense fallback={<div className="bw-journey-map__wait" />}>
            <FerryMap
              ports={ports}
              routes={routes}
              visibleRouteIds={[route.id]}
              fleetVisibleRouteIds={[route.id]}
              dateActiveRouteIds={[route.id]}
              focusRouteIds={[route.id]}
              selection={null}
              highlightedPortIds={[from.id, to.id]}
              fitPortIds={fitPortIds}
              fleet={shipsOnLine}
              focusShipId={myShip?.id ?? null}
              itineraryPreview={preview}
              portMeta={portMeta}
              onSelect={(selection) => {
                if (selection) void navigate({ to: "/", search: selection as never });
              }}
              mobileBottomInset={isMobile ? sheetHeight + 8 : 0}
              mobileTopInset={isMobile ? 70 : 0}
              desktopLeftInset={!isMobile && shown ? 420 : 0}
              desktopRightInset={!isMobile && salonOpen ? 380 : 0}
            />
          </Suspense>
        </ClientOnly>

        {!isMobile && shown ? (
          <div className="bw-journey-panel" key={shown}>
            {renderPanel(shown, Boolean(pinned) && !hover, () => {
              setPinned(null);
              setClosed(true);
            })}
          </div>
        ) : null}

        {!isMobile && salonOpen ? (
          <aside className="bw-journey-salon" aria-label={roomTitle}>
            <button
              type="button"
              className="bw-journey-salon__min"
              onClick={() => setSalonOpen(false)}
              aria-label="Réduire le salon"
            >
              <Minus size={14} aria-hidden />
            </button>
            <EmbeddedRoom
              kind="crossing"
              room={departure.id}
              title={roomTitle}
              moment={moment}
              starterContext={starterContext}
            />
          </aside>
        ) : null}

        {!isMobile && !salonOpen ? (
          <button
            type="button"
            className="bw-journey-salon-fab"
            onClick={() => setSalonOpen(true)}
            aria-label="Ouvrir le salon de la traversée"
          >
            <MessagesSquare size={20} aria-hidden />
            <span>Salon</span>
          </button>
        ) : null}

        {traveller ? (
          <QuickReport
            ports={ports}
            fleet={fleet}
            departures={departures}
            selection={{ type: "departure", id: departure.id }}
          >
            {isMobile ? (
              <button
                type="button"
                className="bw-journey-salon-fab"
                data-mobile
                onClick={() => setSalonDialog(true)}
                aria-label="Ouvrir le salon de la traversée"
              >
                <MessagesSquare size={20} aria-hidden />
              </button>
            ) : null}
          </QuickReport>
        ) : isMobile ? (
          <button
            type="button"
            className="bw-journey-salon-fab"
            data-mobile
            data-alone
            onClick={() => setSalonDialog(true)}
            aria-label="Ouvrir le salon de la traversée"
          >
            <MessagesSquare size={20} aria-hidden />
          </button>
        ) : null}

        {isMobile ? (
          <div className="bw-journey-sheet" ref={sheetRef} data-collapsed={mapMode || undefined}>
            {mapMode ? (
              <button
                type="button"
                className="bw-journey-sheet__bar"
                onClick={() => setMapMode(false)}
              >
                <strong>{stepLabel(steps[index] ?? current, direction, audience)}</strong>
                <span>Afficher l'étape</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="bw-journey-sheet__map"
                  onClick={() => setMapMode(true)}
                >
                  <MapIcon size={14} aria-hidden /> Voir la carte
                </button>
                <LivePulse info={info} onOpen={openDeparture} />
                {renderPanel(steps[index] ?? current, false)}
              </>
            )}
          </div>
        ) : null}
      </div>

      <Dialog open={salonDialog} onOpenChange={setSalonDialog}>
        <DialogContent className="bw-chat-window">
          {salonDialog ? (
            <EmbeddedRoom
              kind="crossing"
              room={departure.id}
              title={roomTitle}
              moment={moment}
              starterContext={starterContext}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
