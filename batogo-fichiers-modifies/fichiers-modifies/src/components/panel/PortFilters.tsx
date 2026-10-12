import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getArrivalPorts,
  getDeparturePorts,
  groupPortsByCountry,
  normalizeText,
  summarizePorts,
} from "@/lib/ferry/filtering";
import type { Port, RouteLine } from "@/lib/ferry/types";

interface PortMultiPickerProps {
  /** « departure » : ports de départ ; « arrival » : ports d'arrivée. */
  direction: "departure" | "arrival";
  ports: Port[];
  routes: RouteLine[];
  value: string[];
  /** Ports choisis de l'autre côté, pour ne proposer que les combinaisons qui existent. */
  otherSide: string[];
  onChange: (ids: string[]) => void;
}

/** Choix d'un ou plusieurs ports, groupés par pays, avec recherche intégrée. */
export function PortMultiPicker({
  direction,
  ports,
  routes,
  value,
  otherSide,
  onChange,
}: PortMultiPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const label = direction === "departure" ? "Départ" : "Arrivée";

  const groups = useMemo(() => {
    const candidates =
      direction === "departure"
        ? getDeparturePorts(ports, routes, otherSide)
        : getArrivalPorts(ports, routes, otherSide);
    const term = normalizeText(search);
    return groupPortsByCountry(candidates)
      .map((group) => ({
        ...group,
        ports: group.ports.filter(
          (port) =>
            !term ||
            normalizeText(`${port.name} ${port.city ?? ""} ${port.country_name}`).includes(term),
        ),
      }))
      .filter((group) => group.ports.length > 0);
  }, [direction, ports, routes, otherSide, search]);

  const toggle = (ids: string[]) => {
    const allSelected = ids.length > 0 && ids.every((id) => value.includes(id));
    onChange(
      allSelected ? value.filter((id) => !ids.includes(id)) : [...new Set([...value, ...ids])],
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="batogo-control flex h-14 w-full min-w-0 items-center justify-between gap-2 px-3 text-left"
          aria-label={`${label} : ${summarizePorts(value, ports)}`}
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </span>
            <span className="block truncate text-sm font-semibold text-foreground">
              {summarizePorts(value, ports, "Tous")}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ville, port ou pays"
            aria-label={`Rechercher un port de ${direction === "departure" ? "départ" : "d'arrivée"}`}
            className="batogo-control h-10 w-full pl-9 pr-9 text-sm"
          />
          {search ? (
            <button
              type="button"
              aria-label="Effacer la recherche"
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        {groups.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">Aucun port trouvé.</p>
        ) : (
          <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto pr-1">
            {groups.map((group) => {
              const ids = group.ports.map((port) => port.id);
              const selectedCount = ids.filter((id) => value.includes(id)).length;
              const countrySelected = selectedCount === ids.length && ids.length > 0;
              return (
                <div key={group.code} className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    aria-pressed={countrySelected}
                    onClick={() => toggle(ids)}
                    className="flex min-h-10 w-full items-center justify-between rounded-lg px-2.5 text-left text-sm font-semibold transition hover:bg-secondary"
                  >
                    <span>
                      {group.name}
                      {ids.length > 1 ? (
                        <span className="ml-1 font-normal text-muted-foreground">· tous</span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {selectedCount ? `${selectedCount}/${ids.length}` : ""}
                      {countrySelected ? <Check className="size-4 text-primary" /> : null}
                    </span>
                  </button>
                  <div className="ml-2 flex flex-col gap-0.5 border-l-2 border-muted pl-2">
                    {group.ports.map((port) => {
                      const isSelected = value.includes(port.id);
                      return (
                        <button
                          key={port.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => toggle([port.id])}
                          className={`flex min-h-10 items-center gap-2 rounded-md px-2 text-left text-sm ${isSelected ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-secondary"}`}
                        >
                          <span className="w-4 shrink-0">
                            {isSelected ? <Check className="size-4" /> : null}
                          </span>
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

        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={!value.length}
            className="text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Tous les ports
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Valider
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
