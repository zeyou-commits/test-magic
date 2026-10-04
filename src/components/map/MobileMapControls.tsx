import { ArrowLeft, ArrowRight, Check, MapPin, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/layout/BrandMark";
import { UserMenu } from "@/components/layout/UserMenu";
import { Input } from "@/components/ui/input";
import type { Filters, Port, RouteLine } from "@/lib/ferry/types";
import { Button } from "@/components/ui/button";

interface MobileMapControlsProps {
  ports: Port[];
  routes: RouteLine[];
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

export function MobileMapControls({ ports, routes, filters, onFiltersChange }: MobileMapControlsProps) {
  const [picker, setPicker] = useState<"departure" | "arrival" | null>(null);
  const [query, setQuery] = useState("");
  const activePorts = useMemo(() => ports.filter((port) => port.status === "active"), [ports]);
  const portById = useMemo(() => new Map(activePorts.map((port) => [port.id, port])), [activePorts]);
  const selectedDeparture = filters.departurePortId ? portById.get(filters.departurePortId) : undefined;
  const selectedArrival = filters.arrivalPortId ? portById.get(filters.arrivalPortId) : undefined;

  const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const findPort = (name: string) => activePorts.find((port) => normalized(port.name) === normalized(name));

  const frequentTrips = useMemo(() => {
    const requested = [["Marseille", "Alger"], ["Alicante", "Oran"], ["Sète", "Nador"]] as const;
    return requested.flatMap(([fromName, toName]) => {
      const from = findPort(fromName);
      const to = findPort(toName);
      if (!from || !to) return [];
      const exists = routes.some((route) => route.status === "active" && route.departure_port_id === from.id && route.arrival_port_id === to.id);
      return exists ? [{ from, to }] : [];
    });
  }, [activePorts, routes]);

  const availablePorts = useMemo(() => {
    const candidates = picker === "arrival" && filters.departurePortId
      ? activePorts.filter((port) => routes.some((route) => route.status === "active" && route.departure_port_id === filters.departurePortId && route.arrival_port_id === port.id))
      : picker === "departure" && filters.arrivalPortId
        ? activePorts.filter((port) => routes.some((route) => route.status === "active" && route.departure_port_id === port.id && route.arrival_port_id === filters.arrivalPortId))
        : activePorts;
    const term = normalized(query.trim());
    return candidates
      .filter((port) => !term || normalized(`${port.name} ${port.city ?? ""} ${port.country_name}`).includes(term))
      .sort((a, b) => a.country_name.localeCompare(b.country_name, "fr") || a.name.localeCompare(b.name, "fr"));
  }, [activePorts, filters.arrivalPortId, filters.departurePortId, picker, query, routes]);

  const openPicker = (next: "departure" | "arrival") => {
    setQuery("");
    setPicker(next);
  };

  const choosePort = (port: Port) => {
    if (picker === "departure") {
      onFiltersChange({ ...filters, departurePortId: port.id, departurePortIds: [port.id] });
    } else {
      onFiltersChange({ ...filters, arrivalPortId: port.id });
    }
    setPicker(null);
  };

  const chooseTrip = (from: Port, to: Port) => {
    onFiltersChange({ ...filters, departurePortId: from.id, departurePortIds: [from.id], arrivalPortId: to.id });
    setPicker(null);
  };

  return (
    <div className={`pointer-events-auto absolute inset-x-0 top-0 w-full p-2 md:hidden ${picker ? "z-[90]" : "z-40"}`}>
      <div className="grid h-14 grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-1.5 rounded-xl border bg-background/95 px-2 shadow-md backdrop-blur-md">
        <Link to="/" aria-label="Accueil Batogo" className="grid size-8 place-items-center">
          <BrandMark className="size-7 text-primary" />
          <span className="sr-only">Batogo</span>
        </Link>
        <Button type="button" variant="ghost" onClick={() => openPicker("departure")} className="h-11 min-w-0 justify-start rounded-lg px-2 text-left hover:bg-secondary/70">
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase text-muted-foreground">Départ</span>
            <span className="block truncate text-xs font-semibold">{selectedDeparture?.name ?? "Choisir"}</span>
          </span>
        </Button>
        <Button type="button" variant="ghost" onClick={() => openPicker("arrival")} className="h-11 min-w-0 justify-start rounded-lg px-2 text-left hover:bg-secondary/70">
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase text-muted-foreground">Arrivée</span>
            <span className="block truncate text-xs font-semibold">{selectedArrival?.name ?? "Choisir"}</span>
          </span>
        </Button>
        <UserMenu compact iconOnly />
      </div>

      {picker ? (
        <div className="fixed inset-0 z-[90] flex flex-col bg-background md:hidden" role="dialog" aria-modal="true" aria-label={`Choisir le port de ${picker === "departure" ? "départ" : "destination"}`}>
          <header className="flex shrink-0 items-center gap-2 border-b px-2 pb-3 pt-[calc(.75rem+env(safe-area-inset-top))]">
            <Button type="button" variant="ghost" size="icon" aria-label="Fermer la recherche" onClick={() => setPicker(null)}>
              <ArrowLeft className="size-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold">{picker === "departure" ? "D’où partez-vous ?" : "Où allez-vous ?"}</p>
              <p className="text-xs text-muted-foreground">Sélectionnez un port pour actualiser la carte</p>
            </div>
          </header>

          <div className="shrink-0 space-y-4 px-4 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une ville, un port ou un pays" className="batogo-control h-12 pl-10 pr-10" />
              {query ? <Button type="button" variant="ghost" size="icon" aria-label="Effacer la recherche" onClick={() => setQuery("")} className="absolute right-1 top-1/2 -translate-y-1/2"><X className="size-4" /></Button> : null}
            </div>

            {frequentTrips.length ? (
              <section>
                <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Recherches fréquentes</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {frequentTrips.map(({ from, to }) => (
                    <Button key={`${from.id}-${to.id}`} type="button" variant="secondary" onClick={() => chooseTrip(from, to)} className="h-10 shrink-0 rounded-full px-3 text-xs font-semibold">
                      {from.name}<ArrowRight className="size-3.5" />{to.name}
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <p className="sticky top-0 z-10 bg-background py-2 text-xs font-bold uppercase text-muted-foreground">Ports disponibles</p>
            <div className="divide-y">
              {availablePorts.map((port) => {
                const selected = picker === "departure" ? filters.departurePortId === port.id : filters.arrivalPortId === port.id;
                return (
                  <Button key={port.id} type="button" variant="ghost" onClick={() => choosePort(port)} className="h-14 w-full justify-start rounded-none px-1">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-primary"><MapPin className="size-4" /></span>
                    <span className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-semibold">{port.name}</span><span className="block truncate text-xs font-normal text-muted-foreground">{port.city ? `${port.city} · ` : ""}{port.country_name}</span></span>
                    {selected ? <Check className="size-4 shrink-0 text-primary" /> : null}
                  </Button>
                );
              })}
              {!availablePorts.length ? <p className="py-10 text-center text-sm text-muted-foreground">Aucun port ne correspond à votre recherche.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
