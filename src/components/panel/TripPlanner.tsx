import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, ChevronDown, Compass, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { companiesQuery, plannerDeparturesQuery, portsQuery, routesQuery, schedulesQuery } from "@/lib/ferry/queries";
import { getSchoolBreaksForZone, getSchoolBreak, type SchoolZone } from "@/lib/ferry/schoolCalendar";
import type { Departure, Port, RouteLine, Schedule } from "@/lib/ferry/types";
import { formatDuration } from "@/lib/ferry/format";

type TravelerType = "solo" | "couple" | "family";

interface LegRecommendation {
  route: RouteLine;
  schedule: Schedule;
  companyName: string;
  score: number;
}

const ANY = "__any__";
const FRANCE = "FR";
const ALGERIA = "DZ";

const toDate = (value: string) => new Date(`${value}T00:00:00`);

const weekdayFor = (value: string) => {
  const day = toDate(value).getDay();
  return day === 0 ? 7 : day;
};

const formatTime = (value: string) =>
  value.slice(0, 5);

const formatDay = (value: string) =>
  toDate(value).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

function findLeg(
  date: string,
  fromId: string,
  toId: string,
  routes: RouteLine[],
  schedules: Schedule[],
  companyNames: Map<string, string>,
  traveler: TravelerType,
): LegRecommendation | null {
  const weekday = weekdayFor(date);
  const candidates: LegRecommendation[] = [];

  routes
    .filter((route) => route.departure_port_id === fromId && route.arrival_port_id === toId)
    .forEach((route) => {
      schedules
        .filter(
          (schedule) =>
            schedule.route_id === route.id &&
            schedule.status === "active" &&
            schedule.weekdays.includes(weekday) &&
            schedule.valid_from <= date &&
            (!schedule.valid_to || schedule.valid_to >= date),
        )
        .forEach((schedule) => {
          const hour = Number(schedule.departure_time.slice(0, 2)) + Number(schedule.departure_time.slice(3, 5)) / 60;
          const duration = schedule.duration_minutes || route.typical_duration_minutes || 9999;

          let comfortPenalty = 0;
          if (traveler === "family") {
            if (hour < 7) comfortPenalty += 80;
            if (hour >= 22) comfortPenalty += 60;
          } else if (traveler === "couple") {
            if (hour < 6) comfortPenalty += 35;
          } else if (hour < 5) {
            comfortPenalty += 20;
          }

          candidates.push({
            route,
            schedule,
            companyName: companyNames.get(schedule.company_id) ?? "Compagnie",
            score: duration + comfortPenalty,
          });
        });
    });

  return candidates.sort((a, b) => a.score - b.score)[0] ?? null;
}

export function TripPlanner() {
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: schedules = [] } = useQuery(schedulesQuery);
  const { data: departures = [] } = useQuery(plannerDeparturesQuery);
  const { data: companies = [] } = useQuery(companiesQuery);

  const activePorts = useMemo(() => ports.filter((port) => port.status === "active"), [ports]);
  const companyNames = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies]);

  const today = new Date().toISOString().slice(0, 10);
  const defaultOutbound = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const [open, setOpen] = useState(true);
  const [outboundDate, setOutboundDate] = useState(defaultOutbound);
  const [returnDate, setReturnDate] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [returnFromId, setReturnFromId] = useState("");
  const [returnToId, setReturnToId] = useState("");
  const [traveler, setTraveler] = useState<TravelerType>("family");
  const [zone, setZone] = useState<SchoolZone | null>(null);
  const flexDays = 3;
  const [tripMode, setTripMode] = useState<"roundtrip" | "oneway">("roundtrip");
  const [searched, setSearched] = useState(false);

  const suggestedCrossings = useMemo(() => {
    if (!zone) return [];
    return departures.flatMap((departure) => {
      const route = routes.find((item) => item.id === departure.route_id);
      if (!route) return [];
      const from = activePorts.find((port) => port.id === route.departure_port_id);
      const to = activePorts.find((port) => port.id === route.arrival_port_id);
      if (!from || !to) return [];
      if (from.country_code !== FRANCE || to.country_code !== ALGERIA) return [];
      const date = departure.departure_at.slice(0, 10);
      const inWindow = getSchoolBreaksForZone(zone).some((period) => {
        return date >= addDays(period.start, -flexDays) && date <= addDays(period.end, flexDays);
      });
      return inWindow ? [{ departure, route, from, to }] : [];
    }).sort((a, b) => a.departure.departure_at.localeCompare(b.departure.departure_at));
  }, [zone, departures, routes, activePorts]);

  const availableDates = useMemo(() => {
    const ids = new Set<string>();
    departures.forEach((departure) => {
      const route = routes.find((item) => item.id === departure.route_id);
      if (!route) return;
      const from = activePorts.find((port) => port.id === route.departure_port_id);
      const to = activePorts.find((port) => port.id === route.arrival_port_id);
      if (!from || !to) return;
      if (fromId && route.departure_port_id !== fromId) return;
      if (toId && route.arrival_port_id !== toId) return;
      if (!fromId && !toId && zone && (from.country_code !== FRANCE || to.country_code !== ALGERIA)) return;
      ids.add(departure.departure_at.slice(0, 10));
    });
    return ids;
  }, [departures, routes, activePorts, fromId, toId, zone]);

  const suggestedReturnCrossings = useMemo(() => {
    if (!zone) return [];
    const period = getSchoolBreaksForZone(zone).find((item) => {
      const start = addDays(item.start, -flexDays);
      const end = addDays(item.end, flexDays);
      return outboundDate >= start && outboundDate <= end;
    }) ?? getSchoolBreaksForZone(zone)[0];
    if (!period) return [];
    return departures.flatMap((departure) => {
      const route = routes.find((item) => item.id === departure.route_id);
      if (!route) return [];
      const from = activePorts.find((port) => port.id === route.departure_port_id);
      const to = activePorts.find((port) => port.id === route.arrival_port_id);
      if (!from || !to || from.country_code !== ALGERIA || to.country_code !== FRANCE) return [];
      const date = departure.departure_at.slice(0, 10);
      return date >= addDays(period.end, -flexDays) && date <= addDays(period.end, flexDays)
        ? [{ departure, route, from, to }]
        : [];
    }).sort((a, b) => a.departure.departure_at.localeCompare(b.departure.departure_at));
  }, [zone, outboundDate, departures, routes, activePorts]);

  const schoolTravelDates = useMemo(() => suggestedCrossings, [suggestedCrossings]);

  const selectedSchoolPeriod = useMemo(() => {
    if (!zone || !outboundDate) return null;
    return getSchoolBreak(outboundDate, zone);
  }, [zone, outboundDate]);

  const outbound = useMemo(
    () => (searched && fromId && toId && outboundDate ? findActualDeparture(outboundDate, fromId, toId, routes, departures, companyNames, traveler) : null),
    [searched, fromId, toId, outboundDate, routes, departures, companyNames, traveler],
  );

  const inbound = useMemo(
    () =>
      searched && tripMode === "roundtrip" && returnDate && returnFromId && returnToId
        ? findActualDeparture(returnDate, returnFromId, returnToId, routes, departures, companyNames, traveler)
        : null,
    [searched, returnDate, returnFromId, returnToId, routes, departures, companyNames, traveler],
  );

  const schoolInfo = useMemo(() => {
    if (!zone) return null;
    const outboundBreak = getSchoolBreak(outboundDate, zone);
    const returnBreak = returnDate ? getSchoolBreak(returnDate, zone) : null;
    return outboundBreak || returnBreak
      ? { outbound: outboundBreak?.name ?? null, return: returnBreak?.name ?? null }
      : null;
  }, [outboundDate, returnDate, zone]);

  const portName = (id: string) => activePorts.find((port) => port.id === id)?.name ?? "—";

  const submit = () => {
    if (!outboundDate || (!zone && (!fromId || !toId))) return;
    if (tripMode === "roundtrip" && returnDate && (!returnFromId || !returnToId || returnDate < outboundDate)) return;
    setSearched(true);
  };

  return (
    <div className="border-b border-border/70 bg-gradient-to-br from-primary/[0.07] via-background to-secondary/30">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Compass className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Planifier mon voyage</span>
            <span className="block truncate text-[11px] text-muted-foreground">Aller + retour, voyageurs et vacances scolaires</span>
          </span>
        </span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="space-y-4 px-5 pb-4">
          <section className="space-y-2">
            <p className="text-sm font-semibold">Je voyage...</p>
            <div className="grid grid-cols-3 gap-2">
              {([["solo", "Seul"], ["couple", "En couple"], ["family", "En famille"]] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setTraveler(value)}
                  className={`rounded-2xl border p-3 text-center text-xs font-semibold transition ${traveler === value ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background hover:bg-secondary"}`}>
                  <Users className="mx-auto mb-1 size-5" />{label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-sm font-semibold">Vacances scolaires</p>
            <Select value={zone ?? ANY} onValueChange={(value) => { const next = value === ANY ? null : value as SchoolZone; setZone(next); if (next) { const first = suggestedCrossings[0]; const firstReturn = suggestedReturnCrossings[0]; if (first) { setOutboundDate(first.departure.departure_at.slice(0, 10)); setFromId(first.from.id); setToId(first.to.id); } if (firstReturn) { setReturnDate(firstReturn.departure.departure_at.slice(0, 10)); setReturnFromId(firstReturn.from.id); setReturnToId(firstReturn.to.id); } } }}>
              <SelectTrigger className="h-11 bg-background"><SelectValue placeholder="Je ne sais pas / pas concerné" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Je ne sais pas / pas concerné</SelectItem>
                <SelectItem value="A">Zone A</SelectItem><SelectItem value="B">Zone B</SelectItem><SelectItem value="C">Zone C</SelectItem>
              </SelectContent>
            </Select>
          </section>

          <section className="space-y-2">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary/70 p-1">
              <button type="button" onClick={() => { setTripMode("roundtrip"); setReturnDate(returnDate || addDays(outboundDate, 7)); }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${tripMode === "roundtrip" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Aller-retour</button>
              <button type="button" onClick={() => { setTripMode("oneway"); setReturnDate(""); }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${tripMode === "oneway" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Aller simple</button>
            </div>

            {zone ? (
              <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-xs">
                <span className="font-semibold">Itinéraire compris :</span> France → Algérie
              </div>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <PortSelect label="Départ" value={fromId} onChange={setFromId} ports={activePorts} />
                  <PortSelect label="Arrivée" value={toId} onChange={setToId} ports={activePorts.filter((port) => port.id !== fromId)} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <DateField label="Aller" value={outboundDate} min={today} onChange={setOutboundDate} availableDates={availableDates} />
                  {tripMode === "roundtrip" ? <DateField label="Retour" value={returnDate} min={outboundDate || today} onChange={setReturnDate} availableDates={availableDates} /> : null}
                </div>
              </>
            )}
          </section>

          {tripMode === "roundtrip" && returnDate ? (
            <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
              <p className="mb-2 text-xs font-semibold">Itinéraire retour</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <PortSelect label="Départ retour" value={returnFromId} onChange={setReturnFromId} ports={activePorts} />
                <PortSelect label="Arrivée retour" value={returnToId} onChange={setReturnToId} ports={activePorts.filter((port) => port.id !== returnFromId)} />
              </div>
            </div>
          ) : null}

          {zone ? (
            <section className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-3">
              <div className="mb-3">
                <p className="text-sm font-semibold">Dates suggérées pour la Zone {zone}</p>
                <p className="text-[11px] text-muted-foreground">Départ depuis la France · arrivée en Algérie · ± 3 jours autour des vacances</p>
              </div>
              {schoolTravelDates.length ? (
                <div className="space-y-3">
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Aller</p>
                    <div className="space-y-1.5">
                      {schoolTravelDates.slice(0, 8).map(({ departure, from, to }) => {
                        const date = departure.departure_at.slice(0, 10);
                        const selected = date === outboundDate && fromId === from.id && toId === to.id;
                        return <button key={departure.id} type="button" onClick={() => { setOutboundDate(date); setFromId(from.id); setToId(to.id); }}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left ${selected ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-secondary"}`}>
                          <span><span className="block text-xs font-semibold">{formatDay(date)} · {formatTime(departure.departure_at)}</span><span className="block text-[10px] text-muted-foreground">{from.name} → {to.name}</span></span><ArrowRight className="size-4 text-primary" />
                        </button>;
                      })}
                    </div>
                  </div>
                  {tripMode === "roundtrip" ? (
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Retour</p>
                      {suggestedReturnCrossings.length ? <div className="space-y-1.5">
                        {suggestedReturnCrossings.slice(0, 8).map(({ departure, from, to }) => {
                          const date = departure.departure_at.slice(0, 10);
                          const selected = date === returnDate && returnFromId === from.id && returnToId === to.id;
                          return <button key={departure.id} type="button" onClick={() => { setReturnDate(date); setReturnFromId(from.id); setReturnToId(to.id); }}
                            className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left ${selected ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-secondary"}`}>
                            <span><span className="block text-xs font-semibold">{formatDay(date)} · {formatTime(departure.departure_at)}</span><span className="block text-[10px] text-muted-foreground">{from.name} → {to.name}</span></span><ArrowRight className="size-4 text-primary" />
                          </button>;
                        })}
                      </div> : <p className="text-xs text-muted-foreground">Aucun retour Algérie → France trouvé autour de la fin des vacances.</p>}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Aucune traversée France → Algérie trouvée autour des vacances de cette zone.</p>
              )}
            </section>
          ) : null}

          <Button
            type="button"
            className="w-full rounded-xl"
            onClick={submit}
            disabled={!outboundDate || (!zone && (!fromId || !toId)) || Boolean(tripMode === "roundtrip" && returnDate && (!returnFromId || !returnToId || returnDate < outboundDate))}
          >
            <CalendarDays className="size-4" />
            Trouver ma traversée
          </Button>

          {schoolInfo ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs">
              <span className="font-semibold">Calendrier scolaire :</span>{" "}
              {schoolInfo.outbound ? `aller pendant les vacances de ${schoolInfo.outbound}` : ""}
              {schoolInfo.outbound && schoolInfo.return ? " · " : ""}
              {schoolInfo.return ? `retour pendant les vacances de ${schoolInfo.return}` : ""}
            </div>
          ) : null}

          {searched ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Suggestion Batogo</p>
              {outbound ? <Recommendation title="Aller recommandé" leg={outbound} from={portName(fromId)} to={portName(toId)} date={outboundDate} /> : <EmptyRecommendation text="Aucune traversée programmée pour l’aller à cette date." />}
              {tripMode === "roundtrip" && returnDate ? inbound ? <Recommendation title="Retour recommandé" leg={inbound} from={portName(returnFromId)} to={portName(returnToId)} date={returnDate} /> : <EmptyRecommendation text="Aucune traversée programmée pour le retour à cette date." /> : null}
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Recommandation basée sur les horaires disponibles, la durée et le profil voyageur. Les tarifs ne sont pas encore pris en compte.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DateField({ label, value, min, onChange, optional = false, availableDates }: { label: string; value: string; min: string; onChange: (value: string) => void; optional?: boolean; availableDates: Set<string> }) {
  return <label className="grid gap-1"><span className="text-xs font-medium text-muted-foreground">{label}{optional ? " · optionnel" : ""}</span><Input type="date" min={min} value={value} onChange={(event) => onChange(event.target.value)} className="bg-background/70" /><span className="text-[10px] text-muted-foreground">{availableDates.size} date(s) de traversée connues</span></label>;
}

function countDeparturesForDate(date: string, fromId: string, toId: string, routes: RouteLine[], departures: Departure[]) {
  return departures.filter((departure) => {
    if (departure.departure_at.slice(0, 10) !== date) return false;
    const route = routes.find((item) => item.id === departure.route_id);
    return Boolean(route && (!fromId || route.departure_port_id === fromId) && (!toId || route.arrival_port_id === toId));
  }).length;
}

function addDays(value: string, amount: number) { const date = new Date(value + "T00:00:00"); date.setDate(date.getDate() + amount); return date.toISOString().slice(0, 10); }

function findActualDeparture(date: string, fromId: string, toId: string, routes: RouteLine[], departures: Departure[], companyNames: Map<string, string>, traveler: TravelerType): LegRecommendation | null {
  const candidates = departures.filter((departure) => departure.departure_at.slice(0, 10) === date).map((departure) => {
    const route = routes.find((item) => item.id === departure.route_id);
    if (!route || route.departure_port_id !== fromId || route.arrival_port_id !== toId) return null;
    const hour = Number(departure.departure_at.slice(11, 13)) + Number(departure.departure_at.slice(14, 16)) / 60;
    const duration = departure.duration_minutes ?? route.typical_duration_minutes ?? 9999;
    let penalty = 0; if (traveler === "family" && (hour < 7 || hour >= 22)) penalty += 80; else if (traveler === "couple" && hour < 6) penalty += 35; else if (traveler === "solo" && hour < 5) penalty += 20;
    return { route, schedule: { id: departure.id, route_id: route.id, company_id: departure.company_id, default_vessel_id: departure.vessel_id, departure_time: departure.departure_at.slice(11, 19), duration_minutes: duration, weekdays: [], valid_from: date, valid_to: date, status: "active" as const, source_name: departure.source_name, source_url: departure.source_url, last_verified_at: departure.last_verified_at, reliability: departure.reliability, notes: departure.notes, is_demo: departure.is_demo }, companyName: companyNames.get(departure.company_id) ?? "Compagnie", score: duration + penalty };
  }).filter(Boolean) as LegRecommendation[];
  return candidates.sort((a, b) => a.score - b.score)[0] ?? null;
}

function PortSelect({ label, value, onChange, ports }: { label: string; value: string; onChange: (value: string) => void; ports: Port[] }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value || ANY} onValueChange={(next) => onChange(next === ANY ? "" : next)}>
        <SelectTrigger className="bg-background/70"><SelectValue placeholder="Choisir un port" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Choisir un port</SelectItem>
          {ports.map((port) => <SelectItem key={port.id} value={port.id}>{port.name}{port.city ? ` · ${port.city}` : ""}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  );
}

function Recommendation({ title, leg, from, to, date }: { title: string; leg: LegRecommendation; from: string; to: string; date: string }) {
  return (
    <div className="rounded-2xl border border-primary/20 bg-background/85 p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-primary">{title}</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{formatDay(date)}</span>
      </div>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="min-w-0 truncate">{from}</span>
        <ArrowRight className="size-3.5 shrink-0 text-primary" />
        <span className="min-w-0 truncate">{to}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div><span className="block text-muted-foreground">Départ</span><strong>{formatTime(leg.schedule.departure_time)}</strong></div>
        <div><span className="block text-muted-foreground">Durée</span><strong>{formatDuration(leg.schedule.duration_minutes)}</strong></div>
        <div><span className="block text-muted-foreground">Compagnie</span><strong className="block truncate">{leg.companyName}</strong></div>
      </div>
    </div>
  );
}

function EmptyRecommendation({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">{text}</div>;
}
