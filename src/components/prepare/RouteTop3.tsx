import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Map as MapIcon, Navigation } from "lucide-react";
import { isTowardsSouth } from "@/lib/ferry/markets";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
} from "@/lib/ferry/queries";
import { buildSailings } from "@/lib/ferry/trips";
import { calculateRoadAccess } from "@/lib/ferry/itinerary.functions";
import {
  BOARDING_BUFFER_MIN,
  DISEMBARK_BUFFER_MIN,
  buildItineraryOptions,
  buildSimulatedSailings,
  distinctItineraries,
  formatDayTime,
  legWithPauses,
  pauseNote,
  type ItineraryOption,
} from "@/lib/ferry/itinerary";
import { estimateFare } from "@/lib/ferry/pricing";
import { portTimeZone } from "@/lib/ferry/time";
import { defaultTripProfile } from "@/components/panel/TripProfile";
import { formatDuration, type CompanionPlan } from "@/lib/ferry/companion";

/** Repères de coût routier (mêmes valeurs par défaut que l'itinéraire de la carte). */
const FUEL_L_PER_100 = 7;
const FUEL_EURO_PER_L = 1.8;
const TOLL_EURO_PER_KM = 0.06;

const numberFormat = new Intl.NumberFormat("fr-FR");

const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Les jours où l'on cherche un départ : la période choisie, sinon le jour ±3, sinon le mois. */
function travelDays(plan: CompanionPlan) {
  if (plan.window) return { from: plan.window.from, to: plan.window.to };
  if (plan.date) return { from: addDays(plan.date, -3), to: addDays(plan.date, 3) };
  return { from: `${plan.month}-01`, to: `${plan.month}-31` };
}

/**
 * Les trois meilleurs trajets porte à porte, calculés sans quitter « Préparer » :
 * le même calcul que l'itinéraire de la carte, montré comme un fil d'étapes daté.
 */
export function RouteTop3({
  plan,
  adults,
  children,
  onPickPorts,
  onMore,
}: {
  plan: CompanionPlan;
  adults: number;
  children: number;
  onPickPorts: (fromPortId: string, toPortId: string) => void;
  onMore: () => void;
}) {
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: departures = [] } = useQuery(upcomingDeparturesQuery());
  const { data: companies = [] } = useQuery(companiesQuery);

  const relevantRoutes = useMemo(
    () =>
      routes.filter((route) => {
        const from = ports.find((port) => port.id === route.departure_port_id);
        const to = ports.find((port) => port.id === route.arrival_port_id);
        return (
          from?.status === "active" &&
          to?.status === "active" &&
          isTowardsSouth(from.country_code, to.country_code)
        );
      }),
    [ports, routes],
  );
  const departurePorts = useMemo(() => {
    const ids = new Set(relevantRoutes.map((route) => route.departure_port_id));
    return ports.filter((port) => ids.has(port.id));
  }, [ports, relevantRoutes]);
  const arrivalPorts = useMemo(() => {
    const ids = new Set(relevantRoutes.map((route) => route.arrival_port_id));
    return ports.filter((port) => ids.has(port.id));
  }, [ports, relevantRoutes]);

  // Sans adresse au bled, on s'arrête au port d'arrivée choisi.
  const arrivalPort = ports.find((port) => port.id === plan.toPortId) ?? null;
  const destinationPoint: [number, number] | null =
    plan.destination?.point ?? (arrivalPort ? [arrivalPort.longitude, arrivalPort.latitude] : null);
  const destinationLabel = plan.destination?.label ?? arrivalPort?.name ?? "";
  const origin = plan.home
    ? plan.home.postcode
      ? `${plan.home.name} (${plan.home.postcode})`
      : plan.home.name
    : "";
  const ready = Boolean(
    plan.home && destinationPoint && departurePorts.length && arrivalPorts.length,
  );

  const road = useQuery({
    queryKey: [
      "prepare-road-access",
      plan.home?.point,
      destinationPoint,
      departurePorts.map((port) => port.id).join(","),
      arrivalPorts.map((port) => port.id).join(","),
    ],
    enabled: ready,
    staleTime: 60 * 60_000,
    retry: 1,
    queryFn: () =>
      calculateRoadAccess({
        data: {
          origin,
          destination: destinationLabel,
          originPoint: plan.home!.point,
          destinationPoint: destinationPoint!,
          departurePorts: departurePorts.map(({ id, longitude, latitude }) => ({
            id,
            longitude,
            latitude,
          })),
          arrivalPorts: arrivalPorts.map(({ id, longitude, latitude }) => ({
            id,
            longitude,
            latitude,
          })),
        },
      }),
  });

  const sailings = useMemo(
    () => buildSailings(departures, relevantRoutes, ports, companies, []),
    [departures, relevantRoutes, ports, companies],
  );
  const days = travelDays(plan);
  const top = useMemo(() => {
    const access = road.data;
    if (!access) return [];
    const profile = {
      ...defaultTripProfile,
      vehicle: plan.vehicle,
      passengers: { ...defaultTripProfile.passengers, adults, children },
    };
    const fare = (sailing: (typeof sailings)[number]) => estimateFare(sailing, profile);
    const published = sailings.filter(
      (sailing) =>
        !sailing.departure.is_demo && sailing.dayKey >= days.from && sailing.dayKey <= days.to,
    );
    const startedAt = Math.max(Date.now(), Date.parse(`${days.from}T00:00:00`));
    const real = buildItineraryOptions(
      published,
      access.toDeparturePorts,
      access.fromArrivalPorts,
      startedAt,
      fare,
      FUEL_L_PER_100,
      FUEL_EURO_PER_L,
      TOLL_EURO_PER_KM,
    );
    const simulated = buildItineraryOptions(
      buildSimulatedSailings(
        relevantRoutes,
        ports,
        plan.month,
        new Set(published.map((sailing) => sailing.route.id)),
      ),
      access.toDeparturePorts,
      access.fromArrivalPorts,
      Date.parse(`${plan.month}-01T00:00:00Z`),
      fare,
      FUEL_L_PER_100,
      FUEL_EURO_PER_L,
      TOLL_EURO_PER_KM,
    );
    const sorted = distinctItineraries([...real, ...simulated], "recommended", children);
    // Les vrais départs d'abord : une simulation ne passe jamais devant un horaire publié.
    const dated = sorted.filter((option) => !option.sailing.isSimulation);
    return [...dated, ...sorted.filter((option) => option.sailing.isSimulation)].slice(0, 3);
  }, [
    road.data,
    sailings,
    relevantRoutes,
    ports,
    plan.vehicle,
    plan.month,
    adults,
    children,
    days.from,
    days.to,
  ]);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!plan.home)
    return (
      <p className="mt-6 rounded-xl bg-secondary/50 p-3 text-sm text-muted-foreground">
        Indiquez d'où vous partez pour voir vos trajets porte à porte.
      </p>
    );
  if (!destinationPoint)
    return (
      <p className="mt-6 rounded-xl bg-secondary/50 p-3 text-sm text-muted-foreground">
        Choisissez votre port d'arrivée (ou votre ville au bled) pour voir vos trajets porte à
        porte.
      </p>
    );

  const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
    new Date(`${plan.month}-15T12:00:00Z`),
  );
  const shownId = openId ?? top[0]?.sailing.departure.id ?? null;

  return (
    <section aria-labelledby="top3-title" className="mt-6">
      <h3 id="top3-title" className="font-display text-lg font-bold">
        Vos 3 meilleurs trajets porte à porte
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        De {plan.home.name} à {destinationLabel} : route, traversée et dernière route, avec les
        heures.
      </p>
      {road.isPending ? (
        <ol className="mt-3 grid gap-2" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <li key={index} className="h-16 animate-pulse rounded-2xl bg-secondary/60" />
          ))}
        </ol>
      ) : road.isError ? (
        <p className="mt-3 rounded-xl bg-secondary p-3 text-sm">
          Le calcul de la route n'a pas abouti.{" "}
          <button
            type="button"
            onClick={() => void road.refetch()}
            className="font-semibold text-primary underline underline-offset-4"
          >
            Réessayer
          </button>
        </p>
      ) : !top.length ? (
        <p className="mt-3 rounded-xl bg-secondary p-3 text-sm">
          Aucune traversée atteignable sur cette période. Voyez les autres dates sur la carte.
        </p>
      ) : (
        <ol className="mt-3 grid gap-2">
          {top.map((option, rank) => (
            <RouteCard
              key={option.sailing.departure.id}
              option={option}
              rank={rank}
              open={option.sailing.departure.id === shownId}
              chosen={
                option.sailing.from.id === plan.fromPortId && option.sailing.to.id === plan.toPortId
              }
              monthLabel={monthLabel}
              destination={road.data?.destination ?? destinationLabel}
              onToggle={() =>
                setOpenId(
                  option.sailing.departure.id === shownId ? "none" : option.sailing.departure.id,
                )
              }
              onPick={() => onPickPorts(option.sailing.from.id, option.sailing.to.id)}
            />
          ))}
        </ol>
      )}
      <button
        type="button"
        onClick={onMore}
        className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-primary px-4 text-sm font-bold text-primary hover:bg-primary/5"
      >
        <MapIcon size={16} aria-hidden /> Voir plus : la simulation sur la carte
      </button>
      <p className="mt-2 text-xs text-muted-foreground">
        La carte s'ouvre avec votre départ, votre arrivée et votre période déjà remplis : autres
        dates, péages, carburant et la route animée.
      </p>
    </section>
  );
}

function RouteCard({
  option,
  rank,
  open,
  chosen,
  monthLabel,
  destination,
  onToggle,
  onPick,
}: {
  option: ItineraryOption;
  rank: number;
  open: boolean;
  chosen: boolean;
  monthLabel: string;
  destination: string;
  onToggle: () => void;
  onPick: () => void;
}) {
  const simulated = Boolean(option.sailing.isSimulation);
  const fromZone = portTimeZone(option.sailing.from);
  const toZone = portTimeZone(option.sailing.to);
  const when = (at: number, arrival = false) =>
    simulated
      ? at === option.leaveHomeAt
        ? `Date à confirmer en ${monthLabel}`
        : `≈ ${formatDuration(Math.round((at - option.leaveHomeAt) / 60_000))} après le départ`
      : formatDayTime(at, arrival ? toZone : fromZone);
  const atPort = option.leaveHomeAt + legWithPauses(option.originRoad.durationMin) * 60_000;
  const sail = Date.parse(option.sailing.departure.departure_at);
  const land = option.sailing.departure.arrival_at
    ? Date.parse(option.sailing.departure.arrival_at)
    : sail + (option.sailing.durationMin ?? 0) * 60_000;
  const out = land + DISEMBARK_BUFFER_MIN * 60_000;
  const steps = [
    {
      icon: "🏠",
      at: when(option.leaveHomeAt),
      title: "Départ de chez vous",
      text: `${Math.round(option.originRoad.distanceKm)} km, ${formatDuration(option.originRoad.durationMin)} jusqu'à ${option.sailing.from.name}${pauseNote(option.originRoad.durationMin)}`,
    },
    {
      icon: "⚓",
      at: when(atPort),
      title: `Au port de ${option.sailing.from.name}`,
      text: `${BOARDING_BUFFER_MIN / 60} h de marge avant le départ : l'heure de convocation de votre billet fait foi`,
    },
    {
      icon: "🚢",
      at: when(sail),
      title: `Traversée${option.sailing.company ? ` avec ${option.sailing.company.name}` : ""}`,
      text: `${formatDuration(option.sailing.durationMin ?? 0)} de mer jusqu'à ${option.sailing.to.name}${simulated ? " (durée estimée)" : ""}`,
    },
    {
      icon: "🛃",
      at: when(land, true),
      title: `Arrivée à ${option.sailing.to.name}`,
      text: `Débarquement, contrôles et sortie du port : ${DISEMBARK_BUFFER_MIN / 60} h de marge`,
    },
    {
      icon: "🛣️",
      at: when(out, true),
      title: "La dernière route",
      text: `${Math.round(option.destinationRoad.distanceKm)} km, ${formatDuration(option.destinationRoad.durationMin)}${pauseNote(option.destinationRoad.durationMin)}`,
    },
    {
      icon: "🏁",
      at: when(option.arrivalAt, true),
      title: "Bien arrivé au bled",
      text: destination,
    },
  ];
  const medal = ["🥇", "🥈", "🥉"][rank] ?? `${rank + 1}`;
  return (
    <li
      className={`rounded-2xl border bg-background shadow-sm ${open ? "border-primary ring-2 ring-primary/15" : ""}`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <span className="text-xl leading-none" aria-hidden>
          {medal}
        </span>
        <span className="min-w-0 flex-1">
          {rank === 0 ? (
            <span className="block text-[11px] font-extrabold uppercase tracking-wide text-primary">
              Notre conseil
            </span>
          ) : null}
          <strong className="block truncate text-[15px] leading-tight">
            {option.sailing.from.name} → {option.sailing.to.name}
          </strong>
          <span className="block text-xs text-muted-foreground">
            {formatDuration(option.totalMinutes)} de porte à porte
            {simulated ? " · horaires pas encore publiés" : ""}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <strong className="block text-[15px] tabular-nums">
            ≈ {numberFormat.format(option.totalEuro)} €
          </strong>
          <span className="block text-[10px] text-muted-foreground">route + ferry</span>
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="border-t px-3 pb-3 pt-3">
          <ol className="relative grid gap-3 before:absolute before:bottom-3 before:left-[13px] before:top-3 before:w-px before:bg-border before:content-['']">
            {steps.map((step) => (
              <li key={step.title} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-2">
                <span
                  className="z-[1] grid size-7 place-items-center rounded-full border bg-background text-sm"
                  aria-hidden
                >
                  {step.icon}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <strong className="text-xs">{step.title}</strong>
                    <span className="text-[11px] font-bold tabular-nums text-primary">
                      {step.at}
                    </span>
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    {step.text}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          {chosen ? (
            <p className="mt-3 text-center text-xs font-semibold text-primary">
              Ce sont vos ports choisis.
            </p>
          ) : (
            <button
              type="button"
              onClick={onPick}
              className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              <Navigation size={15} aria-hidden /> Choisir {option.sailing.from.name} →{" "}
              {option.sailing.to.name}
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
}
