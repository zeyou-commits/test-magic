import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ArrowRight,
  Backpack,
  ChevronDown,
  Pencil,
  Ship,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
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
} from "@/lib/ferry/queries";
import { getSchoolBreaksForZone, type SchoolZone } from "@/lib/ferry/schoolCalendar";
import type { Company, Departure, Port, RouteLine, Selection } from "@/lib/ferry/types";
import { capitalizeFirst, formatDuration } from "@/lib/ferry/format";
import { dateKeyInZone, portTimeZone, wallTimeInZone, zoneLabel } from "@/lib/ferry/time";
import { GroupedPortSelect } from "./GroupedPortSelect";
import { BookingLink } from "./shared";
import {
  TripProfile,
  defaultTripProfile,
  summarizePassengers,
  summarizeVehicle,
  type TripProfileValue,
} from "./TripProfile";

type TravelerType = "solo" | "couple" | "family";
type Direction = "toAlgeria" | "fromAlgeria";

const isAlgeriaPort = (port: Port | undefined) => {
  if (!port) return false;
  const code = port.country_code.trim().toUpperCase();
  return code === "DZ" || code === "DZA";
};

/** Date du jour + n jours, au format AAAA-MM-JJ (calcul en UTC pour éviter les décalages). */
function addDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatDayKey(
  value: string,
  options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" },
) {
  return capitalizeFirst(
    new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: "UTC" }).format(
      new Date(`${value}T00:00:00Z`),
    ),
  );
}

/** Pénalité de confort : une famille évite les départs très tôt ou très tard. */
function comfortPenalty(hour: number, traveler: TravelerType) {
  if (traveler === "family") return hour < 7 || hour >= 22 ? 80 : 0;
  if (traveler === "couple") return hour < 6 ? 35 : 0;
  return hour < 5 ? 20 : 0;
}

interface LegOption {
  departure: Departure;
  route: RouteLine;
  company: Company | undefined;
  from: Port;
  to: Port;
  departureTime: string;
  arrivalLabel: string | null;
  score: number;
}

export function TripPlanner({
  selection,
  onSelect,
  prefill,
}: {
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  prefill?: { fromId: string; toId: string; key: number } | null;
}) {
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  // Le planificateur réutilise le cache global des départs : une seule requête réseau
  // alimente la carte, l'explorateur et le planificateur.
  const { data: departures = [] } = useQuery(upcomingDeparturesQuery());
  const { data: companies = [] } = useQuery(companiesQuery);

  const today = dateKeyInZone(new Date(), "Europe/Paris");

  const [tripMode, setTripMode] = useState<"roundtrip" | "oneway">("roundtrip");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [outboundDate, setOutboundDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [customReturn, setCustomReturn] = useState(false);
  const [returnFromId, setReturnFromId] = useState("");
  const [returnToId, setReturnToId] = useState("");
  const [profile, setProfile] = useState<TripProfileValue>(defaultTripProfile);
  const [profileOpen, setProfileOpen] = useState(false);
  const [zone, setZone] = useState<SchoolZone | null>(null);
  const [flexDays, setFlexDays] = useState(3);
  const [direction, setDirection] = useState<Direction>("toAlgeria");

  useEffect(() => {
    if (!prefill) return;
    setFromId(prefill.fromId);
    setToId(prefill.toId);
    setCustomReturn(false);
  }, [prefill?.key]);

  const activePorts = useMemo(() => ports.filter((port) => port.status === "active"), [ports]);
  const portById = useMemo(() => new Map(ports.map((port) => [port.id, port])), [ports]);
  const companyById = useMemo(
    () => new Map(companies.map((company) => [company.id, company])),
    [companies],
  );
  const activeRoutes = useMemo(() => routes.filter((route) => route.status === "active"), [routes]);

  const passengers = profile.passengers;
  const traveler: TravelerType =
    passengers.children + passengers.babies > 0
      ? "family"
      : passengers.adults + passengers.seniors <= 1
        ? "solo"
        : "couple";

  // Ports proposés : seulement les combinaisons qui existent réellement.
  const departureOptions = useMemo(() => {
    const ids = new Set(
      activeRoutes
        .filter((route) => !toId || route.arrival_port_id === toId)
        .map((route) => route.departure_port_id),
    );
    return activePorts.filter((port) => ids.has(port.id));
  }, [activePorts, activeRoutes, toId]);
  const arrivalOptions = useMemo(() => {
    const ids = new Set(
      activeRoutes
        .filter((route) => !fromId || route.departure_port_id === fromId)
        .map((route) => route.arrival_port_id),
    );
    return activePorts.filter((port) => ids.has(port.id));
  }, [activePorts, activeRoutes, fromId]);

  // Retour : par défaut le trajet inverse de l'aller, modifiable (retour par un autre port).
  const effectiveReturnFrom = customReturn ? returnFromId : toId;
  const effectiveReturnTo = customReturn ? returnToId : fromId;

  /** Toutes les traversées d'un trajet, avec heures locales et score de confort. */
  const legOptions = (from: string, to: string): LegOption[] => {
    if (!from || !to) return [];
    const fromPort = portById.get(from);
    const toPort = portById.get(to);
    if (!fromPort || !toPort) return [];
    const fromZone = portTimeZone(fromPort);
    const toZone = portTimeZone(toPort);
    const routeIds = new Set(
      activeRoutes
        .filter((route) => route.departure_port_id === from && route.arrival_port_id === to)
        .map((route) => route.id),
    );
    return departures
      .filter((departure) => routeIds.has(departure.route_id) && departure.status !== "cancelled")
      .map((departure) => {
        const route = activeRoutes.find((item) => item.id === departure.route_id)!;
        const departureTime = wallTimeInZone(departure.departure_at, fromZone);
        const [hour = 0, minute = 0] = departureTime.split(":").map(Number);
        const duration = departure.duration_minutes ?? route.typical_duration_minutes ?? 9999;
        return {
          departure,
          route,
          company: companyById.get(departure.company_id),
          from: fromPort,
          to: toPort,
          departureTime,
          arrivalLabel: departure.arrival_at
            ? `${formatDayKey(dateKeyInZone(departure.arrival_at, toZone))} · ${wallTimeInZone(departure.arrival_at, toZone)}`
            : null,
          score: duration + comfortPenalty(hour + minute / 60, traveler),
        };
      });
  };

  const outboundAll = useMemo(
    () => legOptions(fromId, toId),
    [fromId, toId, departures, activeRoutes, traveler, portById, companyById],
  );
  const returnAll = useMemo(
    () => legOptions(effectiveReturnFrom, effectiveReturnTo),
    [
      effectiveReturnFrom,
      effectiveReturnTo,
      departures,
      activeRoutes,
      traveler,
      portById,
      companyById,
    ],
  );

  const dayKey = (option: LegOption) =>
    dateKeyInZone(option.departure.departure_at, portTimeZone(option.from));
  const availableDays = (options: LegOption[], after: string) =>
    [...new Set(options.map(dayKey).filter((day) => day >= after))].sort().slice(0, 8);

  const outboundDays = useMemo(() => availableDays(outboundAll, today), [outboundAll, today]);
  const returnDays = useMemo(
    () => availableDays(returnAll, outboundDate || today),
    [returnAll, outboundDate, today],
  );

  const sortByTime = (options: LegOption[]) =>
    options
      .slice()
      .sort((a, b) => a.departure.departure_at.localeCompare(b.departure.departure_at));
  const outboundResults = useMemo(
    () => sortByTime(outboundAll.filter((option) => dayKey(option) === outboundDate)),
    [outboundAll, outboundDate],
  );
  const returnResults = useMemo(
    () => sortByTime(returnAll.filter((option) => dayKey(option) === returnDate)),
    [returnAll, returnDate],
  );

  // Vacances scolaires : propositions d'aller autour du début et de retour autour de la fin,
  // dans le sens choisi (Europe → Algérie ou Algérie → Europe).
  const holidayPeriods = useMemo(
    () => (zone ? getSchoolBreaksForZone(zone).filter((period) => period.end >= today) : []),
    [zone, today],
  );
  const holidaySuggestions = useMemo(() => {
    if (!zone) return [];
    const legMatches = (option: LegOption, outbound: boolean) => {
      const towardsAlgeria = (direction === "toAlgeria") === outbound;
      if (
        towardsAlgeria
          ? !isAlgeriaPort(option.to) || isAlgeriaPort(option.from)
          : !isAlgeriaPort(option.from) || isAlgeriaPort(option.to)
      )
        return false;
      // Si l'utilisateur a choisi des ports, on les respecte.
      if (outbound && fromId && option.from.id !== fromId) return false;
      if (outbound && toId && option.to.id !== toId) return false;
      if (!outbound && toId && option.from.id !== toId) return false;
      if (!outbound && fromId && option.to.id !== fromId) return false;
      return true;
    };
    const everything = activeRoutes.flatMap((route) =>
      legOptions(route.departure_port_id, route.arrival_port_id),
    );
    return holidayPeriods
      .map((period) => {
        const near = (option: LegOption, target: string) => {
          const day = dayKey(option);
          return day >= addDays(target, -flexDays) && day <= addDays(target, flexDays);
        };
        return {
          period,
          outbound: sortByTime(
            everything.filter((option) => legMatches(option, true) && near(option, period.start)),
          ).slice(0, 6),
          inbound:
            tripMode === "roundtrip"
              ? sortByTime(
                  everything.filter(
                    (option) => legMatches(option, false) && near(option, period.end),
                  ),
                ).slice(0, 6)
              : [],
        };
      })
      .filter((item) => item.outbound.length || item.inbound.length);
  }, [
    zone,
    holidayPeriods,
    direction,
    fromId,
    toId,
    flexDays,
    tripMode,
    activeRoutes,
    departures,
    traveler,
    portById,
    companyById,
  ]);

  const pickOutbound = (option: LegOption) => {
    setFromId(option.from.id);
    setToId(option.to.id);
    setOutboundDate(dayKey(option));
    if (returnDate && returnDate < dayKey(option)) setReturnDate("");
  };
  const pickReturn = (option: LegOption) => {
    const isPlainReverse = option.from.id === toId && option.to.id === fromId;
    setCustomReturn(!isPlainReverse && Boolean(fromId && toId));
    setReturnFromId(option.from.id);
    setReturnToId(option.to.id);
    if (!fromId || !toId) {
      setFromId(option.to.id);
      setToId(option.from.id);
    }
    setReturnDate(dayKey(option));
  };

  const swap = () => {
    setFromId(toId);
    setToId(fromId);
    setOutboundDate("");
    setReturnDate("");
  };

  const reset = () => {
    setFromId("");
    setToId("");
    setOutboundDate("");
    setReturnDate("");
    setCustomReturn(false);
    setZone(null);
  };

  const portName = (id: string) => portById.get(id)?.name ?? "—";
  const fromZoneLabel = zoneLabel(portTimeZone(portById.get(fromId)));
  const returnZoneLabel = zoneLabel(portTimeZone(portById.get(effectiveReturnFrom)));

  return (
    <div className="space-y-4 px-3 pb-6 pt-3">
      {/* 1. TRAJET */}
      <section className="space-y-3">
        <div
          className="batogo-tabbar grid grid-cols-2 gap-1 p-1"
          role="radiogroup"
          aria-label="Type de voyage"
        >
          {(["roundtrip", "oneway"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={tripMode === mode}
              data-active={tripMode === mode}
              onClick={() => {
                setTripMode(mode);
                if (mode === "oneway") setReturnDate("");
              }}
              className="batogo-tab"
            >
              {mode === "roundtrip" ? "Aller-retour" : "Aller simple"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-1.5">
          <GroupedPortSelect
            label="Départ"
            value={fromId}
            onChange={(value) => {
              setFromId(value);
              setOutboundDate("");
            }}
            ports={departureOptions}
          />
          <button
            type="button"
            aria-label="Inverser départ et arrivée"
            title="Inverser le sens"
            onClick={swap}
            disabled={!fromId && !toId}
            className="mb-1 grid size-9 place-items-center rounded-full border border-border bg-background text-primary shadow-sm hover:bg-secondary disabled:opacity-40"
          >
            <ArrowLeftRight className="size-4" />
          </button>
          <GroupedPortSelect
            label="Arrivée"
            value={toId}
            onChange={(value) => {
              setToId(value);
              setOutboundDate("");
            }}
            ports={arrivalOptions}
          />
        </div>
      </section>

      {/* 2. DATES */}
      <section className="space-y-3">
        <DateWithDays
          label={`Aller${fromId && toId ? ` · ${portName(fromId)} → ${portName(toId)}` : ""}`}
          value={outboundDate}
          min={today}
          onChange={(value) => {
            setOutboundDate(value);
            if (returnDate && value && returnDate < value) setReturnDate("");
          }}
          days={outboundDays}
          ready={Boolean(fromId && toId)}
        />

        {tripMode === "roundtrip" ? (
          <div className="space-y-2">
            {fromId && toId ? (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-muted-foreground">
                  Retour
                  {effectiveReturnFrom && effectiveReturnTo
                    ? ` · ${portName(effectiveReturnFrom)} → ${portName(effectiveReturnTo)}`
                    : ""}
                </span>
                {fromId && toId ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!customReturn) {
                        setReturnFromId(toId);
                        setReturnToId(fromId);
                      }
                      setCustomReturn((value) => !value);
                      setReturnDate("");
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  >
                    <Pencil className="size-3" />{" "}
                    {customReturn ? "Même trajet en sens inverse" : "Revenir par un autre port"}
                  </button>
                ) : null}
              </div>
            ) : null}
            {customReturn ? (
              <div className="grid grid-cols-2 gap-1.5">
                <GroupedPortSelect
                  label="Retour depuis"
                  value={returnFromId}
                  onChange={(value) => {
                    setReturnFromId(value);
                    setReturnDate("");
                  }}
                  ports={activePorts.filter((port) =>
                    activeRoutes.some(
                      (route) =>
                        route.departure_port_id === port.id &&
                        (!returnToId || route.arrival_port_id === returnToId),
                    ),
                  )}
                />
                <GroupedPortSelect
                  label="Retour vers"
                  value={returnToId}
                  onChange={(value) => {
                    setReturnToId(value);
                    setReturnDate("");
                  }}
                  ports={activePorts.filter((port) =>
                    activeRoutes.some(
                      (route) =>
                        route.arrival_port_id === port.id &&
                        (!returnFromId || route.departure_port_id === returnFromId),
                    ),
                  )}
                />
              </div>
            ) : null}
            {fromId && toId && !customReturn && returnAll.length === 0 ? (
              <p className="rounded-xl bg-warning/15 px-3 py-2 text-xs text-warning-foreground">
                Aucun départ connu de {portName(toId)} vers {portName(fromId)}. Essayez « Revenir
                par un autre port ».
              </p>
            ) : null}
            <DateWithDays
              label="Date de retour"
              value={returnDate}
              min={outboundDate || today}
              onChange={setReturnDate}
              days={returnDays}
              ready={Boolean(effectiveReturnFrom && effectiveReturnTo)}
            />
          </div>
        ) : null}
      </section>

      {/* 3. RÉSULTATS */}
      <section className="space-y-3" aria-live="polite">
        {!fromId || !toId ? (
          <p className="rounded-xl bg-secondary px-3 py-3 text-sm text-muted-foreground">
            Choisissez un port de départ et d’arrivée : les jours de départ s’affichent aussitôt.
          </p>
        ) : !outboundDate ? (
          <p className="rounded-xl bg-secondary px-3 py-3 text-sm text-muted-foreground">
            Choisissez une date d’aller (les jours avec départ sont proposés ci-dessus).
          </p>
        ) : (
          <LegResults
            title={`Aller · ${formatDayKey(outboundDate, { weekday: "long", day: "numeric", month: "long" })}`}
            note={fromZoneLabel}
            options={outboundResults}
            traveler={traveler}
            selection={selection}
            onSelect={onSelect}
            emptyText={`Aucune traversée ${portName(fromId)} → ${portName(toId)} ce jour-là.`}
            nextDays={outboundDays}
            onPickDay={setOutboundDate}
          />
        )}
        {tripMode === "roundtrip" && returnDate && effectiveReturnFrom && effectiveReturnTo ? (
          <LegResults
            title={`Retour · ${formatDayKey(returnDate, { weekday: "long", day: "numeric", month: "long" })}`}
            note={returnZoneLabel}
            options={returnResults}
            traveler={traveler}
            selection={selection}
            onSelect={onSelect}
            emptyText={`Aucune traversée ${portName(effectiveReturnFrom)} → ${portName(effectiveReturnTo)} ce jour-là.`}
            nextDays={returnDays}
            onPickDay={setReturnDate}
          />
        ) : null}
        {outboundDate && returnDate ? (
          <p className="text-xs text-muted-foreground">
            Séjour de{" "}
            {Math.round(
              (new Date(`${returnDate}T00:00:00Z`).getTime() -
                new Date(`${outboundDate}T00:00:00Z`).getTime()) /
                86400000,
            )}{" "}
            jours.
          </p>
        ) : null}
      </section>

      {/* 4. VACANCES SCOLAIRES */}
      <details className="group rounded-2xl border border-border bg-card" open={zone !== null}>
        <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Backpack className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              Partir pendant les vacances scolaires
            </span>
            <span className="block text-xs text-muted-foreground">
              Calendrier français 2026–2027, zones A, B, C
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {(["A", "B", "C"] as SchoolZone[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={zone === item}
                onClick={() => setZone(zone === item ? null : item)}
                className={`h-9 rounded-full border px-3 text-xs font-bold transition ${zone === item ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}
              >
                Zone {item}
              </button>
            ))}
            <Select value={String(flexDays)} onValueChange={(value) => setFlexDays(Number(value))}>
              <SelectTrigger
                className="batogo-control h-9 w-[110px] text-xs"
                aria-label="Souplesse sur les dates"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 3, 5, 7].map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    ± {days} jour{days > 1 ? "s" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!fromId && !toId ? (
            <div
              className="batogo-tabbar grid grid-cols-2 gap-1 p-1"
              role="radiogroup"
              aria-label="Sens du voyage"
            >
              {(
                [
                  ["toAlgeria", "Europe → Algérie"],
                  ["fromAlgeria", "Algérie → Europe"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={direction === value}
                  data-active={direction === value}
                  onClick={() => setDirection(value)}
                  className="batogo-tab"
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Propositions limitées à votre trajet : {portName(fromId) || "tout départ"} →{" "}
              {portName(toId) || "toute arrivée"}.
            </p>
          )}

          {zone ? (
            holidaySuggestions.length ? (
              holidaySuggestions.map(({ period, outbound, inbound }) => (
                <div key={period.name} className="space-y-2">
                  <p className="text-sm font-semibold">
                    {period.name} · zone {zone}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({formatDayKey(period.start, { day: "numeric", month: "short" })} →{" "}
                      {formatDayKey(period.end, { day: "numeric", month: "short" })})
                    </span>
                  </p>
                  <SuggestionList
                    title="Aller, autour du début"
                    options={outbound}
                    onPick={pickOutbound}
                    isPicked={(option) =>
                      option.from.id === fromId &&
                      option.to.id === toId &&
                      dayKey(option) === outboundDate
                    }
                  />
                  {tripMode === "roundtrip" ? (
                    <SuggestionList
                      title="Retour, autour de la fin"
                      options={inbound}
                      onPick={pickReturn}
                      isPicked={(option) =>
                        option.from.id === effectiveReturnFrom &&
                        option.to.id === effectiveReturnTo &&
                        dayKey(option) === returnDate
                      }
                    />
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">
                Aucune traversée connue autour des vacances de la zone {zone} pour ce trajet.
                Augmentez la souplesse ou changez de ports.
              </p>
            )
          ) : null}
        </div>
      </details>

      {/* 5. VOYAGEURS ET VÉHICULE */}
      <div className="rounded-2xl border border-border bg-card">
        <button
          type="button"
          aria-expanded={profileOpen}
          onClick={() => setProfileOpen((open) => !open)}
          className="flex w-full items-center gap-3 px-3 py-3 text-left"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Voyageurs et véhicule</span>
            <span className="block truncate text-xs text-muted-foreground">
              {summarizePassengers(profile.passengers)} · {summarizeVehicle(profile)}
            </span>
          </span>
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${profileOpen ? "rotate-180" : ""}`}
          />
        </button>
        {profileOpen ? (
          <div className="border-t px-3 pb-3 pt-3">
            <TripProfile value={profile} onChange={setProfile} />
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Ces informations servent à recommander les horaires les plus confortables (par exemple
              éviter les départs de nuit avec des enfants) et à préparer votre réservation. Les
              tarifs ne sont pas encore comparés.
            </p>
          </div>
        ) : null}
      </div>

      {fromId || toId || zone ? (
        <button
          type="button"
          onClick={reset}
          className="w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Recommencer
        </button>
      ) : null}
    </div>
  );
}

function DateWithDays({
  label,
  value,
  min,
  onChange,
  days,
  ready,
}: {
  label: string;
  value: string;
  min: string;
  onChange: (value: string) => void;
  days: string[];
  ready: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="grid gap-1">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <Input
          type="date"
          min={min}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="batogo-control h-11"
        />
      </label>
      {ready ? (
        days.length ? (
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Prochains jours avec départ :</p>
            <div className="flex flex-wrap gap-1.5">
              {days.map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={day === value}
                  onClick={() => onChange(day)}
                  className={`h-8 rounded-full border px-2.5 text-xs font-semibold transition ${day === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-secondary"}`}
                >
                  {formatDayKey(day)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Aucun départ connu à venir sur ce trajet.</p>
        )
      ) : null}
    </div>
  );
}

function LegResults({
  title,
  note,
  options,
  traveler,
  selection,
  onSelect,
  emptyText,
  nextDays,
  onPickDay,
}: {
  title: string;
  note: string;
  options: LegOption[];
  traveler: TravelerType;
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  emptyText: string;
  nextDays: string[];
  onPickDay: (day: string) => void;
}) {
  const best =
    options.length > 1
      ? options.reduce((acc, option) => (option.score < acc.score ? option : acc), options[0]!)
      : null;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
      {options.length === 0 ? (
        <div className="rounded-xl bg-secondary px-3 py-3 text-sm text-muted-foreground">
          {emptyText}
          {nextDays.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {nextDays.slice(0, 4).map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => onPickDay(day)}
                  className="h-8 rounded-full border border-border bg-background px-2.5 text-xs font-semibold text-foreground hover:bg-card"
                >
                  {formatDayKey(day)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        options.map((option) => {
          const selected = selection?.type === "departure" && selection.id === option.departure.id;
          return (
            <article
              key={option.departure.id}
              className={`batogo-departure-card p-3 ${selected ? "border-primary" : ""}`}
            >
              <button
                type="button"
                onClick={() => onSelect({ type: "departure", id: option.departure.id })}
                className="block w-full text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xl font-bold tabular-nums text-foreground">
                    {option.departureTime}
                  </span>
                  {best && best.departure.id === option.departure.id ? (
                    <span
                      className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success"
                      title={
                        traveler === "family"
                          ? "Horaire adapté aux familles et traversée la plus courte"
                          : "Traversée la plus courte à un horaire confortable"
                      }
                    >
                      Recommandé
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                  {option.from.name} <ArrowRight className="size-3.5 text-primary" />{" "}
                  {option.to.name}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Ship className="size-3.5" aria-hidden /> {option.company?.name ?? "Compagnie"}
                  </span>
                  <span>
                    Durée{" "}
                    {formatDuration(
                      option.departure.duration_minutes ?? option.route.typical_duration_minutes,
                    )}
                  </span>
                  {option.arrivalLabel ? (
                    <span>Arrivée {option.arrivalLabel} (heure locale)</span>
                  ) : null}
                </div>
              </button>
              <div className="mt-3">
                <BookingLink company={option.company} compact />
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}

function SuggestionList({
  title,
  options,
  onPick,
  isPicked,
}: {
  title: string;
  options: LegOption[];
  onPick: (option: LegOption) => void;
  isPicked: (option: LegOption) => boolean;
}) {
  if (!options.length)
    return <p className="text-xs text-muted-foreground">{title} : aucune traversée connue.</p>;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{title}</p>
      <div className="grid gap-1.5">
        {options.map((option) => {
          const picked = isPicked(option);
          const day = dateKeyInZone(option.departure.departure_at, portTimeZone(option.from));
          return (
            <button
              key={option.departure.id}
              type="button"
              aria-pressed={picked}
              onClick={() => onPick(option)}
              className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition ${picked ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/50 hover:bg-muted"}`}
            >
              <span className="min-w-0">
                <span className="block font-semibold">
                  {formatDayKey(day)} · {option.departureTime}
                </span>
                <span className="block truncate text-muted-foreground">
                  {option.from.name} → {option.to.name} · {option.company?.name ?? "Compagnie"}
                </span>
              </span>
              <span className="shrink-0 font-semibold text-primary">
                {picked ? "Choisi" : "Choisir"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
