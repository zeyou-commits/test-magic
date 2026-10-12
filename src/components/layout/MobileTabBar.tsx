import { Link } from "@tanstack/react-router";
import { CalendarDays, Clock, List, Map as MapIcon, MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const itemClass =
  "flex h-full flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[active=true]:text-primary [&.active]:text-primary";

const moreLinks = [
  { to: "/ports", label: "Ports" },
  { to: "/compagnies", label: "Compagnies" },
  { to: "/guide", label: "Guide pratique" },
  { to: "/a-propos", label: "À propos" },
  { to: "/contact", label: "Contact" },
] as const;

interface MobileTabBarProps {
  className?: string;
  /** Sur la page carte : onglet actif du volet. */
  mapTab?: "map" | "plan";
  /** Sur la page carte : bascule le volet sans recharger la page. */
  onOpenMap?: () => void;
  onOpenPlanner?: () => void;
}

export function MobileTabBar({
  className = "",
  mapTab,
  onOpenMap,
  onOpenPlanner,
}: MobileTabBarProps) {
  const onMapPage = Boolean(onOpenMap && onOpenPlanner);

  const mapItem = (label: string, Icon: LucideIcon, tab: "map" | "plan") =>
    onMapPage ? (
      <button
        type="button"
        onClick={tab === "map" ? onOpenMap : onOpenPlanner}
        data-active={mapTab === tab}
        aria-current={mapTab === tab ? "page" : undefined}
        className={itemClass}
      >
        <Icon className="size-5" aria-hidden />
        <span>{label}</span>
      </button>
    ) : (
      <Link
        to="/"
        search={(tab === "plan" ? { plan: "1" } : {}) as never}
        className={itemClass}
        activeOptions={{ exact: true, includeSearch: true }}
      >
        <Icon className="size-5" aria-hidden />
        <span>{label}</span>
      </Link>
    );

  return (
    <nav
      aria-label="Navigation mobile"
      className={`pointer-events-auto flex h-[60px] w-full items-center justify-around border-t bg-background px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] ${className}`}
    >
      {mapItem("Carte", MapIcon, "map")}
      {mapItem("Planifier", CalendarDays, "plan")}
      <Link to="/horaires" className={itemClass}>
        <Clock className="size-5" aria-hidden />
        <span>Horaires</span>
      </Link>
      <Link to="/lignes" className={itemClass}>
        <List className="size-5" aria-hidden />
        <span>Lignes</span>
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
