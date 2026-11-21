import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronDown,
  CornerDownLeft,
  Ellipsis,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { UserMenu } from "@/components/layout/UserMenu";

export type ShellSpace = { id: string; label: string; tagline: string; icon: LucideIcon };
export type ShellSection = {
  id: string;
  label: string;
  short?: string;
  description: string;
  group: string;
  icon: LucideIcon;
};
export type ShellSearchItem = { tab: string; id: string; label: string; hint: string };

const RAIL_KEY = "bledway:backoffice-rail";
const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr");

/**
 * Le cadre commun des espaces de travail (équipe, compagnie) : menu par espaces à gauche,
 * onglets des rubriques d'un même espace en haut de page, recherche générale (Ctrl+K),
 * barre du bas sur téléphone. Le contenu de chaque rubrique est fourni par la page.
 */
export function BackofficeShell({
  kind,
  brandLabel,
  brandSub,
  spaces,
  sections,
  tab,
  onNavigate,
  badges = {},
  canAccess = () => true,
  searchItems = [],
  onOpenItem,
  topActions,
  notice,
  children,
}: {
  kind: "team" | "company";
  brandLabel: string;
  /** Sous la marque : le rôle du compte, ou la compagnie. */
  brandSub?: ReactNode;
  spaces: ShellSpace[];
  sections: ShellSection[];
  tab: string;
  onNavigate: (tab: string) => void;
  badges?: Record<string, number>;
  canAccess?: (tab: string) => boolean;
  searchItems?: ShellSearchItem[];
  onOpenItem?: ((tab: string, id: string) => void) | undefined;
  /** Boutons de la barre du haut (cloche, etc.). */
  topActions?: ReactNode;
  /** Message au-dessus du contenu (refus d'accès, aperçu…). */
  notice?: ReactNode;
  children: ReactNode;
}) {
  const [rail, setRail] = useState(false);
  const [palette, setPalette] = useState(false);
  const [more, setMore] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      setRail(window.localStorage.getItem(RAIL_KEY) === "1");
    } catch {
      /* stockage indisponible : le menu reste déplié */
    }
  }, []);
  const toggleRail = () =>
    setRail((value) => {
      try {
        window.localStorage.setItem(RAIL_KEY, value ? "0" : "1");
      } catch {
        /* sans stockage, le choix dure le temps de la page */
      }
      return !value;
    });
  // Ctrl+K (ou Cmd+K) : chercher une rubrique ou une fiche depuis n'importe quel écran.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!palette) return;
    setQuery("");
    setCursor(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [palette]);

  const available = useMemo(
    () => sections.filter((section) => canAccess(section.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, canAccess],
  );
  const current = available.find((section) => section.id === tab) ?? available[0] ?? sections[0]!;
  const visibleSpaces = spaces
    .map((space) => ({
      ...space,
      items: available.filter((section) => section.group === space.id),
    }))
    .filter((space) => space.items.length);
  const currentSpace =
    visibleSpaces.find((space) => space.id === current.group) ?? visibleSpaces[0];
  const siblings = currentSpace?.items ?? [];
  const sum = (items: ShellSection[]) =>
    items.reduce((total, item) => total + (badges[item.id] ?? 0), 0);
  const go = (id: string) => {
    onNavigate(id);
    setMore(false);
    setPalette(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  // Résultats de la recherche : d'abord les rubriques, puis les fiches.
  const needle = plain(query.trim());
  const results = [
    ...available
      .filter((section) =>
        plain(`${section.label} ${section.group} ${section.description}`).includes(needle),
      )
      .slice(0, needle ? 8 : 6)
      .map((section) => ({
        key: `s:${section.id}`,
        label: section.label,
        hint: section.group,
        icon: section.icon,
        run: () => go(section.id),
      })),
    ...(needle.length >= 2
      ? searchItems
          .filter(
            (item) => canAccess(item.tab) && plain(`${item.label} ${item.hint}`).includes(needle),
          )
          .slice(0, 8)
          .map((item) => ({
            key: `i:${item.tab}:${item.id}`,
            label: item.label,
            hint: item.hint,
            icon: sections.find((section) => section.id === item.tab)?.icon ?? Search,
            run: () => {
              onOpenItem?.(item.tab, item.id);
              setPalette(false);
            },
          }))
      : []),
  ];
  const mobileSpaces = visibleSpaces.slice(0, 4);
  const moreBadge = sum(visibleSpaces.slice(4).flatMap((space) => space.items));
  // Profil resserré (5 rubriques ou moins, ex. modérateur) : la barre du bas montre directement
  // les rubriques, sans passer par les espaces.
  const flatBottom = available.length <= 5;

  const spaceList = (compact: boolean) =>
    visibleSpaces.map((space) => {
      const active = space.id === currentSpace?.id;
      const pending = sum(space.items);
      const Icon = space.icon;
      return (
        <div className="bo-space" key={space.id} data-active={active || undefined}>
          <button
            type="button"
            className="bo-space__head"
            aria-expanded={compact ? undefined : active}
            aria-current={compact && active ? "page" : undefined}
            title={compact ? space.label : undefined}
            onClick={() => go(active ? current.id : space.items[0]!.id)}
          >
            <span className="bo-space__icon">
              <Icon aria-hidden />
              {compact && pending ? <i aria-hidden /> : null}
            </span>
            {compact ? null : (
              <>
                <span className="bo-space__label">
                  {space.label}
                  <small>{space.tagline}</small>
                </span>
                {pending ? <b className="bo-badge">{pending}</b> : null}
                <ChevronDown className="bo-space__chev" aria-hidden />
              </>
            )}
          </button>
          {active && !compact ? (
            <ul className="bo-space__items">
              {space.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-current={item.id === current.id ? "page" : undefined}
                    onClick={() => go(item.id)}
                  >
                    <span>{item.label}</span>
                    {badges[item.id] ? <b className="bo-badge">{badges[item.id]}</b> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    });

  return (
    <div className="bo" data-kind={kind} data-rail={rail || undefined}>
      <a href="#bo-content" className="bo-skip">
        Aller au contenu
      </a>
      <aside className="bo-side" aria-label={brandLabel}>
        <div className="bo-brand">
          <Link to="/" className="bo-brand__logo" aria-label="BledWay, retour au site">
            <img src="/favicon-192.png" alt="" width={36} height={36} />
          </Link>
          {rail ? null : (
            <p>
              <strong>BledWay</strong>
              <span>{brandLabel}</span>
            </p>
          )}
        </div>
        {rail ? null : brandSub}
        <button
          type="button"
          className="bo-find"
          onClick={() => setPalette(true)}
          aria-label="Chercher une rubrique ou une fiche (Ctrl+K)"
          title={rail ? "Chercher (Ctrl+K)" : undefined}
        >
          <Search aria-hidden />
          {rail ? null : (
            <>
              <span>Chercher…</span>
              <kbd>Ctrl K</kbd>
            </>
          )}
        </button>
        <nav className="bo-nav" aria-label="Espaces">
          {spaceList(rail)}
        </nav>
        <Link
          to="/"
          className="bo-back"
          aria-label={rail ? "Retour au site" : undefined}
          title={rail ? "Retour au site" : undefined}
        >
          <ArrowLeft aria-hidden />
          {rail ? null : <span>Retour au site</span>}
        </Link>
        <button
          type="button"
          className="bo-rail"
          onClick={toggleRail}
          aria-label={rail ? "Déplier le menu" : "Replier le menu"}
          title={rail ? "Déplier le menu" : undefined}
        >
          {rail ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
          {rail ? null : <span>Replier le menu</span>}
        </button>
      </aside>

      <div className="bo-main">
        <header className="bo-top">
          {/* Sur téléphone, le retour au site est à gauche, à la place du fil d'Ariane. */}
          <Link to="/" className="bo-back-top" aria-label="Retour au site">
            <ArrowLeft aria-hidden />
            <span>Site</span>
          </Link>
          <p className="bo-crumb">
            <span>{currentSpace?.label}</span>
            <i aria-hidden>/</i>
            <strong>{current.label}</strong>
          </p>
          <div className="bo-top__actions">
            <button
              type="button"
              className="bo-iconbtn bo-top__search"
              onClick={() => setPalette(true)}
              aria-label="Chercher"
            >
              <Search aria-hidden />
            </button>
            {topActions}
            <Link to="/" className="bo-site">
              <ArrowLeft aria-hidden /> Retour au site
            </Link>
            <UserMenu compact iconOnly />
          </div>
        </header>
        <main id="bo-content" className="bo-content">
          <div className="bo-heading">
            <span className="bo-heading__icon" aria-hidden>
              <current.icon />
            </span>
            <div>
              <h1>{current.label}</h1>
              <p>{current.description}</p>
            </div>
          </div>
          {siblings.length > 1 ? (
            <nav
              className="bo-tabs"
              data-flat={flatBottom || undefined}
              aria-label={`Rubriques de l'espace ${currentSpace?.label}`}
            >
              {siblings.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={item.id === current.id ? "page" : undefined}
                  onClick={() => go(item.id)}
                >
                  {item.short ?? item.label}
                  {badges[item.id] ? <b className="bo-badge">{badges[item.id]}</b> : null}
                </button>
              ))}
            </nav>
          ) : null}
          {notice}
          <div className="bo-page">{children}</div>
        </main>
      </div>

      <nav className="bo-bottom" aria-label={flatBottom ? "Rubriques" : "Espaces"}>
        {flatBottom
          ? available.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={item.id === current.id ? "page" : undefined}
                  onClick={() => go(item.id)}
                >
                  <Icon aria-hidden />
                  <span>{item.short ?? item.label}</span>
                  {badges[item.id] ? <b>{badges[item.id]}</b> : null}
                </button>
              );
            })
          : null}
        {flatBottom
          ? null
          : mobileSpaces.map((space) => {
              const Icon = space.icon;
              const pending = sum(space.items);
              return (
                <button
                  key={space.id}
                  type="button"
                  aria-current={space.id === currentSpace?.id && !more ? "page" : undefined}
                  onClick={() =>
                    go(space.id === currentSpace?.id ? current.id : space.items[0]!.id)
                  }
                >
                  <Icon aria-hidden />
                  <span>{space.label}</span>
                  {pending ? <b>{pending}</b> : null}
                </button>
              );
            })}
        {!flatBottom && visibleSpaces.length > 4 ? (
          <button
            type="button"
            aria-expanded={more}
            aria-current={
              more || !mobileSpaces.some((space) => space.id === currentSpace?.id)
                ? "page"
                : undefined
            }
            onClick={() => setMore((open) => !open)}
          >
            <Ellipsis aria-hidden />
            <span>Plus</span>
            {moreBadge ? <b>{moreBadge}</b> : null}
          </button>
        ) : null}
      </nav>
      {more ? (
        <div className="bo-sheet" role="dialog" aria-modal="true" aria-label="Tous les espaces">
          <header>
            <strong>{brandLabel}</strong>
            <button type="button" onClick={() => setMore(false)} aria-label="Fermer">
              <X aria-hidden />
            </button>
          </header>
          {brandSub}
          <Link to="/" className="bo-back bo-back--sheet">
            <ArrowLeft aria-hidden />
            <span>Retour au site</span>
          </Link>
          <div className="bo-sheet__grid">
            {visibleSpaces.map((space) => (
              <section key={space.id}>
                <h2>
                  <space.icon aria-hidden /> {space.label}
                </h2>
                {space.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={item.id === current.id ? "page" : undefined}
                    onClick={() => go(item.id)}
                  >
                    {item.label}
                    {badges[item.id] ? <b className="bo-badge">{badges[item.id]}</b> : null}
                  </button>
                ))}
              </section>
            ))}
          </div>
        </div>
      ) : null}

      {palette ? (
        <div className="bo-palette" role="dialog" aria-modal="true" aria-label="Recherche">
          <button
            type="button"
            className="bo-palette__scrim"
            aria-label="Fermer la recherche"
            onClick={() => setPalette(false)}
          />
          <div className="bo-palette__box">
            <label>
              <Search aria-hidden />
              <input
                ref={inputRef}
                value={query}
                placeholder="Rubrique, port, navire, compagnie…"
                aria-label="Chercher une rubrique ou une fiche"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCursor(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setPalette(false);
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setCursor((value) => Math.min(value + 1, results.length - 1));
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setCursor((value) => Math.max(value - 1, 0));
                  }
                  if (event.key === "Enter") results[cursor]?.run();
                }}
              />
              <kbd>Échap</kbd>
            </label>
            <ul>
              {results.map((result, index) => (
                <li key={result.key}>
                  <button
                    type="button"
                    data-active={index === cursor || undefined}
                    onMouseEnter={() => setCursor(index)}
                    onClick={result.run}
                  >
                    <result.icon aria-hidden />
                    <span>
                      {result.label}
                      <small>{result.hint}</small>
                    </span>
                    <CornerDownLeft aria-hidden />
                  </button>
                </li>
              ))}
              {results.length ? null : <li className="bo-palette__empty">Aucun résultat.</li>}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
