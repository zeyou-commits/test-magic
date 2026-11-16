import { markBookingLeave } from "@/lib/companion/bookingReturn";
import { isTowardsSouth } from "@/lib/ferry/markets";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Anchor,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
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
  MessageCircle,
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
import { SalesAlertForm } from "@/components/panel/SalesAlertForm";
import { loadPlan, takeItinerarySeed, type ItinerarySeed } from "@/lib/ferry/companion";
import {
  BOARDING_BUFFER_MIN,
  DISEMBARK_BUFFER_MIN,
  buildItineraryOptions,
  buildSimulatedSailings,
  compareItineraries,
  distinctItineraries,
  formatDayTime,
  gapLabel,
  pauseNote,
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
import { RoutePreview, scrollInPanel } from "./RoutePreview";
import { ItineraryAlertForm } from "./ItineraryAlertForm";
import {
  readTravelProfile,
  saveItineraryChoice,
  saveTravelProfile,
  TRAVEL_PROFILE_EVENT,
  type ItineraryChoice,
} from "@/lib/ferry/travelProfile";
import { SimulationJourney } from "@/components/journey/SimulationJourney";
import {
  CostBar,
  DayTimeline,
  TripBar,
  crossesNight,
  durationText,
  nightSpans,
  shortDay,
  timeLabel,
  type TripSegment,
  type TripStep,
} from "./TripParts";

/** « Toulouse (31000) » → « Toulouse », « Tadjena, Algérie » → « Tadjena ». */
const placeName = (label: string) => label.split(/[,(]/)[0]!.trim() || label;
/** « de Sète », « d'Alicante ». */
const ofPlace = (name: string) => (/^[aeiouyàâéèêîôû]/i.test(name) ? `d'${name}` : `de ${name}`);
import { tr } from "@/lib/i18n";

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

/** Ce que « Préparer mon voyage » sait déjà, pour ne pas le redemander ici. */
function seedFromPlan(): ItinerarySeed | null {
  const plan = loadPlan();
  if (!plan?.started || !plan.home) return null;
  return {
    origin: plan.home.postcode ? `${plan.home.name} (${plan.home.postcode})` : plan.home.name,
    originPoint: plan.home.point,
    destination: plan.destination?.label ?? "",
    destinationPoint: plan.destination?.point ?? null,
    period: plan.month,
  };
}

const DEMO_LOOP_MS = 30_000;

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
            className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
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
            aria-label={locating ? tr("ui.itineraryPlanner.localisationEnCours") : tr("ui.itineraryPlanner.utiliserMaPosition")}
            title={tr("ui.itineraryPlanner.utiliserMaPosition")}
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
            aria-label={picking ? tr("ui.itineraryPlanner.annulerNePasPlacerSur") : `${label} : placer sur la carte`}
            title={picking ? tr("ui.itineraryPlanner.annuler") : tr("ui.itineraryPlanner.placerSurLaCarte")}
            className={`grid size-9 shrink-0 place-items-center rounded-full transition ${picking ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary/10"}`}
          >
            {picking ? <X className="size-4" aria-hidden /> : <MapPin className="size-4" aria-hidden />}
          </button>
        )}
      </div>
      {pending && (
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          {tr("ui.itineraryPlanner.rechercheDAdresses")}
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
  // Venue du compagnon « Préparer mon voyage » : domicile, destination et mois déjà connus.
  // Lue une seule fois : le calcul automatique part dès que les deux adresses sont là.
  useEffect(() => {
    // Ouvert depuis le menu : on reprend aussi la préparation en cours (domicile, bled, mois).
    const seed = takeItinerarySeed() ?? seedFromPlan();
    if (!seed) return;
    if (seed.origin) setOrigin(seed.origin);
    if (seed.originPoint) setOriginPoint(seed.originPoint);
    if (seed.destination) setDestination(seed.destination);
    if (seed.destinationPoint) setDestinationPoint(seed.destinationPoint);
    if (seed.period) setPeriod(seed.period);
  }, []);
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
  // Résultats : les trajets en cartes, ou côte à côte (« Comparer »).
  const [resultsView, setResultsView] = useState<"cards" | "compare">("cards");
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
    // Une pastille numérotée par trajet du podium, posée sur sa traversée : la carte montre
    // exactement les trajets de la liste « Vos 3 meilleurs trajets », dans le même ordre.
    const rankPool = realOptions.length ? realOptions : sorted;
    const podium = rankPool.slice(0, 3);
    const bubble = (option: (typeof sorted)[number], chosen: boolean) => {
      const arc = routeArc(option.sailing.from, option.sailing.to);
      const rank = rankPool.indexOf(option);
      return {
        id: option.sailing.departure.id,
        point: arc[Math.floor(arc.length / 2)] ?? arc[0]!,
        path: arc,
        priority: chosen ? 0 : rank >= 0 ? rank + 1 : 99,
        medal: ["🥇", "🥈", "🥉"][rank] ?? "",
        rank: rank >= 0 && rank < 3 ? rank + 1 : undefined,
        title: `${option.sailing.from.name} → ${option.sailing.to.name}`,
        detail: `${formatDuration(option.totalMinutes)} · ${numberFormat.format(option.totalEuro)} €`,
        selected: chosen,
      };
    };
    const choices = [bubble(previewed, true)];
    for (const option of podium) {
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
  // Pendant la comparaison, la carte ne montre que les trajets : discussions et signalements
  // se taisent (ils restent à un toucher, par l'interrupteur « Discussions »).
  const [showSocial, setShowSocial] = useState(false);
  const tripsOnMap = Boolean(mapLayer && active && roadAccess && !filtersOpen && selected && !cinema);
  const quietMap = tripsOnMap && !showSocial;
  useEffect(() => {
    if (!mapLayer) return;
    if (quietMap) mapLayer.dataset["trips"] = "quiet";
    else delete mapLayer.dataset["trips"];
    return () => {
      delete mapLayer.dataset["trips"];
    };
  }, [mapLayer, quietMap]);
  const mapRecap =
    tripsOnMap && mapLayer
      ? createPortal(
          <button
            type="button"
            aria-pressed={showSocial}
            onClick={() => setShowSocial((value) => !value)}
            className="bw-trips-social pointer-events-auto absolute right-3 top-16 z-30"
          >
            <MessageCircle className="size-4" aria-hidden />
            {showSocial ? "Masquer les discussions" : "Discussions"}
          </button>,
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
                      ? tr("ui.itineraryPlanner.egaliteEnTete")
                      : `1er : ${raceLeader.label}`
                    : tr("ui.itineraryPlanner.laCourseEstLancee")
                  : pausingNow
                    ? `Pause conseillée · ${PAUSE_MIN} min`
                    : currentStep.title}
              </strong>
              <span className="block truncate text-xs font-semibold tabular-nums text-primary">
                {racing
                  ? raceDone && raceWinner
                    ? raceTied.length > 1
                      ? tr("ui.itineraryPlanner.ecartDeMoinsDUne")
                      : gapLabel(race[1]?.gapMin ?? 0) + " pour le suivant"
                    : `${race.filter((entry) => raceMinute >= entry.arriveMin).length} sur ${race.length} arrivés`
                  : moment(Math.round(minute))}
              </span>
            </div>
            {racing ? null : (
              <button
                type="button"
                aria-label={playing ? tr("ui.itineraryPlanner.mettreEnPause") : minute >= times.total ? tr("ui.itineraryPlanner.revoirMonVoyage") : tr("ui.itineraryPlanner.reprendre")}
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
              {tr("ui.itineraryPlanner.voirLeDetail")}
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
              aria-label={tr("ui.itineraryPlanner.parcourirLeVoyageDansLe")}
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
        {roadAccess && !filtersOpen ? (
          // Simulation faite : l'en-tête est la recherche elle-même, à modifier d'un toucher.
          <>
            <h2 className="min-w-0 flex-1">
              <span className="sr-only">{tr("ui.itineraryPlanner.trajetPorteAPorte")}{"\u00a0: "}</span>
              <span className="block truncate text-base font-bold leading-tight tracking-tight text-foreground">
                {placeName(roadAccess.origin)} → {placeName(roadAccess.destination)}
              </span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {periodLabel} · {whoSummary}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-label="Modifier la recherche"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-primary"
            >
              <SlidersHorizontal className="size-4" aria-hidden />
            </button>
          </>
        ) : (
          <h2 className="min-w-0 truncate font-display text-base font-bold tracking-tight text-foreground">
            <span className="sr-only">{tr("ui.itineraryPlanner.trajetPorteAPorte")}</span>{tr("ui.itineraryPlanner.deChezVousJusquAu")}
          </h2>
        )}
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
            label={tr("ui.itineraryPlanner.depart")}
            placeholder={tr("ui.itineraryPlanner.adresseVilleOuMaPosition")}
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
            label={tr("ui.itineraryPlanner.arriveeAuBled")}
            placeholder={tr("ui.itineraryPlanner.adresseQuartierOuVilleEn")}
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
              {tr("ui.itineraryPlanner.touchezLaCartePourPlacer")}{picking === "origin" ? tr("ui.itineraryPlanner.depart2") : tr("ui.itineraryPlanner.arrivee")}.
            </p>
          ) : loading ? (
            <p role="status" className="-mt-1 text-xs font-semibold text-primary">
              {tr("ui.itineraryPlanner.preparationDeVotreVoyage")}
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
              tr("ui.itineraryPlanner.simulationDeVotreVoyage")
            ) : (
              <>
                <Play className="size-4" aria-hidden />{tr("ui.itineraryPlanner.simulerMonVoyage")}
              </>
            )}
          </button>
          {!loading && (!origin.trim() || !destination.trim()) ? (
            <p className="-mt-1 text-center text-xs text-muted-foreground">
              {tr("ui.itineraryPlanner.indiquezDOuVousPartez")}
            </p>
          ) : null}
          {roadAccess ? (
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="-mt-1 justify-self-start text-xs font-semibold text-primary underline underline-offset-2"
            >
              {tr("ui.itineraryPlanner.revenirAMonVoyage")}
            </button>
          ) : null}
        </div>
        <RefineStep
          open={refine === "when"}
          onToggle={() => setRefine(refine === "when" ? null : "when")}
          summary={periodLabel}
        >
          {tr("ui.itineraryPlanner.quandPartezVous")}
        </RefineStep>
        {refine === "when" ? (
          <div className="rounded-2xl border border-border bg-card p-3 text-sm shadow-sm">
            <fieldset className="min-w-0">
              <legend className="text-xs font-bold uppercase tracking-wider text-primary">
                {tr("ui.itineraryPlanner.periodeDeDepart")}{" "}
                <span className="font-normal text-muted-foreground">
                  · {months[0]?.key.slice(0, 4)}–{months[11]?.key.slice(0, 4)}
                </span>
              </legend>
              <div
                className="mt-2 grid grid-cols-6 gap-1"
                aria-label={tr("ui.itineraryPlanner.saisonsDesDouzeProchainsMois")}
              >
                {months.map((month) => (
                  <button
                    key={month.key}
                    type="button"
                    aria-label={`${month.label} ${month.key.slice(0, 4)} : saison ${seasonLabel[month.season].toLowerCase()}`}
                    aria-pressed={period === month.key}
                    onClick={() => setPeriod(month.key)}
                    className={`flex min-w-0 flex-col items-center justify-end gap-1 rounded-lg border px-0.5 py-1.5 text-xs font-semibold ${period === month.key ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-muted-foreground"}`}
                  >
                    <span
                      className={`w-4 rounded-t-sm ${seasonHeight[month.season]} ${seasonColor[month.season]}`}
                      aria-hidden
                    />
                    <span className="truncate">{month.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
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
                  {tr("ui.itineraryPlanner.barometre")}
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
          {tr("ui.itineraryPlanner.quiVoyageAvecQuelVehicule")}
        </RefineStep>
        {refine === "who" ? (
          <div className="grid gap-3 text-sm">
            <fieldset className="min-w-0 rounded-2xl border border-border bg-card p-3 shadow-sm">
              <legend className="sr-only">{tr("ui.itineraryPlanner.voyageurs")}</legend>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-primary">
                {tr("ui.itineraryPlanner.voyageurs")}
              </p>
              <div className="grid min-w-0 grid-cols-1 gap-1.5 min-[360px]:grid-cols-2">
                <PassengerControl label={tr("ui.itineraryPlanner.adultes")} value={adults} min={1} onChange={setAdults} />
                <PassengerControl label={tr("ui.itineraryPlanner.enfants")} value={children} min={0} onChange={setChildren} />
              </div>
            </fieldset>
            <fieldset className="min-w-0 rounded-2xl border border-border bg-card p-3 shadow-sm">
              <legend className="sr-only">{tr("ui.itineraryPlanner.votreVoiture")}</legend>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-primary">
                {tr("ui.itineraryPlanner.vehicule")}
              </p>
              <div
                role="group"
                aria-label={tr("ui.itineraryPlanner.choisirVotreVehicule")}
                className="mt-2 grid min-w-0 grid-cols-3 gap-1.5"
              >
                {VEHICLES.filter((item) => item.id !== "none").map(({ id, Icon, label, hint }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={vehicle === id}
                    title={hint}
                    onClick={() => setVehicle(id)}
                    className={`flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl border px-1 py-1.5 text-center text-xs font-semibold leading-tight transition-colors ${vehicle === id ? "border-primary bg-primary text-white" : "border-border bg-white text-foreground hover:border-primary/50"}`}
                  >
                    <Icon className="size-3.5 shrink-0" aria-hidden />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
              <label>
                {tr("ui.itineraryPlanner.consommationL100Km")}
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
                {tr("ui.itineraryPlanner.carburantL")}
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
                {tr("ui.itineraryPlanner.provisionPeagesKm")}
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
        <p className="text-xs leading-snug text-muted-foreground">
          {tr("ui.itineraryPlanner.laCarteMontreUnExemple")}
        </p>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}
        <div className="h-3" />
      </form>
      {/* Avant toute simulation : ce que la route du bled apporte, étape par étape. */}
      {!roadAccess && filtersOpen && !loading ? (
        <RoutePreview
          onStart={() => {
            const field = formRef.current?.querySelector("input");
            scrollInPanel(field, 96);
            field?.focus({ preventScroll: true });
          }}
        />
      ) : null}
      {roadAccess && !filtersOpen && (
        <div className="bw-trips grid gap-3 p-3 sm:p-4">
          {!selected ? (
            <p className="rounded-xl bg-secondary p-3 text-sm">
              {tr("ui.itineraryPlanner.aucuneLigneConnuePourComparer")}
            </p>
          ) : (
            <>
              {(() => {
                // Le classement : notre conseil d'abord (même règle que « Trouver ma traversée »).
                const pool = realOptions.length ? realOptions : sorted;
                type Option = (typeof pool)[number];
                const podium = pool.slice(0, 3);
                const others = pool.slice(3);
                const best = (value: (option: Option) => number) =>
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
                const otherCompanies = (option: Option) =>
                  (companiesByLine.get(`${option.sailing.from.id}|${option.sailing.to.id}`) ?? []).filter(
                    (company) => company.id !== option.sailing.company?.id,
                  );
                const leader = podium[0]!;
                const zoneFrom = (option: Option) => portTimeZone(option.sailing.from);
                const zoneTo = (option: Option) => portTimeZone(option.sailing.to);
                // Les instants clés d'un trajet : maison, port, départ du navire, arrivée, sortie du port, bled.
                const timesOf = (option: Option) => {
                  const port = option.leaveHomeAt + legWithPauses(option.originRoad.durationMin) * 60_000;
                  const sail = Math.max(port, Date.parse(option.sailing.departure.departure_at));
                  const land = option.sailing.departure.arrival_at
                    ? Date.parse(option.sailing.departure.arrival_at)
                    : sail + (option.sailing.durationMin ?? 0) * 60_000;
                  const out = land + DISEMBARK_BUFFER_MIN * 60_000;
                  return { home: option.leaveHomeAt, port, sail, land, out, end: option.arrivalAt };
                };
                const sim = (option: Option) => option.sailing.isSimulation;
                const nightDrive = (option: Option) => {
                  if (sim(option)) return null;
                  const t = timesOf(option);
                  const legs: [number, number, string][] = [
                    [t.home, t.port, zoneFrom(option)],
                    [t.out, t.end, zoneTo(option)],
                  ];
                  for (const [start, end, zone] of legs) {
                    const span = nightSpans(start, end, zone).find((night) => night.to - night.from > 20);
                    if (span) return timeLabel(start + span.from * 60_000, zone);
                  }
                  return null;
                };
                const atoutOf = (option: Option) => {
                  if (pool.length < 2) return null;
                  if (option === cheapest) return "Le moins cher";
                  if (option === shortest) return "Le plus court";
                  if (dated && option === earliest) return "Au bled le plus tôt";
                  if (option === leastDriving) return "Le moins de volant";
                  return null;
                };
                const versusLeader = (option: Option) => {
                  if (option === leader) return "";
                  const parts: string[] = [];
                  // On compare la durée du voyage (pas l'arrivée : chacun part à une date différente).
                  const longer = option.totalMinutes - leader.totalMinutes;
                  if (Math.abs(longer) >= TIE_MIN)
                    parts.push(`${durationText(Math.abs(longer))} ${longer > 0 ? "de plus" : "de moins"}`);
                  const euro = Math.round(option.totalEuro - leader.totalEuro);
                  if (Math.abs(euro) >= 10) parts.push(euro > 0 ? `${euro} € de plus` : `${-euro} € de moins`);
                  const km = Math.round(option.roadKm - leader.roadKm);
                  if (Math.abs(km) >= 50) parts.push(km > 0 ? `${km} km de route en plus` : `${-km} km de route en moins`);
                  const night = nightDrive(option);
                  if (night && !nightDrive(leader)) parts.push(`un départ de nuit à ${night}`);
                  return parts.length
                    ? `Par rapport à notre conseil : ${parts.join(", ")}.`
                    : "Presque identique à notre conseil.";
                };
                // Pourquoi c'est notre conseil, dit avec ses vrais atouts.
                const leaderReason =
                  pool.length < 2
                    ? `${formatDuration(leader.totalMinutes)} de porte à porte.`
                    : leader === shortest && leader === cheapest
                      ? "Notre conseil : le plus court et le moins cher."
                      : leader === shortest
                        ? "Notre conseil : le voyage le plus court, à un horaire confortable."
                        : leader === cheapest
                          ? `Notre conseil : le moins cher${nightDrive(leader) ? "" : ", sans route de nuit"}.`
                          : "Notre conseil : le meilleur équilibre entre durée, horaire et prix.";
                const option = selected;
                const t = timesOf(option);
                const dayOf = (at: number, zone: string) => (sim(option) ? `Date à confirmer` : shortDay(at, zone));
                const rankOf = (item: Option) => pool.indexOf(item);
                const selectedRank = rankOf(option);
                const seaNight = !sim(option) && crossesNight(t.sail, t.land, zoneFrom(option), 120);
                const nights = sim(option)
                  ? 0
                  : nightSpans(t.home, t.end, zoneFrom(option)).filter((span) => span.to - span.from > 120).length;
                const steps: TripStep[] = [
                  {
                    kind: "home",
                    at: t.home,
                    zone: zoneFrom(option),
                    title: "Départ de chez vous",
                    text: `${Math.round(option.originRoad.distanceKm)} km jusqu'à ${option.sailing.from.name}`,
                    note: `${formatDuration(option.originRoad.durationMin)} de route${pauseNote(option.originRoad.durationMin)}`,
                  },
                  {
                    kind: "port",
                    at: t.port,
                    zone: zoneFrom(option),
                    title: `Au port ${ofPlace(option.sailing.from.name)}`,
                    text: `${BOARDING_BUFFER_MIN / 60} h avant le départ. L'heure de convocation du billet fait foi.`,
                  },
                  {
                    kind: "sea",
                    at: t.sail,
                    zone: zoneFrom(option),
                    title: "Départ du navire",
                    text: `${option.sailing.company?.name ?? "Traversée"}${option.sailing.vessel ? ` · ${option.sailing.vessel.name}` : ""} · ${formatDuration(option.sailing.durationMin ?? 0)} de mer${sim(option) ? " (durée estimée)" : ""}`,
                    ...(seaNight ? { note: "Nuit à bord : cabine ou fauteuil" } : {}),
                  },
                  {
                    kind: "land",
                    at: t.land,
                    zone: zoneTo(option),
                    title: `Arrivée à ${option.sailing.to.name}`,
                    text: `Débarquement, police et douane : comptez ${DISEMBARK_BUFFER_MIN / 60} h.`,
                  },
                  {
                    kind: "road",
                    at: t.out,
                    zone: zoneTo(option),
                    title: "La dernière route",
                    text: `${Math.round(option.destinationRoad.distanceKm)} km jusqu'à ${placeName(roadAccess.destination)}`,
                    note: `${formatDuration(option.destinationRoad.durationMin)} de route${pauseNote(option.destinationRoad.durationMin)}`,
                  },
                  { kind: "done", at: t.end, zone: zoneTo(option), title: "Au bled", text: roadAccess.destination },
                ];
                const segments: TripSegment[] = [
                  { kind: "road", minutes: (t.port - t.home) / 60_000 },
                  { kind: "wait", minutes: (t.sail - t.port) / 60_000 },
                  { kind: "sea", minutes: (t.land - t.sail) / 60_000 },
                  { kind: "wait", minutes: (t.out - t.land) / 60_000 },
                  { kind: "road", minutes: (t.end - t.out) / 60_000 },
                ];
                const companies = otherCompanies(option);
                const choose = (item: Option) => setSelectedId(item.sailing.departure.id);
                const compareRows: { label: string; value: (item: Option) => string; score?: (item: Option) => number }[] = [
                  { label: "Départ", value: (item) => (sim(item) ? "À confirmer" : `${shortDay(item.leaveHomeAt, zoneFrom(item))} ${timeLabel(item.leaveHomeAt, zoneFrom(item))}`) },
                  { label: "Au bled", value: (item) => (sim(item) ? `≈ ${formatDuration(item.totalMinutes)}` : `${shortDay(item.arrivalAt, zoneTo(item))} ${timeLabel(item.arrivalAt, zoneTo(item))}`) },
                  { label: "Porte à porte", value: (item) => formatDuration(item.totalMinutes), score: (item) => item.totalMinutes },
                  { label: "Prix estimé", value: (item) => `${numberFormat.format(item.totalEuro)} €`, score: (item) => item.totalEuro },
                  { label: "Au volant", value: (item) => `${Math.round(item.roadKm)} km`, score: (item) => item.roadKm },
                  { label: "Route de nuit", value: (item) => nightDrive(item) ?? "Non", score: (item) => (nightDrive(item) ? 1 : 0) },
                ];
                return (
                  <div className="grid gap-4">
                    <div className="flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold leading-tight">
                          {podium.length > 1 ? `Vos ${podium.length} meilleurs trajets` : tr("ui.itineraryPlanner.votreTrajet")}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {dated
                            ? `${periodLabel}, en partant au plus tôt`
                            : `Aucune date publiée pour ${periodLabel} : durées et prix estimés`}
                        </p>
                      </div>
                      {podium.length > 1 ? (
                        <div className="bw-seg" role="group" aria-label="Affichage des trajets">
                          <button type="button" aria-pressed={resultsView === "cards"} onClick={() => setResultsView("cards")}>
                            Trajets
                          </button>
                          <button type="button" aria-pressed={resultsView === "compare"} onClick={() => setResultsView("compare")}>
                            Comparer
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {dated ? null : (
                      // Mois pas encore en vente : l'alerte d'ouverture, comme dans « Réserver ».
                      <SalesAlertForm
                        periodLabel={periodLabel}
                        periodStart={`${period}-01`}
                        periodEnd={`${period}-28`}
                        fromLabel={podium[0]?.sailing.from.name ?? null}
                        toLabel={podium[0]?.sailing.to.name ?? null}
                      />
                    )}
                    {resultsView === "compare" && podium.length > 1 ? (
                      <div className="bw-compare">
                        <table>
                          <thead>
                            <tr>
                              <th scope="col"><span className="sr-only">Critère</span></th>
                              {podium.map((item, rank) => (
                                <th key={item.sailing.departure.id} scope="col" data-on={item === option ? "true" : undefined}>
                                  <button type="button" onClick={() => choose(item)} aria-pressed={item === option}>
                                    <span className="bw-rank">{rank + 1}</span>
                                    <span>{item.sailing.from.name}</span>
                                    <span>→ {item.sailing.to.name}</span>
                                  </button>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {compareRows.map((row) => {
                              const scores = row.score ? podium.map(row.score) : [];
                              const min = scores.length ? Math.min(...scores) : null;
                              const bestIndex = min !== null && scores.filter((s) => s === min).length === 1 ? scores.indexOf(min) : -1;
                              return (
                                <tr key={row.label}>
                                  <th scope="row">{row.label}</th>
                                  {podium.map((item, index) => (
                                    <td
                                      key={item.sailing.departure.id}
                                      data-on={item === option ? "true" : undefined}
                                      data-best={index === bestIndex ? "true" : undefined}
                                      data-warn={row.label === "Route de nuit" && nightDrive(item) ? "true" : undefined}
                                    >
                                      {row.value(item)}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <ol className="bw-tripcards" aria-label="Choisir un trajet">
                        {podium.map((item, rank) => {
                          const on = item === option;
                          const atout = atoutOf(item);
                          const night = nightDrive(item);
                          return (
                            <li key={item.sailing.departure.id}>
                              <button
                                type="button"
                                aria-pressed={on}
                                onMouseEnter={() => setHoveredId(item.sailing.departure.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                onClick={() => choose(item)}
                                className="bw-tripcard"
                              >
                                <span className="bw-tripcard__top">
                                  <span className="bw-rank">{rank + 1}</span>
                                  {rank === 0 ? "Notre conseil" : item.sailing.company?.name ?? "Trajet"}
                                </span>
                                <strong className="bw-tripcard__line">
                                  {item.sailing.from.name} → {item.sailing.to.name}
                                </strong>
                                <span className="bw-tripcard__nums">
                                  <b>{formatDuration(item.totalMinutes)}</b>
                                  <span>≈ {numberFormat.format(item.totalEuro)} €</span>
                                </span>
                                {night && !atout ? (
                                  <span className="bw-tag" data-tone="warn">Départ de nuit</span>
                                ) : atout ? (
                                  <span className="bw-tag">{atout}</span>
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                    {others.length ? (
                      <details className="bw-others">
                        <summary>Autres trajets ({others.length})</summary>
                        <ol>
                          {others.map((item, index) => (
                            <li key={item.sailing.departure.id}>
                              <button type="button" aria-pressed={item === option} onClick={() => choose(item)}>
                                <span className="bw-rank">{index + 4}</span>
                                <span className="min-w-0 flex-1 truncate">
                                  {item.sailing.from.name} → {item.sailing.to.name}
                                </span>
                                <span className="tabular-nums">{formatDuration(item.totalMinutes)}</span>
                                <span className="tabular-nums text-muted-foreground">≈ {numberFormat.format(item.totalEuro)} €</span>
                              </button>
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}

                    {/* La fiche du trajet choisi : l'essentiel d'abord, puis le fil de route, le coût, les compagnies. */}
                    <article className="bw-tripsheet" aria-label={`Trajet ${option.sailing.from.name} → ${option.sailing.to.name}`}>
                      <div className="bw-tripsheet__ends">
                        <div>
                          <small>Vous partez</small>
                          <b>{sim(option) ? "—" : timeLabel(t.home, zoneFrom(option))}</b>
                          <span>{dayOf(t.home, zoneFrom(option))}</span>
                        </div>
                        <div className="bw-tripsheet__mid">
                          <span>{formatDuration(option.totalMinutes)}</span>
                          <i aria-hidden />
                          <span>{nights ? `${nights} nuit${nights > 1 ? "s" : ""}` : "porte à porte"}</span>
                        </div>
                        <div className="text-right">
                          <small>Au bled</small>
                          <b>{sim(option) ? "—" : timeLabel(t.end, zoneTo(option))}</b>
                          <span>{dayOf(t.end, zoneTo(option))}</span>
                        </div>
                      </div>
                      <TripBar segments={segments} start={t.home} zone={zoneFrom(option)} showNights={!sim(option)} />
                      <p className="bw-tripsheet__why" data-tone={selectedRank === 0 ? "best" : undefined}>
                        {selectedRank === 0 ? <Sparkles className="size-4" aria-hidden /> : <Info className="size-4" aria-hidden />}
                        <span>{selectedRank === 0 ? leaderReason : selectedRank > 0 ? versusLeader(option) : "Trajet estimé, sans date publiée."}</span>
                      </p>
                      {vesselAlerts.has(option.sailing.vessel?.id ?? "") ? (
                        <p role="alert" className="text-sm font-semibold text-warning-foreground">
                          {tr("ui.itineraryPlanner.departAConfirmerAupresDe")}
                        </p>
                      ) : null}

                      <section className="grid gap-2">
                        <h4 className="bw-tripsheet__h">Votre fil de route</h4>
                        <DayTimeline steps={steps} dated={!sim(option)} start={t.home} />
                      </section>

                      <section className="grid gap-2">
                        <h4 className="bw-tripsheet__h">Ce que ça coûte</h4>
                        <CostBar
                          road={option.roadEuro}
                          ferry={option.ferryEuro}
                          range={formatFareRange(estimateFerryFare(option.sailing, profile))}
                        />
                      </section>

                      {option.sailing.company ? (
                        <section className="grid gap-2">
                          <h4 className="bw-tripsheet__h">Compagnies</h4>
                          <div className="bw-company">
                            <CompanyBadge name={option.sailing.company.name} logoUrl={option.sailing.company.logo_url} size={32} />
                            <span className="min-w-0 flex-1">
                              <b>{option.sailing.company.name}</b>
                              <span>{sim(option) ? "Ligne desservie" : `Ce départ · ${timeLabel(t.sail, zoneFrom(option))}, ${shortDay(t.sail, zoneFrom(option))}`}</span>
                            </span>
                          </div>
                          {companies.slice(0, 3).map((company) => (
                            <div key={company.id} className="bw-company">
                              <CompanyBadge name={company.name} logoUrl={company.logo_url} size={32} />
                              <span className="min-w-0 flex-1">
                                <b>{company.name}</b>
                                <span>Aussi sur {option.sailing.from.name} → {option.sailing.to.name}</span>
                              </span>
                              <a
                                href={`/horaires?from=${option.sailing.from.id}&to=${option.sailing.to.id}&month=${period}`}
                                className="shrink-0 text-sm font-bold text-primary"
                              >
                                Ses dates
                              </a>
                            </div>
                          ))}
                        </section>
                      ) : null}

                      <div className="bw-tools">
                        <button type="button" onClick={launchFilm}>
                          <Play className="size-5" aria-hidden />
                          Voir en film
                        </button>
                        <a href={`/horaires?from=${option.sailing.from.id}&to=${option.sailing.to.id}&month=${period}`}>
                          <CalendarDays className="size-5" aria-hidden />
                          {sim(option) ? "Horaires publiés" : "Autres dates"}
                        </a>
                        {option.sailing.to.country_code?.toUpperCase() === "DZ" ? (
                          <a href={`/mes-dinars?plan=1&km=${Math.round(option.destinationRoad.distanceKm)}&adults=${adults}&children=${children}`}>
                            <WalletIcon className="size-5" aria-hidden />
                            Mes dinars
                          </a>
                        ) : null}
                      </div>
                      {compared.length > 1 ? (
                        <button
                          type="button"
                          onClick={racing ? () => setRacing(false) : startRace}
                          className="justify-self-center text-sm font-semibold text-primary underline underline-offset-2"
                        >
                          {racing ? tr("ui.itineraryPlanner.arreterLaComparaison") : tr("ui.itineraryPlanner.comparerCesTrajetsEnFilm")}
                        </button>
                      ) : null}
                    </article>

                    {/* L'action principale, toujours sous la main : le prix et la réservation. */}
                    <div className="bw-tripfoot">
                      <span className="bw-tripfoot__price">
                        <b>≈ {numberFormat.format(option.totalEuro)} €</b>
                        <span>route + ferry</span>
                      </span>
                      {sim(option) ? (
                        <a
                          href={`/horaires?from=${option.sailing.from.id}&to=${option.sailing.to.id}&month=${period}`}
                          className="bw-tripfoot__cta"
                        >
                          Voir les horaires <ArrowRight className="size-4" aria-hidden />
                        </a>
                      ) : (
                        <a
                          href={bookingUrl(option.sailing, profile)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => markBookingLeave(bookingSite(option.sailing))}
                          className="bw-tripfoot__cta"
                        >
                          Réserver chez {bookingSite(option.sailing)} <ArrowUpRight className="size-4" aria-hidden />
                        </a>
                      )}
                    </div>
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
                    aria-label={tr("ui.itineraryPlanner.parcourirLeVoyageDansLe")}
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
                    {playing ? tr("ui.itineraryPlanner.pause") : minute >= times.total ? tr("ui.itineraryPlanner.revoirMonVoyage") : tr("ui.itineraryPlanner.reprendre")}
                  </button>
                </div>
              ) : null}

              {film && (playing || minute > 0) ? (
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
                  <p className="text-xs font-bold">{tr("ui.itineraryPlanner.pasEncoreDeDatePubliee")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {tr("ui.itineraryPlanner.lignesEtPrixEstimesSans")}{periodLabel}.
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
              {tr("ui.itineraryPlanner.voirTousLesDepartsDe")}{periodLabel}
            </button>
          )}
          {sorted.length > 0 && !hasPublishedForPeriod && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 text-xs">
              <p className="font-semibold text-red-800">
                {tr("ui.itineraryPlanner.aucunCalendrierCommercialNEst")}
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
            <p role="status" className="text-xs text-muted-foreground">
              {geometryNote}
            </p>
          )}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">
              {tr("ui.itineraryPlanner.commentSontEstimesLesTrajets")}
            </summary>
            <p className="mt-1">
              {tr("ui.itineraryPlanner.route2")}{" "}
              {roadAccess.roadMode === "osrm" ? tr("ui.itineraryPlanner.osrmOpenstreetmap") : tr("ui.itineraryPlanner.distanceApproximative")}{tr("ui.itineraryPlanner.ferryEtVoitureEstimationSaisonniere")}{" "}
              {BOARDING_BUFFER_MIN / 60}{tr("ui.itineraryPlanner.hAvantLEmbarquementEt")}{DISEMBARK_BUFFER_MIN / 60}{tr("ui.itineraryPlanner.hApresLArriveeSont")}{" "}
              <a href="/barometre-prix" className="font-semibold text-primary underline">
                {tr("ui.itineraryPlanner.barometreDesPrix")}
              </a>
            </p>
          </details>
        </div>
      )}
      </div>
    </section>
  );
}
