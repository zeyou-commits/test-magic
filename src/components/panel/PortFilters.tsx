import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { CountryFlag } from "./CountryFlag";
import { useIsMobile } from "@/hooks/use-mobile";
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
  /** Affiché directement dans le panneau (sans menu déroulant). */
  inline?: boolean;
  /** Ne garder que certains pays (ex. Algérie uniquement). */
  countryFilter?: (code: string) => boolean;
  title?: string;
}

/** Choix d'un ou plusieurs ports, groupés par pays, avec recherche intégrée. */
export function PortMultiPicker({
  direction,
  ports,
  routes,
  value,
  otherSide,
  onChange,
  inline = false,
  countryFilter,
  title,
}: PortMultiPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const isMobile = useIsMobile();
  const label = direction === "departure" ? "Départ" : "Arrivée";

  const { groups, enabledIds, reasons } = useMemo(() => {
    const candidates = (
      direction === "departure"
        ? getDeparturePorts(ports, routes, otherSide)
        : getArrivalPorts(ports, routes, otherSide)
    ).filter((p) => !countryFilter || countryFilter(p.country_code));
    const enabled = new Set(candidates.map((p) => p.id));
    // Raison affichée pour les ports non sélectionnables.
    const reasons = new Map<string, string>();
    const otherDir =
      direction === "departure"
        ? getArrivalPorts(ports, routes, [])
        : getDeparturePorts(ports, routes, []);
    const otherIds = new Set(otherDir.map((p) => p.id));
    ports.forEach((p) => {
      if (enabled.has(p.id)) return;
      if (p.status !== "active") reasons.set(p.id, "Port inactif");
      else if (otherSide.length) reasons.set(p.id, "Pas de liaison avec votre choix");
      else if (otherIds.has(p.id))
        reasons.set(p.id, direction === "departure" ? "Arrivée uniquement" : "Départ uniquement");
      else reasons.set(p.id, "Aucune ligne active");
    });
    const term = normalizeText(search);
    const groups = groupPortsByCountry(
      countryFilter ? ports.filter((p) => countryFilter(p.country_code)) : ports,
    )
      .map((group) => ({
        ...group,
        ports: group.ports
          .filter(
            (port) =>
              !term ||
              normalizeText(`${port.name} ${port.city ?? ""} ${port.country_name}`).includes(term),
          )
          .sort((a, b) => Number(enabled.has(b.id)) - Number(enabled.has(a.id))),
      }))
      .filter((group) => group.ports.length > 0);
    return { groups, enabledIds: [...enabled], reasons };
  }, [direction, ports, routes, otherSide, search, countryFilter]);

  // Aucun filtre = tous les ports : on l'affiche comme tout coché.
  // « Tout désélectionner » : état visuel vide le temps de choisir (sans choix, aucun filtre).
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    if (value.length || (!open && !inline)) setCleared(false);
  }, [value.length, open, inline]);
  const allMode = value.length === 0 && !cleared;
  const effective = allMode ? enabledIds : value;
  const isOn = (id: string) => effective.includes(id);

  const toggle = (ids: string[]) => {
    const allSelected = ids.length > 0 && ids.every(isOn);
    const next = allSelected
      ? effective.filter((id) => !ids.includes(id))
      : [...new Set([...effective, ...ids])];
    const coversAll = enabledIds.length > 0 && enabledIds.every((id) => next.includes(id));
    if (next.length === 0) setCleared(true);
    onChange(coversAll ? [] : next);
  };
  const toggleAll = () => {
    if (allMode) {
      setCleared(true);
      onChange([]);
    } else {
      setCleared(false);
      onChange([]);
    }
  };

  const body = (
    <>
      <div className="relative mb-3 shrink-0">
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

        <button
          type="button"
          aria-pressed={allMode}
          onClick={toggleAll}
          className={`mb-2 flex min-h-11 w-full shrink-0 items-center gap-2 rounded-lg px-2.5 text-left text-sm font-semibold ${allMode ? "bg-primary/10 text-primary" : "hover:bg-secondary"}`}
        >
          <span className="w-4 shrink-0">{allMode ? <Check className="size-4" /> : null}</span>
          🌍 Tous les ports
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {allMode ? "Tout désélectionner" : "Tout cocher"}
          </span>
        </button>
        {groups.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">Aucun port trouvé.</p>
        ) : (
          <div className={`flex flex-col gap-3 overflow-y-auto pr-1 ${inline ? "max-h-[44vh]" : "max-h-[50vh] max-md:max-h-none"} max-md:min-h-0 max-md:flex-1 max-md:overscroll-contain`}>
            {groups.map((group) => {
              const ids = group.ports.filter((p) => !reasons.has(p.id)).map((port) => port.id);
              const selectedCount = ids.filter(isOn).length;
              const countrySelected = selectedCount === ids.length && ids.length > 0;
              return (
                <div key={group.code} className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    aria-pressed={countrySelected}
                    disabled={!ids.length}
                    onClick={() => toggle(ids)}
                    className="flex min-h-10 w-full items-center justify-between rounded-lg px-2.5 text-left text-sm font-semibold transition hover:bg-secondary disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent"
                  >
                    <span className="flex items-center gap-2">
                      <CountryFlag code={group.code} />
                      {group.name}
                      {ids.length > 1 ? (
                        <span className="font-normal text-muted-foreground">· tous</span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {ids.length ? `${selectedCount}/${ids.length}` : "indisponible"}
                      {countrySelected ? <Check className="size-4 text-primary" /> : null}
                    </span>
                  </button>
                  <div className="ml-2 flex flex-col gap-0.5 border-l-2 border-muted pl-2">
                    {group.ports.map((port) => {
                      const reason = reasons.get(port.id);
                      const isSelected = !reason && isOn(port.id);
                      return (
                        <button
                          key={port.id}
                          type="button"
                          aria-pressed={isSelected}
                          disabled={!!reason}
                          onClick={() => toggle([port.id])}
                          className={`flex min-h-10 items-center gap-2 rounded-md px-2 text-left text-sm ${reason ? "cursor-not-allowed text-muted-foreground/60" : isSelected ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-secondary"}`}
                        >
                          <span className="w-4 shrink-0">
                            {isSelected ? <Check className="size-4" /> : null}
                          </span>
                          <span className="flex-1">{port.name}</span>
                          {reason ? (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {reason}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {inline ? null : (
        <div className="mt-3 flex shrink-0 items-center justify-between border-t pt-3">
          <button
            type="button"
            onClick={() => {
              setCleared(false);
              onChange([]);
            }}
            disabled={!value.length && !cleared}
            className="text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Réinitialiser
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Valider{value.length ? ` (${value.length})` : ""}
          </button>
        </div>
        )}
    </>
  );

  if (inline) {
    return (
      <div className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-2.5 shadow-sm">
        <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-primary">
          {title ?? label}
          <span className="ml-1 font-medium normal-case tracking-normal text-muted-foreground">
            · {summarizePorts(value, ports, "Tous")}
          </span>
        </p>
        {body}
      </div>
    );
  }

  const trigger = (
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
  );

  if (isMobile) {
    return (
      <SheetPrimitive.Root open={open} onOpenChange={setOpen}>
        <SheetPrimitive.Trigger asChild>{trigger}</SheetPrimitive.Trigger>
        <SheetPrimitive.Portal>
          <SheetPrimitive.Overlay className="fixed inset-0 z-[90] bg-foreground/40" />
          <SheetPrimitive.Content
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="fixed inset-0 z-[95] flex flex-col bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <SheetPrimitive.Title className="text-base font-bold">Port {direction === "departure" ? "de départ" : "d'arrivée"}</SheetPrimitive.Title>
              <SheetPrimitive.Close aria-label="Fermer" className="grid size-9 place-items-center rounded-full hover:bg-muted">
                <X className="size-4" />
              </SheetPrimitive.Close>
            </div>
            {body}
          </SheetPrimitive.Content>
        </SheetPrimitive.Portal>
      </SheetPrimitive.Root>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="flex w-96 max-w-[calc(100vw-1.5rem)] flex-col p-3">
        {body}
      </PopoverContent>
    </Popover>
  );
}
