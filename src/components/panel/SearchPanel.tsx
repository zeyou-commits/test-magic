import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Backpack,
  CalendarDays,
  ChevronDown,
  Search,
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
} from "@/lib/ferry/trips";
import { diffDays } from "@/lib/ferry/schoolCalendar";
import { TripCalendar, type CalendarField } from "./TripCalendar";
import { dateKeyInZone } from "@/lib/ferry/time";
import { useLiveShips } from "@/lib/ferry/useLiveShips";
import type { LiveShip } from "@/lib/ferry/tracking";
import { PortMultiPicker } from "./PortFilters";
import { CompanyBadge } from "./CompanyBadge";
import { RoundTripCard } from "./RoundTripCard";
import { FareProfileContext } from "@/lib/ferry/pricing";
import { buildRoundTrips, type RoundTrip } from "@/lib/ferry/roundTrips";
import { DayStrip, SailingCard } from "./SailingCard";
import { ShareButtons } from "./ShareButtons";
import {
  TripProfile,
  VehicleChips,
  defaultTripProfile,
  summarizePassengers,
  summarizeVehicle,
  type TripProfileValue,
} from "./TripProfile";

const ANY = "__any__";
const PAGE = 4;

interface SearchPanelProps {
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
}

/**
 * Recherche unique : trajet, dates, voyageurs. Une seule source de vérité (les filtres),
 * lue à la fois par la carte, cette liste et l'adresse de la page.
 */
export function SearchPanel({
  filters,
  onFiltersChange,
  selection,
  onSelect,
  hidePickersOnMobile = false,
  onHighlightRoute,
  onFocusRoute,
}: SearchPanelProps) {
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: departures = [], isLoading } = useQuery(upcomingDeparturesQuery());

  const liveShips = useLiveShips();
  const liveByDeparture = useMemo(
    () => new Map(liveShips.map((ship) => [ship.departure.id, ship])),
    [liveShips],
  );
  const [profile, setProfile] = useState<TripProfileValue>(defaultTripProfile);
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
  const lastStep = 3 as 2 | 3;
  void hidePickersOnMobile;
  // Sens du trajet : Europe → Algérie par défaut, inversé par le bouton ⇄.
  const [reversed, setReversed] = useState(false);
  const searchRef = useRef<HTMLElement>(null);
  const isMobileView = () => typeof window !== "undefined" && window.innerWidth < 768;
  const startSearch = () => {
    setStep(firstStep);
    setCalField("out");
    setEditing(true);
    // Sur mobile, le volet passe en plein écran pour la recherche.
    if (isMobileView()) window.dispatchEvent(new Event("batogo:panel-full"));
  };
  const closeSearch = () => {
    setEditing(false);
    setStep(firstStep);
    searchRef.current?.closest(".batogo-panel-scroll")?.scrollTo({ top: 0, behavior: "instant" });
    if (isMobileView()) window.dispatchEvent(new Event("batogo:close-panel"));
  };
  const showResults = () => {
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
  // Drapeau du compteur : déplie la section et ouvre la liste des compagnies.
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  useEffect(() => {
    const open = () => {
      setEditing(true);
      setCompanyOpen(true);
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
    onFocusRoute?.(next?.routeId ?? null);
  };

  const today = dateKeyInZone(new Date(), "Europe/Paris");
  const set = (patch: Partial<Filters>) => onFiltersChange({ ...filters, ...patch });

  const all = useMemo(
    () => buildSailings(departures, routes, ports, companies, vessels),
    [departures, routes, ports, companies, vessels],
  );
  const outbound = useMemo(
    () =>
      legSailings(
        all,
        filters.departurePortIds,
        filters.arrivalPortIds,
        filters.companyId,
        filters.vesselId,
      ),
    [all, filters.departurePortIds, filters.arrivalPortIds, filters.companyId, filters.vesselId],
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

  // Date d'aller « intelligente » : jour exact, ou fenêtre de ± N jours si la souplesse est activée.
  const outList = filters.date
    ? outbound.filter((item) => Math.abs(diffDays(filters.date!, item.dayKey)) <= filters.flexDays)
    : outbound;
  const backList = filters.returnDate
    ? inbound.filter((item) => item.dayKey === filters.returnDate)
    : inbound.filter((item) => !filters.date || item.dayKey >= filters.date);
  const outShown = filters.date || showAllOut ? outList : outList.slice(0, PAGE);
  const backShown = filters.returnDate || showAllBack ? backList : backList.slice(0, PAGE);
  const outRecommended = filters.date ? recommendedId(outList, traveler) : null;
  const backRecommended = filters.returnDate ? recommendedId(backList, traveler) : null;

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

  const resultCount = filters.roundTrip
    ? roundTrips.main.length + roundTrips.alternatives.length
    : outList.length;
  const portsLabel = (ids: string[]) =>
    ids.length === 0 ? "Tous ports" : ids.length === 1 ? fromName(ids) : `${ids.length} ports`;
  const datesLabel = filters.date
    ? `${shortDay(filters.date)}${filters.roundTrip && filters.returnDate ? ` → ${shortDay(filters.returnDate)}` : ""}${filters.flexDays ? ` ±${filters.flexDays}j` : ""}`
    : "Dates flexibles";

  return (
    <FareProfileContext.Provider value={profile}>
      <div className="flex flex-col">
        {!editing && !active ? (
          <div className="bw-search-welcome">
            <h2>On prend le large ?</h2>
          </div>
        ) : null}
        {/* RECHERCHE : capsule condensée façon Airbnb, formulaire guidé à la demande */}
        {!editing ? (
          <section className="border-b px-3 py-2.5 md:px-5">
            <button type="button" onClick={startSearch} className="bw-search-summary">
              <Search className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-bold">
                  {active
                    ? `${portsLabel(filters.departurePortIds)} ${filters.roundTrip ? "⇄" : "→"} ${portsLabel(filters.arrivalPortIds)}`
                    : "Trouver ma traversée"}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {datesLabel} · {summarizePassengers(profile.passengers)}
                  {profile.vehicle !== "none" ? ` · ${summarizeVehicle(profile)}` : ""}
                </span>
              </span>
              <span className="bw-search-icon" aria-hidden>
                <SlidersHorizontal className="size-4" />
              </span>
              <span className="sr-only">Modifier la recherche</span>
            </button>
          </section>
        ) : null}
        <section
          ref={searchRef}
          className={`scroll-mt-0 space-y-3 border-b bg-card px-4 pb-4 pt-4 md:bg-white md:px-5 ${editing ? "" : "hidden"}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-foreground">Trouver ma traversée</span>
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Fermer la recherche"
              className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground hover:bg-secondary"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div
              className="batogo-tabbar inline-grid grid-cols-2 gap-0.5 !rounded-full !p-0.5"
              role="radiogroup"
              aria-label="Type de voyage"
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
                  {round ? "⇄ Aller-retour" : "→ Aller simple"}
                </button>
              ))}
            </div>
            <button
              type="button"
              title="Inverser le sens"
              aria-label={`Inverser le sens : actuellement ${reversed ? "Algérie → Europe" : "Europe → Algérie"}`}
              onClick={() => {
                setReversed((r) => !r);
                onFiltersChange({ ...swapDirection(filters), date: null, returnDate: null });
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-primary shadow-sm transition hover:bg-primary hover:text-primary-foreground"
            >
              <ArrowLeftRight className="size-3.5" />
              <span className="max-md:hidden">
                {reversed ? "Algérie → Europe" : "Europe → Algérie"}
              </span>
            </button>
          </div>
          <StepLabel
            open={step === 1}
            onOpen={() => setStep(1)}
            summary={`${portsLabel(filters.departurePortIds)} ${filters.roundTrip ? "⇄" : "→"} ${portsLabel(filters.arrivalPortIds)}`}
          >
            ① Où partez-vous ?
          </StepLabel>
          <div className={step === 1 ? "grid grid-cols-1 gap-3" : "hidden"}>
            <div className="min-w-0">
              <PortMultiPicker
                title="Départ"
                direction="departure"
                ports={ports}
                routes={routes}
                countryFilter={reversed ? isAlgeria : isNotAlgeria}
                value={filters.departurePortIds}
                otherSide={filters.arrivalPortIds}
                onChange={(ids) =>
                  onFiltersChange({
                    ...withDeparturePorts(filters, ids, ports, routes),
                    date: null,
                    returnDate: null,
                  })
                }
              />
            </div>
            <div className="min-w-0">
              <PortMultiPicker
                title="Arrivée"
                direction="arrival"
                ports={ports}
                routes={routes}
                countryFilter={reversed ? isNotAlgeria : isAlgeria}
                value={filters.arrivalPortIds}
                otherSide={filters.departurePortIds}
                onChange={(ids) =>
                  onFiltersChange({
                    ...withArrivalPorts(filters, ids, ports, routes),
                    date: null,
                    returnDate: null,
                  })
                }
              />
            </div>
          </div>

          <div id="search-step-2" className="scroll-mt-1" />
          <StepLabel open={step === 2} onOpen={() => setStep(2)} summary={datesLabel}>
            ② Quand partez-vous ?
          </StepLabel>
          <div className={step === 2 ? "-mt-1" : "hidden"}>
            <TripCalendar
              inline
              open={step === 2}
              onOpenChange={() => {}}
              holidaysOn={holidaysOn}
              onHolidaysChange={setHolidaysOn}
              field={calField}
              onFieldChange={setCalField}
              roundTrip={filters.roundTrip}
              date={filters.date}
              returnDate={filters.returnDate}
              flexDays={filters.flexDays}
              outDays={outAvailability}
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
            ③ Qui voyage, avec quel véhicule ?
          </StepLabel>
          <div className={step === 3 ? "-mt-1 space-y-3" : "hidden"}>
            <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
              <TripProfile value={profile} onChange={setProfile} hideVehicle />
            </div>
            <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-primary">
                Véhicule
              </p>
              <VehicleChips value={profile} onChange={setProfile} />
            </div>
          </div>

          <details
            id="filters-company"
            className="group rounded-xl text-xs transition-shadow data-[flash=true]:ring-2 data-[flash=true]:ring-primary/50"
            open={companyOpen || Boolean(filters.companyId || filters.vesselId)}
            onToggle={(e) => setCompanyOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="flex cursor-pointer list-none items-center gap-1 font-semibold text-muted-foreground hover:text-foreground">
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />{" "}
              Compagnie, navire
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <FilterSelect
                label="Compagnie"
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
                label="Navire"
                value={filters.vesselId}
                onChange={(value) => set({ vesselId: value })}
                options={vessels.map((vessel) => ({ value: vessel.id, label: vessel.name }))}
              />
            </div>
          </details>
          <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-1 border-t bg-card/95 px-4 py-2.5 backdrop-blur md:-mx-5 md:px-5">
            <button
              type="button"
              onClick={() => {
                onFiltersChange({ ...emptyFilters, roundTrip: filters.roundTrip });
                setStep(firstStep);
              }}
              className="text-sm font-semibold text-foreground underline underline-offset-2 disabled:opacity-40"
              disabled={!active}
            >
              <span className="md:hidden">Effacer</span>
              <span className="max-md:hidden">Effacer tout</span>
            </button>
            <div className="flex items-center gap-1">
              {step > firstStep ? (
                <button
                  type="button"
                  onClick={() => {
                    setStep((s) => (s - 1) as 1 | 2 | 3);
                  }}
                  className="h-11 whitespace-nowrap rounded-xl px-2 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  ← Retour
                </button>
              ) : (
                <button
                  type="button"
                  onClick={closeSearch}
                  className="h-11 whitespace-nowrap rounded-xl px-2 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  ← Fermer
                </button>
              )}
              {step < lastStep ? (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 1) setCalField("out");
                    setStep((s) => (s + 1) as 1 | 2 | 3);
                  }}
                  className="flex h-11 whitespace-nowrap items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground shadow-md transition hover:opacity-90"
                >
                  Suivant →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    showResults();
                  }}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-md transition hover:opacity-90"
                >
                  <Search className="size-4" aria-hidden />
                  <span className="md:hidden">
                    Voir{active && resultCount ? ` (${resultCount})` : ""}
                  </span>
                  <span className="max-md:hidden">
                    Trouver ma traversée{active && resultCount ? ` (${resultCount})` : ""}
                  </span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* RÉSULTATS */}
        <section id="map-next-departures" className="space-y-5 px-4 py-4 md:px-5">
          {isLoading ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-[120px] animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : (
            <>
              {filters.roundTrip && hasPair ? (
                <RoundTripSection
                  trips={roundTrips}
                  hasPorts={filters.departurePortIds.length + filters.arrivalPortIds.length > 0}
                  onOpenVessel={(id) => onSelect({ type: "vessel", id })}
                  onOpenRoute={(id) => onSelect({ type: "route", id })}
                  onHoverRoute={setHoverRouteId}
                  onFocusRoute={(routeId) => {
                    setOpenCard(routeId ? { id: routeId, routeId } : null);
                    onFocusRoute?.(routeId);
                  }}
                />
              ) : (
                <ResultBlock
                  liveByDeparture={liveByDeparture}
                  title={
                    hasPair
                      ? `Aller · ${fromName(filters.departurePortIds)} → ${fromName(filters.arrivalPortIds)}`
                      : filters.departurePortIds.length || filters.arrivalPortIds.length
                        ? "Traversées"
                        : "Prochains départs"
                  }
                  subtitle={
                    filters.roundTrip
                      ? "Départs aller · heures locales"
                      : "Aller simple · heures locales"
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
                  emptyText="Aucune traversée connue pour cette recherche."
                  onReset={
                    active
                      ? () => onFiltersChange({ ...emptyFilters, roundTrip: filters.roundTrip })
                      : undefined
                  }
                />
              )}
            </>
          )}
        </section>
      </div>
    </FareProfileContext.Provider>
  );
}

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
  onReset,
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
  onReset?: (() => void) | undefined;
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
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-bold leading-tight">{title}</h2>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{subtitle}</span>
          <ShareButtons compact label="Partager cette recherche" />
        </div>
      </div>
      <DayStrip days={days} value={date} onChange={onDate} allLabel="Tous" />
      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">
          {emptyText}
          {near && (near.before || near.after) ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {[near.before, near.after].map((item) =>
                item ? (
                  <button
                    key={item.day}
                    type="button"
                    onClick={() => onDate(item.day)}
                    className="rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
                  >
                    {item.day < date! ? "←" : ""}{" "}
                    {new Date(`${item.day}T00:00:00Z`).toLocaleDateString("fr-FR", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      timeZone: "UTC",
                    })}{" "}
                    {item.day > date! ? "→" : ""}
                  </button>
                ) : null,
              )}
            </div>
          ) : null}
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              className="mx-auto mt-3 flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
            >
              <X className="size-3.5" /> Élargir la recherche
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
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
              Voir les {total - list.length} autres départs
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
            : "Choisir"}
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
          {label} : toutes
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

function RoundTripSection({
  trips,
  hasPorts,
  onOpenVessel,
  onOpenRoute,
  onHoverRoute,
  onFocusRoute,
}: {
  trips: { main: RoundTrip[]; alternatives: RoundTrip[] };
  hasPorts: boolean;
  onOpenVessel: (id: string) => void;
  onOpenRoute: (id: string) => void;
  onHoverRoute: (routeId: string | null) => void;
  onFocusRoute: (routeId: string | null) => void;
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
  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-base font-bold leading-tight">
            {hasPorts ? "Allers-retours pour votre trajet" : "Allers-retours possibles"}
          </h2>
          <span className="text-[11px] text-muted-foreground">Heures locales des ports</span>
        </div>
        {trips.main.length ? (
          list(trips.main)
        ) : (
          <div className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">
            Aucun aller-retour connu pour ces ports et ces dates.
            {trips.alternatives.length ? " Voici des alternatives ci-dessous." : ""}
          </div>
        )}
      </div>
      {trips.alternatives.length ? (
        <div className="space-y-2.5">
          <h2 className="font-display text-base font-bold leading-tight">
            {hasPorts ? "Alternatives par d’autres ports" : "Combinaisons avec ports différents"}
          </h2>
          {list(trips.alternatives)}
        </div>
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
const isAlgeria = (code: string) => code === "DZ";
const isNotAlgeria = (code: string) => code !== "DZ";

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
