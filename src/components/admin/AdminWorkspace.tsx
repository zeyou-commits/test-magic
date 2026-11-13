import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Bell, LayoutDashboard, Search, Waves, Menu, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { UserMenu } from "@/components/layout/UserMenu";
import { adminGroups as groups, adminSections as sections, sectionLabel } from "./adminSections";
import { ROLE_CATALOG, rolesForTab, staffRoles } from "@/lib/admin/permissions";

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
  roles = [],
  refusedTab,
}: {
  tab: string;
  onNavigate: (tab: string) => void;
  badges: Record<string, number>;
  children: ReactNode;
  canAccess?: (tab: string) => boolean;
  searchItems?: AdminSearchItem[];
  onOpenItem?: (tab: string, id: string) => void;
  /** Rôles d'équipe du compte connecté, affichés sous « Espace équipe ». */
  roles?: readonly string[];
  /** Rubrique demandée (lien, adresse) mais fermée à ce rôle : on explique au lieu de rediriger en silence. */
  refusedTab?: string | undefined;
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
          .filter(
            (item) =>
              canAccess(item.tab) &&
              plain(`${item.label} ${item.hint}`).includes(plain(search.trim())),
          )
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
  const mine = staffRoles(roles);
  const roleBadge = mine.length ? (
    <p className="bw-admin-role" aria-label="Votre rôle">
      <span className="bw-admin-role__label">Votre rôle</span>
      <span className="bw-admin-role__chips">
        {mine.map((role) => (
          <span key={role} className={`bw-role-chip bw-role-chip--${role}`}>
            {ROLE_CATALOG[role].label}
          </span>
        ))}
      </span>
      <span className="bw-admin-role__count">
        {available.length} rubrique{available.length > 1 ? "s" : ""}
      </span>
    </p>
  ) : null;
  const refusedBy = refusedTab ? rolesForTab(refusedTab) : [];
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
        {roleBadge}
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
          {refusedTab && (
            <div role="alert" className="bw-admin-refused">
              <strong>
                « {sectionLabel(refusedTab)} » est réservée aux{" "}
                {[...refusedBy.filter((role) => role !== "admin"), "admin" as const]
                  .map((role) => `${ROLE_CATALOG[role].label.toLowerCase()}s`)
                  .join(" et aux ")}
                .
              </strong>
              <span>
                Votre rôle ({mine.map((role) => ROLE_CATALOG[role].label).join(", ")}) ne l'ouvre
                pas. Pour y accéder, demandez à un administrateur. Vous voyez à la place «{" "}
                {current.label} ».
              </span>
            </div>
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
          {roleBadge}
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
