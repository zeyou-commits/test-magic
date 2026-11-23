import { useMemo, useState } from "react";
import { Ban, CalendarX2, Car, Check, ChevronDown, Globe2, Minus, Search, X } from "lucide-react";
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
import { tr } from "@/lib/i18n";
import { Bw504Button, Bw504Note } from "@/components/companion/Bw504Note";
import { closeMatches } from "@/lib/companion/reasons";

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
  /** Ports avec au moins une traversée planifiée ; les autres sont grisés. */
  scheduledPortIds?: Set<string> | undefined;
  /** Ouvre la fiche d'un port grisé ou fermé (consultation toujours possible). */
  onOpenPort?: (id: string) => void;
  /** Ouverture pilotée de l'extérieur : enchaîner Départ → Arrivée → Dates. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  scheduledPortIds,
  onOpenPort,
  open: openProp,
  onOpenChange,
}: PortMultiPickerProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    if (openProp === undefined) setOpenState(next);
  };
  const [search, setSearch] = useState("");
  const [collapsedCountries, setCollapsedCountries] = useState<Record<string, boolean>>({});
  const isMobile = useIsMobile();
  const label = direction === "departure" ? "Départ" : "Arrivée";

  const { groups, enabledIds, reasons } = useMemo(() => {
    const candidates = (
      direction === "departure"
        ? getDeparturePorts(ports, routes, otherSide)
        : getArrivalPorts(ports, routes, otherSide)
    )
      .filter((p) => !countryFilter || countryFilter(p.country_code))
      .filter((p) => !scheduledPortIds || scheduledPortIds.has(p.id));
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
      else if (scheduledPortIds && !scheduledPortIds.has(p.id))
        reasons.set(p.id, "Aucun départ planifié pour le moment");
      else if (otherSide.length) reasons.set(p.id, "Pas de ligne avec votre choix");
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
  }, [direction, ports, routes, otherSide, search, countryFilter, scheduledPortIds]);

  // Rien de coché tant que le voyageur n'a pas choisi : la liste part vide. Sans choix, la
  // recherche (et la carte) gardent toutes les lignes ; seul l'affichage du choix est vide.
  const isOn = (id: string) => value.includes(id);
  const allMode = enabledIds.length > 0 && enabledIds.every(isOn);

  const toggle = (ids: string[]) => {
    const allSelected = ids.length > 0 && ids.every(isOn);
    onChange(
      allSelected ? value.filter((id) => !ids.includes(id)) : [...new Set([...value, ...ids])],
    );
  };
  const toggleAll = () => onChange(allMode ? [] : enabledIds);

  const body = (
    <div className="bw-portpick" data-inline={inline || undefined}>
      <label className="bw-portpick__search">
        <Search aria-hidden />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={inline ? tr("ui.portFilters.rechercherUnPort") : tr("ui.portFilters.villePortOuPays")}
          aria-label={`Rechercher un port ${direction === "departure" ? "de départ" : "d'arrivée"}`}
          enterKeyHint="search"
        />
        {search ? (
          <button
            type="button"
            aria-label={tr("ui.portFilters.effacerLaRecherche")}
            onClick={() => setSearch("")}
          >
            <X aria-hidden />
          </button>
        ) : null}
      </label>

      <button type="button" aria-pressed={allMode} onClick={toggleAll} className="bw-portpick__all">
        <span className="bw-portpick__all-icon" aria-hidden>
          <Globe2 />
        </span>
        <span className="bw-portpick__all-label">
          {inline ? tr("ui.portFilters.tous") : "Tous les ports"}
        </span>
        <span className="bw-portpick__check" data-state={allMode ? "on" : "off"} aria-hidden>
          {allMode ? <Check /> : null}
        </span>
      </button>
      {groups.length === 0 ? (
        <PortTypo
          search={search}
          ports={countryFilter ? ports.filter((p) => countryFilter(p.country_code)) : ports}
          onPick={setSearch}
          fallback={tr("ui.portFilters.aucunPortTrouve")}
        />
      ) : (
        <div
          className={`bw-portpick__list ${inline ? "" : "min-h-0 overflow-y-auto"}`}
        >
          {groups.map((group) => {
            const ids = group.ports.filter((p) => !reasons.has(p.id)).map((port) => port.id);
            const selectedCount = ids.filter(isOn).length;
            const countrySelected = selectedCount === ids.length && ids.length > 0;
            const countryState = countrySelected ? "on" : selectedCount ? "some" : "off";
            const collapsed = collapsedCountries[group.code] ?? false;
            return (
              <section key={group.code} className="bw-portpick__country">
                <div className="bw-portpick__country-head">
                  <button
                    type="button"
                    aria-expanded={!collapsed}
                    onClick={() =>
                      setCollapsedCountries((prev) => ({ ...prev, [group.code]: !collapsed }))
                    }
                    className="bw-portpick__country-toggle"
                  >
                    <CountryFlag code={group.code} className="bw-portpick__flag" />
                    <span className="bw-portpick__country-name">{group.name}</span>
                    <span className="bw-portpick__count" data-some={selectedCount > 0 || undefined}>
                      {ids.length ? `${selectedCount}/${ids.length}` : "—"}
                    </span>
                    <ChevronDown aria-hidden className="bw-portpick__chevron" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${countrySelected ? "Désélectionner" : "Sélectionner"} les ports de ${group.name}`}
                    aria-pressed={countrySelected}
                    disabled={!ids.length}
                    onClick={() => toggle(ids)}
                    className="bw-portpick__country-check"
                  >
                    <span className="bw-portpick__check" data-state={countryState} aria-hidden>
                      {countryState === "on" ? <Check /> : countryState === "some" ? <Minus /> : null}
                    </span>
                  </button>
                </div>
                {!collapsed ? (
                  <div className="bw-portpick__chips">
                    {group.ports.map((port) => {
                      const reason = reasons.get(port.id);
                      const isSelected = !reason && isOn(port.id);
                      return (
                        <button
                          key={port.id}
                          type="button"
                          aria-pressed={isSelected}
                          aria-disabled={!!reason}
                          title={
                            reason ? `${reason} · voir la fiche du port` :
                            (port.facilities?.["dedouanement_vehicule"] === "oui"
                              ? `${port.name} · dédouanement véhicules -3 ans`
                              : port.name)
                          }
                          onClick={() => {
                            if (!reason) return toggle([port.id]);
                            setOpen(false);
                            onOpenPort?.(port.id);
                          }}
                          className="bw-portpick__chip"
                          data-state={reason ? "off" : isSelected ? "on" : undefined}
                        >
                          {isSelected ? <Check aria-hidden /> : null}
                          {reason === "Aucun départ planifié pour le moment" ? (
                            <CalendarX2 aria-hidden />
                          ) : null}
                          {reason === "Port inactif" ? <Ban aria-hidden /> : null}
                          <span>{port.name}</span>
                          {port.facilities?.["dedouanement_vehicule"] === "oui" ? (
                            <Car
                              aria-label={tr("ui.portFilters.dedouanementVehiculesDeMoinsDe")}
                              className="bw-portpick__car"
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {inline ? null : (
        <div className="bw-portpick__foot">
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={!value.length}
            className="bw-portpick__reset"
          >
            {tr("ui.portFilters.reinitialiser")}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="bw-portpick__ok">
            {tr("ui.portFilters.valider")}{value.length ? ` (${value.length})` : ""}
          </button>
        </div>
      )}
    </div>
  );

  if (inline) {
    return (
      <div className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-2.5 shadow-sm">
        <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-primary">
          {title ?? label}
          <span className="ml-1 font-medium normal-case tracking-normal text-muted-foreground">
            · {summarizePorts(value, ports, "à choisir")}
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
      aria-label={`${label} : ${summarizePorts(value, ports, "à choisir")}`}
    >
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span
          className={`block truncate text-sm font-semibold ${value.length ? "text-foreground" : "text-muted-foreground"}`}
        >
          {summarizePorts(value, ports, direction === "departure" ? "D'où partez-vous ?" : "Où allez-vous ?")}
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
            className="bw-portpick-sheet fixed inset-0 z-[95] flex flex-col overflow-y-auto"
          >
            <div className="bw-portpick-sheet__head">
              <SheetPrimitive.Title className="bw-portpick-sheet__title">
                {tr("ui.portFilters.port")}{direction === "departure" ? tr("ui.portFilters.deDepart") : tr("ui.portFilters.dArrivee")}
              </SheetPrimitive.Title>
              <SheetPrimitive.Close
                aria-label={tr("ui.portFilters.fermer")}
                className="bw-portpick-sheet__close"
              >
                <X className="size-5" />
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
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="bw-portpick-pop flex max-h-[min(36rem,var(--radix-popover-content-available-height))] w-[26rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden p-3"
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}

/** Recherche de port vide : la 504 propose les noms proches au lieu d'un « aucun port » sec. */
function PortTypo({
  search,
  ports,
  onPick,
  fallback,
}: {
  search: string;
  ports: Port[];
  onPick: (name: string) => void;
  fallback: string;
}) {
  const close = closeMatches(search, ports, (port) => port.name);
  return (
    <div className="p-2">
      <Bw504Note
        tone="stuck"
        title={close.length ? `Tu voulais dire ${close[0]!.name} ?` : "Je ne connais pas ce port"}
        actions={
          close.length
            ? close.map((port) => (
                <Bw504Button key={port.id} primary={port === close[0]} onClick={() => onPick(port.name)}>
                  {port.name}
                </Bw504Button>
              ))
            : <Bw504Button onClick={() => onPick("")}>Voir tous les ports</Bw504Button>
        }
      >
        {close.length ? null : `${fallback} Essaie le nom de la ville.`}
      </Bw504Note>
    </div>
  );
}
