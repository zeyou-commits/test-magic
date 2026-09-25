import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, MapPinned, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyNote, Section } from "./shared";
import { portsQuery, routesQuery } from "@/lib/ferry/queries";
import type { Filters, Port } from "@/lib/ferry/types";

const ALGERIA = "DZ";

interface MapRouteFilterProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

const isAlgeria = (port: Port) =>
  port.country_code.toUpperCase() === ALGERIA;

function countryKey(port: Port) {
  return port.country_code || port.country_name;
}

function countryLabel(ports: Port[], key: string) {
  return ports.find((port) => countryKey(port) === key)?.country_name ?? key;
}

export function MapRouteFilter({
  filters,
  onFiltersChange,
}: MapRouteFilterProps) {
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const [activeCountry, setActiveCountry] = useState<string | null>(null);

  const activePorts = useMemo(
    () => ports.filter((port) => port.status === "active"),
    [ports],
  );

  const countries = useMemo(
    () =>
      [...new Set(activePorts.map(countryKey))]
        .map((key) => ({
          key,
          label: countryLabel(activePorts, key),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "fr")),
    [activePorts],
  );

  const selectedPorts = useMemo(
    () =>
      activePorts.filter((port) => filters.portIds.includes(port.id)),
    [activePorts, filters.portIds],
  );

  const selectedCountryPorts = useMemo(
    () =>
      activePorts.filter(
        (port) =>
          !activeCountry || countryKey(port) === activeCountry,
      ),
    [activeCountry, activePorts],
  );

  const compatiblePorts = useMemo(() => {
    if (!selectedPorts.length) return [];

    const selectedIds = new Set(selectedPorts.map((port) => port.id));
    const selectedHasAlgeria = selectedPorts.some(isAlgeria);
    const selectedHasEurope = selectedPorts.some(
      (port) => !isAlgeria(port),
    );
    const compatibleIds = new Set<string>();

    routes.forEach((route) => {
      if (selectedIds.has(route.departure_port_id)) {
        compatibleIds.add(route.arrival_port_id);
      }

      if (selectedIds.has(route.arrival_port_id)) {
        compatibleIds.add(route.departure_port_id);
      }
    });

    return activePorts
      .filter((port) => {
        if (!compatibleIds.has(port.id)) return false;
        if (selectedIds.has(port.id)) return false;

        if (selectedHasEurope && !selectedHasAlgeria) {
          return isAlgeria(port);
        }

        if (selectedHasAlgeria && !selectedHasEurope) {
          return !isAlgeria(port);
        }

        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [activePorts, routes, selectedPorts]);

  const visiblePorts = useMemo(() => {
    if (activeCountry) return selectedCountryPorts;
    if (selectedPorts.length) return compatiblePorts;
    return selectedCountryPorts;
  }, [
    activeCountry,
    compatiblePorts,
    selectedCountryPorts,
    selectedPorts.length,
  ]);

  const selectedLineCount = useMemo(() => {
    if (!filters.portIds.length) return routes.length;

    const selectedIds = new Set(filters.portIds);

    return routes.filter(
      (route) =>
        selectedIds.has(route.departure_port_id) ||
        selectedIds.has(route.arrival_port_id),
    ).length;
  }, [filters.portIds, routes]);

  const togglePort = (portId: string) => {
    const portIds = filters.portIds.includes(portId)
      ? filters.portIds.filter((id) => id !== portId)
      : [...filters.portIds, portId];

    onFiltersChange({
      ...filters,
      portIds,
      departureCountry: null,
      departurePortId: null,
      arrivalPortId: null,
    });
  };

  const selectCountry = (key: string | null) => {
    setActiveCountry(key);

    if (!key) {
      onFiltersChange({
        ...filters,
        portIds: [],
        departureCountry: null,
        departurePortId: null,
        arrivalPortId: null,
      });

      return;
    }

    const portIds = activePorts
      .filter((port) => countryKey(port) === key)
      .map((port) => port.id);

    onFiltersChange({
      ...filters,
      portIds,
      departureCountry: null,
      departurePortId: null,
      arrivalPortId: null,
    });
  };

  const reset = () => {
    setActiveCountry(null);

    onFiltersChange({
      ...filters,
      portIds: [],
      departureCountry: null,
      departurePortId: null,
      arrivalPortId: null,
    });
  };

  return (
    <Section
      title="Filtrer la carte"
      action={
        filters.portIds.length ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Réinitialiser
          </Button>
        ) : null
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPinned aria-hidden className="size-4 text-primary" />
          <span>
            {filters.portIds.length
              ? `${selectedLineCount} ligne(s) reliée(s) à la sélection`
              : `${routes.length} lignes disponibles`}
          </span>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Button
            type="button"
            size="sm"
            variant={
              !activeCountry && !filters.portIds.length
                ? "default"
                : "outline"
            }
            className="h-8 shrink-0 rounded-full text-xs"
            onClick={() => selectCountry(null)}
          >
            Tous
          </Button>

          {countries.map((country) => (
            <Button
              key={country.key}
              type="button"
              size="sm"
              variant={
                activeCountry === country.key ? "default" : "outline"
              }
              className="h-8 shrink-0 rounded-full text-xs"
              onClick={() => selectCountry(country.key)}
            >
              {country.label}
            </Button>
          ))}
        </div>

        {selectedPorts.length ? (
          <div className="flex flex-wrap gap-1.5">
            {selectedPorts.map((port) => (
              <button
                key={port.id}
                type="button"
                onClick={() => togglePort(port.id)}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20"
              >
                {port.name}
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
        ) : null}

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {activeCountry
              ? `Ports de ${countryLabel(activePorts, activeCountry)}`
              : selectedPorts.length
                ? "Ports reliés par une ligne"
                : "Ports du pays"}
          </p>

          {visiblePorts.length ? (
            <div className="grid max-h-48 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
              {visiblePorts.map((port) => {
                const selected = filters.portIds.includes(port.id);

                return (
                  <button
                    key={port.id}
                    type="button"
                    onClick={() => togglePort(port.id)}
                    className={`flex min-h-10 items-center justify-between gap-2 rounded-lg border px-2.5 text-left text-sm transition ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:bg-secondary"
                    }`}
                  >
                    <span className="min-w-0 truncate">
                      {port.name}
                      {port.city && port.city !== port.name
                        ? ` · ${port.city}`
                        : ""}
                    </span>

                    {selected ? (
                      <Check
                        aria-hidden
                        className="size-4 shrink-0"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyNote>
              {selectedPorts.length
                ? "Aucune ligne ne relie cette sélection à un autre port."
                : "Choisissez un pays pour afficher ses ports et ses lignes."}
            </EmptyNote>
          )}
        </div>
      </div>
    </Section>
  );
}
