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
  LineChart,
  Radio,
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
  Images,
  Smile,
  Megaphone,
  TriangleAlert,
  Newspaper,
  Menu,
  Ticket,
  X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { UserMenu } from "@/components/layout/UserMenu";

/**
 * Groupes du menu, dans l'ordre d'affichage. Le premier (sans titre) réunit le travail
 * quotidien ; les suivants se replient pour garder le menu court.
 */
const groups = ["", "Planning détaillé", "Réseau", "Voyageurs", "Contrôles", "Équipe"];
const sections = [
  {
    id: "overview",
    label: "Aujourd'hui",
    description: "Ce qui demande votre attention, classé par urgence. Chaque point se règle ici.",
    group: "",
    icon: LayoutDashboard,
  },
  {
    id: "planning",
    label: "Traversées",
    description: "Le planning de la semaine : une ligne par ligne, une colonne par jour.",
    group: "",
    icon: CalendarDays,
  },
  {
    id: "vessels",
    label: "Flotte & compagnies",
    description:
      "Une compagnie à gauche, ses navires à droite. Ajouter, archiver, remplacer ou fusionner un navire.",
    group: "",
    icon: Ship,
  },
  {
    id: "import",
    label: "Import de saison",
    description: "Contrôlez les lignes de votre fichier avant de les publier.",
    group: "",
    icon: FileSpreadsheet,
  },
  {
    id: "assign",
    label: "Affectation auto",
    description:
      "Les règles qui choisissent le navire d'une traversée, et compagnie par compagnie : automatique, proposé ou manuel.",
    group: "",
    icon: Zap,
  },
  {
    id: "incidents",
    label: "Navires immobilisés",
    description: "Source, vérification, départs concernés, messages à préparer et signalements à traiter.",
    group: "",
    icon: TriangleAlert,
  },
  {
    id: "watch",
    label: "Veille actualité",
    description:
      "Ce que Claude a repéré dans la presse et chez les compagnies : approuvez, refusez ou mettez en attente. Rien n'est appliqué sans vous.",
    group: "",
    icon: Newspaper,
  },
  {
    id: "commercial",
    label: "Programmes par compagnie",
    description: "Liaisons commerciales, départs, navires et sources officielles au même endroit.",
    group: "Planning détaillé",
    icon: CalendarRange,
  },
  {
    id: "schedules",
    label: "Calendriers récurrents",
    description: "Gérez les programmes et les fréquences des lignes.",
    group: "Planning détaillé",
    icon: CalendarRange,
  },
  {
    id: "departures",
    label: "Liste des départs",
    description: "Retrouvez un départ par sa date et mettez à jour ses informations.",
    group: "Planning détaillé",
    icon: CalendarDays,
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
    description: "Les lignes entre les deux rives.",
    group: "Réseau",
    icon: Route,
  },
  {
    id: "companies",
    label: "Fiches compagnies",
    description: "Logo, site, description, fusion des doublons et suppression des compagnies.",
    group: "Réseau",
    icon: Building2,
  },
  {
    id: "places",
    label: "Lieux pratiques",
    description: "Stations-service, change, distributeurs autour des ports.",
    group: "Réseau",
    icon: Fuel,
  },
  {
    id: "illustrations",
    label: "Illustrations",
    description: "Avatars, personnages, humeurs et icônes : remplacer une image ou la renommer.",
    group: "Voyageurs",
    icon: Images,
  },
  {
    id: "library",
    label: "Emojis et avatars",
    description:
      "La bibliothèque proposée aux voyageurs (avatar, humeur, salons) et ses catégories.",
    group: "Voyageurs",
    icon: Smile,
  },
  {
    id: "walletMedia",
    label: "Mes dinars : images et voix",
    description: "Choisissez les photos des billets et enregistrez les montants à l’oral.",
    group: "Voyageurs",
    icon: Images,
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
    id: "tickets",
    label: "Billets des voyageurs",
    description: "Écarts d’horaire relevés sur les billets et agences émettrices, sans donnée personnelle.",
    group: "Voyageurs",
    icon: Ticket,
  },
  {
    id: "reviews",
    label: "Avis et photos",
    description: "Relisez les avis et les photos des voyageurs avant de les rendre publics.",
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
    group: "Contrôles",
    icon: Flag,
  },
  {
    id: "reports",
    label: "Erreurs signalées",
    description: "Horaires ou fiches à corriger, remontés par les voyageurs (« Signaler une erreur »).",
    group: "Contrôles",
    icon: TriangleAlert,
  },
  {
    id: "data",
    label: "Qualité des données",
    description: "Contrôlez la cohérence des informations publiées.",
    group: "Contrôles",
    icon: Database,
  },
  {
    id: "health",
    label: "Santé technique",
    description: "Le signal des navires et les fiches sans identifiant.",
    group: "Contrôles",
    icon: Radio,
  },
  {
    id: "usage",
    label: "Mesure d'usage",
    description: "Les pages vues et ce que devient une recherche, sur 7 jours.",
    group: "Contrôles",
    icon: LineChart,
  },
  {
    id: "users",
    label: "Utilisateurs",
    description: "Gérez les comptes voyageurs, les rôles et les accès de votre équipe.",
    group: "Équipe",
    icon: Users,
  },
];

/** Téléphone : les rubriques du quotidien en bas de l'écran, le reste dans « Menu ». */
const MOBILE_TABS: { id: string; short: string }[] = [
  { id: "overview", short: "Aujourd'hui" },
  { id: "planning", short: "Traversées" },
  { id: "watch", short: "Veille" },
  { id: "community", short: "Modération" },
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
  const [menuOpen, setMenuOpen] = useState(false);
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
  const mobileTabs = MOBILE_TABS.filter((item) => canAccess(item.id));
  // « Menu » porte ce qui attend ailleurs que dans les rubriques de la barre.
  const menuBadge = available
    .filter((section) => !mobileTabs.some((item) => item.id === section.id))
    .reduce((sum, section) => sum + (badges[section.id] ?? 0), 0);
  const pick = (id: string) => {
    onNavigate(id);
    setMenuOpen(false);
    setSearch("");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const searchField = (
    <label className="bw-admin-search">
      <Search className="size-4" aria-hidden />
      <input
        ref={menuOpen ? undefined : searchRef}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setSearch("");
          if (event.key === "Enter" && foundItems[0] && onOpenItem) {
            onOpenItem(foundItems[0].tab, foundItems[0].id);
            setSearch("");
            setMenuOpen(false);
          }
        }}
        placeholder="Rubrique, port, navire…"
        aria-label="Chercher une rubrique ou une fiche (Ctrl+K)"
      />
      <kbd className="bw-admin-kbd" aria-hidden>
        Ctrl K
      </kbd>
    </label>
  );
  const navigation = (
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
                  setMenuOpen(false);
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
        if (!items.length) return null;
        const links = items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => pick(id)}
          >
            <Icon className="size-4" aria-hidden />
            <span>{label}</span>
            {Boolean(badges[id]) && <span className="bw-admin-nav-badge">{badges[id]}</span>}
          </button>
        ));
        if (!group) {
          return (
            <div className="bw-admin-nav-group bw-admin-nav-group--main" key="main">
              {links}
            </div>
          );
        }
        // Groupe secondaire : replié, sauf s'il contient la rubrique ouverte ou une recherche.
        const pendingInGroup = items.reduce((sum, item) => sum + (badges[item.id] ?? 0), 0);
        const open = items.some((item) => item.id === tab) || search.trim().length > 0;
        return (
          <details className="bw-admin-nav-group" key={`${group}:${open}`} open={open}>
            <summary>
              <span>{group}</span>
              {pendingInGroup > 0 && <span className="bw-admin-nav-badge">{pendingInGroup}</span>}
            </summary>
            {links}
          </details>
        );
      })}
      {!filtered.length && !foundItems.length && (
        <p className="p-3 text-xs text-muted-foreground">Aucune rubrique ne correspond.</p>
      )}
    </nav>
  );
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
          <img src="/bledway-brand-entete.webp" alt="BledWay" />
          <span>ESPACE ÉQUIPE</span>
        </Link>
        {menuOpen ? null : searchField}
        {menuOpen ? null : navigation}
        <div className="bw-admin-sidebar-foot">
          <Waves className="size-4 text-primary" />
          <p>
            Une équipe, deux rives.<span>Des informations utiles aux voyageurs.</span>
          </p>
        </div>
      </aside>
      <div className="bw-admin-main">
        <header className="bw-admin-topbar">
          <span className="bw-admin-crumb text-xs text-muted-foreground">
            BledWay <span className="mx-2 text-border">/</span>
            <strong className="font-medium text-foreground">{current.group}</strong>
          </span>
          <strong className="bw-admin-mobile-title">{current.label}</strong>
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
      <nav className="bw-admin-tabbar" aria-label="Rubriques principales">
        {mobileTabs.map((item) => {
          const Icon = sections.find((section) => section.id === item.id)?.icon ?? LayoutDashboard;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={tab === item.id && !menuOpen ? "page" : undefined}
              onClick={() => pick(item.id)}
            >
              <Icon className="size-5" aria-hidden />
              <span>{item.short}</span>
              {badges[item.id] ? <b>{badges[item.id]}</b> : null}
            </button>
          );
        })}
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-current={
            menuOpen || !mobileTabs.some((item) => item.id === tab) ? "page" : undefined
          }
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Menu className="size-5" aria-hidden />
          <span>Menu</span>
          {menuBadge ? <b>{menuBadge}</b> : null}
        </button>
      </nav>
      {menuOpen ? (
        <div
          className="bw-admin-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Toutes les rubriques"
        >
          <header>
            <strong>Toutes les rubriques</strong>
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu">
              <X className="size-5" aria-hidden />
            </button>
          </header>
          {searchField}
          {navigation}
          <Link to="/" className="bw-admin-menu__site">
            Voir le site <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
