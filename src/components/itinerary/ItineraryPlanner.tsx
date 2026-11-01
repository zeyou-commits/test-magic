import { isTowardsSouth } from "@/lib/ferry/markets";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Anchor,
  ArrowRight,
  Car,
  CarFront,
  Fuel,
  Info,
  LocateFixed,
  MapPin,
  Minus,
  Pause,
  Play,
  Plus,
  Ship,
  Sparkles,
  Wallet,
  SlidersHorizontal as SlidersHorizontalIcon,
  Star as StarIcon,
} from "lucide-react";
const SlidersHorizontal = SlidersHorizontalIcon;
const Star = StarIcon;
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
} from "@/lib/ferry/queries";
import { buildSailings } from "@/lib/ferry/trips";
import { calculateRoadAccess, searchItineraryAddress } from "@/lib/ferry/itinerary.functions";
import {
  BOARDING_BUFFER_MIN,
  DISEMBARK_BUFFER_MIN,
  buildItineraryOptions,
  buildSimulatedSailings,
  distinctItineraries,
  itineraryChoices,
  type ItineraryMapPreview,
  type ItineraryPriority,
} from "@/lib/ferry/itinerary";
import { calculateRoadGeometry } from "@/lib/ferry/itinerary.functions";
import { bookingSite, bookingUrl } from "@/lib/ferry/booking";
import { estimateFare, estimateFerryFare, formatFareRange, priceSeason } from "@/lib/ferry/pricing";
import { useVesselAlerts } from "@/lib/ferry/vesselAlerts";
import { track } from "@/lib/usage";
import { routeArc } from "@/lib/ferry/geo";
import { defaultTripProfile, VEHICLES, type VehicleKind } from "@/components/panel/TripProfile";
import {
  DEMO_CAPTIONS,
  DEMO_FILM,
  JOURNEY_PICKED_EVENT,
  PAUSE_EVERY_MIN,
  PAUSE_MIN,
  drivingPauses,
  filmTimes,
  raceRanking,
  minuteAtProgress,
  progressAtMinute,
  publishFilmFrame,
  requestPick,
  stageAt,
  type JourneyFilm,
  type LngLat,
  type PickTarget,
} from "@/lib/ferry/journeyFilm";
import { portTimeZone } from "@/lib/ferry/time";
import { vesselMapIcon } from "@/lib/ferry/vesselVisuals";
import { ItineraryAlertForm } from "./ItineraryAlertForm";

type RoadAccess = Awaited<ReturnType<typeof calculateRoadAccess>>;

const priorities: { id: ItineraryPriority; label: string; icon: typeof Wallet }[] = [
  { id: "recommended", label: "Recommandé", icon: Sparkles },
  { id: "cost", label: "Prix", icon: Wallet },
  { id: "driving", label: "Distance", icon: CarFront },
];

const numberFormat = new Intl.NumberFormat("fr-FR");
const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const seasonLabel = {
  calme: "Basse",
  intermediaire: "Moyenne",
  forte: "Haute",
  pointe: "Pic",
} as const;
const seasonHeight = { calme: "h-2", intermediaire: "h-3", forte: "h-4", pointe: "h-5" } as const;
const seasonColor = {
  calme: "bg-[#6ba787]",
  intermediaire: "bg-[#e2b14c]",
  forte: "bg-[#e78339]",
  pointe: "bg-[#c95038]",
} as const;

/** « mer. 4 nov. à 07:30 », dans le fuseau du lieu. */
function formatDayTime(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")} à ${get("hour")}:${get("minute")}`;
}

const DEMO_LOOP_MS = 30_000;

/** Conseil, pas une promesse : les pauses ne sont pas ajoutées aux heures affichées. */
function pauseNote(driveMin: number) {
  const pauses = drivingPauses(driveMin);
  if (!pauses) return "";
  return ` · ${pauses} pause${pauses > 1 ? "s" : ""} de ${PAUSE_MIN} min conseillée${pauses > 1 ? "s" : ""} (une toutes les ${PAUSE_EVERY_MIN / 60} h), à ajouter`;
}

function pauseSummary(pauses: number) {
  const plural = pauses > 1 ? "s" : "";
  return `${pauses} pause${plural} de ${PAUSE_MIN} min conseillée${plural}, une toutes les ${PAUSE_EVERY_MIN / 60} h, à ajouter à ces durées.`;
}

function formatDuration(minutes: number) {
  return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${(minutes % 60).toString().padStart(2, "0")}` : ""}`;
}

function PassengerControl({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-1 rounded-xl border border-border bg-white px-2 py-1">
      <span className="truncate text-xs font-semibold">{label}</span>
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={`Retirer un ${label.toLowerCase().slice(0, -1)}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="grid size-7 place-items-center rounded-full border border-border disabled:opacity-40"
        >
          <Minus className="size-3.5" />
        </button>
        <span className="min-w-3 text-center text-sm font-bold">{value}</span>
        <button
          type="button"
          aria-label={`Ajouter un ${label.toLowerCase().slice(0, -1)}`}
          disabled={value >= 9}
          onClick={() => onChange(value + 1)}
          className="grid size-7 place-items-center rounded-full border border-border disabled:opacity-40"
        >
          <Plus className="size-3.5" />
        </button>
      </span>
    </div>
  );
}

function AddressField({
  label,
  placeholder,
  value,
  onChange,
  point,
  onPointChange,
  countryCode,
  onLocate,
  locating,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  point: [number, number] | null;
  onPointChange: (point: [number, number] | null) => void;
  countryCode?: "DZ";
  onLocate?: () => void;
  locating?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<{ label: string; point: [number, number] }[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (point || value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setPending(true);
      void searchItineraryAddress({ data: { query: value.trim(), countryCode } })
        .then((results) => {
          if (!cancelled) setSuggestions(results);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setPending(false);
        });
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, point, countryCode]);
  return (
    <div className="relative text-sm font-semibold">
      <label className="block" htmlFor={`itinerary-${countryCode ?? "origin"}`}>
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-white px-3 focus-within:ring-2 focus-within:ring-primary/30">
        <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
        <input
          id={`itinerary-${countryCode ?? "origin"}`}
          className="min-h-11 w-full min-w-0 outline-none"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            onPointChange(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          required
          minLength={2}
        />
        {onLocate && (
          <button
            type="button"
            onClick={onLocate}
            disabled={locating}
            aria-label={locating ? "Localisation en cours" : "Utiliser ma position"}
            title="Utiliser ma position"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            <LocateFixed className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {pending && (
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          Recherche d’adresses…
        </span>
      )}
      {open && suggestions.length > 0 && (
        <span
          role="listbox"
          className="absolute z-50 mt-1 block max-h-56 w-full overflow-auto rounded-xl border border-border bg-white p-1 shadow-xl"
        >
          {suggestions.map((item, index) => (
            <button
              key={`${item.point.join(",")}-${index}`}
              type="button"
              role="option"
              aria-selected={false}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-secondary focus:bg-secondary"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(item.label);
                onPointChange(item.point);
                setSuggestions([]);
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

export function ItineraryPlanner({
  onClose,
  onPreview,
  onResultsReady,
  onBookPeriod,
  active = true,
}: {
  active?: boolean;
  onClose: () => void;
  onPreview: (preview: ItineraryMapPreview | null) => void;
  onResultsReady?: () => void;
  onBookPeriod?: (period: string) => void;
}) {
  const { data: ports = [], isPending: portsPending } = useQuery(portsQuery);
  const { data: routes = [], isPending: routesPending } = useQuery(routesQuery);
  const { data: departures = [], isPending: departuresPending } =
    useQuery(upcomingDeparturesQuery());
  const { data: companies = [] } = useQuery(companiesQuery);
  const vesselAlerts = useVesselAlerts();
  const activeRef = useRef(active);
  activeRef.current = active;
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originPoint, setOriginPoint] = useState<[number, number] | null>(null);
  const [destinationPoint, setDestinationPoint] = useState<[number, number] | null>(null);
  const [period, setPeriod] = useState(() => monthKey(new Date()));
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() + index);
        return {
          key: monthKey(date),
          label: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(date),
          season: priceSeason(`${monthKey(date)}-15`),
        };
      }),
    [],
  );
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<VehicleKind>("sedan");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [consumption, setConsumption] = useState(7);
  const [fuelPrice, setFuelPrice] = useState(1.8);
  const [tollRate, setTollRate] = useState(0.06);
  const priority: ItineraryPriority = "recommended";
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [roadAccess, setRoadAccess] = useState<RoadAccess | null>(null);
  const [searchStartedAt, setSearchStartedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (selectedId) track("search_choice");
  }, [selectedId]);
  const [geometryNote, setGeometryNote] = useState<string | null>(null);
  const geometryCache = useRef(
    new Map<string, { toPort: [number, number][]; fromPort: [number, number][] }>(),
  );

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
  const departurePortIds = new Set(relevantRoutes.map((route) => route.departure_port_id));
  const arrivalPortIds = new Set(relevantRoutes.map((route) => route.arrival_port_id));
  const departurePorts = ports.filter((port) => departurePortIds.has(port.id));
  const arrivalPorts = ports.filter((port) => arrivalPortIds.has(port.id));
  const sailings = useMemo(
    () => buildSailings(departures, relevantRoutes, ports, companies, []),
    [departures, relevantRoutes, ports, companies],
  );
  const hasPublishedForPeriod = sailings.some(
    (sailing) => sailing.dayKey.startsWith(period) && !sailing.departure.is_demo,
  );
  const profile = useMemo(
    () => ({
      ...defaultTripProfile,
      vehicle,
      passengers: { ...defaultTripProfile.passengers, adults, children },
    }),
    [vehicle, adults, children],
  );
  const options = useMemo(() => {
    if (!roadAccess || searchStartedAt === null) return [];
    const published = sailings.filter(
      (sailing) => sailing.dayKey.startsWith(period) && !sailing.departure.is_demo,
    );
    const fare = (sailing: (typeof sailings)[number]) => estimateFare(sailing, profile);
    const realOptions = buildItineraryOptions(
      published,
      roadAccess.toDeparturePorts,
      roadAccess.fromArrivalPorts,
      searchStartedAt,
      fare,
      consumption,
      fuelPrice,
      tollRate,
    );
    const simulated = buildSimulatedSailings(
      relevantRoutes,
      ports,
      period,
      new Set(published.map((sailing) => sailing.route.id)),
    );
    const simulationOptions = buildItineraryOptions(
      simulated,
      roadAccess.toDeparturePorts,
      roadAccess.fromArrivalPorts,
      Date.parse(`${period}-01T00:00:00Z`),
      fare,
      consumption,
      fuelPrice,
      tollRate,
    );
    return [...realOptions, ...simulationOptions];
  }, [
    sailings,
    relevantRoutes,
    ports,
    roadAccess,
    searchStartedAt,
    profile,
    consumption,
    fuelPrice,
    tollRate,
    period,
  ]);
  const sorted = useMemo(
    () => distinctItineraries(options, priority, children),
    [options, priority, children],
  );
  // Les vrais départs passent toujours d'abord ; une simulation n'est jamais recommandée à leur place.
  const realOptions = useMemo(() => sorted.filter((option) => !option.sailing.isSimulation), [sorted]);
  const choices = useMemo(
    () => itineraryChoices(realOptions.length ? realOptions : sorted),
    [realOptions, sorted],
  );
  const estimatedChoices = realOptions.length
    ? sorted.filter((option) => option.sailing.isSimulation).slice(0, 3)
    : [];
  const selected =
    sorted.find((option) => option.sailing.departure.id === selectedId) ??
    choices[0]?.option ??
    sorted[0];
  const previewed = sorted.find((option) => option.sailing.departure.id === hoveredId) ?? selected;
  const alternativeKey = sorted
    .slice(0, 6)
    .map((option) => option.sailing.route.id)
    .join("|");

  useEffect(() => {
    if (!active) return;
    if (!previewed || !roadAccess) {
      onPreview(null);
      return;
    }
    const id = previewed.sailing.departure.id;
    const departurePort: [number, number] = [
      previewed.sailing.from.longitude,
      previewed.sailing.from.latitude,
    ];
    const arrivalPort: [number, number] = [
      previewed.sailing.to.longitude,
      previewed.sailing.to.latitude,
    ];
    const alternatives: [number, number][][] = [];
    const seen = new Set([`${previewed.sailing.from.id}|${previewed.sailing.to.id}`]);
    for (const option of sorted.slice(0, 6)) {
      const pair = `${option.sailing.from.id}|${option.sailing.to.id}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      const from: [number, number] = [option.sailing.from.longitude, option.sailing.from.latitude];
      const to: [number, number] = [option.sailing.to.longitude, option.sailing.to.latitude];
      alternatives.push(
        [roadAccess.originPoint, from],
        routeArc(option.sailing.from, option.sailing.to),
        [to, roadAccess.destinationPoint],
      );
    }
    let cancelled = false;
    const show = (
      roadToPort: [number, number][],
      roadFromPort: [number, number][],
      roadDetailed: boolean,
    ) => {
      if (cancelled) return;
      setFilmRoads({ id, toPort: roadToPort, fromPort: roadFromPort });
      onPreview({
        key: Date.now() + Math.random(),
        fit: !hoveredId,
        routeId: previewed.sailing.route.id,
        origin: roadAccess.originPoint,
        destination: roadAccess.destinationPoint,
        departurePort,
        arrivalPort,
        roadToPort,
        roadDetailed,
        ferry: routeArc(previewed.sailing.from, previewed.sailing.to),
        roadFromPort,
        alternatives,
      });
    };
    show(
      [roadAccess.originPoint, departurePort],
      [arrivalPort, roadAccess.destinationPoint],
      false,
    );
    if (hoveredId && hoveredId !== selected?.sailing.departure.id)
      return () => {
        cancelled = true;
      };
    if (roadAccess.roadMode === "estimate") {
      setGeometryNote(
        "OSRM indisponible : trajet approximatif affiché en pointillés. Distances et durées estimées.",
      );
      return () => {
        cancelled = true;
      };
    }
    const cached = geometryCache.current.get(id);
    if (cached) {
      show(cached.toPort, cached.fromPort, true);
      return () => {
        cancelled = true;
      };
    }
    setGeometryNote("Tracé routier en cours de chargement…");
    void calculateRoadGeometry({
      data: {
        origin: roadAccess.originPoint,
        destination: roadAccess.destinationPoint,
        departurePort,
        arrivalPort,
      },
    })
      .then((geometry) => {
        if (cancelled) return;
        geometryCache.current.set(id, geometry);
        show(geometry.toPort, geometry.fromPort, true);
        setGeometryNote(null);
      })
      .catch(() => {
        if (!cancelled)
          setGeometryNote(
            "Tracé routier indisponible : le trajet approximatif reste affiché, sans modifier l'estimation de cette option.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [
    active,
    previewed?.sailing.departure.id,
    selected?.sailing.departure.id,
    hoveredId,
    alternativeKey,
    roadAccess,
    onPreview,
  ]);

  // ---- Le film : le voyage choisi, joué sur la carte ----
  const [filmRoads, setFilmRoads] = useState<{
    id: string;
    toPort: LngLat[];
    fromPort: LngLat[];
  } | null>(null);
  const [minute, setMinute] = useState(0);
  const [wide, setWide] = useState(1);
  const [playing, setPlaying] = useState(false);
  // Fin du film : la caméra recule et montre tout le voyage, avec ses durées.
  const [pullBack, setPullBack] = useState(0);
  const [picking, setPicking] = useState<PickTarget | null>(null);
  const selectedKey = selected?.sailing.departure.id ?? null;
  const film = useMemo<JourneyFilm | null>(() => {
    if (!selected || !roadAccess) return null;
    const from: LngLat = [selected.sailing.from.longitude, selected.sailing.from.latitude];
    const to: LngLat = [selected.sailing.to.longitude, selected.sailing.to.latitude];
    const roads = filmRoads?.id === selectedKey ? filmRoads : null;
    const slug = selected.sailing.vessel ? vesselMapIcon(selected.sailing.vessel.name) : null;
    return {
      key: selectedKey ?? "",
      road: roads?.toPort ?? [roadAccess.originPoint, from],
      sea: routeArc(selected.sailing.from, selected.sailing.to),
      last: roads?.fromPort ?? [to, roadAccess.destinationPoint],
      roadMin: selected.originRoad.durationMin,
      boardMin: BOARDING_BUFFER_MIN,
      ferryMin: selected.sailing.durationMin ?? 0,
      disembarkMin: DISEMBARK_BUFFER_MIN,
      lastMin: selected.destinationRoad.durationMin,
      roadKm: selected.originRoad.distanceKm,
      lastKm: selected.destinationRoad.distanceKm,
      shipImage: slug ? `/vessel-visuals/map/${slug}.webp` : "/images/ferry-3d-marker.png",
      pins: [],
    };
  }, [selected, selectedKey, roadAccess, filmRoads]);

  // La course : tous les trajets partent en même temps, le plus court de porte à porte gagne.
  const [racing, setRacing] = useState(false);
  const [raceMinute, setRaceMinute] = useState(0);
  const race = useMemo(() => {
    if (!roadAccess) return [];
    const entries = sorted.slice(0, 6).map((option) => {
      const id = option.sailing.departure.id;
      const from: LngLat = [option.sailing.from.longitude, option.sailing.from.latitude];
      const to: LngLat = [option.sailing.to.longitude, option.sailing.to.latitude];
      const roads = filmRoads?.id === id ? filmRoads : null;
      const ferryMin = option.sailing.durationMin ?? 0;
      const slug = option.sailing.vessel ? vesselMapIcon(option.sailing.vessel.name) : null;
      const raceFilm: JourneyFilm = {
        key: id,
        road: roads?.toPort ?? [roadAccess.originPoint, from],
        sea: routeArc(option.sailing.from, option.sailing.to),
        last: roads?.fromPort ?? [to, roadAccess.destinationPoint],
        roadMin: option.originRoad.durationMin,
        boardMin: BOARDING_BUFFER_MIN,
        ferryMin,
        disembarkMin: DISEMBARK_BUFFER_MIN,
        lastMin: option.destinationRoad.durationMin,
        shipImage: slug ? `/vessel-visuals/map/${slug}.webp` : "/images/ferry-3d-marker.png",
        pins: [],
      };
      return {
        id,
        label: `${option.sailing.from.name} → ${option.sailing.to.name}`,
        totalMin: filmTimes(raceFilm).total,
        estimated: Boolean(option.sailing.isSimulation),
        film: raceFilm,
      };
    });
    return raceRanking(entries);
  }, [sorted, roadAccess, filmRoads]);
  const raceEnd = race.at(-1)?.totalMin ?? 0;
  const raceWinner = race[0];
  const startRace = () => {
    setPlaying(false);
    setPullBack(0);
    setRaceMinute(0);
    setRacing(true);
  };
  useEffect(() => {
    if (!racing || !raceEnd) return;
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const next = Math.min(raceEnd, ((now - startedAt) / 22_000) * raceEnd);
      setRaceMinute(next);
      if (next < raceEnd) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [racing, raceEnd]);
  const showingResults = active && Boolean(roadAccess) && !filtersOpen;
  useEffect(() => {
    if (!pullBack) return;
    const startedAt = performance.now();
    let frame = 0;
    const pull = (now: number) => {
      const part = Math.min(1, (now - startedAt) / 1800);
      setWide(part);
      if (part < 1) frame = requestAnimationFrame(pull);
    };
    frame = requestAnimationFrame(pull);
    return () => cancelAnimationFrame(frame);
  }, [pullBack]);
  useEffect(() => {
    setPlaying(false);
    setPullBack(0);
    setMinute(0);
    setWide(1);
    setRacing(false);
  }, [selectedKey]);
  useEffect(() => {
    if (!showingResults || !film) return;
    if (racing) {
      publishFilmFrame({
        film,
        minute: raceMinute,
        wide: 1,
        demo: false,
        caption: "",
        racers: race.map((entry) => ({
          film: entry.film,
          label: entry.film.key === raceWinner?.id && raceMinute >= entry.totalMin ? `1er · ${entry.label}` : entry.label,
          winner: entry.id === raceWinner?.id && raceMinute >= entry.totalMin,
        })),
      });
      return;
    }
    publishFilmFrame({ film, minute, wide, demo: false, caption: "" });
  }, [showingResults, film, minute, wide, racing, raceMinute, race, raceWinner?.id]);
  useEffect(() => {
    if (!showingResults) return;
    return () => publishFilmFrame(null);
  }, [showingResults]);
  // Lecture : chaque étape a sa part du film, et la caméra quitte la vue d'ensemble en douceur.
  useEffect(() => {
    if (!playing || !film) return;
    const total = filmTimes(film).total;
    const startMinute = minute >= total ? 0 : minute;
    const startProgress = progressAtMinute(film, startMinute);
    const startWide = wide;
    const startedAt = performance.now();
    let frame = 0;
    setPullBack(0);
    const tick = (now: number) => {
      const elapsed = now - startedAt;
      setWide(Math.max(0, startWide * (1 - elapsed / 1200)));
      const progress = Math.min(1, startProgress + Math.max(0, elapsed - 500) / 24_000);
      setMinute(minuteAtProgress(film, progress));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      setPlaying(false);
      setPullBack((count) => count + 1);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, film?.key]);

  // Écran vide : un voyage d'exemple tourne en boucle sur la carte.
  const demoOn = active && !roadAccess && !picking;
  useEffect(() => {
    if (!demoOn) return;
    const total = filmTimes(DEMO_FILM).total;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const publish = (progress: number, spread: number) => {
      const at = minuteAtProgress(DEMO_FILM, progress);
      publishFilmFrame({
        film: DEMO_FILM,
        minute: Math.min(at, total),
        wide: spread,
        demo: true,
        maxZoom: 6.3,
        caption: `Exemple · ${DEMO_CAPTIONS[stageAt(DEMO_FILM, at)]}`,
      });
    };
    if (still) {
      publish(0, 1);
      return () => publishFilmFrame(null);
    }
    let frame = 0;
    let last = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden || now - last < 33) return;
      last = now;
      const loop = ((now - startedAt) % DEMO_LOOP_MS) / DEMO_LOOP_MS;
      // Vue d'ensemble, voyage, puis retour à la vue d'ensemble avant de recommencer.
      const progress = Math.max(0, Math.min(1, (loop - 0.08) / 0.82));
      const spread = loop < 0.08 ? 1 : loop < 0.12 ? 1 - (loop - 0.08) / 0.04 : loop > 0.92 ? (loop - 0.92) / 0.08 : 0;
      publish(progress, spread);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      publishFilmFrame(null);
    };
  }, [demoOn]);

  // Placer une adresse d'un toucher sur la carte.
  useEffect(() => {
    if (!active && picking) setPicking(null);
    requestPick(active ? picking : null);
    return () => requestPick(null);
  }, [picking, active]);
  useEffect(() => {
    const onPicked = (event: Event) => {
      const { target, point } = (event as CustomEvent<{ target: PickTarget; point: LngLat }>).detail;
      setPicking(null);
      const inAlgeria = point[0] > -9 && point[0] < 12 && point[1] > 18.9 && point[1] < 37.6;
      if (target === "destination") {
        if (!inAlgeria) {
          setError("Ce point n'est pas en Algérie : placez votre destination sur le territoire algérien.");
          return;
        }
        setError(null);
        setDestinationPoint(point);
        setDestination("Point placé sur la carte");
        return;
      }
      if (point[0] < -12 || point[0] > 36 || point[1] < 35 || point[1] > 72) {
        setLocationError("Ce point est hors de la zone Europe–Algérie. Placez votre départ en Europe.");
        return;
      }
      setLocationError(null);
      setOriginPoint(point);
      setOrigin("Point placé sur la carte");
    };
    window.addEventListener(JOURNEY_PICKED_EVENT, onPicked);
    return () => window.removeEventListener(JOURNEY_PICKED_EVENT, onPicked);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRoadAccess(null);
    setRacing(false);
    geometryCache.current.clear();
    const timestamp = Math.max(Date.now(), Date.parse(`${period}-01T00:00:00`));
    if (!Number.isFinite(timestamp)) {
      setError("Choisissez une période de départ.");
      return;
    }
    if (!departurePorts.length || !arrivalPorts.length) {
      setError("Aucune ligne Europe–Algérie active n'est disponible pour cette comparaison.");
      return;
    }
    setLoading(true);
    try {
      const roads = await calculateRoadAccess({
        data: {
          origin,
          destination,
          originPoint: originPoint ?? undefined,
          destinationPoint: destinationPoint ?? undefined,
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
      });
      setSelectedId(null);
      setSearchStartedAt(timestamp);
      setRoadAccess(roads);
      setFiltersOpen(false);
      if (activeRef.current) onResultsReady?.();
      if (activeRef.current)
        requestAnimationFrame(() =>
          document.querySelector(".batogo-panel-scroll")?.scrollTo({ top: 0, behavior: "smooth" }),
        );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le calcul n'a pas pu aboutir. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  function locateOrigin() {
    if (!navigator.geolocation) {
      setLocationError("La géolocalisation n’est pas disponible sur cet appareil.");
      return;
    }
    setLocationError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        if (
          coords.longitude < -12 ||
          coords.longitude > 36 ||
          coords.latitude < 35 ||
          coords.latitude > 72
        ) {
          setLocationError(
            "Votre position est hors de la zone Europe–Algérie. Saisissez une adresse de départ en Europe.",
          );
          return;
        }
        setOriginPoint([coords.longitude, coords.latitude]);
        setOrigin("Ma position actuelle");
      },
      () => {
        setLocating(false);
        setLocationError("Position indisponible. Saisissez votre adresse de départ.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  const periodLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
    new Date(`${period}-15T12:00:00`),
  );
  const vehicleLabel =
    vehicle === "sedan" ? "Berline" : (VEHICLES.find((item) => item.id === vehicle)?.label ?? "");
  const tripSummary = `${periodLabel} · ${vehicleLabel} · ${adults} adulte${adults > 1 ? "s" : ""}${children > 0 ? ` · ${children} enfant${children > 1 ? "s" : ""}` : ""}`;
  const pickButton = (target: PickTarget) => (
    <button
      type="button"
      onClick={() => setPicking(picking === target ? null : target)}
      className="mt-1 inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-primary underline underline-offset-2"
    >
      <MapPin className="size-3.5" aria-hidden />
      {picking === target ? "Annuler" : "Placer sur la carte"}
    </button>
  );
  const estimatedTrip = Boolean(selected?.sailing.isSimulation);
  const stage = film ? stageAt(film, minute) : "road";
  const times = film ? filmTimes(film) : null;
  const moment = (offset: number) => {
    if (!selected) return "";
    if (estimatedTrip) {
      const hours = Math.floor(offset / 60);
      return offset ? `+${hours} h${offset % 60 ? ` ${String(offset % 60).padStart(2, "0")}` : ""}` : "Départ";
    }
    const zone =
      times && offset >= times.disembark
        ? portTimeZone(selected.sailing.to)
        : portTimeZone(selected.sailing.from);
    return formatDayTime(selected.leaveHomeAt + offset * 60_000, zone);
  };
  const steps =
    selected && times
      ? [
          {
            id: "road",
            at: 0,
            title: "Départ de chez vous",
            text: `${Math.round(selected.originRoad.distanceKm)} km, ${formatDuration(selected.originRoad.durationMin)} jusqu'à ${selected.sailing.from.name}${pauseNote(selected.originRoad.durationMin)}`,
          },
          {
            id: "port",
            at: times.port,
            title: `Au port de ${selected.sailing.from.name}`,
            text: "Marge repère avant le départ : l'heure de convocation de votre billet fait foi",
          },
          {
            id: "sea",
            at: times.sea,
            title: "La traversée",
            text: `${formatDuration(selected.sailing.durationMin ?? 0)} de mer jusqu'à ${selected.sailing.to.name}`,
          },
          {
            id: "disembark",
            at: times.disembark,
            title: `Arrivée à ${selected.sailing.to.name}`,
            text: "Débarquement, contrôles et sortie du port, marge repère",
          },
          {
            id: "last",
            at: times.last,
            title: "La dernière route",
            text: `${Math.round(selected.destinationRoad.distanceKm)} km, ${formatDuration(selected.destinationRoad.durationMin)}${pauseNote(selected.destinationRoad.durationMin)}`,
          },
          { id: "done", at: times.total, title: "Arrivée à destination", text: roadAccess?.destination ?? "" },
        ]
      : [];
  const currentStep = steps.find((step) => step.id === stage) ?? steps[0];

  return (
    <section id="itineraire" className="min-h-full min-w-0 w-full bg-[#fffdf8]">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-[#e9f3ef] px-4 py-1.5">
        <h2 className="font-display text-base font-bold uppercase tracking-tight text-foreground sm:text-lg">
          Le trajet porte à porte
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-primary"
        >
          Fermer
        </button>
      </div>
      <form
        onSubmit={(event) => void submit(event)}
        hidden={!filtersOpen}
        className="space-y-3 p-4"
      >
        <p className="font-display text-xl font-bold leading-tight">Votre voyage commence où ?</p>
        <div className="grid gap-2">
          <div>
            <AddressField
              label="Je pars de"
              placeholder="Adresse, ville ou ma position"
              value={origin}
              onChange={setOrigin}
              point={originPoint}
              onPointChange={setOriginPoint}
              onLocate={locateOrigin}
              locating={locating}
            />
            {pickButton("origin")}
          </div>
          {locationError && (
            <p role="status" className="text-xs text-destructive">
              {locationError}
            </p>
          )}
          <div>
            <AddressField
              label="Je vais au bled, à"
              placeholder="Adresse, quartier ou ville en Algérie"
              value={destination}
              onChange={setDestination}
              point={destinationPoint}
              onPointChange={setDestinationPoint}
              countryCode="DZ"
            />
            {pickButton("destination")}
          </div>
        </div>
        <button
          type="submit"
          disabled={loading || portsPending || routesPending || departuresPending}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 font-bold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Préparation de votre voyage…" : "Voir mon voyage"}
          <ArrowRight className="size-4" aria-hidden />
        </button>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}
        <details className="rounded-xl border border-border bg-white px-3 py-2 text-sm">
          <summary className="flex min-h-9 cursor-pointer items-center gap-2 font-semibold">
            <SlidersHorizontal className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate first-letter:uppercase">{tripSummary}</span>
            <span className="shrink-0 text-xs text-primary">Affiner</span>
          </summary>
          <div className="mt-3 grid gap-3">
            <fieldset className="min-w-0">
              <legend className="text-sm font-semibold">
                Période de départ{" "}
                <span className="font-normal text-muted-foreground">
                  · {months[0]?.key.slice(0, 4)}–{months[11]?.key.slice(0, 4)}
                </span>
              </legend>
              <div
                className="mt-2 grid grid-cols-6 gap-1"
                aria-label="Saisons des douze prochains mois"
              >
                {months.map((month) => (
                  <button
                    key={month.key}
                    type="button"
                    aria-label={`${month.label} ${month.key.slice(0, 4)} : saison ${seasonLabel[month.season].toLowerCase()}`}
                    aria-pressed={period === month.key}
                    onClick={() => setPeriod(month.key)}
                    className={`flex min-w-0 flex-col items-center justify-end gap-1 rounded-lg border px-0.5 py-1.5 text-[10px] font-semibold ${period === month.key ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-muted-foreground"}`}
                  >
                    <span
                      className={`w-4 rounded-t-sm ${seasonHeight[month.season]} ${seasonColor[month.season]}`}
                      aria-hidden
                    />
                    <span className="truncate">{month.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                {(["calme", "intermediaire", "forte", "pointe"] as const).map((season) => (
                  <span key={season} className="inline-flex items-center gap-1">
                    <span className={`size-2 rounded-full ${seasonColor[season]}`} />
                    {seasonLabel[season]}
                  </span>
                ))}
                <a
                  href="/barometre-prix"
                  className="font-semibold text-primary underline underline-offset-2"
                >
                  Baromètre
                </a>
              </div>
            </fieldset>
            <fieldset className="min-w-0">
              <legend className="text-sm font-semibold">Votre voiture</legend>
              <div
                role="group"
                aria-label="Choisir votre véhicule"
                className="mt-2 grid min-w-0 grid-cols-3 gap-1.5"
              >
                {VEHICLES.filter((item) => item.id !== "none").map(({ id, Icon, label, hint }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={vehicle === id}
                    title={hint}
                    onClick={() => setVehicle(id)}
                    className={`flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl border px-1 py-1.5 text-center text-[11px] font-semibold leading-tight transition-colors ${vehicle === id ? "border-primary bg-primary text-white" : "border-border bg-white text-foreground hover:border-primary/50"}`}
                  >
                    <Icon className="size-3.5 shrink-0" aria-hidden />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="min-w-0">
              <legend className="mb-1 text-sm font-semibold">Voyageurs</legend>
              <div className="grid min-w-0 grid-cols-1 gap-1.5 min-[360px]:grid-cols-2">
                <PassengerControl label="Adultes" value={adults} min={1} onChange={setAdults} />
                <PassengerControl label="Enfants" value={children} min={0} onChange={setChildren} />
              </div>
            </fieldset>
            <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
              <label>
                Consommation · L/100 km
                <input
                  type="number"
                  min={1}
                  max={30}
                  step={0.1}
                  className="mt-1 block w-full rounded-lg border p-2"
                  value={consumption}
                  onChange={(event) => setConsumption(Number(event.target.value))}
                />
              </label>
              <label>
                Carburant · €/L
                <input
                  type="number"
                  min={0.5}
                  max={5}
                  step={0.01}
                  className="mt-1 block w-full rounded-lg border p-2"
                  value={fuelPrice}
                  onChange={(event) => setFuelPrice(Number(event.target.value))}
                />
              </label>
              <label>
                Provision péages · €/km
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  className="mt-1 block w-full rounded-lg border p-2"
                  value={tollRate}
                  onChange={(event) => setTollRate(Number(event.target.value))}
                />
              </label>
            </div>
          </div>
        </details>
        <p className="text-[11px] leading-snug text-muted-foreground">
          La carte montre un exemple de voyage. Vos adresses servent seulement à calculer votre trajet.
        </p>
      </form>
      {roadAccess && !filtersOpen && (
        <div className="grid gap-3 p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {roadAccess.origin} → {roadAccess.destination}
            </p>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-border px-2 text-xs font-semibold text-primary"
            >
              <SlidersHorizontal className="size-3.5" aria-hidden /> Modifier
            </button>
          </div>
          {!selected ? (
            <p className="rounded-xl bg-secondary p-3 text-sm">
              Aucune ligne connue pour comparer ces ports.
            </p>
          ) : (
            <>
              <div>
                <p className="font-display text-xl font-bold leading-tight">
                  {estimatedTrip
                    ? `Comptez ${formatDuration(selected.totalMinutes)} de porte à porte`
                    : `Partez ${moment(0)}`}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {estimatedTrip
                    ? `Date à confirmer en ${periodLabel}`
                    : `Arrivée ${moment(times?.total ?? 0)}`}{" "}
                  · ≈ {numberFormat.format(selected.totalEuro)} €
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {selected.sailing.from.name} → {selected.sailing.to.name}
                  {selected.sailing.company ? ` · ${selected.sailing.company.name}` : ""} · aller simple
                </p>
                {vesselAlerts.has(selected.sailing.vessel?.id ?? "") ? (
                  <p role="alert" className="mt-1 text-xs font-semibold text-warning-foreground">
                    Départ à confirmer auprès de la compagnie
                  </p>
                ) : null}
              </div>

              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}
                role="group"
                aria-label="Choisir son voyage"
              >
                {choices.map((choice) => {
                  const on = choice.option.sailing.departure.id === selected.sailing.departure.id;
                  return (
                    <button
                      key={choice.option.sailing.departure.id}
                      type="button"
                      aria-pressed={on}
                      onMouseEnter={() => setHoveredId(choice.option.sailing.departure.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => setSelectedId(choice.option.sailing.departure.id)}
                      className={`flex min-h-[72px] min-w-0 flex-col items-start gap-0.5 rounded-xl border p-2 text-left ${on ? "border-primary bg-primary/10" : "border-border bg-white"}`}
                    >
                      <span className="text-[11px] font-bold text-primary">{choice.tag}</span>
                      <span className="w-full truncate text-xs font-bold">
                        {choice.option.sailing.from.name}
                      </span>
                      <span className="text-[11px] leading-tight text-muted-foreground">{choice.delta}</span>
                    </button>
                  );
                })}
              </div>

              {film && times && currentStep ? (
                <div className="rounded-2xl border border-border bg-white p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <strong className="min-w-0 truncate text-sm">{currentStep.title}</strong>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-primary">
                      {moment(Math.round(minute))}
                    </span>
                  </div>
                  <p className="mt-0.5 min-h-8 text-xs leading-snug text-muted-foreground">
                    {currentStep.text}
                  </p>
                  <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                    {[
                      [film.roadMin, "#0e7a43"],
                      [film.boardMin, "#b9a57a"],
                      [film.ferryMin, "#1769a8"],
                      [film.disembarkMin, "#b9a57a"],
                      [film.lastMin, "#0e7a43"],
                    ].map(([flex, color], index) => (
                      <span key={index} style={{ flex: `${flex} 1 0`, background: String(color) }} />
                    ))}
                  </div>
                  <ul className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] leading-snug text-muted-foreground">
                    {[
                      ["Route", film.roadMin, 0],
                      ["Port", film.boardMin, times.port],
                      ["Mer", film.ferryMin, times.sea],
                      ["Sortie", film.disembarkMin, times.disembark],
                      ["Route", film.lastMin, times.last],
                    ].map(([label, length, start], index) => {
                      const on = minute >= Number(start) && minute < Number(start) + Number(length);
                      return (
                        <li key={index} className={on ? "font-bold text-foreground" : undefined}>
                          {label} <span className="tabular-nums">{formatDuration(Number(length))}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {drivingPauses(film.roadMin) + drivingPauses(film.lastMin) > 0 ? (
                    <p className="mt-0.5 text-[11px] leading-snug text-[#8a4b00]">
                      {pauseSummary(drivingPauses(film.roadMin) + drivingPauses(film.lastMin))}
                    </p>
                  ) : null}
                  <input
                    type="range"
                    aria-label="Parcourir le voyage dans le temps"
                    min={0}
                    max={times.total}
                    step={1}
                    value={minute}
                    onChange={(event) => {
                      setPlaying(false);
                      setPullBack(0);
                      setWide(0);
                      setMinute(Number(event.target.value));
                    }}
                    className="h-7 w-full accent-[#0e7a43]"
                  />
                  <button
                    type="button"
                    onClick={() => setPlaying((value) => !value)}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-bold"
                  >
                    {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                    {playing ? "Pause" : minute >= times.total ? "Revoir mon voyage" : "Lancer mon voyage"}
                  </button>
                </div>
              ) : null}

              {race.length > 1 ? (
                <div className="rounded-2xl border border-border bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm">
                      {racing && raceWinner && raceMinute >= raceWinner.totalMin
                        ? `${raceWinner.label} gagne`
                        : "La course des trajets"}
                    </strong>
                    <button
                      type="button"
                      onClick={racing ? () => setRacing(false) : startRace}
                      className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-bold text-white"
                    >
                      {racing ? "Arrêter" : (
                        <>
                          <Play className="size-3.5" aria-hidden /> Lancer tous les trajets
                        </>
                      )}
                    </button>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Tous partent en même temps : seul le temps de porte à porte compte, pas les dates.
                  </p>
                  {racing ? (
                    <ol className="mt-2 grid gap-1">
                      {race.map((entry) => {
                        const arrived = raceMinute >= entry.totalMin;
                        const share = Math.min(100, (raceMinute / entry.totalMin) * 100);
                        return (
                          <li key={entry.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedId(entry.id)}
                              className={`grid min-h-11 w-full gap-1 rounded-lg p-2 text-left ${arrived && entry.rank === 1 ? "bg-primary/10" : "bg-secondary"}`}
                            >
                              <span className="flex items-baseline justify-between gap-2 text-xs">
                                <strong className="min-w-0 truncate">
                                  {arrived ? `${entry.rank}. ` : ""}
                                  {entry.label}
                                  {entry.estimated ? " · estimé" : ""}
                                </strong>
                                <span className="shrink-0 font-bold tabular-nums text-primary">
                                  {!arrived
                                    ? `${Math.round(share)} %`
                                    : entry.rank === 1
                                      ? formatDuration(entry.totalMin)
                                      : `+${formatDuration(entry.gapMin)}`}
                                </span>
                              </span>
                              <span className="block h-1 overflow-hidden rounded-full bg-white" aria-hidden>
                                <span className="block h-full bg-primary" style={{ width: `${share}%` }} />
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-1.5">
                {selected.sailing.isSimulation ? null : (
                  <a
                    href={bookingUrl(selected.sailing, profile)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-center font-bold text-white"
                  >
                    Réserver sur {bookingSite(selected.sailing)} <ArrowRight className="size-4" aria-hidden />
                  </a>
                )}
                <a
                  href={`/horaires?from=${selected.sailing.from.id}&to=${selected.sailing.to.id}&month=${period}`}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-border bg-white text-sm font-semibold text-primary"
                >
                  {selected.sailing.isSimulation ? "Voir les horaires publiés" : "Voir les autres traversées"}
                </a>
              </div>

              <details className="rounded-xl border border-border bg-white px-3 py-2 text-sm">
                <summary className="flex min-h-8 cursor-pointer items-center justify-between font-semibold">
                  Le détail étape par étape
                </summary>
                <ol className="mt-2 grid gap-1">
                  {steps.map((step) => (
                    <li key={step.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPlaying(false);
                          setPullBack(0);
                          setWide(0);
                          setMinute(step.at);
                        }}
                        className={`grid w-full grid-cols-[68px_minmax(0,1fr)] gap-2 rounded-lg p-2 text-left ${stage === step.id ? "bg-primary/10" : ""}`}
                      >
                        <span className="text-[11px] font-bold tabular-nums text-primary">
                          {estimatedTrip ? moment(step.at) : moment(step.at).split(" à ").pop()}
                        </span>
                        <span className="min-w-0">
                          <strong className="block text-xs">{step.title}</strong>
                          <span className="block text-[11px] leading-snug text-muted-foreground">
                            {step.text}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                  Route ≈ {numberFormat.format(selected.roadEuro)} € · Ferry et voiture ≈{" "}
                  {numberFormat.format(selected.ferryEuro)} €, fourchette{" "}
                  {formatFareRange(estimateFerryFare(selected.sailing, profile))}
                </p>
              </details>

              {estimatedChoices.length > 0 ? (
                <div className="rounded-xl bg-secondary p-3">
                  <p className="text-xs font-bold">Pas encore de date publiée</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Lignes et prix estimés, sans départ confirmé en {periodLabel}.
                  </p>
                  <div className="mt-2 grid gap-1">
                    {estimatedChoices.map((option) => (
                      <button
                        key={option.sailing.departure.id}
                        type="button"
                        aria-pressed={option.sailing.departure.id === selected.sailing.departure.id}
                        onClick={() => setSelectedId(option.sailing.departure.id)}
                        className="flex min-h-10 items-center justify-between gap-2 rounded-lg bg-white px-3 text-left text-xs font-semibold"
                      >
                        <span className="min-w-0 truncate">
                          {option.sailing.from.name} → {option.sailing.to.name}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          ≈ {numberFormat.format(option.totalEuro)} €
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
          {sorted.length > 0 && hasPublishedForPeriod && onBookPeriod && (
            <button
              type="button"
              onClick={() => onBookPeriod(period)}
              className="text-xs font-semibold text-primary underline underline-offset-2"
            >
              Voir tous les départs de {periodLabel}
            </button>
          )}
          {sorted.length > 0 && !hasPublishedForPeriod && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 text-xs">
              <p className="font-semibold text-red-800">
                Aucun calendrier commercial n’est encore publié pour cette période.
              </p>
              <ItineraryAlertForm
                routeId={(selected ?? sorted[0]!).sailing.route.id}
                from={(selected ?? sorted[0]!).sailing.from.name}
                to={(selected ?? sorted[0]!).sailing.to.name}
                period={period}
                origin={roadAccess.origin}
                destination={roadAccess.destination}
                vehicle={vehicle}
                adults={adults}
                children={children}
              />
            </div>
          )}
          {geometryNote && (
            <p role="status" className="text-[11px] text-muted-foreground">
              {geometryNote}
            </p>
          )}
          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer">
              Comment sont estimés les trajets et les prix ?
            </summary>
            <p className="mt-1">
              Route :{" "}
              {roadAccess.roadMode === "osrm" ? "OSRM / OpenStreetMap" : "distance approximative"}.
              Ferry et voiture : estimation saisonnière, à confirmer auprès de la compagnie. Les{" "}
              {BOARDING_BUFFER_MIN / 60} h avant l’embarquement et {DISEMBARK_BUFFER_MIN / 60} h après
              l’arrivée sont des marges indicatives ; retards et frontières ne sont pas prévus.{" "}
              <a href="/barometre-prix" className="font-semibold text-primary underline">
                Baromètre des prix
              </a>
            </p>
          </details>
        </div>
      )}
    </section>
  );
}
