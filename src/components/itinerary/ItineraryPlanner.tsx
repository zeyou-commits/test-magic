import { isTowardsSouth } from "@/lib/ferry/markets";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Anchor,
  ArrowRight,
  Car,
  ChevronDown,
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
  X,
  SlidersHorizontal as SlidersHorizontalIcon,
  Star as StarIcon,
  Wallet as WalletIcon,
} from "lucide-react";
const SlidersHorizontal = SlidersHorizontalIcon;
const Star = StarIcon;
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { ITINERARY_CHOOSE_EVENT } from "@/lib/ferry/itinerary";
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
  compareItineraries,
  distinctItineraries,
  gapLabel,
  legWithPauses,
  TIE_MIN,
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
  pausingAt,
  publishJourneyLayout,
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
import {
  readTravelProfile,
  saveItineraryChoice,
  saveTravelProfile,
  TRAVEL_PROFILE_EVENT,
  type ItineraryChoice,
} from "@/lib/ferry/travelProfile";
import { SimulationJourney } from "@/components/journey/SimulationJourney";

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

/** Les pauses sont comptées dans les heures affichées. */
function pauseNote(driveMin: number) {
  const pauses = drivingPauses(driveMin);
  if (!pauses) return "";
  return ` · ${pauses} pause${pauses > 1 ? "s" : ""} de ${PAUSE_MIN} min comprise${pauses > 1 ? "s" : ""}`;
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

/** Une étape repliée : la question à gauche, le choix actuel à droite (comme « Trouver ma traversée »). */
function RefineStep({
  open,
  onToggle,
  summary,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-card px-3.5 py-2.5 text-left shadow-sm transition hover:border-primary ${open ? "border-primary" : "border-border"}`}
    >
      <span className={`text-xs font-semibold ${open ? "text-foreground" : "text-muted-foreground"}`}>
        {children}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate text-xs font-bold text-foreground first-letter:uppercase">
          {summary}
        </span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </span>
    </button>
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
  onPick,
  picking,
  enterKeyHint,
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
  /** Placer le point en touchant la carte. */
  onPick?: () => void;
  picking?: boolean;
  enterKeyHint?: "next" | "go";
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
      <div
        className="bw-address-field batogo-control flex h-14 w-full min-w-0 items-center gap-1 pl-3 pr-1.5"
        data-picking={picking ? "true" : undefined}
      >
        <span className="min-w-0 flex-1">
          <label
            className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            htmlFor={`itinerary-${countryCode ?? "origin"}`}
          >
            {label}
          </label>
          <input
            id={`itinerary-${countryCode ?? "origin"}`}
            className="bw-address-input block h-6 w-full min-w-0 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:font-medium placeholder:text-muted-foreground/80"
            enterKeyHint={enterKeyHint}
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
          onFocus={() => {
            setOpen(true);
            // Comme le volet de la carte : sur téléphone, il se déplie pour laisser la place de saisir,
            // et la page ne glisse pas (sinon le volet se décolle du bas de l'écran).
            if (window.matchMedia("(max-width: 767px)").matches) {
              window.dispatchEvent(new Event("batogo:panel-full"));
              const back = () => {
                if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" });
              };
              requestAnimationFrame(back);
              window.setTimeout(back, 350);
            }
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          required
          minLength={2}
        />
        </span>
        {onLocate && (
          <button
            type="button"
            onClick={onLocate}
            disabled={locating}
            aria-label={locating ? "Localisation en cours" : "Utiliser ma position"}
            title="Utiliser ma position"
            className="grid size-9 shrink-0 place-items-center rounded-full text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            <LocateFixed className="size-4" aria-hidden />
          </button>
        )}
        {onPick && (
          <button
            type="button"
            onClick={onPick}
            aria-pressed={picking}
            aria-label={picking ? "Annuler : ne pas placer sur la carte" : `${label} : placer sur la carte`}
            title={picking ? "Annuler" : "Placer sur la carte"}
            className={`grid size-9 shrink-0 place-items-center rounded-full transition ${picking ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary/10"}`}
          >
            {picking ? <X className="size-4" aria-hidden /> : <MapPin className="size-4" aria-hidden />}
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
  onBookPeriod?: (period: string, choice?: ItineraryChoice) => void;
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
  // Le profil saisi dans « Trouver » (ou ici la dernière fois) : on ne le redemande pas.
  // Un changement venu de ce chargement n'est jamais réenregistré par-dessus le profil gardé.
  const profileSyncing = useRef(false);
  const profileNow = useRef({ vehicle, adults, children });
  profileNow.current = { vehicle, adults, children };
  useEffect(() => {
    const load = () => {
      const stored = readTravelProfile();
      if (!stored) return;
      const now = profileNow.current;
      // Rien à recharger : aucun rendu ne suivra, donc rien à ignorer.
      if (
        now.vehicle === stored.vehicle &&
        now.adults === stored.passengers.adults &&
        now.children === stored.passengers.children
      )
        return;
      profileSyncing.current = true;
      setVehicle(stored.vehicle);
      setAdults(stored.passengers.adults);
      setChildren(stored.passengers.children);
    };
    load();
    window.addEventListener(TRAVEL_PROFILE_EVENT, load);
    return () => window.removeEventListener(TRAVEL_PROFILE_EVENT, load);
  }, []);
  useEffect(() => {
    if (profileSyncing.current) {
      profileSyncing.current = false;
      return;
    }
    const saved = readTravelProfile();
    // Le profil par défaut n'est jamais pris pour un choix.
    if (!saved && vehicle === "sedan" && adults === 2 && children === 0) return;
    const stored = saved ?? defaultTripProfile;
    saveTravelProfile({
      ...stored,
      vehicle,
      passengers: { ...stored.passengers, adults, children },
    });
  }, [vehicle, adults, children]);
  const [consumption, setConsumption] = useState(7);
  const [fuelPrice, setFuelPrice] = useState(1.8);
  const [tollRate, setTollRate] = useState(0.06);
  const priority: ItineraryPriority = "recommended";
  const [filtersOpen, setFiltersOpen] = useState(true);
  // Étapes ② et ③ du formulaire : repliées par défaut, comme dans « Trouver ma traversée ».
  const [refine, setRefine] = useState<"when" | "who" | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Les deux adresses choisies : le voyage se calcule seul, puis de nouveau à chaque réglage changé.
  const lastAutoKey = useRef("");
  // Résultats : la carte dépliée (« Voir le détail ») et la liste des autres trajets.
  const [openDetail, setOpenDetail] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Un trajet touché sur la carte (bulle ou tracé gris) devient le trajet choisi.
  useEffect(() => {
    const choose = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (!id) return;
      setHoveredId(null);
      setSelectedId(id);
    };
    window.addEventListener(ITINERARY_CHOOSE_EVENT, choose);
    return () => window.removeEventListener(ITINERARY_CHOOSE_EVENT, choose);
  }, []);
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
  const compared = useMemo(
    () => compareItineraries(realOptions.length ? realOptions : sorted),
    [realOptions, sorted],
  );
  const dated = realOptions.length > 0;
  const estimatedChoices = realOptions.length
    ? sorted.filter((option) => option.sailing.isSimulation).slice(0, 3)
    : [];
  const selected =
    sorted.find((option) => option.sailing.departure.id === selectedId) ??
    realOptions[0] ??
    sorted[0];
  const previewed = sorted.find((option) => option.sailing.departure.id === hoveredId) ?? selected;
  // Ce que « Trouver » reprendra : le mois et les ports de la traversée choisie.
  const choice: ItineraryChoice | undefined = selected
    ? {
        period,
        departurePortId: selected.sailing.from.id,
        arrivalPortId: selected.sailing.to.id,
      }
    : undefined;
  const choiceKey = choice ? `${choice.period}:${choice.departurePortId}:${choice.arrivalPortId}` : "";
  useEffect(() => {
    saveItineraryChoice(choice ?? null);
    // La clé suffit : elle change dès que le mois ou la traversée choisie change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choiceKey]);
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
    const alternativeIds: string[] = [];
    const seen = new Set([`${previewed.sailing.from.id}|${previewed.sailing.to.id}`]);
    // Une bulle par trajet, posée au milieu de sa traversée : médaille, durée et prix.
    const rankPool = realOptions.length ? realOptions : sorted;
    const bubble = (option: (typeof sorted)[number], chosen: boolean) => {
      const arc = routeArc(option.sailing.from, option.sailing.to);
      const rank = rankPool.indexOf(option);
      return {
        id: option.sailing.departure.id,
        point: arc[Math.floor(arc.length / 2)] ?? arc[0]!,
        path: arc,
        priority: chosen ? 0 : rank >= 0 ? rank + 1 : 99,
        medal: ["🥇", "🥈", "🥉"][rank] ?? "",
        title: `${option.sailing.from.name} → ${option.sailing.to.name}`,
        detail: `${formatDuration(option.totalMinutes)} · ${numberFormat.format(option.totalEuro)} €`,
        selected: chosen,
      };
    };
    const choices = [bubble(previewed, true)];
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
      const id = option.sailing.departure.id;
      alternativeIds.push(id, id, id);
      choices.push(bubble(option, false));
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
        alternativeIds,
        choices,
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
  const filmFor = (option: NonNullable<typeof selected>, roads: { toPort: LngLat[]; fromPort: LngLat[] } | null | undefined): JourneyFilm => {
    const from: LngLat = [option.sailing.from.longitude, option.sailing.from.latitude];
    const to: LngLat = [option.sailing.to.longitude, option.sailing.to.latitude];
    const slug = option.sailing.vessel ? vesselMapIcon(option.sailing.vessel.name) : null;
    return {
      key: option.sailing.departure.id,
      road: roads?.toPort ?? [roadAccess!.originPoint, from],
      sea: routeArc(option.sailing.from, option.sailing.to),
      last: roads?.fromPort ?? [to, roadAccess!.destinationPoint],
      roadMin: legWithPauses(option.originRoad.durationMin),
      roadPauses: drivingPauses(option.originRoad.durationMin),
      boardMin: BOARDING_BUFFER_MIN,
      ferryMin: option.sailing.durationMin ?? 0,
      disembarkMin: DISEMBARK_BUFFER_MIN,
      lastMin: legWithPauses(option.destinationRoad.durationMin),
      lastPauses: drivingPauses(option.destinationRoad.durationMin),
      roadKm: option.originRoad.distanceKm,
      lastKm: option.destinationRoad.distanceKm,
      shipImage: slug ? `/vessel-visuals/map/${slug}.webp` : "/images/ferry-3d-marker.png",
      pins: [],
    };
  };
  const film = useMemo<JourneyFilm | null>(() => {
    if (!selected || !roadAccess) return null;
    return filmFor(selected, filmRoads?.id === selectedKey ? filmRoads : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selectedKey, roadAccess, filmRoads]);

  // La course : chacun part quand il le faut pour son bateau, le premier arrivé gagne.
  const [racing, setRacing] = useState(false);
  const [raceMinute, setRaceMinute] = useState(0);
  const [raceRoadsTick, setRaceRoadsTick] = useState(0);
  // Sur mobile, le film occupe l'écran : le volet se réduit à sa barre de lecture.
  const [cinema, setCinema] = useState(false);
  const race = useMemo(() => {
    if (!roadAccess) return [];
    const firstLeave = Math.min(...compared.map(({ option }) => option.leaveHomeAt));
    const entries = compared.map(({ option }) => {
      const id = option.sailing.departure.id;
      const raceFilm = filmFor(option, geometryCache.current.get(id) ?? (filmRoads?.id === id ? filmRoads : null));
      const startMin = dated ? Math.round((option.leaveHomeAt - firstLeave) / 60_000) : 0;
      return {
        id,
        label: `${option.sailing.from.name} → ${option.sailing.to.name}`,
        startMin,
        totalMin: dated ? Math.round((option.arrivalAt - option.leaveHomeAt) / 60_000) : filmTimes(raceFilm).total,
        estimated: Boolean(option.sailing.isSimulation),
        film: raceFilm,
      };
    });
    return raceRanking(entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compared, dated, roadAccess, filmRoads, raceRoadsTick]);
  const raceEnd = race.at(-1)?.arriveMin ?? 0;
  const raceWinner = race[0];
  const raceTied = race.filter((entry) => entry.gapMin < TIE_MIN);
  const startRace = () => {
    setPlaying(false);
    setPullBack(0);
    setRaceMinute(0);
    setRacing(true);
    if (window.innerWidth < 768) setCinema(true);
    // Les vraies routes de chaque trajet, chargées une seule fois.
    if (roadAccess?.roadMode === "estimate") return;
    for (const { option } of compared) {
      const id = option.sailing.departure.id;
      if (geometryCache.current.has(id)) continue;
      void calculateRoadGeometry({
        data: {
          origin: roadAccess!.originPoint,
          destination: roadAccess!.destinationPoint,
          departurePort: [option.sailing.from.longitude, option.sailing.from.latitude],
          arrivalPort: [option.sailing.to.longitude, option.sailing.to.latitude],
        },
      })
        .then((geometry) => {
          geometryCache.current.set(id, geometry);
          setRaceRoadsTick((count) => count + 1);
        })
        .catch(() => undefined);
    }
  };
  const launchFilm = () => {
    setRacing(false);
    setPlaying(true);
    if (window.innerWidth < 768) setCinema(true);
  };
  const raceDone = racing && raceMinute >= raceEnd;
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
    // Une route qui arrive en chemin ne relance pas la course.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [racing]);
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
    if (!racing) setCinema(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);
  useEffect(() => {
    if (!showingResults) setCinema(false);
    publishJourneyLayout({ wide: showingResults });
    return () => publishJourneyLayout({ wide: false });
  }, [showingResults]);
  const cinemaSeen = useRef(false);
  useEffect(() => {
    if (!cinema && !cinemaSeen.current) return;
    cinemaSeen.current = true;
    if (active) publishJourneyLayout({ cinema });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cinema]);
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
          startMin: entry.startMin ?? 0,
          label: entry.label,
          winner: entry.id === raceWinner?.id && raceMinute >= entry.arriveMin,
        })),
      });
      return;
    }
    publishFilmFrame({
      film,
      minute,
      wide,
      demo: false,
      maxZoom: 7.4,
      caption: pausingAt(film, minute) ? `Pause conseillée · ${PAUSE_MIN} min` : "",
    });
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
        caption: pausingAt(DEMO_FILM, at)
          ? `Exemple · Pause conseillée, ${PAUSE_MIN} min`
          : `Exemple · ${DEMO_CAPTIONS[stageAt(DEMO_FILM, at)]}`,
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

  // Calcul automatique : dès que les deux adresses sont choisies (liste, position ou carte), puis à
  // chaque changement d'adresse ou de période. Revenir sur le formulaire sans rien changer ne relance rien.
  useEffect(() => {
    if (!filtersOpen || !originPoint || !destinationPoint || loading) return;
    if (portsPending || routesPending || departuresPending) return;
    const key = `${originPoint.join(",")}|${destinationPoint.join(",")}|${period}`;
    if (key === lastAutoKey.current) return;
    const timer = window.setTimeout(() => {
      lastAutoKey.current = key;
      formRef.current?.requestSubmit();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    filtersOpen,
    originPoint,
    destinationPoint,
    period,
    loading,
    portsPending,
    routesPending,
    departuresPending,
  ]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Déjà en cours (calcul automatique puis touche Entrée) : un seul calcul.
    if (loading) return;
    setError(null);
    setRoadAccess(null);
    setRacing(false);
    setCinema(false);
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
  const whoSummary = `${adults} adulte${adults > 1 ? "s" : ""}${children > 0 ? ` · ${children} enfant${children > 1 ? "s" : ""}` : ""} · ${vehicleLabel}`;
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
            source: roadAccess?.roadMode === "osrm" ? "Route calculée" : "Route estimée",
            text: `${Math.round(selected.originRoad.distanceKm)} km, ${formatDuration(selected.originRoad.durationMin)} jusqu'à ${selected.sailing.from.name}${pauseNote(selected.originRoad.durationMin)}`,
          },
          {
            id: "port",
            at: times.port,
            title: `Au port de ${selected.sailing.from.name}`,
            source: "Marge repère",
            text: "Marge repère avant le départ : l'heure de convocation de votre billet fait foi",
          },
          {
            id: "sea",
            at: times.sea,
            title: "La traversée",
            source: selected.sailing.isSimulation ? "Durée estimée" : "Horaire publié",
            text: `${formatDuration(selected.sailing.durationMin ?? 0)} de mer jusqu'à ${selected.sailing.to.name}`,
          },
          {
            id: "disembark",
            at: times.disembark,
            title: `Arrivée à ${selected.sailing.to.name}`,
            source: "Marge repère",
            text: "Débarquement, contrôles et sortie du port, marge repère",
          },
          {
            id: "last",
            at: times.last,
            title: "La dernière route",
            source: roadAccess?.roadMode === "osrm" ? "Route calculée" : "Route estimée",
            text: `${Math.round(selected.destinationRoad.distanceKm)} km, ${formatDuration(selected.destinationRoad.durationMin)}${pauseNote(selected.destinationRoad.durationMin)}`,
          },
          { id: "done", at: times.total, title: "Arrivée à destination", source: "", text: roadAccess?.destination ?? "" },
        ]
      : [];
  const currentStep = steps.find((step) => step.id === stage) ?? steps[0];
  const pausingNow = film ? pausingAt(film, minute) : false;
  const raceLeader = race
    .filter((entry) => raceMinute >= entry.arriveMin)
    .at(0);
  // Le récap posé sur la carte, en haut à gauche : l'essentiel du trajet choisi, sans ouvrir le volet.
  const [mapLayer, setMapLayer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMapLayer(document.querySelector<HTMLElement>(".bw-map-canvas"));
  }, []);
  const recapPool = realOptions.length ? realOptions : sorted;
  const recapRank = selected ? recapPool.indexOf(selected) : -1;
  const mapRecap =
    mapLayer && active && roadAccess && !filtersOpen && selected && !cinema
      ? createPortal(
          <div
            className="pointer-events-auto absolute left-14 right-3 top-3 z-30 max-w-[20rem] rounded-2xl border border-border bg-white/95 p-2.5 shadow-lg backdrop-blur md:hidden"
            role="status"
            aria-label="Trajet choisi"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-primary">
                  {recapRank === 0 ? "🥇 Notre conseil" : recapRank > 0 && recapRank < 3 ? `${["🥇", "🥈", "🥉"][recapRank]} Trajet choisi` : "Trajet choisi"}
                </p>
                <p className="truncate text-sm font-bold leading-tight">
                  {selected.sailing.from.name} → {selected.sailing.to.name}
                </p>
              </div>
              <p className="shrink-0 text-right">
                <strong className="block text-sm tabular-nums">≈ {numberFormat.format(selected.totalEuro)} €</strong>
                <span className="block text-[10px] text-muted-foreground">{formatDuration(selected.totalMinutes)}</span>
              </p>
            </div>
            {selected.sailing.company ? (
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CompanyBadge
                  name={selected.sailing.company.name}
                  logoUrl={selected.sailing.company.logo_url}
                  size={16}
                />
                <span className="truncate">{selected.sailing.company.name}</span>
              </p>
            ) : null}
            <p className="mt-1 text-[11px] font-semibold leading-snug">
              🏠{" "}
              {selected.sailing.isSimulation
                ? `Date à confirmer en ${periodLabel}`
                : formatDayTime(selected.leaveHomeAt, portTimeZone(selected.sailing.from))}{" "}
              → 🏁{" "}
              {selected.sailing.isSimulation
                ? `≈ ${formatDuration(selected.totalMinutes)}`
                : formatDayTime(selected.arrivalAt, portTimeZone(selected.sailing.to))}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Touchez une bulle pour changer de trajet.</p>
          </div>,
          mapLayer,
        )
      : null;
  const closeCinema = () => {
    setPlaying(false);
    setCinema(false);
  };

  return (
    <section id="itineraire" className="@container min-h-full min-w-0 w-full bg-[#fffdf8]">
      {mapRecap}
      {cinema && film && times && currentStep ? (
        <div className="grid gap-1.5 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-sm">
                {racing
                  ? raceLeader
                    ? raceDone && raceTied.length > 1
                      ? "Égalité en tête"
                      : `1er : ${raceLeader.label}`
                    : "La course est lancée"
                  : pausingNow
                    ? `Pause conseillée · ${PAUSE_MIN} min`
                    : currentStep.title}
              </strong>
              <span className="block truncate text-xs font-semibold tabular-nums text-primary">
                {racing
                  ? raceDone && raceWinner
                    ? raceTied.length > 1
                      ? "Écart de moins d'une heure"
                      : gapLabel(race[1]?.gapMin ?? 0) + " pour le suivant"
                    : `${race.filter((entry) => raceMinute >= entry.arriveMin).length} sur ${race.length} arrivés`
                  : moment(Math.round(minute))}
              </span>
            </div>
            {racing ? null : (
              <button
                type="button"
                aria-label={playing ? "Mettre en pause" : minute >= times.total ? "Revoir mon voyage" : "Reprendre"}
                onClick={() => setPlaying((value) => !value)}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary"
              >
                {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
              </button>
            )}
            <button
              type="button"
              onClick={closeCinema}
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-primary px-3 text-xs font-bold text-white"
            >
              Voir le détail
            </button>
          </div>
          {racing ? (
            <span className="block h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
              <span
                className="block h-full bg-primary"
                style={{ width: `${raceEnd ? Math.min(100, (raceMinute / raceEnd) * 100) : 0}%` }}
              />
            </span>
          ) : (
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
              className="h-6 w-full accent-[#0e7a43]"
            />
          )}
        </div>
      ) : null}
      <div hidden={cinema}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-3 md:bg-white md:px-5">
        <h2 className="min-w-0 truncate font-display text-base font-bold tracking-tight text-foreground">
          <span className="sr-only">Trajet porte à porte : </span>De chez vous jusqu'au bled
        </h2>
        {/* Simulation faite : le voyage se lance d'ici, même volet replié (sans repasser par le bas). */}
        {roadAccess && !filtersOpen && selected ? (
          <button
            type="button"
            onClick={launchFilm}
            aria-label="Voir mon voyage sur la carte"
            className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-bold text-primary-foreground shadow-md transition hover:opacity-90"
          >
            <Play className="size-3.5" aria-hidden /> Voir sur la carte
          </button>
        ) : null}
        {/* Pas de ✕ : on replie le volet par sa poignée ; quitter Route passe par la barre du bas. */}
      </div>
      <form
        ref={formRef}
        onSubmit={(event) => void submit(event)}
        hidden={!filtersOpen}
        className="space-y-3 bg-card px-4 pt-4 md:bg-white md:px-5"
      >
        <div className="grid gap-3">
          <AddressField
            label="Départ"
            placeholder="Adresse, ville ou ma position"
            value={origin}
            onChange={setOrigin}
            point={originPoint}
            onPointChange={setOriginPoint}
            onLocate={locateOrigin}
            locating={locating}
            onPick={() => setPicking(picking === "origin" ? null : "origin")}
            picking={picking === "origin"}
            enterKeyHint="next"
          />
          {locationError && (
            <p role="status" className="-mt-1 text-xs text-destructive">
              {locationError}
            </p>
          )}
          <AddressField
            label="Arrivée au bled"
            placeholder="Adresse, quartier ou ville en Algérie"
            value={destination}
            onChange={setDestination}
            point={destinationPoint}
            onPointChange={setDestinationPoint}
            countryCode="DZ"
            onPick={() => setPicking(picking === "destination" ? null : "destination")}
            picking={picking === "destination"}
            enterKeyHint="go"
          />
          {picking ? (
            <p role="status" className="-mt-1 text-xs font-semibold text-primary">
              Touchez la carte pour placer votre {picking === "origin" ? "départ" : "arrivée"}.
            </p>
          ) : loading ? (
            <p role="status" className="-mt-1 text-xs font-semibold text-primary">
              Préparation de votre voyage…
            </p>
          ) : null}
          <button
            type="submit"
            disabled={
              loading ||
              origin.trim().length < 2 ||
              destination.trim().length < 2 ||
              portsPending ||
              routesPending ||
              departuresPending
            }
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-bold text-primary-foreground shadow-md transition hover:opacity-90 disabled:bg-primary/35 disabled:shadow-none"
          >
            {loading ? (
              "Simulation de votre voyage…"
            ) : (
              <>
                <Play className="size-4" aria-hidden /> Simuler mon voyage
              </>
            )}
          </button>
          {!loading && (!origin.trim() || !destination.trim()) ? (
            <p className="-mt-1 text-center text-[11px] text-muted-foreground">
              Indiquez d'où vous partez et où vous allez au bled.
            </p>
          ) : null}
          {roadAccess ? (
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="-mt-1 justify-self-start text-xs font-semibold text-primary underline underline-offset-2"
            >
              ← Revenir à mon voyage
            </button>
          ) : null}
        </div>
        <RefineStep
          open={refine === "when"}
          onToggle={() => setRefine(refine === "when" ? null : "when")}
          summary={periodLabel}
        >
          ② Quand partez-vous ?
        </RefineStep>
        {refine === "when" ? (
          <div className="rounded-2xl border border-border bg-card p-3 text-sm shadow-sm">
            <fieldset className="min-w-0">
              <legend className="text-[11px] font-bold uppercase tracking-wider text-primary">
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
          </div>
        ) : null}
        <RefineStep
          open={refine === "who"}
          onToggle={() => setRefine(refine === "who" ? null : "who")}
          summary={whoSummary}
        >
          ③ Qui voyage, avec quel véhicule ?
        </RefineStep>
        {refine === "who" ? (
          <div className="grid gap-3 text-sm">
            <fieldset className="min-w-0 rounded-2xl border border-border bg-card p-3 shadow-sm">
              <legend className="sr-only">Voyageurs</legend>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-primary">
                Voyageurs
              </p>
              <div className="grid min-w-0 grid-cols-1 gap-1.5 min-[360px]:grid-cols-2">
                <PassengerControl label="Adultes" value={adults} min={1} onChange={setAdults} />
                <PassengerControl label="Enfants" value={children} min={0} onChange={setChildren} />
              </div>
            </fieldset>
            <fieldset className="min-w-0 rounded-2xl border border-border bg-card p-3 shadow-sm">
              <legend className="sr-only">Votre voiture</legend>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-primary">
                Véhicule
              </p>
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
              <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
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
            </fieldset>
          </div>
        ) : null}
        <p className="text-[11px] leading-snug text-muted-foreground">
          La carte montre un exemple de voyage. Vos adresses servent seulement à calculer votre trajet.
        </p>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}
        <div className="h-3" />
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
              {(() => {
                // Le classement : notre conseil d'abord (même règle que « Trouver ma traversée »).
                const pool = realOptions.length ? realOptions : sorted;
                const podium = pool.slice(0, 3);
                const others = pool.slice(3);
                const best = (value: (option: (typeof pool)[number]) => number) =>
                  [...pool].sort((a, b) => value(a) - value(b))[0];
                const earliest = best((option) => (dated ? option.arrivalAt : option.totalMinutes));
                const cheapest = best((option) => option.totalEuro);
                const leastDriving = best((option) => option.roadKm);
                const shortest = best((option) => option.totalMinutes);
                // Les compagnies qui desservent chaque ligne (tous les départs connus), pour choisir en confiance.
                const companiesByLine = new Map<string, NonNullable<(typeof sailings)[number]["company"]>[]>();
                for (const sailing of sailings) {
                  if (!sailing.company) continue;
                  const key = `${sailing.from.id}|${sailing.to.id}`;
                  const list = companiesByLine.get(key) ?? [];
                  if (!list.some((company) => company.id === sailing.company!.id)) list.push(sailing.company);
                  companiesByLine.set(key, list);
                }
                const lineCompanies = (option: (typeof pool)[number]) => {
                  const list = [...(companiesByLine.get(`${option.sailing.from.id}|${option.sailing.to.id}`) ?? [])];
                  const own = option.sailing.company;
                  if (own && !list.some((company) => company.id === own.id)) list.unshift(own);
                  // La compagnie de ce départ d'abord.
                  return list.sort((a, b) => Number(b.id === own?.id) - Number(a.id === own?.id));
                };
                const leader = podium[0]!;
                const zoneFrom = (option: (typeof pool)[number]) => portTimeZone(option.sailing.from);
                const zoneTo = (option: (typeof pool)[number]) => portTimeZone(option.sailing.to);
                const when = (option: (typeof pool)[number], at: number, arrival = false) =>
                  option.sailing.isSimulation
                    ? at === option.leaveHomeAt
                      ? `Date à confirmer en ${periodLabel}`
                      : `≈ ${formatDuration(Math.round((at - option.leaveHomeAt) / 60_000))} après le départ`
                    : formatDayTime(at, arrival ? zoneTo(option) : zoneFrom(option));
                const badgesOf = (option: (typeof pool)[number]) => {
                  const list: { icon: string; text: string }[] = [];
                  if (pool.length > 1 && option === shortest)
                    list.push({ icon: "⌛", text: "Le voyage le plus court" });
                  if (pool.length > 1 && dated && option === earliest && option !== shortest)
                    list.push({ icon: "⏱", text: "Au bled le plus tôt" });
                  if (pool.length > 1 && option === cheapest) list.push({ icon: "💶", text: "Le moins cher" });
                  if (pool.length > 1 && option === leastDriving)
                    list.push({ icon: "🚗", text: "Le moins de volant" });
                  return list;
                };
                const versusLeader = (option: (typeof pool)[number]) => {
                  if (option === leader) return "";
                  const parts: string[] = [];
                  // On compare la durée du voyage (pas l'arrivée : chacun part à une date différente).
                  const longer = option.totalMinutes - leader.totalMinutes;
                  if (Math.abs(longer) >= TIE_MIN)
                    parts.push(
                      `voyage ${gapLabel(Math.abs(longer)).replace("+", "")} ${longer > 0 ? "plus long" : "plus court"}`,
                    );
                  const euro = Math.round(option.totalEuro - leader.totalEuro);
                  if (Math.abs(euro) >= 10) parts.push(euro > 0 ? `${euro} € de plus` : `${-euro} € de moins`);
                  const km = Math.round(option.roadKm - leader.roadKm);
                  if (Math.abs(km) >= 50) parts.push(km > 0 ? `${km} km de route en plus` : `${-km} km de route en moins`);
                  return parts.length ? `Par rapport à notre conseil : ${parts.join(", ")}.` : "Presque identique à notre conseil.";
                };
                const stepsOf = (option: (typeof pool)[number]) => {
                  const port = option.leaveHomeAt + legWithPauses(option.originRoad.durationMin) * 60_000;
                  const sail = Date.parse(option.sailing.departure.departure_at);
                  const land = option.sailing.departure.arrival_at
                    ? Date.parse(option.sailing.departure.arrival_at)
                    : sail + (option.sailing.durationMin ?? 0) * 60_000;
                  const out = land + DISEMBARK_BUFFER_MIN * 60_000;
                  return [
                    {
                      icon: "🏠",
                      at: when(option, option.leaveHomeAt),
                      title: "Départ de chez vous",
                      text: `${Math.round(option.originRoad.distanceKm)} km, ${formatDuration(option.originRoad.durationMin)} jusqu'à ${option.sailing.from.name}${pauseNote(option.originRoad.durationMin)}`,
                    },
                    {
                      icon: "⚓",
                      at: when(option, port),
                      title: `Au port de ${option.sailing.from.name}`,
                      text: `${BOARDING_BUFFER_MIN / 60} h de marge avant le départ : l'heure de convocation de votre billet fait foi`,
                    },
                    {
                      icon: "🚢",
                      at: when(option, sail),
                      title: `Traversée${option.sailing.company ? ` avec ${option.sailing.company.name}` : ""}`,
                      text: `${formatDuration(option.sailing.durationMin ?? 0)} de mer jusqu'à ${option.sailing.to.name}${option.sailing.isSimulation ? " (durée estimée)" : ""}`,
                    },
                    {
                      icon: "🛃",
                      at: when(option, land, true),
                      title: `Arrivée à ${option.sailing.to.name}`,
                      text: `Débarquement, contrôles et sortie du port : ${DISEMBARK_BUFFER_MIN / 60} h de marge`,
                    },
                    {
                      icon: "🛣️",
                      at: when(option, out, true),
                      title: "La dernière route",
                      text: `${Math.round(option.destinationRoad.distanceKm)} km, ${formatDuration(option.destinationRoad.durationMin)}${pauseNote(option.destinationRoad.durationMin)}`,
                    },
                    {
                      icon: "🏁",
                      at: when(option, option.arrivalAt, true),
                      title: "Bien arrivé au bled",
                      text: roadAccess.destination,
                    },
                  ];
                };
                // Pourquoi c'est notre conseil, dit avec ses vrais atouts.
                const leaderReason =
                  pool.length < 2
                    ? `${formatDuration(leader.totalMinutes)} de porte à porte.`
                    : leader === shortest && leader === cheapest
                      ? `Le plus court et le moins cher : ${formatDuration(leader.totalMinutes)} de porte à porte.`
                      : leader === shortest
                        ? `Le voyage le plus court (${formatDuration(leader.totalMinutes)} de porte à porte), à un horaire confortable.`
                        : leader === cheapest
                          ? `Le moins cher, pour ${formatDuration(leader.totalMinutes)} de porte à porte.`
                          : `Le meilleur équilibre entre durée (${formatDuration(leader.totalMinutes)}), horaire et prix.`;
                const card = (option: (typeof pool)[number], rank: number) => {
                  const id = option.sailing.departure.id;
                  const on = id === selected.sailing.departure.id;
                  const open = openDetail === id;
                  const medal = ["🥇", "🥈", "🥉"][rank] ?? `${rank + 1}`;
                  const badges = badgesOf(option);
                  return (
                    <li
                      key={id}
                      className={`rounded-2xl border bg-white shadow-sm transition ${on ? "border-primary ring-2 ring-primary/15" : "border-border"}`}
                    >
                      <button
                        type="button"
                        aria-pressed={on}
                        onMouseEnter={() => setHoveredId(id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => setSelectedId(id)}
                        className="grid w-full gap-1.5 p-3 text-left"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="text-xl leading-none" aria-hidden>
                              {medal}
                            </span>
                            <span className="min-w-0">
                              {rank === 0 ? (
                                <span className="block text-[11px] font-extrabold uppercase tracking-wide text-primary">
                                  Notre conseil
                                </span>
                              ) : null}
                              <strong className="block truncate text-[15px] leading-tight">
                                {option.sailing.from.name} → {option.sailing.to.name}
                              </strong>
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <strong className="block text-[15px] tabular-nums">
                              ≈ {numberFormat.format(option.totalEuro)} €
                            </strong>
                            <span className="block text-[10px] text-muted-foreground">route + ferry</span>
                          </span>
                        </span>
                        {lineCompanies(option).length ? (
                          <span className="grid gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                              {lineCompanies(option).length > 1 ? "Compagnies sur cette ligne" : "Compagnie"}
                            </span>
                            <span className="flex flex-wrap gap-1.5">
                              {lineCompanies(option)
                                .slice(0, 4)
                                .map((company) => {
                                  const own = company.id === option.sailing.company?.id;
                                  return (
                                    <span
                                      key={company.id}
                                      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${own ? "border-primary/40 bg-primary/5 text-foreground" : "border-border bg-white text-muted-foreground"}`}
                                    >
                                      <CompanyBadge name={company.name} logoUrl={company.logo_url} size={22} />
                                      <span className="max-w-[9.5rem] truncate">{company.name}</span>
                                      {own && option.sailing.vessel ? (
                                        <span className="font-normal text-muted-foreground">
                                          · {option.sailing.vessel.name}
                                        </span>
                                      ) : null}
                                    </span>
                                  );
                                })}
                            </span>
                          </span>
                        ) : null}
                        <span className="grid grid-cols-2 gap-1.5">
                          <span className="rounded-xl bg-secondary/70 px-2.5 py-1.5">
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                              🏠 Vous partez
                            </span>
                            <span className="block text-xs font-bold leading-snug">
                              {when(option, option.leaveHomeAt)}
                            </span>
                          </span>
                          <span className="rounded-xl bg-secondary/70 px-2.5 py-1.5">
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                              🏁 Au bled
                            </span>
                            <span className="block text-xs font-bold leading-snug">
                              {when(option, option.arrivalAt, true)}
                            </span>
                          </span>
                        </span>
                        {badges.length ? (
                          <span className="flex flex-wrap gap-1">
                            {badges.map((badge) => (
                              <span
                                key={badge.text}
                                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
                              >
                                <span aria-hidden>{badge.icon}</span>
                                {badge.text}
                              </span>
                            ))}
                          </span>
                        ) : null}
                        <span className="text-[11px] leading-snug text-muted-foreground">
                          {rank === 0 ? leaderReason : versusLeader(option)}{" "}
                          {Math.round(option.roadKm)} km de route au total.
                        </span>
                        {vesselAlerts.has(option.sailing.vessel?.id ?? "") ? (
                          <span role="alert" className="text-xs font-semibold text-warning-foreground">
                            Départ à confirmer auprès de la compagnie
                          </span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => {
                          setSelectedId(id);
                          setOpenDetail(open ? null : id);
                        }}
                        className="flex w-full items-center justify-center gap-1 border-t border-border py-2 text-xs font-bold text-primary"
                      >
                        {open ? "Masquer le détail" : "Voir le détail du voyage"}
                        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
                      </button>
                      {open ? (
                        <div className="grid gap-2 border-t border-border px-3 pb-3 pt-2">
                          <ol className="relative grid gap-2 before:absolute before:bottom-3 before:left-[13px] before:top-3 before:w-px before:bg-border">
                            {stepsOf(option).map((step) => (
                              <li key={step.title} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-2">
                                <span
                                  className="z-[1] grid size-7 place-items-center rounded-full border border-border bg-white text-sm"
                                  aria-hidden
                                >
                                  {step.icon}
                                </span>
                                <span className="min-w-0">
                                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                                    <strong className="text-xs">{step.title}</strong>
                                    <span className="text-[11px] font-bold tabular-nums text-primary">{step.at}</span>
                                  </span>
                                  <span className="block text-[11px] leading-snug text-muted-foreground">
                                    {step.text}
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ol>
                          <p className="rounded-xl bg-secondary/60 px-3 py-2 text-[11px] text-muted-foreground">
                            Route ≈ {numberFormat.format(option.roadEuro)} € (carburant et péages) · Ferry et
                            voiture ≈ {numberFormat.format(option.ferryEuro)} €, fourchette{" "}
                            {formatFareRange(estimateFerryFare(option.sailing, profile))}
                          </p>
                          {option.sailing.to.country_code?.toUpperCase() === "DZ" ? (
                            // Arrivée en Algérie : le budget sur place, route jusqu'à la maison comprise.
                            <a
                              href={`/mes-dinars?plan=1&km=${Math.round(option.destinationRoad.distanceKm)}&adults=${adults}&children=${children}`}
                              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 text-sm font-bold text-primary"
                            >
                              <WalletIcon className="size-4" aria-hidden /> Prévoir mes dinars au bled
                            </a>
                          ) : null}
                          <div className="grid gap-1.5">
                            {option.sailing.isSimulation ? null : (
                              <a
                                href={bookingUrl(option.sailing, profile)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-primary bg-white px-4 text-sm font-bold text-primary"
                              >
                                Réserver sur {bookingSite(option.sailing)} <ArrowRight className="size-4" aria-hidden />
                              </a>
                            )}
                            <a
                              href={`/horaires?from=${option.sailing.from.id}&to=${option.sailing.to.id}&month=${period}`}
                              className="text-center text-xs font-semibold text-primary underline underline-offset-2"
                            >
                              {option.sailing.isSimulation ? "Voir les horaires publiés" : "Voir les autres dates de cette ligne"}
                            </a>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                };
                return (
                  <div className="grid gap-2.5">
                    <div>
                      <h3 className="font-display text-lg font-bold leading-tight">
                        {podium.length > 1 ? `Vos ${podium.length} meilleurs trajets` : "Votre trajet"}
                      </h3>
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        {dated
                          ? `Pour ${periodLabel}, en partant au plus tôt. Touchez un trajet pour le voir sur la carte.`
                          : `Aucune date publiée pour ${periodLabel} : durées et prix estimés.`}
                      </p>
                    </div>
                    <ol className="grid gap-2">{podium.map((option, rank) => card(option, rank))}</ol>
                    <button
                      type="button"
                      onClick={launchFilm}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground shadow-md transition hover:opacity-90"
                    >
                      <Play className="size-4" aria-hidden /> Voir ce voyage sur la carte
                    </button>
                    {others.length ? (
                      <button
                        type="button"
                        aria-expanded={showOthers}
                        onClick={() => setShowOthers((value) => !value)}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-white text-sm font-bold text-foreground"
                      >
                        {showOthers ? "Masquer les autres trajets" : `Autres trajets (${others.length})`}
                        <ChevronDown className={`size-4 transition-transform ${showOthers ? "rotate-180" : ""}`} aria-hidden />
                      </button>
                    ) : null}
                    {showOthers && others.length ? (
                      <ol className="grid gap-2">{others.map((option, index) => card(option, index + 3))}</ol>
                    ) : null}
                    {compared.length > 1 ? (
                      <button
                        type="button"
                        onClick={racing ? () => setRacing(false) : startRace}
                        className="justify-self-center text-xs font-semibold text-primary underline underline-offset-2"
                      >
                        {racing ? "Arrêter la comparaison" : "Comparer ces trajets en film sur la carte"}
                      </button>
                    ) : null}
                  </div>
                );
              })()}

              {/* Le film du voyage choisi : lecture et curseur, une fois lancé. */}
              {film && times && currentStep && (playing || minute > 0) ? (
                <div className="rounded-2xl border border-border bg-white p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <strong className="min-w-0 text-sm leading-snug">
                      {pausingNow ? `Pause conseillée · ${PAUSE_MIN} min` : currentStep.title}
                    </strong>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-primary">
                      {moment(Math.round(minute))}
                    </span>
                  </div>
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
                      setRacing(false);
                      setWide(0);
                      setMinute(Number(event.target.value));
                    }}
                    className="h-7 w-full accent-[#0e7a43]"
                  />
                  <button
                    type="button"
                    onClick={playing ? () => setPlaying(false) : launchFilm}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-bold"
                  >
                    {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                    {playing ? "Pause" : minute >= times.total ? "Revoir mon voyage" : "Reprendre"}
                  </button>
                </div>
              ) : null}

              {film ? (
                <SimulationJourney
                  film={film}
                  minute={minute}
                  onSeek={(next) => {
                    setPlaying(false);
                    setPullBack(0);
                    setRacing(false);
                    setWide(0);
                    setMinute(next);
                  }}
                  from={selected.sailing.from}
                  to={selected.sailing.to}
                  vehicle={vehicle !== "none"}
                  followHref={`/horaires?from=${selected.sailing.from.id}&to=${selected.sailing.to.id}&month=${period}`}
                />
              ) : null}

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
              onClick={() => onBookPeriod(period, choice)}
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
      </div>
    </section>
  );
}
