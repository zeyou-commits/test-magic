import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Anchor, ArrowRight, Car, CarFront, ChevronLeft, ChevronRight, Clock3, Fuel, LocateFixed, MapPin, Minus, Plus, Ship, Sparkles, Wallet } from "lucide-react";
import { companiesQuery, portsQuery, routesQuery, upcomingDeparturesQuery } from "@/lib/ferry/queries";
import { buildSailings } from "@/lib/ferry/trips";
import { calculateRoadAccess, searchItineraryAddress } from "@/lib/ferry/itinerary.functions";
import { buildItineraryOptions, distinctItineraries, type ItineraryMapPreview, type ItineraryPriority } from "@/lib/ferry/itinerary";
import { calculateRoadGeometry } from "@/lib/ferry/itinerary.functions";
import { bookingSite, bookingUrl } from "@/lib/ferry/booking";
import { estimateFare, estimateFerryFare, estimateVehicleFare, formatFareRange, priceSeason } from "@/lib/ferry/pricing";
import { routeArc } from "@/lib/ferry/geo";
import { defaultTripProfile, VEHICLES, type VehicleKind } from "@/components/panel/TripProfile";

type RoadAccess = Awaited<ReturnType<typeof calculateRoadAccess>>;

const priorities: { id: ItineraryPriority; label: string; icon: typeof Wallet }[] = [
  { id: "recommended", label: "Recommandé", icon: Sparkles },
  { id: "cost", label: "Moins cher", icon: Wallet },
  { id: "time", label: "Plus rapide", icon: Clock3 },
];

const numberFormat = new Intl.NumberFormat("fr-FR");
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const seasonLabel = { calme: "Basse", intermediaire: "Moyenne", forte: "Haute", pointe: "Pic" } as const;
const seasonHeight = { calme: "h-3", intermediaire: "h-5", forte: "h-7", pointe: "h-9" } as const;

function PassengerControl({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (value: number) => void }) {
  return <div className="flex min-w-0 items-center justify-between rounded-xl border border-border bg-white px-2 py-1.5"><span className="text-xs font-semibold">{label}</span><span className="flex items-center gap-2"><button type="button" aria-label={`Retirer un ${label.toLowerCase().slice(0, -1)}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="grid size-7 place-items-center rounded-full border border-border disabled:opacity-40"><Minus className="size-3.5" /></button><span className="min-w-3 text-center text-sm font-bold">{value}</span><button type="button" aria-label={`Ajouter un ${label.toLowerCase().slice(0, -1)}`} disabled={value >= 9} onClick={() => onChange(value + 1)} className="grid size-7 place-items-center rounded-full border border-border disabled:opacity-40"><Plus className="size-3.5" /></button></span></div>;
}

function JourneyGuide() {
  const steps = [
    { label: "Chez vous", symbol: <MapPin className="size-4" aria-hidden /> },
    { label: "Port de départ", symbol: <Anchor className="size-4" aria-hidden /> },
    { label: "Port d’arrivée", symbol: <Anchor className="size-4" aria-hidden /> },
    { label: "Destination", symbol: <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true"><path d="M4 3v18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M5 4h16v11H5z" fill="#fff" stroke="currentColor" strokeWidth="1"/><path d="M5 4h4v3H5zm8 0h4v3h-4zM9 7h4v3H9zm8 0h4v3h-4zM5 10h4v3H5zm8 0h4v3h-4z" fill="currentColor"/></svg> },
  ];
  return <div className="bw-journey-guide" aria-label="Votre trajet : de chez vous au port, traversée en ferry, puis route vers votre destination">
    <div className="bw-journey-guide__track" aria-hidden />
    <span className="bw-journey-guide__vehicle bw-journey-guide__vehicle--first" aria-hidden><span className="bw-journey-guide__bags"><span /><span /><span /></span><Car className="size-5" /></span>
    <span className="bw-journey-guide__vehicle bw-journey-guide__vehicle--ship" aria-hidden><Ship className="size-5" /></span>
    <span className="bw-journey-guide__vehicle bw-journey-guide__vehicle--last" aria-hidden><span className="bw-journey-guide__bags"><span /><span /><span /></span><Car className="size-5" /></span>
    {steps.map(({ symbol, label }) => <div key={label} className="bw-journey-guide__step"><span className="bw-journey-guide__icon">{symbol}</span><span>{label}</span></div>)}
  </div>;
}

function AddressField({ label, placeholder, value, onChange, point, onPointChange, countryCode, onLocate, locating }: {
  label: string; placeholder: string; value: string; onChange: (value: string) => void;
  point: [number, number] | null; onPointChange: (point: [number, number] | null) => void; countryCode?: "DZ";
  onLocate?: () => void; locating?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<{ label: string; point: [number, number] }[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (point || value.trim().length < 3) { setSuggestions([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setPending(true);
      void searchItineraryAddress({ data: { query: value.trim(), countryCode } })
        .then((results) => { if (!cancelled) setSuggestions(results); })
        .catch(() => { if (!cancelled) setSuggestions([]); })
        .finally(() => { if (!cancelled) setPending(false); });
    }, 450);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [value, point, countryCode]);
  return <div className="relative text-sm font-semibold"><label className="block" htmlFor={`itinerary-${countryCode ?? "origin"}`}>{label}</label>
    <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-white px-3 focus-within:ring-2 focus-within:ring-primary/30"><MapPin className="size-4 shrink-0 text-primary" aria-hidden /><input id={`itinerary-${countryCode ?? "origin"}`} className="min-h-11 w-full min-w-0 outline-none" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open && suggestions.length > 0} placeholder={placeholder} value={value} onChange={(event) => { onChange(event.target.value); onPointChange(null); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)} required minLength={5} />{onLocate && <button type="button" onClick={onLocate} disabled={locating} aria-label={locating ? "Localisation en cours" : "Utiliser ma position"} title="Utiliser ma position" className="grid size-8 shrink-0 place-items-center rounded-lg text-primary hover:bg-primary/10 disabled:opacity-50"><LocateFixed className="size-4" aria-hidden /></button>}</div>
    {pending && <span className="mt-1 block text-xs font-normal text-muted-foreground">Recherche d’adresses…</span>}
    {open && suggestions.length > 0 && <span role="listbox" className="absolute z-50 mt-1 block max-h-56 w-full overflow-auto rounded-xl border border-border bg-white p-1 shadow-xl">{suggestions.map((item, index) => <button key={`${item.point.join(",")}-${index}`} type="button" role="option" aria-selected={false} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-secondary focus:bg-secondary" onPointerDown={(event) => event.preventDefault()} onClick={() => { onChange(item.label); onPointChange(item.point); setSuggestions([]); setOpen(false); }}>{item.label}</button>)}</span>}
  </div>;
}

export function ItineraryPlanner({ onClose, onPreview, onResultsReady }: { onClose: () => void; onPreview: (preview: ItineraryMapPreview | null) => void; onResultsReady?: () => void }) {
  const { data: ports = [], isPending: portsPending } = useQuery(portsQuery);
  const { data: routes = [], isPending: routesPending } = useQuery(routesQuery);
  const { data: departures = [], isPending: departuresPending } = useQuery(upcomingDeparturesQuery());
  const { data: companies = [] } = useQuery(companiesQuery);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originPoint, setOriginPoint] = useState<[number, number] | null>(null);
  const [destinationPoint, setDestinationPoint] = useState<[number, number] | null>(null);
  const [period, setPeriod] = useState(() => monthKey(new Date()));
  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() + index); return { key: monthKey(date), label: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(date), season: priceSeason(`${monthKey(date)}-15`) }; }), []);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<VehicleKind>("sedan");
  const vehicleScrollRef = useRef<HTMLDivElement>(null);
  const vehicleDragRef = useRef<{ x: number; left: number; dragged: boolean } | null>(null);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [consumption, setConsumption] = useState(7);
  const [fuelPrice, setFuelPrice] = useState(1.8);
  const [tollRate, setTollRate] = useState(0.06);
  const [priority, setPriority] = useState<ItineraryPriority>("recommended");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [roadAccess, setRoadAccess] = useState<RoadAccess | null>(null);
  const [searchStartedAt, setSearchStartedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [geometryNote, setGeometryNote] = useState<string | null>(null);
  const geometryCache = useRef(new Map<string, { toPort: [number, number][]; fromPort: [number, number][] }>());

  useEffect(() => {
    const scroller = vehicleScrollRef.current;
    const selectedVehicle = scroller?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!scroller || !selectedVehicle) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const selectedRect = selectedVehicle.getBoundingClientRect();
    scroller.scrollBy({ left: (selectedRect.left + selectedRect.right - scrollerRect.left - scrollerRect.right) / 2, behavior: "smooth" });
  }, [vehicle]);

  const relevantRoutes = useMemo(() => routes.filter((route) => {
    const from = ports.find((port) => port.id === route.departure_port_id);
    const to = ports.find((port) => port.id === route.arrival_port_id);
    return from?.status === "active" && to?.status === "active" && from.country_code !== "DZ" && to.country_code === "DZ";
  }), [ports, routes]);
  const departurePortIds = new Set(relevantRoutes.map((route) => route.departure_port_id));
  const arrivalPortIds = new Set(relevantRoutes.map((route) => route.arrival_port_id));
  const departurePorts = ports.filter((port) => departurePortIds.has(port.id));
  const arrivalPorts = ports.filter((port) => arrivalPortIds.has(port.id));
  const sailings = useMemo(() => buildSailings(departures, relevantRoutes, ports, companies, []), [departures, relevantRoutes, ports, companies]);
  const profile = useMemo(() => ({
    ...defaultTripProfile,
    vehicle,
    passengers: { ...defaultTripProfile.passengers, adults, children },
  }), [vehicle, adults, children]);
  const options = useMemo(() => roadAccess && searchStartedAt !== null
    ? buildItineraryOptions(sailings.filter((sailing) => sailing.dayKey.startsWith(period)), roadAccess.toDeparturePorts, roadAccess.fromArrivalPorts, searchStartedAt, (sailing) => estimateFare(sailing, profile), consumption, fuelPrice, tollRate)
    : [], [sailings, roadAccess, searchStartedAt, profile, consumption, fuelPrice, tollRate, period]);
  const sorted = useMemo(() => distinctItineraries(options, priority, children), [options, priority, children]);
  const selected = sorted.find((option) => option.sailing.departure.id === selectedId) ?? sorted[0];
  const previewed = sorted.find((option) => option.sailing.departure.id === hoveredId) ?? selected;
  const alternativeKey = sorted.slice(0, 6).map((option) => option.sailing.route.id).join("|");

  useEffect(() => {
    if (!previewed || !roadAccess) { onPreview(null); return; }
    const id = previewed.sailing.departure.id;
    const departurePort: [number, number] = [previewed.sailing.from.longitude, previewed.sailing.from.latitude];
    const arrivalPort: [number, number] = [previewed.sailing.to.longitude, previewed.sailing.to.latitude];
    const alternatives: [number, number][][] = [];
    const seen = new Set([`${previewed.sailing.from.id}|${previewed.sailing.to.id}`]);
    for (const option of sorted.slice(0, 6)) {
      const pair = `${option.sailing.from.id}|${option.sailing.to.id}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      const from: [number, number] = [option.sailing.from.longitude, option.sailing.from.latitude];
      const to: [number, number] = [option.sailing.to.longitude, option.sailing.to.latitude];
      alternatives.push([roadAccess.originPoint, from], routeArc(option.sailing.from, option.sailing.to), [to, roadAccess.destinationPoint]);
    }
    let cancelled = false;
    const show = (roadToPort: [number, number][], roadFromPort: [number, number][], roadDetailed: boolean) => {
      if (cancelled) return;
      onPreview({ key: Date.now() + Math.random(), fit: !hoveredId, routeId: previewed.sailing.route.id, origin: roadAccess.originPoint, destination: roadAccess.destinationPoint,
        departurePort, arrivalPort, roadToPort, roadDetailed, ferry: routeArc(previewed.sailing.from, previewed.sailing.to), roadFromPort, alternatives });
    };
    show([roadAccess.originPoint, departurePort], [arrivalPort, roadAccess.destinationPoint], false);
    if (hoveredId && hoveredId !== selected?.sailing.departure.id) return () => { cancelled = true; };
    if (roadAccess.roadMode === "estimate") {
      setGeometryNote("OSRM indisponible : trajet approximatif affiché en pointillés. Distances et durées estimées.");
      return () => { cancelled = true; };
    }
    const cached = geometryCache.current.get(id);
    if (cached) { show(cached.toPort, cached.fromPort, true); return () => { cancelled = true; }; }
    setGeometryNote("Tracé routier en cours de chargement…");
    void calculateRoadGeometry({ data: {
      origin: roadAccess.originPoint, destination: roadAccess.destinationPoint, departurePort, arrivalPort,
    } }).then((geometry) => {
      if (cancelled) return;
      geometryCache.current.set(id, geometry);
      show(geometry.toPort, geometry.fromPort, true);
      setGeometryNote(null);
    }).catch(() => {
      if (!cancelled) setGeometryNote("Tracé routier indisponible : le trajet approximatif reste affiché, sans modifier l'estimation de cette option.");
    });
    return () => { cancelled = true; };
  }, [previewed?.sailing.departure.id, selected?.sailing.departure.id, hoveredId, alternativeKey, roadAccess, onPreview]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRoadAccess(null);
    geometryCache.current.clear();
    const timestamp = Math.max(Date.now(), Date.parse(`${period}-01T00:00:00`));
    if (!Number.isFinite(timestamp)) {
      setError("Choisissez une période de départ.");
      return;
    }
    if (!departurePorts.length || !arrivalPorts.length) {
      setError("Aucune liaison Europe–Algérie active n'est disponible pour cette comparaison.");
      return;
    }
    setLoading(true);
    try {
      const roads = await calculateRoadAccess({ data: {
        origin, destination, originPoint: originPoint ?? undefined, destinationPoint: destinationPoint ?? undefined,
        departurePorts: departurePorts.map(({ id, longitude, latitude }) => ({ id, longitude, latitude })),
        arrivalPorts: arrivalPorts.map(({ id, longitude, latitude }) => ({ id, longitude, latitude })),
      } });
      setSelectedId(null);
      setSearchStartedAt(timestamp);
      setRoadAccess(roads);
      setFiltersOpen(false);
      onResultsReady?.();
      requestAnimationFrame(() => document.querySelector(".batogo-panel-scroll")?.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le calcul n'a pas pu aboutir. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  function locateOrigin() {
    if (!navigator.geolocation) { setLocationError("La géolocalisation n’est pas disponible sur cet appareil."); return; }
    setLocationError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setLocating(false);
      if (coords.longitude < -12 || coords.longitude > 36 || coords.latitude < 35 || coords.latitude > 72) {
        setLocationError("Votre position est hors de la zone Europe–Algérie. Saisissez une adresse de départ en Europe.");
        return;
      }
      setOriginPoint([coords.longitude, coords.latitude]);
      setOrigin("Ma position actuelle");
    }, () => { setLocating(false); setLocationError("Position indisponible. Saisissez votre adresse de départ."); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }

  return (
    <section id="itineraire" className="min-h-full bg-[#fffdf8]">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-[#e9f3ef] px-4 py-2.5">
        <div>
          <h2 className="font-display text-base font-bold uppercase tracking-tight text-foreground sm:text-lg">Le trajet porte à porte</h2>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-primary">Fermer</button>
      </div>
      {roadAccess && !filtersOpen && <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5"><p className="min-w-0 truncate text-xs font-medium text-muted-foreground">{roadAccess.origin} → {roadAccess.destination} · {period} · {vehicle === "sedan" ? "Berline" : VEHICLES.find((item) => item.id === vehicle)?.label}</p><button type="button" onClick={() => setFiltersOpen(true)} className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-primary">Modifier</button></div>}
      <form onSubmit={(event) => void submit(event)} hidden={!filtersOpen} className="space-y-3 p-4">
        <JourneyGuide />
        <div className="grid gap-3">
          <AddressField label="Votre adresse de départ" placeholder="Ex. 12 rue de Lyon, Paris, France" value={origin} onChange={setOrigin} point={originPoint} onPointChange={setOriginPoint} onLocate={locateOrigin} locating={locating} />
          {locationError && <p role="status" className="text-xs text-destructive">{locationError}</p>}
          <AddressField label="Votre destination finale en Algérie" placeholder="Ex. rue Didouche Mourad, Alger" value={destination} onChange={setDestination} point={destinationPoint} onPointChange={setDestinationPoint} countryCode="DZ" />
        </div>
        <div className="grid gap-3">
          <fieldset><legend className="text-sm font-semibold">Période de départ <span className="font-normal text-muted-foreground">· prix indicatifs</span></legend><div className="mt-2 flex gap-1.5 overflow-x-auto pb-2 touch-pan-x" aria-label="Choisir le mois de départ">{months.map((month) => <button key={month.key} type="button" aria-pressed={period === month.key} onClick={() => setPeriod(month.key)} className={`flex min-w-12 shrink-0 flex-col items-center rounded-lg border px-1 py-1.5 text-[10px] transition-colors ${period === month.key ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-muted-foreground"}`}><span className={`mb-1 w-4 rounded-t-sm ${seasonHeight[month.season]} ${month.season === "pointe" ? "bg-orange-500" : month.season === "forte" ? "bg-amber-500" : month.season === "intermediaire" ? "bg-teal-500" : "bg-primary/50"}`} aria-hidden /><strong>{month.label}</strong><span>{seasonLabel[month.season]}</span></button>)}</div><a href="/barometre-prix" className="text-[11px] font-semibold text-primary underline underline-offset-2">Comprendre les saisons et les prix</a></fieldset>
          <fieldset className="min-w-0 max-w-full">
            <legend className="text-sm font-semibold">Votre voiture</legend>
            <div className="mb-1 flex items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground">Glissez pour choisir</span><span className="flex gap-1"><button type="button" aria-label="Véhicules précédents" onClick={() => vehicleScrollRef.current?.scrollBy({ left: -150, behavior: "smooth" })} className="grid size-7 place-items-center rounded-full border border-border bg-white text-primary"><ChevronLeft className="size-3.5" /></button><button type="button" aria-label="Véhicules suivants" onClick={() => vehicleScrollRef.current?.scrollBy({ left: 150, behavior: "smooth" })} className="grid size-7 place-items-center rounded-full border border-border bg-white text-primary"><ChevronRight className="size-3.5" /></button></span></div>
            <div ref={vehicleScrollRef} role="group" aria-label="Choisir votre véhicule" className="max-w-full overflow-x-auto overscroll-x-contain pb-2 touch-pan-x cursor-grab select-none [scrollbar-width:thin] active:cursor-grabbing" onPointerDown={(event) => { if (event.pointerType === "touch") return; vehicleDragRef.current = { x: event.clientX, left: event.currentTarget.scrollLeft, dragged: false }; }} onPointerMove={(event) => { const drag = vehicleDragRef.current; if (!drag) return; const delta = event.clientX - drag.x; if (Math.abs(delta) > 5 && !drag.dragged) { drag.dragged = true; event.currentTarget.setPointerCapture(event.pointerId); } if (drag.dragged) event.currentTarget.scrollLeft = drag.left - delta; }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { vehicleDragRef.current = null; }} onClickCapture={(event) => { if (vehicleDragRef.current?.dragged) { event.preventDefault(); event.stopPropagation(); } vehicleDragRef.current = null; }}>
              <div className="flex w-max min-w-full justify-center gap-1.5 px-1">{VEHICLES.filter((item) => item.id !== "none").map(({ id, Icon, label, hint }) => <button key={id} type="button" aria-pressed={vehicle === id} title={hint} onClick={() => setVehicle(id)} className={`flex min-h-14 w-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 py-1 text-center text-[11px] font-semibold transition-colors ${vehicle === id ? "border-primary bg-primary text-white" : "border-border bg-white text-foreground hover:border-primary/50"}`}><Icon className="size-4" aria-hidden />{label}</button>)}</div>
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-2"><PassengerControl label="Adultes" value={adults} min={1} onChange={setAdults} /><PassengerControl label="Enfants" value={children} min={0} onChange={setChildren} /></div>
        </div>
        <details className="rounded-xl border border-border bg-white px-4 py-3 text-sm"><summary className="cursor-pointer font-semibold text-primary">Ajuster les hypothèses de coût routier</summary><div className="mt-4 grid gap-3 sm:grid-cols-3"><label>Consommation · L/100 km<input type="number" min={1} max={30} step={0.1} className="mt-1 block w-full rounded-lg border p-2" value={consumption} onChange={(event) => setConsumption(Number(event.target.value))} /></label><label>Carburant · €/L<input type="number" min={0.5} max={5} step={0.01} className="mt-1 block w-full rounded-lg border p-2" value={fuelPrice} onChange={(event) => setFuelPrice(Number(event.target.value))} /></label><label>Provision péages · €/km<input type="number" min={0} max={1} step={0.01} className="mt-1 block w-full rounded-lg border p-2" value={tollRate} onChange={(event) => setTollRate(Number(event.target.value))} /></label></div></details>
        <button type="submit" disabled={loading || portsPending || routesPending || departuresPending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 font-bold text-white transition hover:brightness-110 disabled:opacity-60 sm:w-auto">{loading ? "Calcul en cours…" : "Comparer les itinéraires"}<ArrowRight className="size-4" aria-hidden /></button>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      </form>
      {roadAccess && (
        <div className="border-t border-border px-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="font-display text-xl font-bold">Vos options de voyage</h3><p className="mt-1 text-xs text-muted-foreground">{roadAccess.origin} → {roadAccess.destination} · {sorted.length} itinéraire{sorted.length > 1 ? "s" : ""} distinct{sorted.length > 1 ? "s" : ""} · premier départ atteignable par liaison</p></div><div className="flex flex-wrap gap-1 rounded-xl bg-secondary p-1" aria-label="Classer les itinéraires">{priorities.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={priority === id} onClick={() => { setPriority(id); setSelectedId(null); }} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold ${priority === id ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Icon className="size-3.5" aria-hidden />{label}</button>)}</div></div>
          {geometryNote && <p role="status" className="mt-3 text-xs text-muted-foreground">{geometryNote}</p>}
          {selected && <p className="mt-3 rounded-xl bg-secondary px-3 py-2 text-xs leading-5 text-muted-foreground">Pour l'itinéraire affiché : ferry estimé entre <strong className="text-foreground">{formatFareRange(estimateFerryFare(selected.sailing, profile))}</strong>, voiture comprise. Le total affiché est un repère central, auquel s'ajoute la route. <a href="/barometre-prix" className="font-semibold text-primary underline underline-offset-2">Voir le baromètre et les saisons</a>.</p>}
          {sorted.length === 0 ? <p className="mt-5 rounded-xl bg-secondary p-4 text-sm">Aucune traversée connue pour cette période. Choisissez un autre mois ou consultez les horaires.</p> : <div className="mt-3 grid gap-2">{sorted.slice(0, 6).map((option, index) => <article key={option.sailing.departure.id} role="button" tabIndex={0} aria-label={`Sélectionner ${option.sailing.from.name} vers ${option.sailing.to.name}`} aria-pressed={selected?.sailing.departure.id === option.sailing.departure.id} onMouseEnter={() => setHoveredId(option.sailing.departure.id)} onMouseLeave={() => setHoveredId(null)} onFocus={() => setHoveredId(option.sailing.departure.id)} onBlur={() => setHoveredId(null)} onClick={() => setSelectedId(option.sailing.departure.id)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelectedId(option.sailing.departure.id); } }} className={`cursor-pointer rounded-2xl border bg-white p-3 transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-primary ${selected?.sailing.departure.id === option.sailing.departure.id ? "border-primary ring-2 ring-primary/20" : "border-border"}`}><div className="flex items-start justify-between gap-3"><div><span className="text-[11px] font-bold uppercase tracking-wide text-primary">{index === 0 ? priorities.find((item) => item.id === priority)?.label : `Option ${index + 1}`}</span><h4 className="mt-1 font-display text-lg font-bold">{option.sailing.from.name} <span className="text-primary">→</span> {option.sailing.to.name}</h4><p className="text-xs text-muted-foreground">{option.sailing.company?.name ?? "Compagnie à confirmer"} · {option.sailing.vessel?.name ?? "Navire à confirmer"}</p></div><strong className="whitespace-nowrap text-lg text-primary">~{numberFormat.format(option.totalEuro)} €</strong></div><div className="mt-2 flex items-center gap-2 border-y border-border py-2 text-xs"><CarFront className="size-4 text-primary" aria-hidden /><span>{Math.round(option.originRoad.distanceKm)} km</span><ArrowRight className="size-3 text-muted-foreground" aria-hidden /><Ship className="size-4 text-primary" aria-hidden /><span>{option.sailing.durationMin ? Math.round(option.sailing.durationMin / 60) : "—"} h</span><ArrowRight className="size-3 text-muted-foreground" aria-hidden /><CarFront className="size-4 text-primary" aria-hidden /><span>{Math.round(option.destinationRoad.distanceKm)} km</span></div><div className="mt-2 grid grid-cols-2 gap-1.5 text-xs"><p><span className="block text-muted-foreground">Ferry · départ local</span><strong>{option.sailing.dayKey} · {option.sailing.depTime}</strong></p><p><span className="block text-muted-foreground">Destination · heure locale estimée</span><strong>{new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: option.sailing.toZone }).format(option.arrivalAt)}</strong></p><p><span className="block text-muted-foreground">Voyage porte à porte</span><strong>{Math.floor(option.totalMinutes / 60)} h {option.totalMinutes % 60} min</strong></p><p><span className="block text-muted-foreground">Départ conseillé de chez vous</span><strong>{new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(option.leaveHomeAt)}</strong></p><p><span className="block text-muted-foreground">Conduite totale</span><strong>{Math.round(option.roadKm)} km</strong></p></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Fuel className="size-3.5" aria-hidden />Route ~{option.roadEuro} € · Ferry ~{option.ferryEuro} € (dont voiture ~{estimateVehicleFare(option.sailing, profile)} €)</span><a href={bookingUrl(option.sailing, profile)} target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline underline-offset-2">Voir l'offre {bookingSite(option.sailing)} ↗</a></div></article>)}</div>}
          <p className="mt-5 text-xs leading-5 text-muted-foreground">{roadAccess.roadMode === "osrm" ? "Distances routières : OSRM / OpenStreetMap." : "Distances routières approximatives : distance directe majorée de 32 %, vitesse moyenne de 68 km/h."} En cas d'échec du tracé, la ligne approximative ne modifie pas les coûts et durées déjà calculés. Coût carburant et péages provisionnés selon vos hypothèses ; l'estimation du ferry comprend les voyageurs et le véhicule choisi, mais ne constitue pas un devis. La durée porte à porte commence au départ conseillé de chez vous, inclut 2 h avant l'embarquement et exclut les jours d'attente avant cette date. Conditions routières, frontières et retards non prédits.</p>
        </div>
      )}
    </section>
  );
}
