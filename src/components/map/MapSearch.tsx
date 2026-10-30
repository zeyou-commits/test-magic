import { VesselAlertTag } from "@/components/panel/VesselAlert";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Building2, Heart, Search, MapPin, Route as RouteIcon, Ship } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { searchCatalog, type CatalogResult } from "@/lib/ferry/catalogSearch";
import type { FleetShip } from "@/lib/ferry/fleet";
import { useMyTrip } from "@/lib/ferry/myTrip";
import type { RouteLine, Selection } from "@/lib/ferry/types";

// Table communautaire pas encore présente dans les types générés.
const db = typedSupabase as unknown as SupabaseClient;

const icons = { vessel: Ship, company: Building2, port: MapPin, route: RouteIcon } as const;
const groupLabel = {
  vessel: "Navires",
  company: "Compagnies",
  port: "Ports",
  route: "Liaisons · voir les traversées",
} as const;

function ResultRow({
  icon: Icon,
  label,
  hint,
  vesselId,
  onClick,
}: {
  icon: typeof Ship;
  label: string;
  hint: string;
  vesselId?: string | null | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-secondary"
    >
      <Icon className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="truncate">{label}</span>
          <VesselAlertTag vesselId={vesselId} />
        </span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

/**
 * Rechercher un navire, un port ou une compagnie, même sans traversée sur la carte. Une ligne
 * renvoie vers les traversées : réserver reste le rôle de « Trouver ma traversée ».
 */
export function MapSearch({
  atSea,
  onOpen,
  onSelect,
  onRoute,
}: {
  atSea: FleetShip[];
  onOpen: () => void;
  onSelect: (selection: Selection) => void;
  onRoute: (route: RouteLine) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const { user } = useAuth();
  const { trip: myTrip } = useMyTrip();
  const { data: vessels = [] } = useQuery({ ...vesselsQuery, enabled: open });
  const { data: companies = [] } = useQuery({ ...companiesQuery, enabled: open });
  const { data: ports = [] } = useQuery({ ...portsQuery, enabled: open });
  const { data: routes = [] } = useQuery({ ...routesQuery, enabled: open });
  const { data: departures = [] } = useQuery({ ...upcomingDeparturesQuery(), enabled: open });
  const { data: followedIds = [] } = useQuery({
    queryKey: ["map-search-followed", user?.id],
    enabled: open && Boolean(user),
    queryFn: async () => {
      const { data } = await db
        .from("bw_follows")
        .select("target_id")
        .eq("user_id", user!.id)
        .eq("target_kind", "vessel")
        .eq("active", true);
      return ((data ?? []) as { target_id: string }[]).map((row) => row.target_id);
    },
  });
  const results = useMemo(
    () => searchCatalog(term, { vessels, companies, ports, routes, departures }),
    [term, vessels, companies, ports, routes, departures],
  );
  // Avant toute saisie : le cas le plus courant se règle sans taper.
  const followed = vessels.filter((vessel) => followedIds.includes(vessel.id));
  const sailing = atSea.filter((ship) => ship.vesselId && !followedIds.includes(ship.vesselId));
  const close = () => {
    setOpen(false);
    setTerm("");
  };
  const select = (selection: Selection) => {
    close();
    onSelect(selection);
  };
  const go = (result: CatalogResult) => {
    if (result.kind === "route") {
      const route = routes.find((r) => r.id === result.id);
      close();
      if (route) onRoute(route);
      return;
    }
    select({ type: result.kind, id: result.id });
  };
  const empty = term.trim().length < 2;
  return (
    <>
      <button
        type="button"
        aria-label="Rechercher un navire, un port ou une compagnie"
        title="Rechercher un navire, un port ou une compagnie"
        onClick={() => {
          onOpen();
          setOpen(true);
        }}
        className="flex w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[9px] font-bold leading-none text-primary transition-colors hover:bg-secondary md:min-w-11 md:text-[10px] [@media(max-width:767px)_and_(max-height:700px)]:py-1"
      >
        <Search className="size-4 md:size-[18px]" aria-hidden />
        <span className="[@media(max-width:767px)_and_(max-height:700px)]:hidden">Loupe</span>
      </button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="top-0 flex h-dvh max-w-none translate-y-0 flex-col gap-3 rounded-none sm:top-[12%] sm:h-auto sm:max-h-[76dvh] sm:max-w-lg sm:rounded-2xl">
          <DialogHeader className="text-left">
            <DialogTitle>Rechercher</DialogTitle>
            <DialogDescription>
              Un navire, une compagnie ou un port, même sans traversée en ce moment.
            </DialogDescription>
          </DialogHeader>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-input px-3">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Ex. Tassili, GNV, Oran"
              aria-label="Nom d'un navire, d'une compagnie ou d'un port"
              className="min-w-0 flex-1 bg-transparent text-base outline-none"
            />
          </label>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {empty ? (
              <>
                {myTrip ? (
                  <div className="mb-2">
                    <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Ma traversée
                    </p>
                    <ResultRow
                      icon={Ship}
                      label={`${myTrip.from?.name ?? "Départ"} → ${myTrip.to?.name ?? "Arrivée"}`}
                      hint={myTrip.vessel?.name ?? "Voir ma traversée"}
                      vesselId={myTrip.vessel?.id}
                      onClick={() => select({ type: "departure", id: myTrip.departure.id })}
                    />
                  </div>
                ) : null}
                {followed.length ? (
                  <div className="mb-2">
                    <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Mes navires suivis
                    </p>
                    {followed.map((vessel) => (
                      <ResultRow
                        key={vessel.id}
                        icon={Heart}
                        label={vessel.name}
                        hint="Voir sa fiche"
                        vesselId={vessel.id}
                        onClick={() => select({ type: "vessel", id: vessel.id })}
                      />
                    ))}
                  </div>
                ) : null}
                {sailing.length ? (
                  <div className="mb-2">
                    <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      En mer maintenant
                    </p>
                    {sailing.map((ship) => (
                      <ResultRow
                        key={ship.id}
                        icon={Ship}
                        label={ship.name}
                        hint="Voir sa fiche"
                        vesselId={ship.vesselId}
                        onClick={() => select({ type: "vessel", id: ship.vesselId! })}
                      />
                    ))}
                  </div>
                ) : null}
              </>
            ) : !results.length ? (
              <p className="p-3 text-sm text-muted-foreground">
                Rien ne correspond à « {term.trim()} ».
              </p>
            ) : null}
            {(["vessel", "company", "port", "route"] as const).map((kind) => {
              const group = results.filter((r) => r.kind === kind);
              if (!group.length) return null;
              return (
                <div key={kind} className="mb-2">
                  <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {groupLabel[kind]}
                  </p>
                  {group.map((result) => (
                    <ResultRow
                      key={`${kind}:${result.id}`}
                      icon={icons[kind]}
                      label={result.label}
                      hint={result.hint}
                      vesselId={kind === "vessel" ? result.id : undefined}
                      onClick={() => go(result)}
                    />
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
