import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Building2, MapPin, Route as RouteIcon, Search, Ship } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { searchCatalog, type CatalogResult } from "@/lib/ferry/catalogSearch";
import type { Selection } from "@/lib/ferry/types";

const icons = { vessel: Ship, company: Building2, port: MapPin, route: RouteIcon } as const;
const groupLabel = {
  vessel: "Navires",
  company: "Compagnies",
  port: "Ports",
  route: "Liaisons",
} as const;

/**
 * Trouver un navire, une compagnie, un port ou une liaison pour le suivre, même sans traversée
 * sur la carte. Distinct de « Trouver ma traversée » (Où / Quand / Qui), qui sert à réserver.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: vessels = [] } = useQuery({ ...vesselsQuery, enabled: open });
  const { data: companies = [] } = useQuery({ ...companiesQuery, enabled: open });
  const { data: ports = [] } = useQuery({ ...portsQuery, enabled: open });
  const { data: routes = [] } = useQuery({ ...routesQuery, enabled: open });
  const { data: departures = [] } = useQuery({ ...upcomingDeparturesQuery(), enabled: open });
  const results = useMemo(
    () => searchCatalog(term, { vessels, companies, ports, routes, departures }),
    [term, vessels, companies, ports, routes, departures],
  );
  const go = (result: CatalogResult) => {
    const selection: Selection = { type: result.kind, id: result.id };
    setOpen(false);
    setTerm("");
    if (pathname === "/") {
      window.dispatchEvent(new CustomEvent("bledway:select", { detail: selection }));
      return;
    }
    window.location.assign(`/?select=${selection.type}&id=${selection.id}`);
  };
  return (
    <>
      <button
        type="button"
        aria-label="Chercher un navire, une compagnie, un port ou une liaison"
        title="Chercher un navire, une compagnie, un port"
        onClick={() => setOpen(true)}
        className="grid size-11 shrink-0 place-items-center rounded-xl text-foreground hover:bg-secondary"
      >
        <Search size={21} aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-0 flex h-dvh max-w-none translate-y-0 flex-col gap-3 rounded-none sm:top-[12%] sm:h-auto sm:max-h-[76dvh] sm:max-w-lg sm:rounded-2xl">
          <DialogHeader className="text-left">
            <DialogTitle>Chercher sur BledWay</DialogTitle>
            <DialogDescription>
              Navire, compagnie, port ou liaison, pour le suivre ou voir ses traversées.
            </DialogDescription>
          </DialogHeader>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-input px-3">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Ex. Tassili, GNV, Oran, Alger Marseille"
              aria-label="Rechercher"
              className="min-w-0 flex-1 bg-transparent text-base outline-none"
            />
          </label>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {term.trim().length >= 2 && !results.length ? (
              <p className="p-3 text-sm text-muted-foreground">
                Rien ne correspond à « {term.trim()} ».
              </p>
            ) : null}
            {(["vessel", "company", "port", "route"] as const).map((kind) => {
              const group = results.filter((r) => r.kind === kind);
              if (!group.length) return null;
              const Icon = icons[kind];
              return (
                <div key={kind} className="mb-2">
                  <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {groupLabel[kind]}
                  </p>
                  {group.map((result) => (
                    <button
                      key={`${kind}:${result.id}`}
                      type="button"
                      onClick={() => go(result)}
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-secondary"
                    >
                      <Icon className="size-4 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{result.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {result.hint}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
