import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { CabasImg } from "@/components/CabasImg";
import type { AvatarRow } from "@/lib/community/avatars";
import { normalizeSearch, useLibrary, type LibraryGroup } from "@/lib/community/library";
import { tr } from "@/lib/i18n";

const ALL = "__tout";

/**
 * Choisir une image dans toute la bibliothèque (avatar, humeur, salon). Les catégories servent à
 * naviguer (« Tout » par défaut) et la recherche porte sur le nom et la catégorie : rien n'est
 * réservé à un usage.
 */
export function LibraryPicker({
  selected,
  onPick,
  ariaLabel,
  background,
  labels = true,
  size = 48,
  disabled = false,
  compact = false,
}: {
  selected?: string | null;
  onPick: (row: AvatarRow) => void;
  ariaLabel: string;
  /** Couleur de fond des vignettes (couleur de l'avatar). */
  background?: string;
  labels?: boolean;
  size?: number;
  disabled?: boolean;
  /** Version serrée (panneau du salon). */
  compact?: boolean;
}) {
  const library = useLibrary();
  const [tab, setTab] = useState(ALL);
  const [search, setSearch] = useState("");
  const query = normalizeSearch(search);

  // « Tout » : chaque image une seule fois, sous sa première catégorie.
  const sections = useMemo<LibraryGroup[]>(() => {
    if (query) {
      const found = library.rows.filter((row) =>
        [row.label, row.id, ...(library.categoriesOf.get(row.id) ?? [])].some((text) =>
          normalizeSearch(text).includes(query),
        ),
      );
      return [{ id: "search", label: "", rows: found }];
    }
    if (tab !== ALL) return library.groups.filter((group) => group.id === tab);
    const seen = new Set<string>();
    return library.groups
      .map((group) => ({
        ...group,
        rows: group.rows.filter((row) => !seen.has(row.id) && seen.add(row.id)),
      }))
      .filter((group) => group.rows.length);
  }, [library.groups, library.rows, library.categoriesOf, query, tab]);

  const current = library.groups.some((group) => group.id === tab) ? tab : ALL;
  const total = library.rows.length;

  return (
    <div className="bw-library" data-compact={compact || undefined}>
      <div className="bw-library__search">
        <Search size={15} aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Chercher parmi ${total} images`}
          aria-label={tr("ui.libraryPicker.chercherUneImage")}
        />
        {search ? (
          <button type="button" aria-label={tr("ui.libraryPicker.effacerLaRecherche")} onClick={() => setSearch("")}>
            <X size={14} aria-hidden />
          </button>
        ) : null}
      </div>
      {query ? null : (
        <div className="bw-library__tabs" role="tablist" aria-label={tr("ui.libraryPicker.categories")}>
          {[{ id: ALL, label: "Tout", rows: library.rows }, ...library.groups].map((group) => (
            <button
              key={group.id}
              type="button"
              role="tab"
              aria-selected={current === group.id}
              onClick={() => setTab(group.id)}
            >
              {group.label} <small>{group.rows.length}</small>
            </button>
          ))}
        </div>
      )}
      <div className="bw-library__scroll">
        {library.pending && !total ? <p className="bw-library__empty">{tr("ui.libraryPicker.chargement")}</p> : null}
        {sections.map((section) => (
          <section key={section.id}>
            {current === ALL && section.label && sections.length > 1 ? (
              <h4 className="bw-library__group">{section.label}</h4>
            ) : null}
            <div className="bw-library__grid" role="radiogroup" aria-label={ariaLabel}>
              {section.rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  role="radio"
                  aria-checked={selected === row.id}
                  aria-label={row.label}
                  title={row.label}
                  disabled={disabled}
                  onClick={() => onPick(row)}
                  style={background ? { background } : undefined}
                >
                  <CabasImg src={row.image} alt="" width={size} height={size} loading="lazy" />
                  {labels ? <span>{row.label}</span> : null}
                  {selected === row.id ? <Check size={13} aria-hidden /> : null}
                </button>
              ))}
            </div>
          </section>
        ))}
        {query && !sections[0]?.rows.length ? (
          <p className="bw-library__empty">{tr("ui.libraryPicker.aucuneImageNeCorrespondA")}{search.trim()} ».</p>
        ) : null}
      </div>
    </div>
  );
}
