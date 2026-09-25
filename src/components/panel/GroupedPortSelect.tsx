import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Port } from "@/lib/ferry/types";

interface GroupedPortSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ports: Port[];
}

interface PortGroup {
  key: string;
  label: string;
  ports: Port[];
}

const normalize = (value: string) => value.trim().toLocaleLowerCase("fr");

function groupPorts(ports: Port[]): PortGroup[] {
  const groups = new Map<string, PortGroup>();

  ports.forEach((port) => {
    const key = port.country_code || normalize(port.country_name);
    const existing = groups.get(key);

    if (existing) {
      existing.ports.push(port);
      return;
    }

    groups.set(key, {
      key,
      label: port.country_name,
      ports: [port],
    });
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      ports: [...group.ports].sort((a, b) =>
        a.name.localeCompare(b.name, "fr"),
      ),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

export function GroupedPortSelect({
  label,
  value,
  onChange,
  ports,
}: GroupedPortSelectProps) {
  const [open, setOpen] = useState(false);
  const [countryKey, setCountryKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const groups = useMemo(() => groupPorts(ports), [ports]);
  const selected = ports.find((port) => port.id === value);

  const visibleGroups = useMemo(() => {
    const term = normalize(search);

    return groups
      .filter((group) => !countryKey || group.key === countryKey)
      .map((group) => ({
        ...group,
        ports: group.ports.filter((port) => {
          if (!term) return true;

          return normalize(
            `${port.name} ${port.city ?? ""} ${port.country_name}`,
          ).includes(term);
        }),
      }))
      .filter((group) => group.ports.length > 0);
  }, [countryKey, groups, search]);

  useEffect(() => {
    if (!open) {
      setCountryKey(null);
      setSearch("");
    }
  }, [open]);

  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-expanded={open}
            aria-label={`${label} : ${selected?.name ?? "Choisir un port"}`}
            className="h-11 w-full justify-between bg-background/70 px-3 font-normal"
          >
            <span
              className={
                selected
                  ? "truncate text-foreground"
                  : "truncate text-muted-foreground"
              }
            >
              {selected
                ? `${selected.name}${selected.city ? ` · ${selected.city}` : ""}`
                : "Choisir un port"}
            </span>

            <ChevronDown
              aria-hidden
              className="size-4 shrink-0 opacity-60"
            />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[min(23rem,calc(100vw-2rem))] p-2"
        >
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
            />

            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un port"
              aria-label="Rechercher un port"
              className="h-10 pl-9 pr-9"
            />

            {search ? (
              <button
                type="button"
                aria-label="Effacer la recherche"
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Button
              type="button"
              size="sm"
              variant={countryKey === null ? "default" : "outline"}
              className="h-8 shrink-0 rounded-full text-xs"
              onClick={() => setCountryKey(null)}
            >
              Tous les pays
            </Button>

            {groups.map((group) => (
              <Button
                key={group.key}
                type="button"
                size="sm"
                variant={countryKey === group.key ? "default" : "outline"}
                className="h-8 shrink-0 rounded-full text-xs"
                onClick={() => setCountryKey(group.key)}
              >
                {group.label} ({group.ports.length})
              </Button>
            ))}
          </div>

          <div className="mt-1 max-h-64 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="flex min-h-10 w-full items-center rounded-md px-2 text-left text-sm text-muted-foreground hover:bg-secondary"
            >
              Aucun port sélectionné
            </button>

            {visibleGroups.map((group) => (
              <div key={group.key} className="mt-2 first:mt-0">
                <div className="flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <span>{group.label}</span>
                  <span>{group.ports.length}</span>
                </div>

                {group.ports.map((port) => (
                  <button
                    key={port.id}
                    type="button"
                    onClick={() => {
                      onChange(port.id);
                      setOpen(false);
                    }}
                    className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-2 text-left text-sm hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 truncate">
                      {port.name}
                      {port.city && port.city !== port.name
                        ? ` · ${port.city}`
                        : ""}
                    </span>

                    {port.id === value ? (
                      <Check
                        aria-hidden
                        className="size-4 shrink-0 text-primary"
                      />
                    ) : null}
                  </button>
                ))}
              </div>
            ))}

            {visibleGroups.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                Aucun port trouvé.
              </p>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </label>
  );
}
