import { BookingReturnNote } from "@/components/companion/BookingReturnNote";
import { vesselCompanyIds } from "@/lib/ferry/filterSync";
import { track } from "@/lib/usage";
import { HomeTraffic } from "./HomeTraffic";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { ROUTE_PREVIEW_EVENT } from "@/components/itinerary/RoutePreview";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Backpack,
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
import { emptyFilters, type Filters, type Selection } from "@/lib/ferry/types";
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
import { diffDays } from "@/lib/ferry/schoolCalendar";
import { TripCalendar, type CalendarField } from "./TripCalendar";
import { dateKeyInZone } from "@/lib/ferry/time";
import { useLiveShips } from "@/lib/ferry/useLiveShips";
import type { LiveShip } from "@/lib/ferry/tracking";
import { PortMultiPicker } from "./PortFilters";
import { SalesCalendarNote } from "@/components/companion/SalesCalendarNote";
import { companyCalendars, isEstimatedDeparture } from "@/lib/companion/salesCalendar";
import { isNorthShore, isSouthShore } from "@/lib/ferry/markets";
import { CompanyBadge } from "./CompanyBadge";
import { RoundTripCard } from "./RoundTripCard";
import { estimateFare, FareProfileContext, useFareProfile } from "@/lib/ferry/pricing";
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
import { tr } from "@/lib/i18n";
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
    window.addEventListener("batogo:edit-filters", open);
    return () => window.removeEventListener("batogo:edit-filters", open);
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
    setCalOpen(step === 2 && editing && isDesktop);
  }, [step, editing, isDesktop]);
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
    const month = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
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
    [departures, routes, companies, filters.date, filters.returnDate, filters.roundTrip, filters.departurePortIds, filters.arrivalPortIds],
  );
  const salesAlert = filters.date ? (
    <SalesCalendarNote
      calendars={calendars}
      date={filters.date}
      returnDate={filters.roundTrip ? filters.returnDate : null}
      fromLabel={filters.departurePortIds.length ? fromName(filters.departurePortIds) : null}
      toLabel={filters.arrivalPortIds.length ? fromName(filters.arrivalPortIds) : null}
    />
  ) : null;
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
    if (found.kind === "notThatDay" && (!hasPair || filters.flexDays > 0)) return { kind: "unknown" } as const;
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
  const reportContext = `Recherche sans départ affiché : ${fromName(filters.departurePortIds) || "tous ports"} → ${fromName(filters.arrivalPortIds) || "tous ports"}${filters.date ? `, le ${filters.date}` : ""}.`;

  // Sans date de retour, un voyageur n'a pas encore d'aller-retour à comparer.
  const showTrips = filters.roundTrip && Boolean(filters.returnDate);
  const resultCount = showTrips
    ? roundTrips.main.length + roundTrips.alternatives.length
    : outList.length;
  const portsLabel = (ids: string[]) =>
    ids.length === 0 ? "Tous ports" : ids.length === 1 ? fromName(ids) : `${ids.length} ports`;
  const datesLabel = filters.date
    ? `${shortDay(filters.date)}${filters.roundTrip ? ` → ${filters.returnDate ? shortDay(filters.returnDate) : "retour à définir"}` : ""}${filters.flexDays ? ` ±${filters.flexDays}j` : ""}`
    : "Dates flexibles";

  return (
    <FareProfileContext.Provider value={profile}>
      <div className="flex flex-col">
        {/* RECHERCHE : capsule condensée façon Airbnb, formulaire guidé à la demande */}
        {!editing && !homeMode ? (
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
                  // Le volet Route s'ouvre, puis on descend jusqu'à l'aperçu des étapes.
                  window.setTimeout(
                    () => window.dispatchEvent(new Event(ROUTE_PREVIEW_EVENT)),
                    450,
                  );
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
        {!editing && (filters.companyId || filters.vesselId) ? (
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
          className={`scroll-mt-0 space-y-3 border-b bg-card px-4 pb-4 pt-4 md:bg-white md:px-5 ${editing ? "" : "hidden"}`}
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
              aria-label={`Inverser le sens : actuellement ${reversed ? "Algérie → Europe" : "Europe → Algérie"}`}
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
                                  className={`flex min-h-12 flex-col items-start justify-center rounded-xl border px-3 py-1.5 text-left transition disabled:opacity-50 ${on ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "border-border bg-card hover:border-primary/60"}`}
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
              open={isDesktop ? calOpen : step === 2}
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
            summary={`${summarizePassengers(profile.passengers)}${profile.vehicle !== "none" ? ` · ${summarizeVehicle(profile)}` : " · Sans véhicule"}`}
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
                    Voir les traversées
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
        {/* RÉSULTATS */}
        <section
          hidden={homeMode || editing}
          id="map-next-departures"
          className="space-y-5 px-4 py-4 md:px-5"
        >
          <a
            href="/barometre-prix"
            className="inline-block text-xs font-semibold text-primary underline underline-offset-2"
          >
            {tr("ui.searchPanel.comprendreLesPrixEstimesEt")}
          </a>
          {isLoading ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-[120px] animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : (
            <>
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
              <BookingReturnNote className="mb-3" />
              {showTrips ? (
                <>
                {/* Des résultats : l'encart explique d'abord les « Estimé ». Rien : la 504 d'abord. */}
                {salesAlert && roundTrips.main.some((trip) => trip.mirror) ? (
                  <div className="mb-3">{salesAlert}</div>
                ) : null}
                <RoundTripSection
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
                {salesAlert && !roundTrips.main.some((trip) => trip.mirror) ? (
                  <div className="mt-3">{salesAlert}</div>
                ) : null}
                </>
              ) : (
                <>
                  {salesAlert && outList.length ? <div className="mb-3">{salesAlert}</div> : null}
                  <ResultBlock
                    liveByDeparture={liveByDeparture}
                    title={
                      hasPair
                        ? `Aller · ${fromName(filters.departurePortIds)} → ${fromName(filters.arrivalPortIds)}`
                        : filters.departurePortIds.length || filters.arrivalPortIds.length
                          ? tr("ui.searchPanel.traversees")
                          : tr("ui.searchPanel.prochainsDeparts")
                    }
                    subtitle={
                      filters.roundTrip
                        ? tr("ui.searchPanel.allersAjoutezUneDateDe")
                        : tr("ui.searchPanel.allerSimpleHeuresLocales")
                    }
                    days={outDays}
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
                    reportTarget={reportTarget}
                    reportContext={reportContext}
                    onReportMissing={startSearch}
                    onReset={
                      active
                        ? () => onFiltersChange({ ...emptyFilters, roundTrip: filters.roundTrip })
                        : undefined
                    }
                  />
                  {salesAlert && !outList.length ? <div className="mt-3">{salesAlert}</div> : null}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </FareProfileContext.Provider>
  );
}

type SortBy = "date" | "price" | "duration";

const bySailing = (sortBy: SortBy, profile: TripProfileValue) => (a: Sailing, b: Sailing) =>
  sortBy === "price"
    ? estimateFare(a, profile) - estimateFare(b, profile)
    : (a.durationMin ?? Infinity) - (b.durationMin ?? Infinity);

function ResultBlock({
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
  onReset,
  reportTarget,
  reportContext,
  onReportMissing,
}: {
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
      <DayStrip days={days} value={date} onChange={onDate} allLabel="Tous" />
      {list.length === 0 ? (
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
                        {new Date(`${item.day}T00:00:00Z`).toLocaleDateString("fr-FR", {
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
                <Bw504Button onClick={onReset}>{tr("ui.searchPanel.elargirLaRecherche")}</Bw504Button>
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
        <div className="space-y-2">
          {recommended && list.some((sailing) => sailing.departure.id === recommended) ? (
            <p className="text-[11px] text-muted-foreground">{RECOMMENDED_RULE}</p>
          ) : null}
          {list.map((sailing, index) => (
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
          ))}
          {!expanded && total > list.length ? (
            <button
              type="button"
              onClick={onMore}
              className="w-full rounded-2xl border border-dashed py-3 text-sm font-semibold text-primary transition hover:bg-primary/5"
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
  new Date(`${key}T00:00:00Z`).toLocaleDateString("fr-FR", {
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
      className={`batogo-control flex h-12 min-w-0 items-center gap-2 px-3 text-left ${active ? "!border-primary" : ""}`}
    >
      <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 leading-tight">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
          {flex > 0 ? <span className="ml-1 text-primary">± {flex} j</span> : null}
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
        <RoundTripCard
          key={`${trip.out.departure.id}-${trip.back.departure.id}`}
          trip={trip}
          index={index}
          onOpenVessel={onOpenVessel}
          onOpenRoute={onOpenRoute}
          onHoverRoute={onHoverRoute}
          onFocusRoute={onFocusRoute}
        />
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
                ? `Pas d'aller-retour par le même port à ces dates`
                : `${help.leg === "aller" ? "Aller" : "Retour"} : ${reasonTitle(help.reason, help.leg === "aller" ? dateLabel.out : dateLabel.back).toLowerCase()}`
            }
            actions={
              <>
                {help.leg === "aller"
                  ? [help.out.before, help.out.after].map((day) =>
                      day ? (
                        <Bw504Button key={`o${day}`} primary onClick={() => onDates({ date: day })}>
                          Aller {fmtShort(day, true)}
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
                      Retour {fmtShort(day, true)}
                    </Bw504Button>
                  ) : null,
                )}
                {flexDays < 3 ? (
                  <Bw504Button onClick={() => onDates({ flexDays: 3 })}>± 3 jours</Bw504Button>
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
                ? "Des retours existent par un autre port : regarde juste en dessous, ou décale tes dates."
                : "Aucun départ connu ne colle à ces deux dates. Décale un peu l'aller ou le retour, ça part souvent mieux."
              : reasonBody(help.reason, "")}
          </Bw504Note>
        )}
      </div>
      {otherPorts.length ? (
        <details className="rounded-2xl border border-dashed p-3">
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

const shortDayFormatter = new Intl.DateTimeFormat("fr-FR", {
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
      className={`flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left shadow-sm transition hover:border-primary ${className}`}
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
      return reason.count > 1 ? "Les bateaux de ce jour-là sont complets" : "Le bateau de ce jour-là est complet";
    case "notPublished":
      return "Les horaires ne sont pas encore sortis";
    case "notThatDay":
      return `Pas de bateau le ${date ? weekdayName(date) : "jour choisi"} sur cette ligne`;
    default:
      return "Je n'ai rien trouvé, et je ne sais pas pourquoi";
  }
}

function reasonBody(reason: NoSailingReason, fallback: string) {
  switch (reason.kind) {
    case "soldOut":
      return "Plus de place à bord. Regarde les jours d'à côté, ça part souvent mieux.";
    case "notPublished":
      return `Les compagnies ont publié leurs départs jusqu'au ${new Date(
        `${reason.publishedUntil}T00:00:00Z`,
      ).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}. Active l'alerte : je te préviens dès que ça sort.`;
    case "notThatDay":
      return `Elle part le ${weekdayList(reason.weekdays)} : prends le jour le plus proche.`;
    default:
      return `${fallback} Vérifie chez la compagnie, et dis-le-moi si tu trouves.`;
  }
}
