import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Anchor, Building2, CalendarDays, ChevronDown, Ship, Waves } from "lucide-react";
import type { FleetShip } from "@/lib/ferry/fleet";
import type { Departure } from "@/lib/ferry/types";

interface MapStatsProps {
  fleet: FleetShip[];
  departures: Departure[];
  companiesCount: number;
  portsCount: number;
  onSelectVessel: (vesselId: string) => void;
  onOpenDepartures: () => void;
}

const DAYS = 7;

/** Tableau de bord compact de la carte : chaque compteur ouvre le détail correspondant. */
export function MapStats({
  fleet,
  departures,
  companiesCount,
  portsCount,
  onSelectVessel,
  onOpenDepartures,
}: MapStatsProps) {
  const [open, setOpen] = useState<"sea" | "docked" | null>(null);
  const now = Date.now();
  const atSea = fleet.filter((s) => s.state === "sea");
  const docked = fleet.filter((s) => s.state === "docked");
  const upcoming = departures.filter((d) => {
    const t = new Date(d.departure_at).getTime();
    return d.status !== "cancelled" && t >= now && t < now + DAYS * 86_400_000;
  }).length;

  const list = open === "sea" ? atSea : open === "docked" ? docked : [];
  const item =
    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-secondary";
  const value = "text-base font-bold tabular-nums text-foreground";
  const label = "text-xs text-muted-foreground";

  return (
    <div className="pointer-events-auto absolute right-4 top-[4.5rem] z-10 hidden w-56 rounded-2xl border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur md:block">
      <button type="button" className={item} onClick={() => setOpen(open === "sea" ? null : "sea")} aria-expanded={open === "sea"}>
        <Waves className="size-4 text-primary" />
        <span className={value}>{atSea.length}</span>
        <span className={`${label} flex-1`}>en mer</span>
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open === "sea" ? "rotate-180" : ""}`} />
      </button>
      <button type="button" className={item} onClick={() => setOpen(open === "docked" ? null : "docked")} aria-expanded={open === "docked"}>
        <Anchor className="size-4 text-muted-foreground" />
        <span className={value}>{docked.length}</span>
        <span className={`${label} flex-1`}>à quai</span>
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open === "docked" ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <ul className="mx-1 mb-1 max-h-48 overflow-y-auto rounded-xl bg-secondary/50 p-1">
          {list.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">Aucun navire</li>
          ) : (
            list.map((ship) => (
              <li key={ship.id}>
                <button
                  type="button"
                  disabled={!ship.vesselId}
                  onClick={() => ship.vesselId && onSelectVessel(ship.vesselId)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium hover:bg-background"
                >
                  <Ship className="size-3.5 text-primary" />
                  <span className="flex-1 truncate">{ship.name}</span>
                  {ship.source === "live" ? (
                    <span className="text-[10px] font-semibold text-primary">AIS</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
      <div className="my-1 h-px bg-border" />
      <button type="button" className={item} onClick={onOpenDepartures}>
        <CalendarDays className="size-4 text-muted-foreground" />
        <span className={value}>{upcoming}</span>
        <span className={label}>traversées sous {DAYS} j</span>
      </button>
      <Link to="/compagnies" className={item}>
        <Building2 className="size-4 text-muted-foreground" />
        <span className={value}>{companiesCount}</span>
        <span className={label}>compagnies</span>
      </Link>
      <Link to="/ports" className={item}>
        <Anchor className="size-4 text-muted-foreground" />
        <span className={value}>{portsCount}</span>
        <span className={label}>ports</span>
      </Link>
    </div>
  );
}
