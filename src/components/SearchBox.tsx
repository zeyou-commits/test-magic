import type { ReactNode } from "react";
import { CheckCircle2, Loader2, MapPin, Search, X } from "lucide-react";
import { tr } from "@/lib/i18n";

export type SearchHit = {
  key: string;
  title: string;
  sub?: string | undefined;
  onPick: () => void;
};

/**
 * Le champ de recherche d'un lieu, partout pareil (ville en France, en Europe, au bled) :
 * une loupe, une roue pendant la recherche, une coche une fois le lieu choisi, une croix pour
 * effacer ; les résultats en carte sous le champ, le nom d'abord, la précision ensuite.
 */
export function SearchBox({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  busy = false,
  picked = false,
  hits,
  searched = false,
  autoComplete = "off",
  large = false,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Une recherche est en cours. */
  busy?: boolean;
  /** Le texte du champ est un lieu choisi dans la liste. */
  picked?: boolean;
  hits: SearchHit[];
  /** La recherche est finie : sans résultat, on le dit. */
  searched?: boolean;
  autoComplete?: string;
  large?: boolean;
}) {
  const listId = `${id}-lieux`;
  const empty = searched && !busy && !picked && !hits.length && value.trim().length >= 2;
  return (
    <div className="bw-searchbox" data-large={large || undefined}>
      <label htmlFor={id} className="bw-searchbox__label">
        {label}
      </label>
      {hint ? <p className="bw-searchbox__hint">{hint}</p> : null}
      <div className="bw-searchbox__field" data-picked={picked || undefined}>
        <span className="bw-searchbox__icon" aria-hidden>
          {busy ? (
            <Loader2 size={17} className="animate-spin" />
          ) : picked ? (
            <CheckCircle2 size={17} />
          ) : (
            <Search size={17} />
          )}
        </span>
        <input
          id={id}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-autocomplete="list"
          aria-controls={hits.length ? listId : undefined}
          aria-expanded={hits.length > 0}
          aria-busy={busy || undefined}
          role="combobox"
        />
        {value ? (
          <button
            type="button"
            className="bw-searchbox__clear"
            onClick={() => onChange("")}
            aria-label={tr("ui.searchBox.effacer")}
          >
            <X size={15} aria-hidden />
          </button>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {busy ? tr("ui.searchBox.rechercheEnCours") : hits.length ? `${hits.length} lieux trouvés` : ""}
      </p>
      {hits.length ? (
        <ul id={listId} role="listbox" className="bw-searchbox__list">
          {hits.map((hit) => (
            <li key={hit.key} role="option" aria-selected={false}>
              <button type="button" onClick={hit.onPick}>
                <span className="bw-searchbox__pin" aria-hidden>
                  <MapPin size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <b>{hit.title}</b>
                  {hit.sub ? <small>{hit.sub}</small> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : empty ? (
        <p className="bw-searchbox__none">{tr("ui.searchBox.aucunLieuTrouveEssayezLe")}</p>
      ) : null}
    </div>
  );
}

/** « Tizi, 06020, Semaoun, Algérie » → le nom, puis la précision sans le pays ni le code. */
export function splitPlace(label: string, country?: string) {
  const parts = label
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const title = parts.shift() ?? label;
  const rest = parts.filter((part) => !/^\d{4,6}$/.test(part) && part !== country);
  return { title, sub: rest.join(", ") || undefined };
}
