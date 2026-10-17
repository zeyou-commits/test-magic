import { Link } from "@tanstack/react-router";
import { Anchor, Clock, List, Map as MapIcon, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const itemClass =
  "flex h-full flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[active=true]:text-primary [&.active]:text-primary";

const moreLinks = [
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
  /** Sur la page carte : revient à la recherche sans recharger la page. */
  onOpenMap?: () => void;
}

export function MobileTabBar({ className = "", onOpenMap }: MobileTabBarProps) {
  return (
    <nav
      aria-label="Navigation mobile"
      className={`pointer-events-auto flex h-[60px] w-full items-center justify-around border-t bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] backdrop-blur ${className}`}
    >
      {onOpenMap ? (
        <button
          type="button"
          onClick={onOpenMap}
          data-active="true"
          aria-current="page"
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
      <Link to="/horaires" className={itemClass}>
        <Clock className="size-5" aria-hidden />
        <span>Horaires</span>
      </Link>
      <Link to="/lignes" className={itemClass}>
        <List className="size-5" aria-hidden />
        <span>Lignes</span>
      </Link>
      <Link to="/ports" className={itemClass}>
        <Anchor className="size-5" aria-hidden />
        <span>Ports</span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger className={itemClass} aria-label="Plus de pages">
          <MoreHorizontal className="size-5" aria-hidden />
          <span>Plus</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-52">
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
