import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { getArrivalPorts, getDeparturePorts, groupPortsByCountry, withDeparturePorts, normalizeText } from "@/lib/ferry/filtering";
import type { Filters, Port, RouteLine } from "@/lib/ferry/types";

const ANY = "__any__";

interface PortFilterProps {
  ports: Port[];
  routes: RouteLine[];
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

/** Choix des ports de départ, groupés par pays avec recherche intégrée. */
export function DeparturePicker({ ports, routes, filters, onFiltersChange }: PortFilterProps) {
  const [search, setSearch] = useState("");

  const groups = useMemo(() => {
    const allGroups = groupPortsByCountry(getDeparturePorts(ports, routes));
    const term = normalizeText(search);
    
    if (!term) return allGroups;
    
    return allGroups.map(group => ({
      ...group,
      ports: group.ports.filter(port => normalizeText(`${port.name} ${port.city ?? ""} ${port.country_name}`).includes(term))
    })).filter(group => group.ports.length > 0);
  }, [ports, routes, search]);

  const selected = filters.departurePortIds;

  const apply = (ids: string[]) => onFiltersChange(withDeparturePorts(filters, ids, ports, routes));

  const toggleCountry = (ids: string[]) => {
    const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
    apply(allSelected ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])]);
  };

  const togglePort = (id: string) =>
    apply(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);

  return (
    <div className="flex flex-col gap-4">
      {/* Recherche interne au popover */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un port..."
          className="batogo-control h-9 w-full pl-9 pr-9 text-sm"
        />
        {search ? (
          <button
            onClick={() => setSearch("")}
            className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <div className="p-4 text-center text-sm text-muted-foreground">Aucun port trouvé.</div>
      ) : (
        <div className="flex flex-col gap-4 max-h-[45vh] overflow-y-auto pr-1 scrollbar-none">
          {groups.map((group) => {
            const ids = group.ports.map((port) => port.id);
            const selectedCount = ids.filter((id) => selected.includes(id)).length;
            const countrySelected = selectedCount === ids.length && ids.length > 0;

            return (
              <div key={group.code} className="flex flex-col gap-1">
                <button
                  onClick={() => toggleCountry(ids)}
                  className="flex min-h-10 w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition hover:bg-muted"
                >
                  <span>{group.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {selectedCount ? `${selectedCount}/${ids.length}` : ""}
                    </span>
                    {countrySelected ? <Check className="size-4 text-primary" /> : null}
                  </span>
                </button>
                <div className="ml-2 flex flex-col gap-0.5 border-l-2 border-muted pl-2">
                  {group.ports.map((port) => {
                    const isSelected = selected.includes(port.id);
                    return (
                      <button
                        key={port.id}
                        onClick={() => togglePort(port.id)}
                        className={
                          isSelected
                            ? "flex min-h-10 items-center gap-2 rounded-md bg-primary/10 px-2 text-left text-xs font-semibold text-primary"
                            : "flex min-h-10 items-center gap-2 rounded-md px-2 text-left text-xs text-muted-foreground hover:bg-background"
                        }
                      >
                        <div className="w-4 shrink-0">{isSelected ? <Check className="size-3.5" /> : null}</div>
                        <span>{port.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Choix du port d'arrivée : uniquement les ports atteignables depuis les départs retenus. */
export function ArrivalSelect({ ports, routes, filters, onFiltersChange, triggerClassName }: PortFilterProps & { triggerClassName?: string }) {
  const options = useMemo(
    () => groupPortsByCountry(getArrivalPorts(ports, routes, filters.departurePortIds)),
    [ports, routes, filters.departurePortIds],
  );

  return (
    <Select
      value={filters.arrivalPortId ?? ANY}
      onValueChange={(next) => onFiltersChange({ ...filters, arrivalPortId: next === ANY ? null : next })}
    >
      <SelectTrigger className={triggerClassName}>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Port d’arrivée
        </span>
        <SelectValue placeholder="Toutes arrivées" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>Toutes les arrivées</SelectItem>
        {options.flatMap((group) =>
          group.ports.map((port) => (
            <SelectItem key={port.id} value={port.id}>
              {port.name}
            </SelectItem>
          )),
        )}
      </SelectContent>
    </Select>
  );
}
