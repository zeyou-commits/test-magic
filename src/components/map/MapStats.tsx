import { Anchor, Flag, Ship, Waves, type LucideProps } from "lucide-react";
import type { FleetShip } from "@/lib/ferry/fleet";

export type MapShortcut = "sea" | "upcoming" | "companies" | "ports" | null;

interface MapStatsProps {
  atSea: FleetShip[];
  upcomingShips: FleetShip[];
  companies: { id: string; name: string; logoUrl: string | null }[];
  portsCount: number;
  activeShortcut: MapShortcut;
  selectedCompanyId: string | null;
  onToggle: (shortcut: Exclude<MapShortcut, null>) => void;
  onSelectCompany: (companyId: string | null) => void;
  onSelectShip: (ship: FleetShip) => void;
  companyOf: (ship: FleetShip) => string | undefined;
}

function LighthouseIcon({ className }: LucideProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M9 9h6l1 12H8L9 9Z" /><path d="M8.5 15h7" /><path d="M10 9V6l2-2 2 2v3" /><path d="M5 21h14" /><path d="M4 5.5 7 7M20 5.5 17 7" />
  </svg>;
}

export function MapStats({ atSea, upcomingShips, companies, portsCount, activeShortcut, selectedCompanyId, onToggle, onSelectCompany, onSelectShip, companyOf }: MapStatsProps) {
  const item = "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-foreground transition-colors hover:bg-secondary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground md:gap-1.5 md:px-2.5 md:py-1.5 md:text-sm";
  const shipList = activeShortcut === "sea" ? atSea : activeShortcut === "upcoming" ? upcomingShips : [];
  const shortcuts = [
    { id: "sea" as const, label: "Navires en mer", count: atSea.length, icon: <Waves className="size-3 md:size-4" /> },
    { id: "upcoming" as const, label: "Navires bientôt au départ", count: upcomingShips.length, icon: <Anchor className="size-3 md:size-4" /> },
    { id: "companies" as const, label: "Compagnies des navires", count: companies.length, icon: <Flag className="size-3 md:size-4" /> },
    { id: "ports" as const, label: "Ports et liaisons", count: portsCount, icon: <LighthouseIcon className="size-3 md:size-4" /> },
  ];
  return (
    <div className="pointer-events-auto absolute right-2 top-3 z-20 md:right-5 md:top-5">
      <div className="flex items-center rounded-full border border-border bg-background/95 p-0.5 shadow-md backdrop-blur md:gap-0.5 md:p-1 md:shadow-lg">
        {shortcuts.map(({ id, label, count, icon }) => (
          <button key={id} type="button" className={item} data-active={activeShortcut === id} aria-label={`${label} : ${count}`} aria-pressed={activeShortcut === id} aria-expanded={activeShortcut === id && id !== "ports"} title={`${label} : ${count}`} onClick={() => onToggle(id)}>{icon}{count}</button>
        ))}
      </div>
      {(activeShortcut === "sea" || activeShortcut === "upcoming" || activeShortcut === "companies") && (
        <div className="ml-auto mt-2 max-h-[min(48dvh,18rem)] w-64 overflow-y-auto rounded-2xl border border-border bg-background/95 p-1 shadow-lg backdrop-blur" aria-label={activeShortcut === "companies" ? "Filtrer les compagnies" : "Choisir un navire"}>
          {activeShortcut === "companies" ? (
            <>
              <button type="button" className="flex w-full items-center rounded-xl px-3 py-2 text-left text-xs font-semibold hover:bg-secondary" aria-pressed={!selectedCompanyId} onClick={() => onSelectCompany(null)}>Toutes les compagnies</button>
              {companies.map((company) => (
                <button key={company.id} type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium hover:bg-secondary data-[active=true]:bg-secondary" data-active={selectedCompanyId === company.id} aria-pressed={selectedCompanyId === company.id} onClick={() => onSelectCompany(company.id)}>
                  {company.logoUrl ? <img src={company.logoUrl} alt="" className="size-5 shrink-0 object-contain" /> : <Flag className="size-4 shrink-0 text-primary" />}
                  <span className="truncate">{company.name}</span>
                </button>
              ))}
              {companies.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Aucune compagnie pour le moment</p>}
            </>
          ) : shipList.length === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground">Aucun navire pour le moment</p> : shipList.map((ship) => (
            <button key={ship.id} type="button" onClick={() => onSelectShip(ship)} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium hover:bg-secondary">
              <Ship className="size-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 leading-tight"><span className="block truncate">{ship.name}</span>{companyOf(ship) && <span className="block truncate text-[10px] font-normal text-muted-foreground">{companyOf(ship)}</span>}</span>
              {ship.source === "live" && <span className="text-[10px] font-semibold text-primary">AIS</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
