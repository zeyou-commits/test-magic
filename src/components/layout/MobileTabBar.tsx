import { Link } from "@tanstack/react-router";
import { BookOpen, Clock, List, MapPin, Map as MapIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const tabs: Array<{ to: string; label: string; Icon: LucideIcon }> = [
  { to: "/", label: "Carte", Icon: MapIcon },
  { to: "/horaires", label: "Horaires", Icon: Clock },
  { to: "/ports", label: "Ports", Icon: MapPin },
  { to: "/lignes", label: "Lignes", Icon: List },
  { to: "/guide", label: "Guide", Icon: BookOpen },
];

export function MobileTabBar({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-auto flex h-[60px] w-full items-center justify-around border-t bg-background px-2 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.05)] ${className}`}>
      {tabs.map(({ to, label, Icon }) => (
        <Link
          key={to}
          to={to}
          className="flex h-full flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground [&.active]:text-primary"
        >
          <Icon className="size-5" />
          <span>{label}</span>
        </Link>
      ))}
    </div>
  );
}
