import { cloneElement, useState, type ReactElement } from "react";
import { Link } from "@tanstack/react-router";
import { Anchor, CalendarDays, Flag, Ship, Waves, type LucideProps } from "lucide-react";
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

/** Phare (style Lucide) : absent de la bibliothèque d'icônes. */
function LighthouseIcon({ className }: LucideProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 9h6l1 12H8L9 9Z" />
      <path d="M8.5 15h7" />
      <path d="M10 9V6l2-2 2 2v3" />
      <path d="M5 21h14" />
      <path d="M4 5.5 7 7M20 5.5 17 7" />
    </svg>
  );
}

/** Tableau de bord horizontal de la carte : icône + chiffre, libellé en infobulle. */
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
    "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-bold tabular-nums text-foreground transition-colors hover:bg-secondary data-[active=true]:bg-secondary";
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

  const stat = (tip: string, node: ReactElement<{ title?: string }>) => cloneElement(node, { title: tip });

  return (
    <>
      <div className="pointer-events-auto absolute right-4 top-4 z-10 hidden md:block">
        <div className="flex items-center gap-0.5 rounded-full border border-border bg-background/95 p-1 shadow-lg backdrop-blur">
          {stat(
            plural(atSea.length, "navire en mer", "navires en mer"),
            <button type="button" className={item} data-active={open === "sea"} aria-label="Navires en mer" aria-expanded={open === "sea"} onClick={() => setOpen(open === "sea" ? null : "sea")}>
              <Waves className="size-4 text-primary" />
              {atSea.length}
            </button>,
          )}
          {stat(
            plural(docked.length, "navire à quai", "navires à quai"),
            <button type="button" className={item} data-active={open === "docked"} aria-label="Navires à quai" aria-expanded={open === "docked"} onClick={() => setOpen(open === "docked" ? null : "docked")}>
              <Anchor className="size-4 text-muted-foreground" />
              {docked.length}
            </button>,
          )}
          <span className="mx-0.5 h-5 w-px bg-border" />
          {stat(
            `${plural(upcoming, "traversée", "traversées")} sous ${DAYS} jours`,
            <button type="button" className={item} aria-label="Traversées à venir" onClick={onOpenDepartures}>
              <CalendarDays className="size-4 text-muted-foreground" />
              {upcoming}
            </button>,
          )}
          {stat(
            plural(companiesCount, "compagnie", "compagnies"),
            <Link to="/compagnies" className={item} aria-label="Compagnies">
              <Flag className="size-4 text-muted-foreground" />
              {companiesCount}
            </Link>,
          )}
          {stat(
            plural(portsCount, "port", "ports"),
            <Link to="/ports" className={item} aria-label="Ports">
              <LighthouseIcon className="size-4 text-muted-foreground" />
              {portsCount}
            </Link>,
          )}
        </div>
        {open ? (
          <ul className="ml-auto mt-2 max-h-56 w-56 overflow-y-auto rounded-2xl border border-border bg-background/95 p-1 shadow-lg backdrop-blur">
            {list.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">Aucun navire</li>
            ) : (
              list.map((ship) => (
                <li key={ship.id}>
                  <button
                    type="button"
                    disabled={!ship.vesselId}
                    onClick={() => ship.vesselId && onSelectVessel(ship.vesselId)}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium hover:bg-secondary"
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
      </div>
    </>
  );
}
