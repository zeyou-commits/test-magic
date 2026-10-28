import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  CalendarRange,
  Database,
  FileSpreadsheet,
  Flag,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Route,
  Search,
  Ship,
  Star,
  Waves,
  Users,
  Zap,
  Fuel,
  Megaphone,
  TriangleAlert,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { UserMenu } from "@/components/layout/UserMenu";

/** Groupes du menu, dans l'ordre d'affichage. */
const groups = ["Tableau de bord", "Planning", "Réseau", "Voyageurs", "À vérifier", "Équipe"];
const sections = [
  {
    id: "overview",
    label: "Vue d’ensemble",
    description: "Les priorités du jour et les actions de votre équipe.",
    group: "Tableau de bord",
    icon: LayoutDashboard,
  },
  {
    id: "commercial",
    label: "Programmes par compagnie",
    description: "Liaisons commerciales, départs, navires et sources officielles au même endroit.",
    group: "Planning",
    icon: CalendarRange,
  },
  {
    id: "departures",
    label: "Départs",
    description: "Retrouvez un départ et mettez à jour ses informations.",
    group: "Planning",
    icon: CalendarDays,
  },
  {
    id: "schedules",
    label: "Calendriers récurrents",
    description: "Gérez les programmes et les fréquences des lignes.",
    group: "Planning",
    icon: CalendarRange,
  },
  {
    id: "import",
    label: "Importer un planning",
    description: "Contrôlez les lignes de votre fichier avant de les publier.",
    group: "Planning",
    icon: FileSpreadsheet,
  },
  {
    id: "ports",
    label: "Ports",
    description: "Accès, informations pratiques et points sur la carte.",
    group: "Réseau",
    icon: MapPin,
  },
  {
    id: "routes",
    label: "Liaisons",
    description: "Les liaisons entre les deux rives.",
    group: "Réseau",
    icon: Route,
  },
  {
    id: "companies",
    label: "Compagnies",
    description: "Les transporteurs et leurs informations publiques.",
    group: "Réseau",
    icon: Building2,
  },
  {
    id: "vessels",
    label: "Navires",
    description: "Suivi en direct, photos, caractéristiques et affectations de la flotte.",
    group: "Réseau",
    icon: Ship,
  },
  {
    id: "places",
    label: "Lieux pratiques",
    description: "Stations-service, change, distributeurs autour des ports.",
    group: "Réseau",
    icon: Fuel,
  },
  {
    id: "flash",
    label: "Flash info",
    description: "Actualités et perturbations Europe ↔ Algérie, sourcées.",
    group: "Voyageurs",
    icon: Zap,
  },
  {
    id: "signals",
    label: "Catalogue des signalements",
    description:
      "Situations, choix et services proposés aux voyageurs dans « Que voyez-vous ? ».",
    group: "Voyageurs",
    icon: Megaphone,
  },
  {
    id: "community",
    label: "Modération voyageurs",
    description: "Avis sur les navires et signalements en cours, à vérifier ou à clore.",
    group: "Voyageurs",
    icon: MessageSquare,
  },
  {
    id: "reviews",
    label: "Avis des voyageurs",
    description: "Relisez les contributions avant de les rendre publiques.",
    group: "Voyageurs",
    icon: Star,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Préparez, vérifiez et diffusez les ouvertures de traversées.",
    group: "Voyageurs",
    icon: Bell,
  },
  {
    id: "alerts",
    label: "Alertes planning",
    description: "Les anomalies du calendrier à vérifier avant publication.",
    group: "À vérifier",
    icon: Flag,
  },
  {
    id: "reports",
    label: "Erreurs signalées",
    description: "Horaires ou fiches à corriger, remontés par les voyageurs (« Signaler une erreur »).",
    group: "À vérifier",
    icon: TriangleAlert,
  },
  {
    id: "data",
    label: "Qualité des données",
    description: "Contrôlez la cohérence des informations publiées.",
    group: "À vérifier",
    icon: Database,
  },
  {
    id: "users",
    label: "Utilisateurs",
    description: "Gérez les comptes voyageurs, les rôles et les accès de votre équipe.",
    group: "Équipe",
    icon: Users,
  },
];

/** Fiche retrouvable depuis la recherche du menu (port, navire, compagnie…). */
export type AdminSearchItem = { tab: string; id: string; label: string; hint: string };

export function AdminWorkspace({
  tab,
  onNavigate,
  badges,
  children,
  canAccess = () => true,
  searchItems = [],
  onOpenItem,
}: {
  tab: string;
  onNavigate: (tab: string) => void;
  badges: Record<string, number>;
  children: ReactNode;
  canAccess?: (tab: string) => boolean;
  searchItems?: AdminSearchItem[];
  onOpenItem?: (tab: string, id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  // Ctrl+K (ou Cmd+K) : chercher une rubrique ou une fiche depuis n'importe quel écran.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const plain = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");
  const foundItems =
    search.trim().length >= 2
      ? searchItems
          .filter((item) => canAccess(item.tab) && plain(`${item.label} ${item.hint}`).includes(plain(search.trim())))
          .slice(0, 8)
      : [];
  const current = sections.find((section) => section.id === tab) ?? sections[0]!;
  const available = sections.filter((section) => canAccess(section.id));
  const filtered = available.filter((section) =>
    plain(`${section.label} ${section.description}`).includes(plain(search.trim())),
  );
  const pending = badges["notifications"] ?? 0;
  return (
    <div className="bw-admin-workspace">
      <a
        href="#admin-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3"
      >
        Aller au contenu
      </a>
      <aside className="bw-admin-sidebar">
        <Link to="/" className="bw-admin-brand">
          <img src="/bledway-brand.png" alt="BledWay" />
          <span>ESPACE ÉQUIPE</span>
        </Link>
        <label className="bw-admin-search">
          <Search className="size-4" aria-hidden />
          <input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSearch("");
              if (event.key === "Enter" && foundItems[0] && onOpenItem) {
                onOpenItem(foundItems[0].tab, foundItems[0].id);
                setSearch("");
              }
            }}
            placeholder="Rubrique, port, navire…"
            aria-label="Chercher une rubrique ou une fiche (Ctrl+K)"
          />
          <kbd className="bw-admin-kbd" aria-hidden>
            Ctrl K
          </kbd>
        </label>
        <nav aria-label="Administration">
          {foundItems.length ? (
            <div className="bw-admin-nav-group">
              <h2>Fiches</h2>
              {foundItems.map((item) => {
                const Icon = sections.find((section) => section.id === item.tab)?.icon ?? Search;
                return (
                  <button
                    key={`${item.tab}:${item.id}`}
                    type="button"
                    onClick={() => {
                      onOpenItem?.(item.tab, item.id);
                      setSearch("");
                    }}
                  >
                    <Icon className="size-4" aria-hidden />
                    <span>
                      {item.label}
                      <small className="block text-[11px] font-normal text-muted-foreground">
                        {item.hint}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {groups.map((group) => {
            const items = filtered.filter((item) => item.group === group);
            return items.length ? (
              <div className="bw-admin-nav-group" key={group}>
                <h2>{group}</h2>
                {items.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    aria-current={tab === id ? "page" : undefined}
                    onClick={() => onNavigate(id)}
                  >
                    <Icon className="size-4" aria-hidden />
                    <span>{label}</span>
                    {Boolean(badges[id]) && (
                      <span className="bw-admin-nav-badge">{badges[id]}</span>
                    )}
                  </button>
                ))}
              </div>
            ) : null;
          })}
          {!filtered.length && !foundItems.length && (
            <p className="p-3 text-xs text-muted-foreground">Aucune rubrique ne correspond.</p>
          )}
        </nav>
        <div className="bw-admin-sidebar-foot">
          <Waves className="size-4 text-primary" />
          <p>
            Une équipe, deux rives.<span>Des informations utiles aux voyageurs.</span>
          </p>
        </div>
      </aside>
      <div className="bw-admin-main">
        <header className="bw-admin-topbar">
          <span className="text-xs text-muted-foreground">
            BledWay <span className="mx-2 text-border">/</span>
            <strong className="font-medium text-foreground">{current.group}</strong>
          </span>
          <div className="flex items-center gap-3">
            {canAccess("notifications") && (
              <button
                type="button"
                onClick={() => onNavigate("notifications")}
                aria-label={`${pending} campagne${pending > 1 ? "s" : ""} à vérifier`}
                className="relative grid size-9 place-items-center rounded-full border border-border"
              >
                <Bell className="size-4" />
                {pending > 0 && (
                  <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-[#d65236] text-[9px] font-bold text-white">
                    {pending}
                  </span>
                )}
              </button>
            )}
            <UserMenu compact iconOnly />
          </div>
        </header>
        <div className="bw-admin-mobile-nav">
          <label htmlFor="admin-section">Rubrique</label>
          <select
            id="admin-section"
            value={tab}
            onChange={(event) => onNavigate(event.target.value)}
          >
            {available.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
                {badges[item.id] ? ` (${badges[item.id]})` : ""}
              </option>
            ))}
          </select>
        </div>
        <main id="admin-content" className="bw-admin-content">
          <div className="bw-admin-page-heading">
            <div>
              <span className="bw-account-kicker">{current.group}</span>
              <h1>{current.label}</h1>
              <p>{current.description}</p>
            </div>
            <Link to="/" className="bw-action-secondary">
              Voir le site
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
          {pending > 0 && tab !== "notifications" && canAccess("notifications") && (
            <button
              type="button"
              onClick={() => onNavigate("notifications")}
              className="bw-admin-attention"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100">
                <Bell className="size-4 text-amber-800" />
              </span>
              <span>
                <strong>
                  {pending} annonce{pending > 1 ? "s" : ""} prête{pending > 1 ? "s" : ""} à vérifier
                </strong>
                <span>Des départs publiés correspondent à des alertes de voyageurs.</span>
              </span>
              <ArrowUpRight className="ml-auto size-4 shrink-0" />
            </button>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
