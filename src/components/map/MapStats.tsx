import { useAuth } from "@/hooks/useAuth";
import { useEffect, useRef } from "react";
import { Anchor, Building2, Ship, type LucideProps } from "lucide-react";
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
  onDismiss: () => void;
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
  onDismiss,
}: MapStatsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target))
        dismissRef.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      dismissRef.current();
      rootRef.current?.querySelector<HTMLButtonElement>("button[data-active=true]")?.focus();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [menuOpen]);
  const { isAdmin } = useAuth();
  const item =
    "flex w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-bold leading-none tabular-nums text-foreground transition-colors hover:bg-secondary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground md:min-w-11 md:text-xs";
  const shipList =
    activeShortcut === "sea" ? atSea : activeShortcut === "upcoming" ? upcomingShips : [];
  // Icônes parlantes sans légende : bateau qui tangue (en mer, avec point « en direct »),
  // bateau à l'ancre (à quai), bâtiment (compagnies), phare (ports).
  const icon = "size-4 md:size-[18px]";
  const shortcuts = [
    {
      id: "sea" as const,
      label: "En mer",
      title: "Navires en mer",
      count: atSea.length,
      icon: (
        <span className="relative inline-flex">
          <Ship className={`${icon} bw-ship-sailing`} />
          <span className="absolute -right-0.5 -top-0.5 inline-flex size-2" aria-hidden>
            <span className="absolute inline-flex size-full rounded-full bg-success opacity-75 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2 rounded-full border border-background bg-success" />
          </span>
        </span>
      ),
    },
    {
      id: "upcoming" as const,
      label: "À quai",
      title: "Navires à quai",
      count: upcomingShips.length,
      icon: (
        <span className="relative inline-flex">
          <Ship className={icon} />
          <span className="absolute -bottom-1 -right-1 grid size-3 place-items-center rounded-full bg-background">
            <Anchor className="size-2.5" strokeWidth={2.5} />
          </span>
        </span>
      ),
    },
    {
      id: "companies" as const,
      label: "Compagnies",
      title: "Compagnies des navires",
      count: companies.length,
      icon: <Building2 className={icon} />,
    },
    {
      id: "ports" as const,
      label: "Ports",
      title: "Ports et liaisons",
      count: portsCount,
      icon: <LighthouseIcon className={icon} />,
    },
  ];
  return (
    <div
      ref={rootRef}
      className="pointer-events-auto absolute left-2 top-14 z-30 md:left-auto md:right-5 md:top-5"
    >
      {/* Raccourcis empilés à la verticale, icône au-dessus du nombre : colonne étroite.
          Mobile : à gauche, sous la légende, pour dégager l'est de la carte (ports italiens). */}
      <div className="flex w-max flex-col items-stretch md:ml-auto gap-0.5 rounded-2xl border border-border bg-background/95 p-1 shadow-md backdrop-blur md:shadow-lg">
        {shortcuts.map(({ id, label, title, count, icon }) => (
          <button
            key={id}
            type="button"
            className={`${item} group relative`}
            data-active={activeShortcut === id}
            aria-label={`${title} : ${count}`}
            aria-pressed={activeShortcut === id}
            aria-expanded={activeShortcut === id && menuOpen}
            onClick={() => onToggle(id)}
          >
            <span aria-hidden className="inline-flex">
              {icon}
            </span>
            {count}
            {/* Libellé court au survol (ordinateur), à gauche de la colonne. */}
            {!(activeShortcut === id && menuOpen) ? (
              <span
                aria-hidden
                className="pointer-events-none absolute right-full top-1/2 mr-2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-semibold text-background shadow-md md:group-hover:block"
              >
                {label}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {menuOpen && activeShortcut && (
        <div
          className="absolute left-full top-0 ml-2 max-h-[min(60dvh,24rem)] md:left-auto md:right-full md:ml-0 md:mr-2 w-[min(18rem,calc(100vw-5.5rem))] overflow-y-auto rounded-2xl border border-border bg-background/95 p-1 shadow-lg backdrop-blur"
          onPointerLeave={() => onPreview(null)}
          aria-label={
            activeShortcut === "companies" ? "Filtrer les compagnies" : "Choisir un navire"
          }
        >
          {activeShortcut === "ports" ? (
            <div role="radiogroup" aria-label="Afficher les liaisons" className="p-2">
              <p className="px-1 pt-1 text-xs font-bold">Afficher les liaisons</p>
              {(
                [
                  ["published", "Avec programme publié", "Tous les programmes futurs"],
                  ["all", "Toutes les liaisons", "Y compris sans programme à venir"],
                  ["none", "Aucune liaison", "Garder les ports et les bateaux"],
                ] as const
              ).map(([value, label, description]) => {
                const selected = lineVisibility === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      onLineVisibility(value);
                      onDismiss();
                    }}
                    className={`flex min-h-12 w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-secondary ${value === "published" ? "text-success" : "text-foreground"}`}
                  >
                    <span
                      aria-hidden
                      className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${selected ? "border-current" : "border-muted-foreground/40"}`}
                    >
                      {selected ? <span className="size-2 rounded-full bg-current" /> : null}
                    </span>
                    <span>
                      <b className="block text-xs">{label}</b>
                      <span className="text-[10px] text-muted-foreground">{description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : activeShortcut === "companies" ? (
            <>
              <button
                type="button"
                className="flex w-full items-center rounded-xl px-3 py-2 text-left text-xs font-semibold hover:bg-secondary"
                aria-pressed={!selectedCompanyId}
                onClick={() => onSelectCompany(null)}
                onPointerEnter={() => onPreview(null)}
                onFocus={() => onPreview(null)}
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
                  onClick={() =>
                    onSelectCompany(selectedCompanyId === company.id ? null : company.id)
                  }
                  onPointerEnter={(e) => {
                    if (e.pointerType === "mouse") onPreview({ companyId: company.id });
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType === "mouse") onPreview(null);
                  }}
                  onFocus={() => onPreview({ companyId: company.id })}
                  onBlur={() => onPreview(null)}
                >
                  {company.logoUrl ? (
                    <img src={company.logoUrl} alt="" className="size-5 shrink-0 object-contain" />
                  ) : (
                    <Building2 className="size-4 shrink-0 text-primary" />
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
