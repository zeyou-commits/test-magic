import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ArrowRight,
  Backpack,
  CalendarDays,
  ChevronDown,
  RotateCcw,
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
  popularPairs,
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
import { DayStrip, SailingCard } from "./SailingCard";
import { ShareButtons } from "./ShareButtons";
import {
  TripProfile,
  defaultTripProfile,
  summarizePassengers,
  summarizeVehicle,
  type TripProfileValue,
} from "./TripProfile";

const ANY = "__any__";
const PAGE = 6;

interface SearchPanelProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  /** Sur mobile, Départ et Arrivée sont déjà dans l'en-tête de la page. */
  hidePickersOnMobile?: boolean;
  /** Ligne à mettre en évidence sur la carte (survol ou traversée dépliée). */
  onHighlightRoute?: (routeId: string | null) => void;
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
  const [calOpen, setCalOpen] = useState(false);
  const [calField, setCalField] = useState<CalendarField>("out");
  const [holidaysOn, setHolidaysOnState] = useState(false);
  useEffect(() => {
    try {
      setHolidaysOnState(window.localStorage.getItem("batogo:school-holidays") === "1");
    } catch {
      // Stockage indisponible : sans conséquence.
    }
  }, []);
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
  const toggleCard = (sailing: Sailing) =>
    setOpenCard((current) =>
      current?.id === sailing.departure.id
        ? null
        : { id: sailing.departure.id, routeId: sailing.route.id },
    );

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
      hasPair && filters.roundTrip
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
      hasPair,
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

  const active = hasActiveFilters(filters);
  const pairs = useMemo(() => popularPairs(all, 6), [all]);
  const route = (from: string, to: string) =>
    set({ departurePortIds: [from], arrivalPortIds: [to], date: null, returnDate: null });
  const fromName = (ids: string[]) => ports.find((port) => port.id === ids[0])?.name ?? "";

  return (
    <div className="flex flex-col">
      {/* RECHERCHE */}
      <section className="space-y-3 border-b bg-gradient-to-b from-primary/[0.06] to-transparent px-4 pb-4 pt-4 md:px-5">
        <div className="flex items-center justify-between gap-2">
          <div
            className="batogo-tabbar inline-grid grid-cols-2 gap-1 p-1"
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
                className="batogo-tab px-3"
              >
                {round ? "Aller-retour" : "Aller simple"}
              </button>
            ))}
          </div>
          {active ? (
            <button
              type="button"
              onClick={() => onFiltersChange({ ...emptyFilters, roundTrip: filters.roundTrip })}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <RotateCcw className="size-3.5" /> Effacer
            </button>
          ) : null}
        </div>

        <div
          className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 ${hidePickersOnMobile ? "hidden md:grid" : ""}`}
        >
          <PortMultiPicker
            direction="departure"
            ports={ports}
            routes={routes}
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
          <button
            type="button"
            aria-label="Inverser départ et arrivée"
            title="Inverser le sens"
            disabled={!filters.departurePortIds.length && !filters.arrivalPortIds.length}
            onClick={() =>
              onFiltersChange({ ...swapDirection(filters), date: null, returnDate: null })
            }
            className="group grid size-10 place-items-center rounded-full border border-border bg-card text-primary shadow-sm transition hover:rotate-180 hover:bg-primary hover:text-primary-foreground disabled:opacity-40 disabled:hover:rotate-0 disabled:hover:bg-card disabled:hover:text-primary"
          >
            <ArrowLeftRight className="size-4" />
          </button>
          <PortMultiPicker
            direction="arrival"
            ports={ports}
            routes={routes}
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

        <TripCalendar
          open={calOpen}
          onOpenChange={setCalOpen}
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
          anchor={
            <div className={`grid gap-1.5 ${filters.roundTrip ? "grid-cols-2" : "grid-cols-1"}`}>
              <DateButton
                label="Aller"
                value={filters.date}
                flex={filters.flexDays}
                active={calOpen && calField === "out"}
                onClick={() => {
                  setCalField("out");
                  setCalOpen(true);
                }}
              />
              {filters.roundTrip ? (
                <DateButton
                  label="Retour"
                  value={filters.returnDate}
                  active={calOpen && calField === "ret"}
                  onClick={() => {
                    setCalField(filters.date ? "ret" : "out");
                    setCalOpen(true);
                  }}
                />
              ) : null}
            </div>
          }
        />

        <div className="grid grid-cols-1">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="batogo-control flex h-12 w-full min-w-0 items-center gap-2 px-3 text-left"
              >
                <Users className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-xs font-semibold">
                    {summarizePassengers(profile.passengers)}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {summarizeVehicle(profile)}
                  </span>
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[340px] max-w-[92vw] p-3">
              <TripProfile value={profile} onChange={setProfile} />
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Sert à recommander l’horaire le plus confortable. Les tarifs ne sont pas encore
                comparés.
              </p>
            </PopoverContent>
          </Popover>
        </div>

        <details id="filters-company" className="group text-xs" open={Boolean(filters.companyId || filters.vesselId)}>
          <summary className="flex cursor-pointer list-none items-center gap-1 font-semibold text-muted-foreground hover:text-foreground">
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />{" "}
            Compagnie, navire
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <FilterSelect
              label="Compagnie"
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
      </section>

      {/* RÉSULTATS */}
      <section className="space-y-5 px-4 py-4 md:px-5">
        {isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-[120px] animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : (
          <>
            {!hasPair && !active ? (
              <div className="-mx-4 space-y-1.5 md:-mx-5">
                <h2 className="px-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground md:px-5">
                  Trajets fréquents
                </h2>
                <div className="flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:px-5 [&::-webkit-scrollbar]:hidden">
                  {pairs.map((pair, index) => (
                    <button
                      key={`${pair.from.id}-${pair.to.id}`}
                      type="button"
                      onClick={() => route(pair.from.id, pair.to.id)}
                      style={{ animationDelay: `${index * 50}ms` }}
                      className="sailing-card inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
                    >
                      {pair.from.name} <ArrowRight className="size-3 text-primary" /> {pair.to.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <ResultBlock
              liveByDeparture={liveByDeparture}
              title={
                hasPair
                  ? `Aller · ${fromName(filters.departurePortIds)} → ${fromName(filters.arrivalPortIds)}`
                  : filters.departurePortIds.length || filters.arrivalPortIds.length
                    ? "Traversées"
                    : "Prochains départs"
              }
              subtitle="Heures locales des ports"
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

            {hasPair && filters.roundTrip ? (
              <ResultBlock
                liveByDeparture={liveByDeparture}
                title={`Retour · ${fromName(filters.arrivalPortIds)} → ${fromName(filters.departurePortIds)}`}
                subtitle={
                  filters.returnDate
                    ? "Heures locales des ports"
                    : "Choisissez le jour de votre retour"
                }
                days={backDays}
                date={filters.returnDate}
                onDate={(day) => set({ returnDate: day })}
                list={backShown}
                total={backList.length}
                recommended={backRecommended}
                openId={openCard?.id ?? null}
                onToggle={toggleCard}
                onHoverRoute={setHoverRouteId}
                onOpenVessel={(id) => onSelect({ type: "vessel", id })}
                onOpenRoute={(id) => onSelect({ type: "route", id })}
                onMore={() => setShowAllBack(true)}
                expanded={showAllBack || Boolean(filters.returnDate)}
                emptyText="Aucune traversée de retour connue. Essayez un autre port de retour depuis la carte."
              />
            ) : null}
          </>
        )}
      </section>
    </div>
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

function DateButton({
  label,
  value,
  flex = 0,
  active,
  onClick,
}: {
  label: string;
  value: string | null;
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
            ? new Date(`${value}T00:00:00Z`).toLocaleDateString("fr-FR", {
                weekday: "short",
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              })
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
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: { value: string; label: string; leading?: ReactNode }[];
}) {
  return (
    <Select value={value ?? ANY} onValueChange={(next) => onChange(next === ANY ? null : next)}>
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
