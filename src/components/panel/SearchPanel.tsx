import { createPortal } from "react-dom";
import { BookingReturnNote } from "@/components/companion/BookingReturnNote";
import { vesselCompanyIds } from "@/lib/ferry/filterSync";
import { track } from "@/lib/usage";
import { HomeTraffic } from "./HomeTraffic";
import { useMatch } from "@tanstack/react-router";
import { TrafficSnapshot } from "@/components/board/TrafficSnapshot";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ArrowRight,
  Backpack,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ListChecks,
  RotateCcw,
  Search,
  Ship,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChoiceMenu } from "@/components/ChoiceMenu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  companiesQuery,
  fleetDeparturesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { emptyFilters, type Filters, type Port, type Selection } from "@/lib/ferry/types";
import {
  hasActiveFilters,
  swapDirection,
  withArrivalPorts,
  withDeparturePorts,
} from "@/lib/ferry/filtering";
import {
  buildSailings,
  daysWithSailings,
  legSailings,
  recommendedId,
  type Sailing,
  type TravelerType,
  RECOMMENDED_RULE,
} from "@/lib/ferry/trips";
import { addDaysKey, diffDays } from "@/lib/ferry/schoolCalendar";
import { loadPlan, roadToPort, type CompanionPlan } from "@/lib/ferry/companion";
import { TripCalendar, type CalendarField } from "./TripCalendar";
import { dateKeyInZone } from "@/lib/ferry/time";
import { useLiveShips } from "@/lib/ferry/useLiveShips";
import type { LiveShip } from "@/lib/ferry/tracking";
import { PortMultiPicker } from "./PortFilters";
import { SalesCalendarNote } from "@/components/companion/SalesCalendarNote";
import { companyCalendars, isEstimatedDeparture } from "@/lib/companion/salesCalendar";
import { isNorthShore, isSouthShore } from "@/lib/ferry/markets";
import { CompanyBadge } from "./CompanyBadge";
import { vesselMapIcon } from "@/lib/ferry/vesselVisuals";
import { RoundTripCard, RoundTripRow } from "./RoundTripCard";
import { estimateFare, FareProfileContext, formatEuro, useFareProfile } from "@/lib/ferry/pricing";
import { buildRoundTrips, type RoundTrip } from "@/lib/ferry/roundTrips";
import { DayStrip, SailingCard } from "./SailingCard";
import { ShareButtons } from "./ShareButtons";
import { ReportButton } from "./ReportButton";
import {
  TripProfile,
  VehicleChips,
  defaultTripProfile,
  summarizePassengers,
  summarizeVehicle,
  type TripProfileValue,
} from "./TripProfile";
import {
  readTravelProfile,
  saveTravelProfile,
  TRAVEL_PROFILE_EVENT,
} from "@/lib/ferry/travelProfile";
import { tr, lazyDateFormat, intlLocale } from "@/lib/i18n";
import { Bw504Button, Bw504Note } from "@/components/companion/Bw504Note";
import {
  explainNoSailing,
  weekdayList,
  weekdayName,
  type NoSailingReason,
} from "@/lib/companion/reasons";

const ANY = "__any__";
const PAGE = 4;

interface SearchPanelProps {
  homeMode?: boolean;
  /** Grand écran : barre de recherche horizontale au-dessus des résultats, cartes sur deux colonnes. */
  wide?: boolean;
  onTrafficPreview?: (preview: import("@/lib/ferry/mapPresentation").MapPreview | null) => void;
  onOpenSearch?: () => void;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  /** Sur mobile, Départ et Arrivée sont déjà dans l'en-tête de la page. */
  hidePickersOnMobile?: boolean;
  /** Ligne à mettre en évidence sur la carte (survol ou traversée dépliée). */
  onHighlightRoute?: (routeId: string | null) => void;
  /** Trajet ouvert par l'utilisateur : prime sur les filtres pour le cadrage de la carte. */
  onFocusRoute?: (routeId: string | null) => void;
  onOpenItinerary?: () => void;
}

/**
 * Recherche unique : trajet, dates, voyageurs. Une seule source de vérité (les filtres),
 * lue à la fois par la carte, cette liste et l'adresse de la page.
 */
export function SearchPanel({
  homeMode = false,
  wide = false,
  onTrafficPreview,
  onOpenSearch,
  filters,
  onFiltersChange,
  selection,
  onSelect,
  hidePickersOnMobile = false,
  onHighlightRoute,
  onFocusRoute,
  onOpenItinerary,
}: SearchPanelProps) {
  // Point du trafic calculé par le chargeur de l'accueil (absent ailleurs).
  const homeSnapshot = useMatch({ from: "/", shouldThrow: false })?.loaderData?.snapshot ?? null;
  const { trip } = useMyTrip();
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: departures = [], isLoading } = useQuery(upcomingDeparturesQuery());
  const { data: recentDepartures = [] } = useQuery(fleetDeparturesQuery);

  const liveShips = useLiveShips();
  const liveByDeparture = useMemo(
    () => new Map(liveShips.map((ship) => [ship.departure.id, ship])),
    [liveShips],
  );
  const [profile, setProfile] = useState<TripProfileValue>(defaultTripProfile);
  // Le profil choisi dans la Route ou lors d'une recherche précédente revient tel quel.
  // Un changement venu de ce chargement n'est jamais réenregistré par-dessus le profil gardé.
  const loadingProfile = useRef(false);
  useEffect(() => {
    const load = () => {
      const stored = readTravelProfile();
      // Rien à recharger : aucun rendu ne suivra, donc rien à ignorer.
      if (!stored || JSON.stringify(stored) === JSON.stringify(latest.current.profile)) return;
      loadingProfile.current = true;
      setProfile(stored);
    };
    load();
    window.addEventListener(TRAVEL_PROFILE_EVENT, load);
    return () => window.removeEventListener(TRAVEL_PROFILE_EVENT, load);
  }, []);
  useEffect(() => {
    if (loadingProfile.current) {
      loadingProfile.current = false;
      return;
    }
    // Seul un profil réellement modifié est gardé : le défaut n'est jamais pris pour un choix.
    if (!readTravelProfile() && JSON.stringify(profile) === JSON.stringify(defaultTripProfile))
      return;
    saveTravelProfile(profile);
  }, [profile]);
  // Formulaire guidé ouvert tant qu'aucune recherche n'est lancée, capsule ensuite.
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // Ordinateur : 2 étapes (Où ? puis Quand & qui ?). Smartphone : une étape par écran.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const firstStep = 1 as 1 | 2;
  void hidePickersOnMobile;
  // Sens du trajet : Europe → Algérie par défaut, inversé par le bouton ⇄.
  // Le sens vit dans les filtres (et l'URL) : « Tous les ports » le respecte.
  const reversed = filters.direction === "dz-eu";
  const searchRef = useRef<HTMLElement>(null);
  const isMobileView = () => typeof window !== "undefined" && window.innerWidth < 768;
  const startSearch = () => {
    onOpenSearch?.();
    setStep(firstStep);
    setCalField("out");
    setEditing(true);
    // Sur mobile, le volet passe en plein écran pour la recherche.
    if (isMobileView()) window.dispatchEvent(new Event("batogo:panel-full"));
  };
  // « Modifier » : la recherche en cours est mémorisée à l'ouverture du formulaire.
  // Fermer sans valider la restaure et ramène aux résultats (l'accueil seulement s'il n'y en avait pas).
  const snapshot = useRef<{
    filters: Filters;
    profile: TripProfileValue;
    hadSearch: boolean;
  } | null>(null);
  const latest = useRef({ filters, profile });
  latest.current = { filters, profile };
  useEffect(() => {
    if (!editing) return;
    const { filters: current, profile: currentProfile } = latest.current;
    snapshot.current = {
      filters: current,
      profile: currentProfile,
      hadSearch: hasActiveFilters(current),
    };
  }, [editing]);
  const closeSearch = () => {
    const saved = snapshot.current;
    snapshot.current = null;
    if (saved?.hadSearch) {
      if (JSON.stringify(saved.filters) !== JSON.stringify(filters)) onFiltersChange(saved.filters);
      setProfile(saved.profile);
      showResults();
      return;
    }
    setEditing(false);
    setStep(firstStep);
    searchRef.current?.closest(".batogo-panel-scroll")?.scrollTo({ top: 0, behavior: "instant" });
    window.dispatchEvent(new Event("batogo:close-panel"));
  };
  const showResults = () => {
    snapshot.current = null;
    setEditing(false);
    setStep(firstStep);
    if (isMobileView()) {
      window.dispatchEvent(new Event("batogo:results-panel"));
      window.setTimeout(() => window.dispatchEvent(new Event("batogo:show-departures")), 60);
    }
  };
  // Chaque étape s'affiche depuis son début, en haut du volet.
  useEffect(() => {
    if (!editing || !isMobileView()) return;
    const id = window.setTimeout(() => {
      const target =
        step === 1 ? searchRef.current : document.getElementById(`search-step-${step}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => window.clearTimeout(id);
  }, [step, editing]);
  useEffect(() => {
    const open = () => {
      setStep(1);
      setEditing(true);
    };
    // Accueil du navigateur mobile : la carte Réserver ouvre directement l'étape des dates
    // ou des voyageurs (les ports y sont déjà choisis).
    const openStep = (event: Event) => {
      const wanted = (event as CustomEvent<{ step?: 2 | 3 }>).detail?.step ?? 2;
      if (wanted === 2) setCalField(latest.current.filters.date && latest.current.filters.roundTrip ? "ret" : "out");
      setStep(wanted);
      setEditing(true);
    };
    window.addEventListener("batogo:edit-filters", open);
    window.addEventListener("batogo:edit-step", openStep);
    return () => {
      window.removeEventListener("batogo:edit-filters", open);
      window.removeEventListener("batogo:edit-step", openStep);
    };
  }, []);
  useEffect(() => {
    const close = () => {
      setEditing(false);
      setStep(1);
    };
    const showDepartures = () => {
      close();
      window.setTimeout(() => {
        const result = document.getElementById("map-next-departures");
        const scroller = result?.closest(".batogo-panel-scroll");
        if (!result || !(scroller instanceof HTMLElement)) return;
        const top = result.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        scroller.scrollTo({ top: scroller.scrollTop + top - 8, behavior: "smooth" });
      }, 40);
    };
    window.addEventListener("batogo:close-filters", close);
    window.addEventListener("batogo:show-departures", showDepartures);
    return () => {
      window.removeEventListener("batogo:close-filters", close);
      window.removeEventListener("batogo:show-departures", showDepartures);
    };
  }, []);
  // Drapeau du compteur : ouvre la liste des compagnies.
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  useEffect(() => {
    const open = () => {
      setEditing(true);
      window.setTimeout(() => {
        const el = document.getElementById("filters-company");
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.setAttribute("data-flash", "true");
        window.setTimeout(() => el?.removeAttribute("data-flash"), 1400);
        window.setTimeout(() => setCompanyMenuOpen(true), 350);
      }, 200);
    };
    window.addEventListener("batogo:open-companies", open);
    return () => window.removeEventListener("batogo:open-companies", open);
  }, []);
  const [calOpen, setCalOpen] = useState(false);
  useEffect(() => {
    setCalOpen(step === 2 && editing && isDesktop && !wide);
  }, [step, editing, isDesktop, wide]);
  // Grand écran : pas de formulaire pas à pas, la barre horizontale reste au-dessus des résultats.
  const formOpen = editing && !wide;
  const [wideCalOpen, setWideCalOpen] = useState(false);
  // Barre PC : Compagnie et Navire restent derrière « Filtres » tant qu'aucun n'est choisi.
  // Le bouton ⇄ fait un demi-tour à chaque inversion.
  const [swapTurns, setSwapTurns] = useState(0);
  const [travellersOpen, setTravellersOpen] = useState(false);
  // Enchaînement : chaque choix ouvre le suivant (Départ → Arrivée → Dates → Voyageurs).
  const [portOpen, setPortOpen] = useState<"departure" | "arrival" | null>(null);
  const travellersChained = useRef(false);
  // Après la fermeture animée du choix précédent (le focus revient sur son bouton) : sinon le
  // suivant, ouvert trop tôt, se refermerait aussitôt.
  const later = (fn: () => void) => window.setTimeout(fn, 320);
  const onPortOpenChange = (direction: "departure" | "arrival") => (next: boolean) => {
    if (next) return setPortOpen(direction);
    setPortOpen(null);
    if (direction === "departure") {
      if (filters.departurePortIds.length && !filters.arrivalPortIds.length)
        later(() => setPortOpen("arrival"));
      return;
    }
    if (!filters.arrivalPortIds.length || filters.date) return;
    if (wide) {
      setCalField("out");
      later(() => setWideCalOpen(true));
    } else later(() => setStep(2));
  };
  const onWideCalOpenChange = (next: boolean) => {
    setWideCalOpen(next);
    if (next || travellersChained.current) return;
    // La date choisie arrive au rendu suivant : on la relit après la fermeture.
    later(() => {
      const current = latest.current.filters;
      if (!current.date || (current.roundTrip && !current.returnDate)) return;
      travellersChained.current = true;
      setTravellersOpen(true);
    });
  };
  // Grand écran : la barre vit dans la scène de la carte, au-dessus du volet des résultats.
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const wideBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!wide) return;
    setStage(document.getElementById("carte"));
  }, [wide]);
  useEffect(() => {
    const bar = wideBarRef.current;
    const host = stage;
    if (!wide || !bar || !host) return;
    const sync = () => host.style.setProperty("--wide-bar-h", `${Math.round(bar.offsetHeight)}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      host.style.removeProperty("--wide-bar-h");
    };
  }, [wide, stage, homeMode]);
  const [calField, setCalField] = useState<CalendarField>("out");
  const [holidaysOn, setHolidaysOnState] = useState(false);
  const setHolidaysOn = (on: boolean) => {
    setHolidaysOnState(on);
    try {
      window.localStorage.setItem("batogo:school-holidays", on ? "1" : "0");
    } catch {
      // Sans conséquence.
    }
  };
  const [showAllOut, setShowAllOut] = useState(false);
  const [showAllBack, setShowAllBack] = useState(false);
  // Accordéon : une seule traversée dépliée à la fois ; le survol met sa ligne en évidence sur la carte.
  const [openCard, setOpenCard] = useState<{ id: string; routeId: string } | null>(null);
  const [hoverRouteId, setHoverRouteId] = useState<string | null>(null);
  useEffect(() => {
    onHighlightRoute?.(hoverRouteId ?? openCard?.routeId ?? null);
  }, [hoverRouteId, openCard, onHighlightRoute]);
  useEffect(() => () => onHighlightRoute?.(null), [onHighlightRoute]);
  const toggleCard = (sailing: Sailing) => {
    const next =
      openCard?.id === sailing.departure.id
        ? null
        : { id: sailing.departure.id, routeId: sailing.route.id };
    setOpenCard(next);
    if (next) track("search_choice");
    onFocusRoute?.(next?.routeId ?? null);
  };

  const today = dateKeyInZone(new Date(), "Europe/Paris");
  const set = (patch: Partial<Filters>) => onFiltersChange({ ...filters, ...patch });

  // Le voyage de « Préparer » : d'où l'on part et où l'on va, pour comparer les ports porte à porte.
  const [prepared, setPrepared] = useState<CompanionPlan | null>(null);
  useEffect(() => setPrepared(loadPlan()), []);
  const all = useMemo(
    () => buildSailings(departures, routes, ports, companies, vessels),
    [departures, routes, ports, companies, vessels],
  );
  // Date cherchée au-delà du dernier départ publié SUR LES PORTS CHERCHÉS : ventes pas encore
  // ouvertes. (Le dernier départ de tout le réseau masquait le cas : une autre ligne publiée plus
  // loin suffisait à ne rien dire pour Sète → Alger.)
  const salesClosed = useMemo(() => {
    if (!filters.date || !departures.length) return null;
    const from = new Set(filters.departurePortIds);
    const to = new Set(filters.arrivalPortIds);
    const byRoute = new Map(routes.map((r) => [r.id, r]));
    const onPair = departures.filter((d) => {
      const route = byRoute.get(d.route_id);
      if (!route) return false;
      const out =
        (!from.size || from.has(route.departure_port_id)) &&
        (!to.size || to.has(route.arrival_port_id));
      // Aller-retour : les départs du sens inverse comptent aussi.
      const back =
        filters.roundTrip &&
        (!to.size || to.has(route.departure_port_id)) &&
        (!from.size || from.has(route.arrival_port_id));
      return out || back;
    });
    // Seul le calendrier commercial compte : la rotation estimée n'est pas encore en vente.
    const scope = (onPair.length ? onPair : departures).filter((d) => !isEstimatedDeparture(d));
    const last = scope.reduce((max, d) => (d.departure_at > max ? d.departure_at : max), "");
    if (filters.date <= last.slice(0, 10)) return null;
    const month = lazyDateFormat({ month: "long", year: "numeric" }).format(
      new Date(`${filters.date}T12:00:00`),
    );
    return { month, last: last.slice(0, 10) };
  }, [
    filters.date,
    filters.departurePortIds,
    filters.arrivalPortIds,
    filters.roundTrip,
    departures,
    routes,
  ]);
  // Ports ayant au moins un départ ou une arrivée planifiés (hors annulations).
  const scheduledPortIds = useMemo(() => {
    const byRoute = new Map(routes.map((r) => [r.id, r]));
    const ids = new Set<string>();
    departures.forEach((d) => {
      if (d.status === "cancelled") return;
      const route = byRoute.get(d.route_id);
      if (route) ids.add(route.departure_port_id).add(route.arrival_port_id);
    });
    return ids;
  }, [departures, routes]);
  const outbound = useMemo(
    () =>
      legSailings(
        all,
        filters.departurePortIds,
        filters.arrivalPortIds,
        filters.companyId,
        filters.vesselId,
        filters.direction,
      ),
    [
      all,
      filters.departurePortIds,
      filters.arrivalPortIds,
      filters.companyId,
      filters.vesselId,
      filters.direction,
    ],
  );
  const hasPair = filters.departurePortIds.length > 0 && filters.arrivalPortIds.length > 0;
  const inbound = useMemo(
    () =>
      filters.roundTrip
        ? legSailings(
            all,
            filters.arrivalPortIds,
            filters.departurePortIds,
            filters.companyId,
            filters.vesselId,
            filters.direction === "dz-eu" ? "eu-dz" : "dz-eu",
          )
        : [],
    [
      all,
      filters.roundTrip,
      filters.arrivalPortIds,
      filters.departurePortIds,
      filters.companyId,
      filters.vesselId,
    ],
  );

  const traveler: TravelerType =
    profile.passengers.children + profile.passengers.babies > 0
      ? "family"
      : profile.passengers.adults + profile.passengers.seniors <= 1
        ? "solo"
        : "couple";
  const outDays = useMemo(() => daysWithSailings(outbound, today), [outbound, today]);
  const backDays = useMemo(
    () => daysWithSailings(inbound, filters.date ?? today),
    [inbound, filters.date, today],
  );
  // Disponibilités complètes pour le calendrier (tous les jours avec départ, pas seulement les 60 premiers).
  const outAvailability = useMemo(
    () => new Map(daysWithSailings(outbound, today, 1000).map((item) => [item.day, item.count])),
    [outbound, today],
  );
  const backAvailability = useMemo(
    () =>
      new Map(
        daysWithSailings(inbound, filters.date ?? today, 1000).map((item) => [
          item.day,
          item.count,
        ]),
      ),
    [inbound, filters.date, today],
  );

  // Jours où tous les départs d'un sens sont estimés : le calendrier les montre en point creux.
  const estimatedDays = useMemo(() => {
    const days = new Set<string>();
    for (const leg of [outbound, inbound]) {
      const byDay = new Map<string, boolean>();
      leg.forEach((sailing) => {
        const estimated = isEstimatedDeparture(sailing.departure);
        byDay.set(sailing.dayKey, (byDay.get(sailing.dayKey) ?? true) && estimated);
      });
      byDay.forEach((all, day) => {
        if (all) days.add(day);
      });
    }
    return days;
  }, [outbound, inbound]);
  const [sortBy, setSortBy] = useState<SortBy>("date");
  // Date d'aller « intelligente » : jour exact, ou fenêtre de ± N jours si la souplesse est activée.
  const outList = filters.date
    ? outbound.filter((item) => Math.abs(diffDays(filters.date!, item.dayKey)) <= filters.flexDays)
    : outbound;
  const backList = filters.returnDate
    ? inbound.filter((item) => item.dayKey === filters.returnDate)
    : inbound.filter((item) => !filters.date || item.dayKey >= filters.date);
  const outSorted = sortBy === "date" ? outList : [...outList].sort(bySailing(sortBy, profile));
  const outShown = filters.date || showAllOut ? outSorted : outSorted.slice(0, PAGE);
  const backShown = filters.returnDate || showAllBack ? backList : backList.slice(0, PAGE);
  // Même règle que l'itinéraire : durée, horaire confortable, et un prix nettement plus bas l'emporte.
  const fareOf = (sailing: Sailing) => estimateFare(sailing, profile);
  const outRecommended = filters.date ? recommendedId(outList, traveler, fareOf) : null;
  // La frise de dates d'une recherche datée : deux semaines de part et d'autre, pas six mois.
  const stripDays = useMemo(() => {
    if (!filters.date) return outDays;
    const date = filters.date;
    return [...outAvailability.entries()]
      .map(([day, count]) => ({ day, count }))
      .filter((item) => Math.abs(diffDays(date, item.day)) <= 14)
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [filters.date, outDays, outAvailability]);
  const stripRange = filters.date
    ? {
        from: addDaysKey(filters.date, -filters.flexDays),
        to: addDaysKey(filters.date, filters.flexDays),
      }
    : null;
  // Les autres possibilités sur les mêmes jours : partir d'un autre port, ou arriver ailleurs.
  const alternatives = useMemo(() => {
    if (!filters.date || !hasPair) return [];
    const date = filters.date;
    const span = Math.max(3, filters.flexDays);
    const from = new Set(filters.departurePortIds);
    const to = new Set(filters.arrivalPortIds);
    const searchedFrom = ports.find((port) => from.has(port.id));
    const fromShore = searchedFrom ? isNorthShore(searchedFrom.country_code) : null;
    // La route en plus (ou en moins) par rapport au port cherché : depuis chez soi pour un autre
    // port de départ, jusqu'à la destination au bled pour un autre port d'arrivée.
    const home = prepared?.home?.point ?? null;
    const bled = prepared?.destination?.point ?? null;
    const tolls = prepared?.country === "FR";
    const searchedTo = ports.find((port) => to.has(port.id));
    const extraRoad = (kind: "from" | "to", port: Port) => {
      const origin = kind === "from" ? home : bled;
      const searched = kind === "from" ? searchedFrom : searchedTo;
      if (!origin || !searched) return null;
      const there = roadToPort(origin, port, kind === "from" && tolls);
      const usual = roadToPort(origin, searched, kind === "from" && tolls);
      return { km: there.km - usual.km, euros: there.euros - usual.euros };
    };
    const groups = new Map<
      string,
      {
        kind: "from" | "to";
        portId: string;
        label: string;
        count: number;
        fare: number;
        road: { km: number; euros: number } | null;
      }
    >();
    for (const sailing of all) {
      if (sailing.departure.status === "cancelled") continue;
      if (Math.abs(diffDays(date, sailing.dayKey)) > span) continue;
      const otherFrom = !from.has(sailing.from.id) && to.has(sailing.to.id);
      const otherTo = from.has(sailing.from.id) && !to.has(sailing.to.id);
      if (!otherFrom && !otherTo) continue;
      // Même rive que la recherche : un autre port d'Europe, ou un autre port d'Algérie.
      if (otherFrom && fromShore !== null && isNorthShore(sailing.from.country_code) !== fromShore)
        continue;
      const kind = otherFrom ? "from" : "to";
      const portId = otherFrom ? sailing.from.id : sailing.to.id;
      const key = `${kind}:${portId}`;
      const fare = estimateFare(sailing, profile);
      const current = groups.get(key);
      if (current) {
        current.count += 1;
        current.fare = Math.min(current.fare, fare);
      } else
        groups.set(key, {
          kind,
          portId,
          label: `${sailing.from.name} → ${sailing.to.name}`,
          count: 1,
          fare,
          road: extraRoad(kind, kind === "from" ? sailing.from : sailing.to),
        });
    }
    // Rangées au coût porte à porte : la traversée, plus la route en plus côté Europe (au bled,
    // seulement les kilomètres : le prix de l'essence y est trop différent pour l'additionner).
    const cost = (item: { kind: "from" | "to"; fare: number; road: { euros: number } | null }) =>
      item.fare +
      (item.kind === "from" && item.road && profile.vehicle !== "none" ? item.road.euros : 0);
    return [...groups.values()].sort((a, b) => cost(a) - cost(b)).slice(0, 4);
  }, [
    all,
    filters.date,
    filters.flexDays,
    filters.departurePortIds,
    filters.arrivalPortIds,
    hasPair,
    ports,
    profile,
    prepared,
  ]);
  const alternativesBlock = alternatives.length ? (
    <section className="bw-alts" aria-labelledby="alts-titre">
      <h3 id="alts-titre">{tr("ui.searchPanel.autresPossibilitesSurCesJours")}</h3>
      <ul>
        {alternatives.map((item) => (
          <li key={`${item.kind}:${item.portId}`}>
            <button
              type="button"
              onClick={() =>
                set(
                  item.kind === "from"
                    ? { departurePortIds: [item.portId] }
                    : { arrivalPortIds: [item.portId] },
                )
              }
            >
              <span className="bw-alts__line">{item.label}</span>
              <span className="bw-alts__meta">
                {item.count}{tr("ui.searchPanel.departB")}{item.count > 1 ? "s" : ""}{tr("ui.searchPanel.traverseeDes")}{" "}
                {formatEuro(item.fare).replace("~", "")}
              </span>
              {item.road && Math.abs(item.road.km) >= 30 ? (
                <span className="bw-alts__road" data-more={item.road.km > 0 ? "" : undefined}>
                  {roadLabel(item.kind, item.road, profile.vehicle !== "none")}
                </span>
              ) : null}
              <ArrowRight className="size-4 shrink-0 text-primary" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  ) : null;
  const backRecommended = filters.returnDate ? recommendedId(backList, traveler, fareOf) : null;

  const roundTrips = useMemo(
    () =>
      filters.roundTrip
        ? buildRoundTrips(all, {
            fromIds: filters.departurePortIds,
            toIds: filters.arrivalPortIds,
            companyId: filters.companyId,
            vesselId: filters.vesselId,
            date: filters.date,
            returnDate: filters.returnDate,
            flexDays: filters.flexDays,
          })
        : { main: [], alternatives: [] },
    [all, filters],
  );

  const active = hasActiveFilters(filters);
  const fromName = (ids: string[]) => ports.find((port) => port.id === ids[0])?.name ?? "";
  // Calendrier de vente de chaque compagnie sur ces ports : jusqu'où c'est en vente, et au-delà le
  // calendrier théorique (rotation habituelle, « Estimé »), avec l'alerte d'ouverture par compagnie.
  const calendars = useMemo(
    () =>
      filters.date
        ? companyCalendars({
            departures,
            routes,
            companies,
            fromIds: filters.departurePortIds,
            toIds: filters.arrivalPortIds,
            roundTrip: filters.roundTrip,
            dates: [filters.date, filters.roundTrip ? filters.returnDate : null],
          })
        : [],
    [
      departures,
      routes,
      companies,
      filters.date,
      filters.returnDate,
      filters.roundTrip,
      filters.departurePortIds,
      filters.arrivalPortIds,
    ],
  );
  const salesNote = (defaultOpen = false) =>
    filters.date ? (
      <SalesCalendarNote
        defaultOpen={defaultOpen}
        calendars={calendars}
        date={filters.date}
        returnDate={filters.roundTrip ? filters.returnDate : null}
        fromLabel={filters.departurePortIds.length ? fromName(filters.departurePortIds) : null}
        toLabel={filters.arrivalPortIds.length ? fromName(filters.arrivalPortIds) : null}
        fromIds={filters.departurePortIds}
        toIds={filters.arrivalPortIds}
      />
    ) : null;
  const salesAlert = salesNote();
  // Aller-retour sans résultat : pourquoi (aller d'abord, puis retour), et les jours les plus proches.
  const roundTripHelp = useMemo(() => {
    const nearest = (days: string[], target: string | null) => {
      if (!target) return { before: null, after: null };
      const sorted = [...days].sort();
      return {
        before: [...sorted].reverse().find((day) => day < target) ?? null,
        after: sorted.find((day) => day > target) ?? null,
      };
    };
    const outDaysAll = [...outAvailability.keys()];
    const backDaysAll = [...backAvailability.keys()];
    const outOk = filters.date ? outAvailability.has(filters.date) : true;
    const reason = explainNoSailing({
      date: outOk ? filters.returnDate : filters.date,
      availableDays: outOk ? backDaysAll : outDaysAll,
      publishedUntil: salesClosed?.last || null,
    });
    return {
      leg: outOk ? ("retour" as const) : ("aller" as const),
      reason: reason.kind === "notThatDay" && !hasPair ? ({ kind: "unknown" } as const) : reason,
      out: outOk ? { before: null, after: null } : nearest(outDaysAll, filters.date),
      back: nearest(backDaysAll, filters.returnDate),
    };
  }, [outAvailability, backAvailability, filters.date, filters.returnDate, salesClosed, hasPair]);
  // Pourquoi rien ? La 504 ne donne une raison que si les données la prouvent.
  const noSailingReason = useMemo(() => {
    const found = explainNoSailing({
      date: filters.date,
      availableDays: [...outAvailability.keys()],
      publishedUntil: salesClosed?.last || null,
    });
    // Le rythme d'une ligne n'a de sens que pour un couple de ports et une date exacte.
    if (found.kind === "notThatDay" && (!hasPair || filters.flexDays > 0))
      return { kind: "unknown" } as const;
    return found;
  }, [filters.date, filters.flexDays, outAvailability, salesClosed, hasPair]);
  const reportRoute = routes.find(
    (route) =>
      route.status === "active" &&
      filters.departurePortIds.includes(route.departure_port_id) &&
      filters.arrivalPortIds.includes(route.arrival_port_id),
  );
  const reportTarget = reportRoute
    ? { type: "route" as const, id: reportRoute.id }
    : filters.departurePortIds.length === 1
      ? { type: "port" as const, id: filters.departurePortIds[0]! }
      : filters.arrivalPortIds.length === 1
        ? { type: "port" as const, id: filters.arrivalPortIds[0]! }
        : null;
  const reportContext = tr("ui.searchPanel.rechercheSansDepartAffiche", { v: fromName(filters.departurePortIds) || "tous ports", v2: fromName(filters.arrivalPortIds) || "tous ports", v3: filters.date ? `, le ${filters.date}` : "" });

  // Sans date de retour, un voyageur n'a pas encore d'aller-retour à comparer.
  const showTrips = filters.roundTrip && Boolean(filters.returnDate);
  const resultCount = showTrips
    ? roundTrips.main.length + roundTrips.alternatives.length
    : outList.length;
  const portsLabel = (ids: string[]) =>
    ids.length === 0 ? tr("ui.searchPanel.tousPorts") : ids.length === 1 ? fromName(ids) : `${ids.length} ports`;
  const datesLabel = filters.date
    ? `${shortDay(filters.date)}${filters.roundTrip ? ` → ${filters.returnDate ? shortDay(filters.returnDate) : tr("ui.searchPanel.retourADefinir")}` : ""}${filters.flexDays ? ` ±${filters.flexDays}j` : ""}`
    : tr("ui.searchPanel.datesFlexibles");

  // Grand écran : barre de recherche façon comparateur, sur toute la largeur de la carte.
  // Les résultats restent dans le volet de gauche ; la carte reste utilisable à droite.
  const tripCount = showTrips ? roundTrips.main.length : 0;
  const wideCount = showTrips
    ? tripCount
      ? `${tripCount} aller${tripCount > 1 ? "s" : ""}-retour${tripCount > 1 ? "s" : ""}`
      : ""
    : outList.length
      ? tr("ui.searchPanel.depart2", { length: outList.length, v: outList.length > 1 ? "s" : "" })
      : "";
  // Accueil PC sans port choisi : les trois lignes qui ont le plus de départs à venir, dans le
  // sens de la recherche, en un geste. Calculé depuis les départs publiés, rien d'inventé.
  const busiestRoutes =
    wide && !filters.departurePortIds.length && !filters.arrivalPortIds.length
      ? (() => {
          const counts = new Map<string, number>();
          for (const departure of departures)
            counts.set(departure.route_id, (counts.get(departure.route_id) ?? 0) + 1);
          return routes
            .filter((route) => route.status === "active" && counts.has(route.id))
            .map((route) => ({
              route,
              from: ports.find((port) => port.id === route.departure_port_id),
              to: ports.find((port) => port.id === route.arrival_port_id),
              count: counts.get(route.id) ?? 0,
            }))
            .filter(
              (item) =>
                item.from &&
                item.to &&
                (item.from.country_code === "DZ") === reversed,
            )
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);
        })()
      : [];
  const wideSegment = "min-w-0 bg-[color-mix(in_oklab,var(--color-muted)_60%,var(--color-card))]";
  const wideBar =
    wide && !homeMode && stage
      ? createPortal(
          <div
            ref={wideBarRef}
            role="search"
            aria-label={tr("ui.searchPanel.trouverMaTraversee")}
            className="pointer-events-auto absolute inset-x-5 top-5 z-[45] rounded-3xl border border-white/70 bg-card px-5 pb-3.5 pt-3.5 shadow-[0_16px_48px_#16324a26]"
          >
            <h2 className="sr-only">{tr("ui.searchPanel.reserverUneTraversee")}</h2>
            <div className="flex items-stretch gap-3">
              <div className="bw-wide-bar grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1.15fr)] gap-[2px] overflow-hidden rounded-2xl border border-border/70 bg-border/70">
                <div className={`${wideSegment} relative pe-4`}>
                  <PortMultiPicker
                    onOpenPort={(id) => onSelect({ type: "port", id })}
                    title={tr("ui.searchPanel.depart")}
                    direction="departure"
                    ports={ports}
                    routes={routes}
                    countryFilter={reversed ? isSouthShore : isNorthShore}
                    value={filters.departurePortIds}
                    otherSide={filters.arrivalPortIds}
                    scheduledPortIds={departures.length ? scheduledPortIds : undefined}
                    onChange={(ids) => onFiltersChange(withDeparturePorts(filters, ids, ports, routes))}
                    open={wide && portOpen === "departure"}
                    onOpenChange={onPortOpenChange("departure")}
                  />
                </div>
                <div className={`${wideSegment} relative`}>
                  {/* Échanger départ et arrivée : l'aller part de l'autre rive. */}
                  <button
                    type="button"
                    title={tr("ui.searchPanel.inverserLeSens")}
                    aria-label={tr("ui.searchPanel.inverserLeSensActuellement", { v: reversed ? "Algérie → Europe" : "Europe → Algérie" })}
                    onClick={() => {
                      setSwapTurns((turns) => turns + 1);
                      onFiltersChange(swapDirection(filters));
                    }}
                    className="bw-wide-swap"
                  >
                    <ArrowLeftRight
                      className="size-4"
                      aria-hidden
                      style={{ transform: `rotate(${swapTurns * 180}deg)` }}
                    />
                  </button>
                  <div className="ps-3">
                    <PortMultiPicker
                      onOpenPort={(id) => onSelect({ type: "port", id })}
                      title={tr("ui.searchPanel.arrivee")}
                      direction="arrival"
                      ports={ports}
                      routes={routes}
                      countryFilter={reversed ? isNorthShore : isSouthShore}
                      value={filters.arrivalPortIds}
                      otherSide={filters.departurePortIds}
                      scheduledPortIds={departures.length ? scheduledPortIds : undefined}
                      onChange={(ids) => onFiltersChange(withArrivalPorts(filters, ids, ports, routes))}
                      open={wide && portOpen === "arrival"}
                      onOpenChange={onPortOpenChange("arrival")}
                    />
                  </div>
                </div>
                <div className={`${wideSegment} bw-wide-dates`}>
                  <TripCalendar
                    side="bottom"
                    anchor={
                      <div className={`bw-wide-legs grid h-16 w-full ${filters.roundTrip ? "grid-cols-2" : "grid-cols-1"}`}>
                        {(filters.roundTrip ? (["out", "ret"] as const) : (["out"] as const)).map((leg) => {
                          const value = leg === "out" ? filters.date : filters.returnDate;
                          const on = wideCalOpen && calField === leg;
                          return (
                            <button
                              key={leg}
                              type="button"
                              data-on={on || undefined}
                              disabled={leg === "ret" && !filters.date}
                              onClick={() => {
                                setCalField(leg);
                                setWideCalOpen(true);
                              }}
                              className={`flex min-w-0 flex-col items-start justify-center px-4 text-start transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-primary)] ${leg === "ret" ? "border-s border-border/70" : ""} ${on ? "bg-card shadow-[inset_0_0_0_2px_var(--color-primary)]" : "hover:bg-card"}`}
                            >
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {leg === "out" ? tr("ui.searchPanel.aller") : tr("ui.searchPanel.retour")}
                              </span>
                              <span className="w-full truncate text-sm font-semibold">
                                {value
                                  ? `${shortDay(value)}${leg === "out" && filters.flexDays ? ` ±${filters.flexDays} j` : ""}`
                                  : leg === "out"
                                    ? tr("ui.searchPanel.choisir")
                                    : tr("ui.searchPanel.ajouter")}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    }
                    open={wideCalOpen}
                    onOpenChange={onWideCalOpenChange}
                    holidaysOn={holidaysOn}
                    onHolidaysChange={setHolidaysOn}
                    field={calField}
                    onFieldChange={setCalField}
                    roundTrip={filters.roundTrip}
                    date={filters.date}
                    returnDate={filters.returnDate}
                    flexDays={filters.flexDays}
                    outDays={outAvailability}
                    estimatedDays={estimatedDays}
                    backDays={backAvailability}
                    pairLabel={
                      hasPair ? `${fromName(filters.departurePortIds)} → ${fromName(filters.arrivalPortIds)}` : null
                    }
                    today={today}
                    onChange={(patch) => set(patch)}
                  />
                </div>
                <div className={wideSegment}>
                  <Popover open={travellersOpen} onOpenChange={setTravellersOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex h-16 w-full min-w-0 items-center justify-between gap-2 px-4 text-start transition-colors hover:bg-card focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-primary)] data-[state=open]:bg-card data-[state=open]:shadow-[inset_0_0_0_2px_var(--color-primary)]"
                      >
                        <Users className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {tr("ui.searchPanel.voyageurs")}
                          </span>
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {summarizePassengers(profile.passengers)}
                            {profile.vehicle === "none"
                              ? tr("ui.searchPanel.sansVehicule")
                              : ` · ${profile.car ? `${profile.car.make} ${profile.car.model}` : summarizeVehicle(profile)}`}
                          </span>
                        </span>
                        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      collisionPadding={12}
                      className="max-h-[var(--radix-popover-content-available-height)] w-[440px] overflow-y-auto rounded-2xl p-4 shadow-2xl"
                    >
                      <TripProfile value={profile} onChange={setProfile} />
                      <button
                        type="button"
                        onClick={() => setTravellersOpen(false)}
                        className="mt-3 h-10 w-full rounded-full bg-primary text-sm font-bold text-primary-foreground hover:brightness-110"
                      >
                        {tr("ui.searchPanel.valider")}
                      </button>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWideCalOpen(false);
                  setTravellersOpen(false);
                  // Sans critère, la liste n'est pas ouverte : ce bouton l'ouvre.
                  window.dispatchEvent(new Event("bledway:wide-results"));
                  window.setTimeout(
                    () =>
                      document
                        .getElementById("map-next-departures")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                    60,
                  );
                }}
                className="bw-wide-cta"
              >
                {wideCount ? tr("ui.searchPanel.afficher", { wideCount }) : tr("ui.searchPanel.afficherLesDeparts")}
                <span className="bw-wide-cta__go" aria-hidden>
                  <img src="/504-cta.webp" alt="" width={152} height={96} className="bw-wide-cta__car" />
                </span>
              </button>
            </div>
            {/* Options du voyage : type de trajet, filtres dans une fenêtre, trajets populaires.
                Le sens se change avec ⇄ entre Départ et Arrivée (plus de doublon ici). */}
            <div className="bw-wide-opts mt-3 flex items-center gap-2">
              <div className="bw-wide-trip" role="radiogroup" aria-label={tr("ui.searchPanel.typeDeVoyage")}>
                {[true, false].map((round) => (
                  <button
                    key={String(round)}
                    type="button"
                    role="radio"
                    aria-checked={filters.roundTrip === round}
                    data-active={filters.roundTrip === round}
                    onClick={() => set({ roundTrip: round, returnDate: round ? filters.returnDate : null })}
                  >
                    {round ? tr("ui.searchPanel.allerRetour") : tr("ui.searchPanel.allerSimple")}
                  </button>
                ))}
              </div>
              <ChoiceMenu
                label={tr("ui.searchPanel.compagnie")}
                all="Toutes les compagnies"
                icon={<Building2 className="size-4" aria-hidden />}
                value={filters.companyId}
                onChange={(value) => set({ companyId: value, vesselId: null })}
                options={companies.map((company) => ({
                  value: company.id,
                  label: company.name,
                  leading: <CompanyBadge name={company.name} logoUrl={company.logo_url} size={22} />,
                }))}
              />
              <ChoiceMenu
                label={tr("ui.searchPanel.navire")}
                all={
                  filters.companyId
                    ? (() => { const n = companies.find((company) => company.id === filters.companyId)?.name; return n ? tr("ui.searchPanel.tousLesNavires", { v: /^[aeiouyhàâéèêîôûAEIOUYHÀÂÉÈÊÎÔÛ]/.test(n) ? "d'" : "de ", n }) : tr("ui.searchPanel.tousLesNaviresDeLa"); })()
                    : "Tous les navires"
                }
                icon={<Ship className="size-4" aria-hidden />}
                value={filters.vesselId}
                onChange={(value) => set({ vesselId: value })}
                options={vessels
                  .filter(
                    (vessel) =>
                      !filters.companyId ||
                      vesselCompanyIds(vessel.id, vessels, [...recentDepartures, ...departures]).includes(
                        filters.companyId,
                      ),
                  )
                  .map((vessel) => {
                    const cutout = vesselMapIcon(vessel.name);
                    return {
                      value: vessel.id,
                      label: vessel.name,
                      leading: cutout ? (
                        <img src={`/vessel-visuals/map/${cutout}.webp`} alt="" className="bw-wide-menu__ship" />
                      ) : (
                        <Ship className="size-4" aria-hidden />
                      ),
                    };
                  })}
              />
              {active ? (
                <button
                  type="button"
                  className="bw-wide-reset"
                  onClick={() => {
                    onFiltersChange({ ...emptyFilters, roundTrip: filters.roundTrip });
                    window.dispatchEvent(new Event("bledway:wide-results-hide"));
                  }}
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  {tr("ui.searchPanel.reinitialiser")}
                </button>
              ) : null}
              {/* Tri en un geste, seulement quand il y a des départs à trier. */}
              {wideCount ? (
                <div
                  role="group"
                  aria-label={tr("ui.searchPanel.trierPar")}
                  className="bw-wide-sort inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-card p-0.5"
                >
                  {(
                    [
                      ["date", tr("ui.searchPanel.plusTot")],
                      ["price", tr("ui.searchPanel.moinsCher")],
                      ["duration", tr("ui.searchPanel.plusCourt")],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={sortBy === key}
                      onClick={() => setSortBy(key)}
                      className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${sortBy === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              {busiestRoutes.length ? (
                <div className="bw-wide-quick" role="group" aria-label={tr("ui.searchPanel.trajetsPopulaires")}>
                  <span className="bw-wide-quick__label">{tr("ui.searchPanel.populaires")}</span>
                  {busiestRoutes.map(({ route, from, to }) => (
                    <button
                      key={route.id}
                      type="button"
                      onClick={() =>
                        onFiltersChange(
                          withArrivalPorts(
                            withDeparturePorts(filters, [from!.id], ports, routes),
                            [to!.id],
                            ports,
                            routes,
                          ),
                        )
                      }
                    >
                      {from!.name}
                      <ArrowRight className="size-3" aria-hidden />
                      {to!.name}
                    </button>
                  ))}
                </div>
              ) : null}
              <span className="flex-1" />
              <button
                type="button"
                onClick={closeSearch}
                aria-label={tr("ui.searchPanel.fermerLaRecherche")}
                className="bw-wide-close grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>,
          stage,
        )
      : null;

  return (
    <FareProfileContext.Provider value={profile}>
      <div className="flex flex-col">
        {/* RECHERCHE : capsule condensée façon Airbnb, formulaire guidé à la demande */}
        {!formOpen && !homeMode && !wide ? (
          <section className="border-b px-3 py-2.5 md:px-5">
            <button type="button" onClick={startSearch} className="bw-search-summary">
              <Ship className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 leading-tight">
                {/* Une recherche en cours affiche ses ports : on rappelle que c'est le formulaire. */}
                {active ? (
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-primary">
                    {tr("ui.searchPanel.trouverMaTraversee")}
                  </span>
                ) : null}
                <span className="block truncate text-sm font-bold">
                  {active
                    ? `${portsLabel(filters.departurePortIds)} ${filters.roundTrip ? "⇄" : "→"} ${portsLabel(filters.arrivalPortIds)}`
                    : tr("ui.searchPanel.trouverMaTraversee")}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {datesLabel} · {summarizePassengers(profile.passengers)}
                  {profile.vehicle !== "none" ? ` · ${summarizeVehicle(profile)}` : ""}
                </span>
              </span>
              <span className="bw-search-icon" aria-hidden>
                <SlidersHorizontal className="size-4" />
              </span>
              <span className="sr-only">{tr("ui.searchPanel.modifierLaRecherche")}</span>
            </button>
            {/* Nouveau visiteur : la valeur de la route du bled, avant de rien demander. */}
            {/* Réserver : la préparation pas à pas a son onglet ; on ne la rappelle qu'avant la
                première recherche, jamais par-dessus des résultats. */}
            {onOpenItinerary && !trip && !active ? (
              <button
                type="button"
                onClick={() => {
                  onOpenItinerary();
                }}
                className="bw-route-teaser"
              >
                <span className="bw-route-teaser__icon" aria-hidden>
                  <ListChecks className="size-4" />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <strong>{tr("ui.searchPanel.maRouteDuBledEtape")}</strong>
                  <small>{tr("ui.searchPanel.papiersPortTraverseeArriveeVoyez")}</small>
                </span>
                <ChevronRight className="size-4 shrink-0" aria-hidden />
              </button>
            ) : null}
          </section>
        ) : null}
        {!formOpen && !wide && (filters.companyId || filters.vesselId) ? (
          <div
            className="flex flex-wrap gap-1 border-b px-4 py-2"
            aria-label={tr("ui.searchPanel.filtresActifs")}
          >
            {filters.companyId && (
              <button
                type="button"
                className="rounded-full border bg-secondary px-2 py-1 text-[11px] font-semibold"
                aria-label={tr("ui.searchPanel.retirerLeFiltreCompagnie")}
                onClick={() => set({ companyId: null, vesselId: null })}
              >
                {companies.find((c) => c.id === filters.companyId)?.name ??
                  tr("ui.searchPanel.compagnie")}{" "}
                ×
              </button>
            )}
            {filters.vesselId && (
              <button
                type="button"
                className="rounded-full border bg-secondary px-2 py-1 text-[11px] font-semibold"
                aria-label={tr("ui.searchPanel.retirerLeFiltreNavire")}
                onClick={() => set({ vesselId: null })}
              >
                {vessels.find((v) => v.id === filters.vesselId)?.name ??
                  tr("ui.searchPanel.navire")}{" "}
                ×
              </button>
            )}
          </div>
        ) : null}
        <section
          ref={searchRef}
          className={`scroll-mt-0 space-y-3 border-b bg-card px-4 pb-4 pt-4 md:bg-white md:px-5 ${formOpen ? "" : "hidden"}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-foreground">
              {tr("ui.searchPanel.trouverMaTraversee")}
            </span>
            <div className="flex items-center gap-1.5">
              {active ? (
                <button
                  type="button"
                  onClick={() => onFiltersChange({ ...emptyFilters, roundTrip: filters.roundTrip })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  {tr("ui.searchPanel.reinitialiser")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={closeSearch}
                aria-label={tr("ui.searchPanel.fermerLaRecherche")}
                className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground hover:bg-secondary"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div
              className="batogo-tabbar inline-grid grid-cols-2 gap-0.5 !rounded-full !p-0.5"
              role="radiogroup"
              aria-label={tr("ui.searchPanel.typeDeVoyage")}
            >
              {[true, false].map((round) => (
                <button
                  key={String(round)}
                  type="button"
                  role="radio"
                  aria-checked={filters.roundTrip === round}
                  data-active={filters.roundTrip === round}
                  onClick={() =>
                    set({ roundTrip: round, returnDate: round ? filters.returnDate : null })
                  }
                  className="batogo-tab !min-h-7 !rounded-full px-3 !text-xs"
                >
                  {round ? tr("ui.searchPanel.allerRetour") : tr("ui.searchPanel.allerSimple")}
                </button>
              ))}
            </div>
            <button
              type="button"
              title={tr("ui.searchPanel.inverserLeSens")}
              aria-label={tr("ui.searchPanel.inverserLeSensActuellement", { v: reversed ? "Algérie → Europe" : "Europe → Algérie" })}
              onClick={() => onFiltersChange(swapDirection(filters))}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-primary shadow-sm transition hover:bg-primary hover:text-primary-foreground"
            >
              <ArrowLeftRight className="size-3.5" />
              <span className="max-md:hidden">
                {reversed ? tr("ui.searchPanel.algerieEurope") : tr("ui.searchPanel.europeAlgerie")}
              </span>
            </button>
          </div>
          <StepLabel
            open={step === 1}
            onOpen={() => setStep(1)}
            summary={`${portsLabel(filters.departurePortIds)} ${filters.roundTrip ? "⇄" : "→"} ${portsLabel(filters.arrivalPortIds)}`}
          >
            {tr("ui.searchPanel.ouPartezVous")}
          </StepLabel>
          <div className={step === 1 ? "grid grid-cols-1 gap-3" : "hidden"}>
            <div className="min-w-0">
              <PortMultiPicker
                onOpenPort={(id) => onSelect({ type: "port", id })}
                title={tr("ui.searchPanel.depart")}
                direction="departure"
                ports={ports}
                routes={routes}
                countryFilter={reversed ? isSouthShore : isNorthShore}
                value={filters.departurePortIds}
                otherSide={filters.arrivalPortIds}
                scheduledPortIds={departures.length ? scheduledPortIds : undefined}
                onChange={(ids) => onFiltersChange(withDeparturePorts(filters, ids, ports, routes))}
                open={!wide && portOpen === "departure"}
                onOpenChange={onPortOpenChange("departure")}
              />
            </div>
            <div className="min-w-0">
              <PortMultiPicker
                onOpenPort={(id) => onSelect({ type: "port", id })}
                title={tr("ui.searchPanel.arrivee")}
                direction="arrival"
                ports={ports}
                routes={routes}
                countryFilter={reversed ? isNorthShore : isSouthShore}
                value={filters.arrivalPortIds}
                otherSide={filters.departurePortIds}
                scheduledPortIds={departures.length ? scheduledPortIds : undefined}
                onChange={(ids) => onFiltersChange(withArrivalPorts(filters, ids, ports, routes))}
                open={!wide && portOpen === "arrival"}
                onOpenChange={onPortOpenChange("arrival")}
              />
            </div>
          </div>

          <div id="search-step-2" className="scroll-mt-1" />
          <StepLabel open={step === 2} onOpen={() => setStep(2)} summary={datesLabel}>
            {tr("ui.searchPanel.quandPartezVous")}
          </StepLabel>
          {/* Date pas encore en vente : on le dit tout de suite, avec l'alerte d'ouverture. */}
          {salesAlert ? <div className="mb-2">{salesAlert}</div> : null}
          <div className={step === 2 ? "-mt-1" : "hidden"}>
            <TripCalendar
              {...(isDesktop
                ? {
                    side: "right" as const,
                    anchor: (
                      <div className="space-y-2">
                        <div
                          className={`grid gap-1.5 ${filters.roundTrip ? "grid-cols-2" : "grid-cols-1"}`}
                        >
                          {(filters.roundTrip ? (["out", "ret"] as const) : (["out"] as const)).map(
                            (leg) => {
                              const value = leg === "out" ? filters.date : filters.returnDate;
                              const on = calOpen && calField === leg;
                              return (
                                <button
                                  key={leg}
                                  type="button"
                                  disabled={leg === "ret" && !filters.date}
                                  onClick={() => {
                                    setCalField(leg);
                                    setCalOpen(true);
                                  }}
                                  className={`flex min-h-12 flex-col items-start justify-center rounded-xl border px-3 py-1.5 text-start transition disabled:opacity-50 ${on ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "border-border bg-card hover:border-primary/60"}`}
                                >
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                                    {leg === "out"
                                      ? tr("ui.searchPanel.aller")
                                      : tr("ui.searchPanel.retour")}
                                  </span>
                                  <span className="text-sm font-semibold">
                                    {value ? shortDay(value) : tr("ui.searchPanel.choisirUneDate")}
                                  </span>
                                </button>
                              );
                            },
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {tr("ui.searchPanel.leCalendrierSOuvreA")}
                        </p>
                      </div>
                    ),
                  }
                : { inline: true })}
              open={wide ? false : isDesktop ? calOpen : step === 2}
              onOpenChange={isDesktop ? setCalOpen : () => {}}
              holidaysOn={holidaysOn}
              onHolidaysChange={setHolidaysOn}
              field={calField}
              onFieldChange={setCalField}
              roundTrip={filters.roundTrip}
              date={filters.date}
              returnDate={filters.returnDate}
              flexDays={filters.flexDays}
              outDays={outAvailability}
              estimatedDays={estimatedDays}
              backDays={backAvailability}
              pairLabel={
                hasPair
                  ? `${fromName(filters.departurePortIds)} → ${fromName(filters.arrivalPortIds)}`
                  : null
              }
              today={today}
              onChange={(patch) => set(patch)}
            />
          </div>

          <div id="search-step-3" className="scroll-mt-1" />
          <StepLabel
            open={step === 3}
            onOpen={() => setStep(3)}
            summary={`${summarizePassengers(profile.passengers)}${profile.vehicle !== "none" ? ` · ${summarizeVehicle(profile)}` : tr("ui.searchPanel.sansVehicule2")}`}
          >
            {tr("ui.searchPanel.quiVoyageAvecQuelVehicule")}
          </StepLabel>
          <div className={step === 3 ? "-mt-1 space-y-3" : "hidden"}>
            <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
              <TripProfile value={profile} onChange={setProfile} hideVehicle />
            </div>
            <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-primary">
                {tr("ui.searchPanel.vehicule")}
              </p>
              <VehicleChips value={profile} onChange={setProfile} />
            </div>
          </div>

          <div
            id="filters-company"
            className="rounded-2xl border border-border bg-card p-3 text-xs shadow-sm transition-shadow data-[flash=true]:ring-2 data-[flash=true]:ring-primary/50"
          >
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-primary">
              {tr("ui.searchPanel.compagnieEtNavire")}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <FilterSelect
                label={tr("ui.searchPanel.compagnie")}
                open={companyMenuOpen}
                onOpenChange={setCompanyMenuOpen}
                value={filters.companyId}
                onChange={(value) => set({ companyId: value })}
                options={companies.map((company) => ({
                  value: company.id,
                  label: company.name,
                  leading: (
                    <CompanyBadge name={company.name} logoUrl={company.logo_url} size={20} />
                  ),
                }))}
              />
              <FilterSelect
                label={tr("ui.searchPanel.navire")}
                value={filters.vesselId}
                onChange={(value) => set({ vesselId: value })}
                options={vessels
                  .filter(
                    (vessel) =>
                      !filters.companyId ||
                      vesselCompanyIds(vessel.id, vessels, [
                        ...recentDepartures,
                        ...departures,
                      ]).includes(filters.companyId),
                  )
                  .map((vessel) => ({ value: vessel.id, label: vessel.name }))}
              />
            </div>
          </div>
          <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-1 border-t bg-card/95 px-4 py-2.5 backdrop-blur md:-mx-5 md:px-5">
            <div className="flex items-center gap-1">
              {step > firstStep ? (
                <button
                  type="button"
                  onClick={() => {
                    setStep((s) => (s - 1) as 1 | 2 | 3);
                  }}
                  className="h-11 whitespace-nowrap rounded-xl px-2 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  {tr("ui.searchPanel.retour2")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={closeSearch}
                  className="h-11 whitespace-nowrap rounded-xl px-2 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  {tr("ui.searchPanel.fermer")}
                </button>
              )}
              {step === 2 ? (
                // « Qui voyage » est facultatif : 2 adultes et une berline par défaut, à préciser si besoin.
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="h-11 whitespace-nowrap rounded-xl border border-border px-2.5 text-sm font-semibold text-primary transition hover:bg-secondary"
                  title={tr("ui.searchPanel.facultatifPassagersEtVehiculePour")}
                >
                  {tr("ui.searchPanel.voyageurs")}
                </button>
              ) : null}
              {step === 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 1) setCalField(filters.date && filters.roundTrip ? "ret" : "out");
                    setStep((s) => (s + 1) as 1 | 2 | 3);
                  }}
                  className="flex h-11 whitespace-nowrap items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground shadow-md transition hover:opacity-90"
                >
                  {tr("ui.searchPanel.suivantDates")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    track("search_results", String(resultCount));
                    showResults();
                  }}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-md transition hover:opacity-90"
                >
                  <Ship className="size-4" aria-hidden />
                  <span className="md:hidden">
                    {tr("ui.searchPanel.voir")}
                    {active && resultCount ? ` (${resultCount})` : ""}
                  </span>
                  <span className="max-md:hidden">
                    {tr("ui.searchPanel.voirLesTraversees")}
                    {active && resultCount ? ` (${resultCount})` : ""}
                  </span>
                </button>
              )}
            </div>
          </div>
        </section>

        {!editing && homeMode ? (
          <HomeTraffic
            filters={filters}
            onSelect={onSelect}
            {...(onTrafficPreview ? { onPreview: onTrafficPreview } : {})}
          />
        ) : null}
        {/* Portes vers les pages de référence, servies dans le HTML de l'accueil : les moteurs et
            les robots qui ne lancent pas le JavaScript y trouvent les lignes, ports et guides. */}
        {!editing && homeMode && homeSnapshot ? (
          <div className="px-4 pb-3 md:px-5">
            <TrafficSnapshot snapshot={homeSnapshot} compact />
          </div>
        ) : null}
        {!editing && homeMode ? (
          <nav aria-label={tr("ui.searchPanel.explorerBledway")} className="bw-home-explore px-4 pb-4 md:px-5">
            {(
              [
                ["/lignes", tr("ui.searchPanel.explorerLignes")],
                ["/ports", tr("ui.searchPanel.explorerPorts")],
                ["/compagnies", tr("ui.searchPanel.explorerCompagnies")],
                ["/bateaux", tr("ui.searchPanel.explorerNavires")],
                ["/guide", tr("ui.searchPanel.explorerGuides")],
                ["/questions-frequentes", tr("ui.searchPanel.explorerQuestions")],
              ] as const
            ).map(([href, label]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </nav>
        ) : null}
        {wideBar}
        {/* RÉSULTATS */}
        <section
          hidden={homeMode || formOpen}
          id="map-next-departures"
          className="space-y-5 px-4 py-4 md:px-5"
        >
          {wide ? null : (
            <a
              href="/barometre-prix"
              className="inline-block text-xs font-semibold text-primary underline underline-offset-2"
            >
              {tr("ui.searchPanel.comprendreLesPrixEstimesEt")}
            </a>
          )}
          {isLoading ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-[120px] animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : (
            <>
              {wide ? null : (
              <label className="flex items-center justify-end gap-2 text-xs font-semibold text-muted-foreground">
                {tr("ui.searchPanel.trierPar")}
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortBy)}
                  className="h-9 rounded-lg border border-input bg-background px-2 text-xs text-foreground"
                >
                  <option value="date">{tr("ui.searchPanel.date")}</option>
                  <option value="price">{tr("ui.searchPanel.prixEstime")}</option>
                  <option value="duration">{tr("ui.searchPanel.duree")}</option>
                </select>
              </label>
              )}
              <BookingReturnNote className="mb-3" />
              {showTrips ? (
                <>
                  <RoundTripSection
                    wide={wide}
                    help={roundTripHelp}
                    dateLabel={{ out: filters.date, back: filters.returnDate }}
                    flexDays={filters.flexDays}
                    onDates={(patch) => set(patch)}
                    trips={roundTrips}
                    sortBy={sortBy}
                    onOpenVessel={(id) => onSelect({ type: "vessel", id })}
                    onOpenRoute={(id) => onSelect({ type: "route", id })}
                    onHoverRoute={setHoverRouteId}
                    onFocusRoute={(routeId) => {
                      setOpenCard(routeId ? { id: routeId, routeId } : null);
                      onFocusRoute?.(routeId);
                    }}
                    reportTarget={reportTarget}
                    reportContext={reportContext}
                  />
                  {/* D'abord les départs disponibles ; la ligne « pas encore en vente » vient après. */}
                  {salesAlert ? (
                    <div className="mt-3">{salesNote(!roundTrips.main.length)}</div>
                  ) : null}
                  {alternativesBlock}
                </>
              ) : (
                <>
                  <ResultBlock
                    wide={wide}
                    liveByDeparture={liveByDeparture}
                    title={
                      hasPair
                        ? tr("ui.searchPanel.aller2", { fromName: fromName(filters.departurePortIds), fromName2: fromName(filters.arrivalPortIds) })
                        : filters.departurePortIds.length || filters.arrivalPortIds.length
                          ? tr("ui.searchPanel.traversees")
                          : tr("ui.searchPanel.prochainsDeparts")
                    }
                    subtitle={
                      filters.roundTrip
                        ? tr("ui.searchPanel.allersAjoutezUneDateDe")
                        : tr("ui.searchPanel.allerSimpleHeuresLocales")
                    }
                    days={stripDays}
                    range={filters.flexDays > 0 ? stripRange : null}
                    date={filters.date}
                    onDate={(day) =>
                      set({
                        date: day,
                        returnDate:
                          day && filters.returnDate && filters.returnDate < day
                            ? null
                            : filters.returnDate,
                      })
                    }
                    list={outShown}
                    total={outList.length}
                    recommended={outRecommended}
                    multiDay={filters.flexDays > 0}
                    openId={openCard?.id ?? null}
                    onToggle={toggleCard}
                    onHoverRoute={setHoverRouteId}
                    onOpenVessel={(id) => onSelect({ type: "vessel", id })}
                    onOpenRoute={(id) => onSelect({ type: "route", id })}
                    onMore={() => setShowAllOut(true)}
                    expanded={showAllOut || Boolean(filters.date)}
                    emptyText="Aucun départ publié pour cette recherche. Un horaire peut manquer."
                    reason={noSailingReason}
                    notice={noSailingReason.kind === "notPublished" ? salesNote(true) : null}
                    reportTarget={reportTarget}
                    reportContext={reportContext}
                    onReportMissing={startSearch}
                    onReset={
                      active
                        ? () => onFiltersChange({ ...emptyFilters, roundTrip: filters.roundTrip })
                        : undefined
                    }
                  />
                  {salesAlert && (outList.length || noSailingReason.kind !== "notPublished") ? (
                    <div className="mt-3">{salesNote()}</div>
                  ) : null}
                  {alternativesBlock}
                </>
              )}
              {wide ? (
                <a
                  href="/barometre-prix"
                  className="inline-block text-xs font-semibold text-primary underline underline-offset-2"
                >
                  {tr("ui.searchPanel.comprendreLesPrixEstimesEt")}
                </a>
              ) : null}
            </>
          )}
        </section>
      </div>
    </FareProfileContext.Provider>
  );
}

type SortBy = "date" | "price" | "duration";

const roundKm = (km: number) => (Math.round(Math.abs(km) / 10) * 10).toLocaleString(intlLocale());
const roundEuros = (euros: number) =>
  (Math.round(Math.abs(euros) / 10) * 10).toLocaleString(intlLocale());
/** « 1 010 km de route en plus depuis chez vous (≈ 190 €) », ou en moins. */
function roadLabel(kind: "from" | "to", road: { km: number; euros: number }, byCar: boolean) {
  const more = road.km > 0;
  const where = kind === "from" ? tr("ui.searchPanel.depuisChezVous") : tr("ui.searchPanel.jusquAVotreDestination");
  // Insécables : « + ≈ 80 € » et « + 420 km » ne se coupent pas en fin de ligne.
  const cost =
    kind === "from" && byCar ? ` (${more ? "+" : "−"} ≈ ${roundEuros(road.euros)} €)` : "";
  return tr("ui.searchPanel.kmDeRoute", { v: more ? "+" : "−", roundKm: roundKm(road.km), where, cost });
}

const bySailing = (sortBy: SortBy, profile: TripProfileValue) => (a: Sailing, b: Sailing) =>
  sortBy === "price"
    ? estimateFare(a, profile) - estimateFare(b, profile)
    : (a.durationMin ?? Infinity) - (b.durationMin ?? Infinity);

function ResultBlock({
  wide = false,
  liveByDeparture,
  title,
  subtitle,
  days,
  date,
  onDate,
  list,
  total,
  recommended,
  multiDay,
  openId,
  onToggle,
  onHoverRoute,
  onOpenVessel,
  onOpenRoute,
  onMore,
  expanded,
  emptyText,
  reason,
  notice = null,
  range = null,
  onReset,
  reportTarget,
  reportContext,
  onReportMissing,
}: {
  /** Grand écran : cartes sur deux colonnes, la carte dépliée prend toute la largeur. */
  wide?: boolean;
  liveByDeparture: Map<string, LiveShip>;
  title: string;
  subtitle: string;
  days: { day: string; count: number }[];
  date: string | null;
  onDate: (day: string | null) => void;
  list: Sailing[];
  total: number;
  recommended: string | null;
  /** Plusieurs jours affichés (souplesse sur la date) : chaque carte indique son jour. */
  multiDay?: boolean;
  openId: string | null;
  onToggle: (sailing: Sailing) => void;
  onHoverRoute: (routeId: string | null) => void;
  onOpenVessel: (vesselId: string) => void;
  onOpenRoute: (routeId: string) => void;
  onMore: () => void;
  expanded: boolean;
  emptyText: string;
  reason: NoSailingReason;
  /** L'encart qui explique déjà le vide (ventes pas encore ouvertes) : il remplace la 504. */
  notice?: ReactNode;
  range?: { from: string; to: string } | null;
  onReset?: (() => void) | undefined;
  reportTarget: { type: "route" | "port"; id: string } | null;
  reportContext: string;
  onReportMissing: () => void;
}) {
  // Jours avec départ les plus proches du jour demandé (avant / après), pour ne jamais laisser sans issue.
  const near = date
    ? {
        before: [...days].reverse().find((item) => item.day < date),
        after: days.find((item) => item.day > date),
      }
    : null;
  return (
    <div className="space-y-2.5">
      {/* Le titre garde toute la largeur ; la précision passe dessous (sur téléphone, un sous-titre
          long à côté écrasait le titre mot par mot). */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold leading-tight">{title}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <div className="shrink-0">
          <ShareButtons compact label={tr("ui.searchPanel.partagerCetteRecherche")} />
        </div>
      </div>
      <DayStrip days={days} value={date} onChange={onDate} allLabel="Tous" range={range} />
      {list.length === 0 && notice ? (
        notice
      ) : list.length === 0 ? (
        <Bw504Note
          tone="stuck"
          title={reasonTitle(reason, date)}
          actions={
            <>
              {near
                ? [near.before, near.after].map((item) =>
                    item ? (
                      <Bw504Button key={item.day} primary onClick={() => onDate(item.day)}>
                        {item.day < date! ? "← " : ""}
                        {new Date(`${item.day}T00:00:00Z`).toLocaleDateString(intlLocale(), {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          timeZone: "UTC",
                        })}
                        {item.day > date! ? " →" : ""}
                      </Bw504Button>
                    ) : null,
                  )
                : null}
              {onReset ? (
                <Bw504Button onClick={onReset}>
                  {tr("ui.searchPanel.elargirLaRecherche")}
                </Bw504Button>
              ) : null}
              {reason.kind === "unknown" ? (
                reportTarget ? (
                  <span className="bw-504note__report">
                    <ReportButton
                      targetType={reportTarget.type}
                      targetId={reportTarget.id}
                      label={tr("ui.searchPanel.signalerUnHoraireManquant")}
                      initialDetails={reportContext}
                      initialReason="missing_info"
                    />
                  </span>
                ) : (
                  <Bw504Button onClick={onReportMissing}>
                    {tr("ui.searchPanel.choisirDesPortsPourSignaler")}
                  </Bw504Button>
                )
              ) : null}
            </>
          }
        >
          {reasonBody(reason, emptyText)}
        </Bw504Note>
      ) : (
        <div className={wide ? "grid grid-cols-2 items-start gap-3" : "space-y-2"}>
          {recommended && list.some((sailing) => sailing.departure.id === recommended) ? (
            <p className="col-span-full text-[11px] text-muted-foreground">{RECOMMENDED_RULE}</p>
          ) : null}
          {list.map((sailing, index) => (
            <div
              key={sailing.departure.id}
              className={wide && openId === sailing.departure.id ? "col-span-full" : "contents"}
            >
            <SailingCard
              key={sailing.departure.id}
              sailing={sailing}
              index={index}
              showDay={!date || Boolean(multiDay)}
              live={liveByDeparture.get(sailing.departure.id)}
              recommended={recommended === sailing.departure.id}
              expanded={openId === sailing.departure.id}
              onToggle={() => onToggle(sailing)}
              onHover={(hovering) => onHoverRoute(hovering ? sailing.route.id : null)}
              onOpenVessel={onOpenVessel}
              onOpenRoute={onOpenRoute}
            />
            </div>
          ))}
          {!expanded && total > list.length ? (
            <button
              type="button"
              onClick={onMore}
              className="col-span-full w-full rounded-2xl border border-dashed py-3 text-sm font-semibold text-primary transition hover:bg-primary/5"
            >
              {tr("ui.searchPanel.voirLes")}
              {total - list.length}
              {tr("ui.searchPanel.autresDeparts")}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

const fmtShort = (key: string, weekday = false) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString(intlLocale(), {
    ...(weekday ? { weekday: "short" as const } : {}),
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

function DateButton({
  label,
  value,
  returnValue,
  flex = 0,
  active,
  onClick,
}: {
  label: string;
  value: string | null;
  returnValue?: string | null | undefined;
  flex?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={active}
      className={`batogo-control flex h-12 min-w-0 items-center gap-2 px-3 text-start ${active ? "!border-primary" : ""}`}
    >
      <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 leading-tight">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
          {flex > 0 ? <span className="ms-1 text-primary">± {flex} j</span> : null}
        </span>
        <span className="block truncate text-sm font-semibold">
          {value
            ? returnValue !== undefined
              ? `${fmtShort(value)} → ${returnValue ? fmtShort(returnValue) : "retour"}`
              : fmtShort(value, true)
            : tr("ui.searchPanel.choisir")}
        </span>
      </span>
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  open,
  onOpenChange,
}: {
  label: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  value: string | null;
  onChange: (value: string | null) => void;
  options: { value: string; label: string; leading?: ReactNode }[];
}) {
  return (
    <Select
      {...(open !== undefined && onOpenChange ? { open, onOpenChange } : {})}
      value={value ?? ANY}
      onValueChange={(next) => onChange(next === ANY ? null : next)}
    >
      <SelectTrigger className="batogo-control h-10 text-xs" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY} textValue={label}>
          {label}
          {tr("ui.searchPanel.toutes")}
        </SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} textValue={option.label}>
            <span className="flex min-w-0 items-center gap-2">
              {option.leading}
              <span className="truncate">{option.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type RoundTripHelp = {
  leg: "aller" | "retour";
  reason: NoSailingReason;
  out: { before: string | null; after: string | null };
  back: { before: string | null; after: string | null };
};

function RoundTripSection({
  wide = false,
  help,
  dateLabel,
  flexDays,
  onDates,
  trips,
  sortBy,
  onOpenVessel,
  onOpenRoute,
  onHoverRoute,
  onFocusRoute,
  reportTarget,
  reportContext,
}: {
  /** Grand écran : un aller-retour par ligne compacte, prix total à droite. */
  wide?: boolean;
  help: RoundTripHelp;
  dateLabel: { out: string | null; back: string | null };
  flexDays: number;
  onDates: (patch: Partial<Filters>) => void;
  trips: { main: RoundTrip[]; alternatives: RoundTrip[] };
  sortBy: SortBy;
  onOpenVessel: (id: string) => void;
  onOpenRoute: (id: string) => void;
  onHoverRoute: (routeId: string | null) => void;
  onFocusRoute: (routeId: string | null) => void;
  reportTarget: { type: "route" | "port"; id: string } | null;
  reportContext: string;
}) {
  const list = (items: RoundTrip[]) => (
    <div className="space-y-2.5">
      {items.map((trip, index) => (
        wide ? (
          <RoundTripRow
            key={`${trip.out.departure.id}-${trip.back.departure.id}`}
            trip={trip}
            index={index}
            onOpenVessel={onOpenVessel}
            onOpenRoute={onOpenRoute}
            onHoverRoute={onHoverRoute}
            onFocusRoute={onFocusRoute}
          />
        ) : (
        <RoundTripCard
          key={`${trip.out.departure.id}-${trip.back.departure.id}`}
          trip={trip}
          index={index}
          onOpenVessel={onOpenVessel}
          onOpenRoute={onOpenRoute}
          onHoverRoute={onHoverRoute}
          onFocusRoute={onFocusRoute}
        />
        )
      ))}
    </div>
  );
  const profile = useFareProfile();
  const sorted = (items: RoundTrip[]) => {
    if (sortBy === "date") return items;
    const value = (trip: RoundTrip) =>
      sortBy === "price"
        ? estimateFare(trip.out, profile) + estimateFare(trip.back, profile)
        : (trip.out.durationMin ?? Infinity) + (trip.back.durationMin ?? Infinity);
    return [...items].sort((a, b) => value(a) - value(b));
  };
  // Même port d'abord ; les retours par un autre port restent repliés.
  const samePort = trips.main.filter((trip) => trip.mirror);
  const otherPorts = [...trips.main.filter((trip) => !trip.mirror), ...trips.alternatives];
  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-base font-bold leading-tight">
            {tr("ui.searchPanel.allerRetourParLeMeme")}
          </h2>
          <span className="text-[11px] text-muted-foreground">
            {tr("ui.searchPanel.heuresLocalesDesPorts")}
          </span>
        </div>
        {samePort.length ? (
          list(sorted(samePort))
        ) : (
          <Bw504Note
            tone="stuck"
            title={
              help.reason.kind === "unknown"
                ? tr("ui.searchPanel.pasDAllerRetourPar")
                : `${help.leg === "aller" ? tr("ui.searchPanel.aller") : tr("ui.searchPanel.retour")} : ${reasonTitle(help.reason, help.leg === "aller" ? dateLabel.out : dateLabel.back).toLowerCase()}`
            }
            actions={
              <>
                {help.leg === "aller"
                  ? [help.out.before, help.out.after].map((day) =>
                      day ? (
                        <Bw504Button key={`o${day}`} primary onClick={() => onDates({ date: day })}>
                          {tr("ui.searchPanel.allerB")}{fmtShort(day, true)}
                        </Bw504Button>
                      ) : null,
                    )
                  : null}
                {[help.back.before, help.back.after].map((day) =>
                  day && (!dateLabel.out || day >= dateLabel.out) ? (
                    <Bw504Button
                      key={`b${day}`}
                      primary={help.leg === "retour"}
                      onClick={() => onDates({ returnDate: day })}
                    >
                      {tr("ui.searchPanel.retourB")}{fmtShort(day, true)}
                    </Bw504Button>
                  ) : null,
                )}
                {flexDays < 3 ? (
                  <Bw504Button onClick={() => onDates({ flexDays: 3 })}>{tr("ui.searchPanel.t3Jours")}</Bw504Button>
                ) : null}
                {help.reason.kind === "unknown" && reportTarget ? (
                  <span className="bw-504note__report">
                    <ReportButton
                      targetType={reportTarget.type}
                      targetId={reportTarget.id}
                      label={tr("ui.searchPanel.signalerUnHoraireManquant")}
                      initialDetails={reportContext}
                      initialReason="missing_info"
                    />
                  </span>
                ) : null}
              </>
            }
          >
            {help.reason.kind === "unknown"
              ? otherPorts.length
                ? tr("ui.searchPanel.desRetoursExistentParUn")
                : tr("ui.searchPanel.aucunDepartConnuNeColle")
              : reasonBody(help.reason, "")}
          </Bw504Note>
        )}
      </div>
      {otherPorts.length ? (
        <details open={!wide || samePort.length < 3} className="rounded-2xl border border-dashed p-3">
          <summary className="cursor-pointer font-display text-sm font-bold">
            {tr("ui.searchPanel.retourParUnAutrePort")}
            {otherPorts.length})
          </summary>
          <div className="mt-2.5">{list(sorted(otherPorts))}</div>
        </details>
      ) : null}
    </div>
  );
}

const shortDayFormatter = lazyDateFormat({
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
function shortDay(key: string) {
  return shortDayFormatter.format(new Date(`${key}T00:00:00Z`));
}

/** En-tête d'étape façon Airbnb : titre quand l'étape est ouverte, ligne résumé cliquable sinon. */
function StepLabel({
  open,
  onOpen,
  summary,
  children,
  className = "",
  forceOpen = false,
}: {
  forceOpen?: boolean;
  open: boolean;
  onOpen: () => void;
  summary: string;
  children: ReactNode;
  className?: string;
}) {
  if (open || forceOpen) {
    return (
      <h3 className={`font-display text-base font-bold tracking-tight ${className}`}>{children}</h3>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-start shadow-sm transition hover:border-primary ${className}`}
    >
      <span className="text-xs font-semibold text-muted-foreground">{children}</span>
      <span className="min-w-0 truncate text-xs font-bold text-foreground">{summary}</span>
    </button>
  );
}

/** Titre de la 504 selon la raison prouvée par les données. */
function reasonTitle(reason: NoSailingReason, date: string | null) {
  switch (reason.kind) {
    case "soldOut":
      return reason.count > 1
        ? "Les navires de ce jour-là sont complets"
        : "Le navire de ce jour-là est complet";
    case "notPublished":
      return "Les horaires ne sont pas encore sortis";
    case "notThatDay":
      return `Aucun navire le ${date ? weekdayName(date) : "jour choisi"} sur cette ligne`;
    default:
      return tr("ui.searchPanel.jeNAiRienTrouve");
  }
}

function reasonBody(reason: NoSailingReason, fallback: string) {
  switch (reason.kind) {
    case "soldOut":
      return "Plus de place à bord. Regarde les jours d'à côté.";
    case "notPublished":
      return `Les compagnies ont publié leurs départs jusqu'au ${new Date(
        `${reason.publishedUntil}T00:00:00Z`,
      ).toLocaleDateString(intlLocale(), {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })}. Active l'alerte : je te préviens dès que ça sort.`;
    case "notThatDay":
      return `Elle part le ${weekdayList(reason.weekdays)} : prends le jour le plus proche.`;
    default:
      return tr("ui.searchPanel.verifieChezLaCompagnieEt", { fallback });
  }
}

