import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2 } from "lucide-react";
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
import {
  formatDuration,
  FUEL_EURO_PER_L,
  FUEL_L_PER_100,
  TOLL_EURO_PER_KM,
  type CompanionPlan,
} from "@/lib/ferry/companion";

export { FUEL_EURO_PER_L, FUEL_L_PER_100, TOLL_EURO_PER_KM };

const numberFormat = new Intl.NumberFormat("fr-FR");

const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Les jours où l'on cherche un départ : la période choisie, sinon le jour ±3, sinon le mois. */
export function travelDays(plan: CompanionPlan) {
  if (plan.window) return { from: plan.window.from, to: plan.window.to };
  if (plan.date) return { from: addDays(plan.date, -3), to: addDays(plan.date, 3) };
  return { from: `${plan.month}-01`, to: `${plan.month}-31` };
}

// Le prix a son étape (Budget) : la route compare les durées, portion par portion.
export type Asset = "balance" | "trip" | "sea" | "road";
export const assetLabels: Record<Asset, string> = {
  balance: "Notre conseil",
  trip: "Voyage le plus court",
  sea: "Traversée la plus courte",
  road: "Route la plus courte jusqu'au port",
};

/**
 * Notre sélection : le trajet conseillé, puis le gagnant de chaque atout (voyage, traversée,
 * route, prix). Un trajet qui gagne plusieurs atouts n'apparaît qu'une fois, avec ses badges.
 */
export function selectionByAsset(pool: ItineraryOption[], limit = 4) {
  const leader = pool[0];
  if (!leader) return [];
  const best = (value: (option: ItineraryOption) => number) =>
    [...pool].sort((a, b) => value(a) - value(b))[0]!;
  const winners: [Asset, ItineraryOption][] = [
    ["balance", leader],
    ["trip", best((option) => option.totalMinutes)],
    ["sea", best((option) => option.sailing.durationMin ?? Infinity)],
    ["road", best((option) => option.originRoad.distanceKm)],
  ];
  const picked: { option: ItineraryOption; assets: Asset[] }[] = [];
  for (const [asset, option] of winners) {
    if (pool.length < 2 && asset !== "balance") continue;
    const found = picked.find((item) => item.option === option);
    if (found) found.assets.push(asset);
    else picked.push({ option, assets: [asset] });
  }
  return picked.slice(0, limit);
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
  onRecommend,
}: {
  plan: CompanionPlan;
  adults: number;
  children: number;
  onPickPorts: (fromPortId: string, toPortId: string) => void;
  /** Le trajet conseillé, tant que le voyageur n'a rien choisi lui-même. */
  onRecommend?: (fromPortId: string, toPortId: string) => void;
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
    return selectionByAsset(dated.length ? dated : sorted);
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
  // Rien de choisi à la main : la case cochée est celle du conseil, pas le port le plus proche.
  const advised = top[0]?.option.sailing;
  const advisedFrom = advised?.from.id;
  const advisedTo = advised?.to.id;
  useEffect(() => {
    if (plan.portsChosen || !advisedFrom || !advisedTo) return;
    if (plan.fromPortId === advisedFrom && plan.toPortId === advisedTo) return;
    onRecommend?.(advisedFrom, advisedTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisedFrom, advisedTo, plan.portsChosen, plan.fromPortId, plan.toPortId]);
  const [openId, setOpenId] = useState<string | null>(null);
  // Un nouveau calcul lancé par le voyageur (ville, destination) : on l'amène sous ses yeux.
  const section = useRef<HTMLElement>(null);
  const seen = useRef(false);
  useEffect(() => {
    if (!seen.current) {
      seen.current = true;
      return;
    }
    if (!road.isFetching) return;
    const box = section.current?.getBoundingClientRect();
    if (box && (box.top < 0 || box.top > window.innerHeight * 0.6))
      section.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [road.isFetching]);

  if (!plan.home) return null;
  if (!destinationPoint)
    return (
      <p className="bw-route__empty">
        Ajoutez votre ville au bled, ou choisissez un port d'arrivée, pour voir vos trajets porte à
        porte.
      </p>
    );

  const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
    new Date(`${plan.month}-15T12:00:00Z`),
  );
  const estimated = top.some(({ option }) => option.sailing.isSimulation);

  return (
    <section ref={section} aria-labelledby="top3-title" className="bw-route__top scroll-mt-4">
      <h3 id="top3-title" className="bw-route__h">
        {top.length > 1 ? `Vos ${top.length} meilleurs trajets` : "Votre trajet"}
        <span>porte à porte · {monthLabel}</span>
      </h3>
      {road.isPending || (road.isFetching && !top.length) ? (
        <RouteLoading month={monthLabel} destination={destinationLabel} />
      ) : road.isError ? (
        <p className="bw-route__empty">
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
        <p className="bw-route__empty">
          Aucune traversée atteignable sur cette période. Voyez les autres dates sur la carte.
        </p>
      ) : (
        <ol className="grid gap-2">
          {top.map(({ option, assets }) => (
            <RouteCard
              key={option.sailing.departure.id}
              option={option}
              assets={assets}
              open={option.sailing.departure.id === openId}
              chosen={
                option.sailing.from.id === plan.fromPortId && option.sailing.to.id === plan.toPortId
              }
              monthLabel={monthLabel}
              destination={road.data?.destination ?? destinationLabel}
              onToggle={() =>
                setOpenId(
                  option.sailing.departure.id === openId ? null : option.sailing.departure.id,
                )
              }
              onPick={() => onPickPorts(option.sailing.from.id, option.sailing.to.id)}
            />
          ))}
        </ol>
      )}
      {estimated ? (
        <p className="bw-route__note">
          Horaires pas encore publiés pour cette période : heures et durées estimées.
        </p>
      ) : null}
    </section>
  );
}

function RouteCard({
  option,
  assets,
  open,
  chosen,
  monthLabel,
  destination,
  onToggle,
  onPick,
}: {
  option: ItineraryOption;
  assets: Asset[];
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
  // Les trois portions à l'échelle : on voit d'un coup d'œil où passe le temps.
  const legs = [
    {
      kind: "road",
      icon: "🚗",
      time: option.originRoad.durationMin,
      sub: `${Math.round(option.originRoad.distanceKm)} km`,
    },
    { kind: "sea", icon: "⛴️", time: option.sailing.durationMin ?? 0, sub: "en mer" },
    {
      kind: "road",
      icon: "🚗",
      time: option.destinationRoad.durationMin,
      sub: `${Math.round(option.destinationRoad.distanceKm)} km`,
    },
  ];
  const sum = legs.reduce((total, leg) => total + leg.time, 0) || 1;
  return (
    <li className="bw-rcard" data-chosen={chosen || undefined} data-open={open || undefined}>
      <button type="button" aria-pressed={chosen} onClick={onPick} className="bw-rcard__main">
        <span className="bw-rcard__head">
          <span className="bw-rcard__pick" aria-hidden>
            {chosen ? <Check size={13} strokeWidth={3.5} /> : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="bw-rcard__badges">
              {assets.map((asset) => (
                <span key={asset} data-asset={asset}>
                  {assetLabels[asset]}
                </span>
              ))}
            </span>
            <strong className="bw-rcard__name">
              {option.sailing.from.name} → {option.sailing.to.name}
            </strong>
          </span>
          <span className="bw-rcard__total">
            <strong>{formatDuration(option.totalMinutes)}</strong>
            <span>porte à porte</span>
          </span>
        </span>
        <span className="bw-rcard__bar" aria-hidden>
          {legs.map((leg, index) => (
            <i
              key={index}
              data-kind={leg.kind}
              style={{ flexGrow: Math.max(leg.time / sum, 0.08) }}
            />
          ))}
        </span>
        <span className="bw-rcard__legs">
          {legs.map((leg, index) => (
            <span key={index} data-kind={leg.kind}>
              <b>
                <span aria-hidden>{leg.icon}</span> {formatDuration(leg.time)}
              </b>
              <small>{leg.sub}</small>
            </span>
          ))}
        </span>
      </button>
      <button type="button" aria-expanded={open} onClick={onToggle} className="bw-rcard__more">
        {open ? "Masquer le détail" : "Heure par heure"}
        <ChevronDown
          size={14}
          aria-hidden
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <ol className="bw-rcard__steps">
          {steps.map((step) => (
            <li key={step.title}>
              <span aria-hidden>{step.icon}</span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <strong>{step.title}</strong>
                  <em>{step.at}</em>
                </span>
                <small>{step.text}</small>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

const loadingSteps = (month: string, destination: string) => [
  {
    title: "Je trace la route jusqu'aux ports",
    sub: "Les ports de France, d'Espagne et d'Italie à votre portée",
  },
  {
    title: `Je regarde les traversées de ${month}`,
    sub: "Horaires publiés, sinon les habitudes de chaque ligne",
  },
  {
    title: "Je compte l'attente et la dernière route",
    sub: destination
      ? `Du port d'arrivée jusqu'à ${destination}`
      : "Du port d'arrivée jusqu'au bled",
  },
];

/** Pendant le calcul : la voiture roule, la mer bouge, et la 504 dit ce qu'elle fait. */
function RouteLoading({ month, destination }: { month: string; destination: string }) {
  const steps = loadingSteps(month, destination);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setStep((current) => Math.min(current + 1, steps.length - 1)),
      1600,
    );
    return () => window.clearInterval(id);
  }, [steps.length]);
  const now = steps[step]!;
  return (
    <div className="bw-rload" role="status" aria-live="polite" aria-busy="true">
      <div className="bw-rload__track" aria-hidden>
        <i data-kind="road" />
        <i data-kind="sea" />
        <i data-kind="road" />
        <span className="bw-rload__car">🚗</span>
      </div>
      <p className="bw-rload__msg">
        <Loader2 size={16} className="shrink-0 animate-spin text-primary" aria-hidden />
        <span>
          {now.title}…<small>{now.sub}</small>
        </span>
      </p>
      <div className="bw-rload__ghost" aria-hidden>
        <span />
        <span />
      </div>
    </div>
  );
}
