import { Link } from "@tanstack/react-router";
import { Anchor, Clock, Map as MapIcon, MoreHorizontal, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const itemClass =
  "flex h-full flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[active=true]:text-primary [&.active]:text-primary";

const moreLinks = [
  { to: "/horaires", label: "Tous les horaires" },
  { to: "/ports", label: "Annuaire des ports" },
  { to: "/lignes", label: "Lignes" },
  { to: "/compagnies", label: "Compagnies" },
  { to: "/guide", label: "Guide pratique" },
  { to: "/vehicules-moins-3-ans", label: "Véhicules de moins de 3 ans" },
  { to: "/bateaux", label: "Dossiers bateaux" },
  { to: "/simulateurs", label: "Simulateurs" },
  { to: "/covoiturage", label: "Covoiturage" },
  { to: "/a-propos", label: "À propos" },
  { to: "/contact", label: "Contact" },
] as const;

interface MobileTabBarProps {
  className?: string;
  activeTab?: "map" | "departures" | "search" | "ports";
  onOpenMap?: () => void;
  onOpenDepartures?: () => void;
  onOpenSearch?: () => void;
  onShowPorts?: () => void;
  onOpenItinerary?: () => void;
}

const rememberAction = (action: "departures" | "search" | "ports" | "itinerary") =>
  window.sessionStorage.setItem("bledway:open-home-action", action);

export function MobileTabBar({
  className = "",
  activeTab,
  onOpenMap,
  onOpenDepartures,
  onOpenSearch,
  onShowPorts,
  onOpenItinerary,
}: MobileTabBarProps) {
  return (
    <nav
      aria-label="Navigation mobile"
      className={`pointer-events-auto flex h-[60px] w-full items-center justify-around border-t bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] backdrop-blur ${className}`}
    >
      {onOpenMap ? (
        <button
          type="button"
          onClick={onOpenMap}
          data-active={activeTab === "map"}
          aria-current={activeTab === "map" ? "page" : undefined}
          className={itemClass}
        >
          <MapIcon className="size-5" aria-hidden />
          <span>Carte</span>
        </button>
      ) : (
        <Link to="/" className={itemClass} activeOptions={{ exact: true }}>
          <MapIcon className="size-5" aria-hidden />
          <span>Carte</span>
        </Link>
      )}
      {onOpenDepartures ? (
        <button
          type="button"
          onClick={onOpenDepartures}
          data-active={activeTab === "departures"}
          className={itemClass}
        >
          <Clock className="size-5" aria-hidden />
          <span>Départs</span>
        </button>
      ) : (
        <Link to="/" onClick={() => rememberAction("departures")} className={itemClass}>
          <Clock className="size-5" aria-hidden />
          <span>Départs</span>
        </Link>
      )}
      {onOpenSearch ? (
        <button
          type="button"
          onClick={onOpenSearch}
          data-active={activeTab === "search"}
          className={`${itemClass} text-primary`}
          aria-label="Chercher une traversée"
        >
          <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-md">
            <Search className="size-5" aria-hidden />
          </span>
          <span>Chercher</span>
        </button>
      ) : (
        <Link
          to="/"
          onClick={() => rememberAction("search")}
          className={`${itemClass} text-primary`}
          aria-label="Chercher une traversée"
        >
          <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-md">
            <Search className="size-5" aria-hidden />
          </span>
          <span>Chercher</span>
        </Link>
      )}
      {onShowPorts ? (
        <button
          type="button"
          onClick={onShowPorts}
          data-active={activeTab === "ports"}
          className={itemClass}
        >
          <Anchor className="size-5" aria-hidden />
          <span>Ports</span>
        </button>
      ) : (
        <Link to="/" onClick={() => rememberAction("ports")} className={itemClass}>
          <Anchor className="size-5" aria-hidden />
          <span>Ports</span>
        </Link>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger className={itemClass} aria-label="Plus de pages">
          <MoreHorizontal className="size-5" aria-hidden />
          <span>Plus</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-52">
          <DropdownMenuItem asChild>
            {onOpenItinerary ? <button type="button" className="w-full" onClick={onOpenItinerary}>Itinéraire porte à porte</button> : <Link to="/" onClick={() => rememberAction("itinerary")}>Itinéraire porte à porte</Link>}
          </DropdownMenuItem>
          {moreLinks.map((link) => (
            <DropdownMenuItem key={link.to} asChild>
              <Link to={link.to}>{link.label}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
