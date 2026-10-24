import { useAuth } from "@/hooks/useAuth";
import { Anchor, Flag, Ship, Waves, type LucideProps } from "lucide-react";
import type { FleetShip } from "@/lib/ferry/fleet";
import {
  shortCompanyName,
  type LineVisibility,
  type MapPreview,
} from "@/lib/ferry/mapPresentation";

export type MapShortcut = "sea" | "upcoming" | "companies" | "ports" | null;

interface MapStatsProps {
  atSea: FleetShip[];
  upcomingShips: FleetShip[];
  companies: { id: string; name: string; logoUrl: string | null; count: number }[];
  portsCount: number;
  activeShortcut: MapShortcut;
  menuOpen: boolean;
  selectedCompanyId: string | null;
  onToggle: (shortcut: Exclude<MapShortcut, null>) => void;
  onSelectCompany: (companyId: string | null) => void;
  onSelectShip: (ship: FleetShip) => void;
  companyOf: (ship: FleetShip) => string | undefined;
  infoOf: (ship: FleetShip) => { route: string; dock: string; destination: string; status: string };
  lineVisibility: LineVisibility;
  onLineVisibility: (value: LineVisibility) => void;
  onPreview: (preview: MapPreview | null) => void;
}

function LighthouseIcon({ className }: LucideProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9 9h6l1 12H8L9 9Z" />
      <path d="M8.5 15h7" />
      <path d="M10 9V6l2-2 2 2v3" />
      <path d="M5 21h14" />
      <path d="M4 5.5 7 7M20 5.5 17 7" />
    </svg>
  );
}

export function MapStats({
  atSea,
  upcomingShips,
  companies,
  portsCount,
  activeShortcut,
  menuOpen,
  selectedCompanyId,
  onToggle,
  onSelectCompany,
  onSelectShip,
  companyOf,
  infoOf,
  lineVisibility,
  onLineVisibility,
  onPreview,
}: MapStatsProps) {
  const { isAdmin } = useAuth();
  const item =
    "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-foreground transition-colors hover:bg-secondary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground md:gap-1.5 md:px-2.5 md:py-1.5 md:text-sm";
  const shipList =
    activeShortcut === "sea" ? atSea : activeShortcut === "upcoming" ? upcomingShips : [];
  const shortcuts = [
    {
      id: "sea" as const,
      label: "Navires en mer",
      count: atSea.length,
      icon: <Waves className="size-3 md:size-4" />,
    },
    {
      id: "upcoming" as const,
      label: "Navires à quai",
      count: upcomingShips.length,
      icon: <Anchor className="size-3 md:size-4" />,
    },
    {
      id: "companies" as const,
      label: "Compagnies des navires",
      count: companies.length,
      icon: <Flag className="size-3 md:size-4" />,
    },
    {
      id: "ports" as const,
      label: "Ports et liaisons",
      count: portsCount,
      icon: <LighthouseIcon className="size-3 md:size-4" />,
    },
  ];
  return (
    <div className="pointer-events-auto absolute right-2 top-3 z-20 md:right-5 md:top-5">
      <div className="ml-auto flex w-max items-center rounded-full border border-border bg-background/95 p-0.5 shadow-md backdrop-blur md:gap-0.5 md:p-1 md:shadow-lg">
        {shortcuts.map(({ id, label, count, icon }) => (
          <button
            key={id}
            type="button"
            className={item}
            data-active={activeShortcut === id}
            aria-label={`${label} : ${count}`}
            aria-pressed={activeShortcut === id}
            aria-expanded={activeShortcut === id && menuOpen}
            title={`${label} : ${count}`}
            onClick={() => onToggle(id)}
          >
            {icon}
            {count}
          </button>
        ))}
      </div>
      {menuOpen && activeShortcut && (
        <div
          className="ml-auto mt-2 max-h-[min(48dvh,20rem)] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-border bg-background/95 p-1 shadow-lg backdrop-blur"
          onPointerLeave={() => onPreview(null)}
          aria-label={
            activeShortcut === "companies" ? "Filtrer les compagnies" : "Choisir un navire"
          }
        >
          {activeShortcut === "ports" ? (
            <fieldset className="p-2">
              <legend className="px-1 pt-1 text-xs font-bold">Afficher les liaisons</legend>
              {(
                [
                  ["published", "Avec programme publié", "Tous les programmes futurs"],
                  ["all", "Toutes les liaisons", "Y compris sans programme à venir"],
                  ["none", "Aucune liaison", "Garder les ports et les bateaux"],
                ] as const
              ).map(([value, label, description]) => (
                <label
                  key={value}
                  className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-2 py-2 hover:bg-secondary"
                >
                  <input
                    type="radio"
                    name="map-lines"
                    value={value}
                    checked={lineVisibility === value}
                    onChange={() => onLineVisibility(value)}
                    className="accent-primary"
                  />
                  <span>
                    <b className="block text-xs">{label}</b>
                    <span className="text-[10px] text-muted-foreground">{description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : activeShortcut === "companies" ? (
            <>
              <button
                type="button"
                className="flex w-full items-center rounded-xl px-3 py-2 text-left text-xs font-semibold hover:bg-secondary"
                aria-pressed={!selectedCompanyId}
                onClick={() => onSelectCompany(null)}
              >
                Toutes les compagnies
              </button>
              {companies.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium hover:bg-secondary data-[active=true]:bg-secondary"
                  data-active={selectedCompanyId === company.id}
                  aria-pressed={selectedCompanyId === company.id}
                  onClick={() => onSelectCompany(company.id)}
                >
                  {company.logoUrl ? (
                    <img src={company.logoUrl} alt="" className="size-5 shrink-0 object-contain" />
                  ) : (
                    <Flag className="size-4 shrink-0 text-primary" />
                  )}
                  <span className="truncate" title={company.name}>
                    {shortCompanyName(company.name)} ({company.count})
                  </span>
                </button>
              ))}
              {companies.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Aucune compagnie pour le moment
                </p>
              )}
            </>
          ) : shipList.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Aucun navire pour le moment</p>
          ) : (
            shipList.map((ship) => (
              <button
                key={ship.id}
                type="button"
                onClick={() => onSelectShip(ship)}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse")
                    onPreview({
                      routeId: ship.routeId,
                      ...(ship.vesselId ? { vesselId: ship.vesselId } : {}),
                    });
                }}
                onFocus={() =>
                  onPreview({
                    routeId: ship.routeId,
                    ...(ship.vesselId ? { vesselId: ship.vesselId } : {}),
                  })
                }
                onBlur={() => onPreview(null)}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium hover:bg-secondary"
              >
                <Ship className="size-3.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate">{ship.name}</span>
                  <span
                    className="block truncate text-[10px] font-normal text-muted-foreground"
                    title={companyOf(ship)}
                  >
                    {shortCompanyName(companyOf(ship) ?? "Compagnie à confirmer")} ·{" "}
                    {infoOf(ship).route}
                  </span>
                  {activeShortcut === "upcoming" && (
                    <>
                      <span className="mt-1 block truncate text-[10px]">
                        {infoOf(ship).dock} → {infoOf(ship).destination}
                      </span>
                      <span className="block text-[10px] font-normal text-primary">
                        {infoOf(ship).status}
                      </span>
                    </>
                  )}
                </span>
                {isAdmin && ship.source === "live" && (
                  <span className="text-[10px] font-semibold text-primary">AIS</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
