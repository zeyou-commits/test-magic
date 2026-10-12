import { ArrowLeft, ArrowRight, Check, MapPin, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { UserMenu } from "@/components/layout/UserMenu";
import { Input } from "@/components/ui/input";
import type { Filters, Port, RouteLine } from "@/lib/ferry/types";
import { Button } from "@/components/ui/button";
import { algerianRegion, groupPortsByCountry, normalizeText } from "@/lib/ferry/filtering";

interface MobileMapControlsProps {
  ports: Port[];
  routes: RouteLine[];
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

const COUNTRY_LABEL: Record<string, string> = { FR: "Toute la France", ES: "Toute l’Espagne", IT: "Toute l’Italie", DZ: "Toute l’Algérie" };

function arrivalIds(filters: Filters) {
  return filters.arrivalPortIds?.length ? filters.arrivalPortIds : filters.arrivalPortId ? [filters.arrivalPortId] : [];
}

function summarize(ids: string[], ports: Port[], portById: Map<string, Port>) {
  if (!ids.length) return "Tous les ports";
  if (ids.length === 1) return portById.get(ids[0]!)?.name ?? "1 port";
  const set = new Set(ids);
  const countries = groupPortsByCountry(ports);
  const full = countries.find((c) => c.ports.length === ids.length && c.ports.every((p) => set.has(p.id)));
  if (full) return `${COUNTRY_LABEL[full.code] ?? full.name} (${ids.length})`;
  const regions = new Set(ids.map((id) => portById.get(id)).map((p) => (p ? algerianRegion(p) : null)));
  if (regions.size === 1 && !regions.has(null)) return `Algérie ${[...regions][0]} (${ids.length})`;
  return `${ids.length} ports`;
}

export function MobileMapControls({ ports, routes, filters, onFiltersChange }: MobileMapControlsProps) {
  const [picker, setPicker] = useState<"departure" | "arrival" | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<string[]>([]);
  const activePorts = useMemo(() => ports.filter((port) => port.status === "active"), [ports]);
  const portById = useMemo(() => new Map(activePorts.map((port) => [port.id, port])), [activePorts]);
  const activeRoutes = useMemo(() => routes.filter((r) => r.status === "active"), [routes]);
  const findPort = (name: string) => activePorts.find((port) => normalizeText(port.name) === normalizeText(name));

  const frequentTrips = useMemo(() => {
    const requested = [["Marseille", "Alger"], ["Alicante", "Oran"], ["Sète", "Nador"]] as const;
    return requested.flatMap(([fromName, toName]) => {
      const from = findPort(fromName);
      const to = findPort(toName);
      if (!from || !to) return [];
      return activeRoutes.some((r) => r.departure_port_id === from.id && r.arrival_port_id === to.id) ? [{ from, to }] : [];
    });
  }, [activePorts, activeRoutes]);

  // Ports pertinents : ceux qui ont une ligne active dans le sens choisi, compatibles avec l'autre côté.
  const candidates = useMemo(() => {
    if (picker === "arrival") {
      const from = new Set(filters.departurePortIds);
      const ids = new Set(activeRoutes.filter((r) => !from.size || from.has(r.departure_port_id)).map((r) => r.arrival_port_id));
      return activePorts.filter((p) => ids.has(p.id));
    }
    const to = new Set(arrivalIds(filters));
    const ids = new Set(activeRoutes.filter((r) => !to.size || to.has(r.arrival_port_id)).map((r) => r.departure_port_id));
    return activePorts.filter((p) => ids.has(p.id));
  }, [picker, filters, activeRoutes, activePorts]);

  const groups = useMemo(() => {
    const term = normalizeText(query);
    const list = candidates.filter((p) => !term || normalizeText(`${p.name} ${p.city ?? ""} ${p.country_name}`).includes(term));
    return groupPortsByCountry(list);
  }, [candidates, query]);

  const shortcuts = useMemo(() => {
    const out: { key: string; label: string; ids: string[] }[] = [];
    groupPortsByCountry(candidates).forEach((c) => {
      if (c.ports.length > 1) out.push({ key: c.code, label: COUNTRY_LABEL[c.code] ?? c.name, ids: c.ports.map((p) => p.id) });
      if (c.code === "DZ") {
        (["Ouest", "Centre", "Est"] as const).forEach((region) => {
          const ids = c.ports.filter((p) => algerianRegion(p) === region).map((p) => p.id);
          if (ids.length) out.push({ key: `DZ-${region}`, label: `Algérie ${region}`, ids });
        });
      }
    });
    return out;
  }, [candidates]);

  const openPicker = (next: "departure" | "arrival") => {
    setQuery("");
    setDraft(next === "departure" ? filters.departurePortIds : arrivalIds(filters));
    setPicker(next);
  };

  const toggle = (ids: string[]) => {
    setDraft((current) => {
      const set = new Set(current);
      const allIn = ids.every((id) => set.has(id));
      ids.forEach((id) => (allIn ? set.delete(id) : set.add(id)));
      return [...set];
    });
  };

  const apply = () => {
    if (picker === "departure") {
      onFiltersChange({ ...filters, departurePortIds: draft, departurePortId: draft.length === 1 ? draft[0]! : null });
    } else {
      onFiltersChange({ ...filters, arrivalPortIds: draft, arrivalPortId: draft.length === 1 ? draft[0]! : null });
    }
    setPicker(null);
  };

  const chooseTrip = (from: Port, to: Port) => {
    onFiltersChange({ ...filters, departurePortId: from.id, departurePortIds: [from.id], arrivalPortId: to.id, arrivalPortIds: [to.id] });
    setPicker(null);
  };

  const draftSet = new Set(draft);

  return (
    <div className={`pointer-events-auto absolute inset-x-0 top-0 w-full p-2 md:hidden ${picker ? "z-[90]" : "z-40"}`}>
      <div className="grid h-14 grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-1.5 rounded-xl border bg-background/95 px-2 shadow-md backdrop-blur-md">
        <Link to="/" aria-label="Accueil Batogo" className="grid size-8 place-items-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground shadow-md">
          B
        </Link>
        <Button type="button" variant="ghost" onClick={() => openPicker("departure")} className="h-11 min-w-0 justify-start rounded-lg px-2 text-left hover:bg-secondary/70">
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase text-muted-foreground">Départ</span>
            <span className="block truncate text-xs font-semibold">{summarize(filters.departurePortIds, activePorts, portById)}</span>
          </span>
        </Button>
        <Button type="button" variant="ghost" onClick={() => openPicker("arrival")} className="h-11 min-w-0 justify-start rounded-lg px-2 text-left hover:bg-secondary/70">
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase text-muted-foreground">Arrivée</span>
            <span className="block truncate text-xs font-semibold">{summarize(arrivalIds(filters), activePorts, portById)}</span>
          </span>
        </Button>
        <UserMenu compact iconOnly />
      </div>

      {picker ? (
        <div className="fixed inset-0 z-[90] flex flex-col bg-background md:hidden" role="dialog" aria-modal="true" aria-label={`Choisir les ports de ${picker === "departure" ? "départ" : "destination"}`}>
          <header className="flex shrink-0 items-center gap-2 border-b px-2 pb-3 pt-[calc(.75rem+env(safe-area-inset-top))]">
            <Button type="button" variant="ghost" size="icon" aria-label="Fermer la recherche" onClick={() => setPicker(null)}>
              <ArrowLeft className="size-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold">{picker === "departure" ? "D’où partez-vous ?" : "Où allez-vous ?"}</p>
              <p className="text-xs text-muted-foreground">Un pays, une façade, un ou plusieurs ports</p>
            </div>
            {draft.length ? <Button type="button" variant="ghost" size="sm" onClick={() => setDraft([])}>Effacer</Button> : null}
          </header>

          <div className="shrink-0 space-y-3 px-4 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une ville, un port ou un pays" className="batogo-control h-12 pl-10 pr-10" />
              {query ? <Button type="button" variant="ghost" size="icon" aria-label="Effacer la recherche" onClick={() => setQuery("")} className="absolute right-1 top-1/2 -translate-y-1/2"><X className="size-4" /></Button> : null}
            </div>

            {shortcuts.length ? (
              <div className="flex flex-wrap gap-2">
                {shortcuts.map((s) => {
                  const on = s.ids.every((id) => draftSet.has(id));
                  return (
                    <Button key={s.key} type="button" size="sm" variant={on ? "default" : "outline"} onClick={() => toggle(s.ids)} className="h-9 rounded-full px-3 text-xs font-semibold">
                      {on ? <Check className="size-3.5" /> : null}{s.label} · {s.ids.length}
                    </Button>
                  );
                })}
              </div>
            ) : null}

            {frequentTrips.length ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {frequentTrips.map(({ from, to }) => (
                  <Button key={`${from.id}-${to.id}`} type="button" variant="secondary" onClick={() => chooseTrip(from, to)} className="h-9 shrink-0 rounded-full px-3 text-xs font-semibold">
                    {from.name}<ArrowRight className="size-3.5" />{to.name}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            {groups.map((group) => (
              <section key={group.code}>
                <p className="sticky top-0 z-10 bg-background py-2 text-xs font-bold uppercase text-muted-foreground">{group.name}</p>
                <div className="divide-y">
                  {group.ports.map((port) => {
                    const selected = draftSet.has(port.id);
                    const region = algerianRegion(port);
                    return (
                      <Button key={port.id} type="button" variant="ghost" aria-pressed={selected} onClick={() => toggle([port.id])} className="h-14 w-full justify-start rounded-none px-1">
                        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${selected ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}>{selected ? <Check className="size-4" /> : <MapPin className="size-4" />}</span>
                        <span className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-semibold">{port.name}</span><span className="block truncate text-xs font-normal text-muted-foreground">{port.city ? `${port.city} · ` : ""}{region ? `Façade ${region}` : port.country_name}</span></span>
                      </Button>
                    );
                  })}
                </div>
              </section>
            ))}
            {!groups.length ? <p className="py-10 text-center text-sm text-muted-foreground">Aucun port ne correspond à votre recherche.</p> : null}
          </div>

          <div className="shrink-0 border-t px-4 pb-[calc(.75rem+env(safe-area-inset-bottom))] pt-3">
            <Button type="button" onClick={apply} className="h-12 w-full rounded-xl text-sm font-bold">
              {draft.length ? `Voir les traversées · ${summarize(draft, activePorts, portById)}` : "Voir tous les ports"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
