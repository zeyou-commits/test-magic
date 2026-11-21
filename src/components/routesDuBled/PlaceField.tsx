import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, MapPin, MapPinned, Navigation } from "lucide-react";
import { tr } from "@/lib/i18n";
import { searchItineraryAddress } from "@/lib/ferry/itinerary.functions";
import type { Lieu } from "@/lib/routesDuBled/porteAPorte";

type Item = { kind: "geo" } | { kind: "pick" } | { kind: "lieu"; lieu: Lieu };

/**
 * Champ d'adresse libre : on tape, on choisit une suggestion (Photon / OpenStreetMap),
 * ou « Ma position », ou un point touché sur la carte.
 */
export function PlaceField({
  id,
  label,
  placeholder,
  value,
  country,
  onChoose,
  onLocate,
  locating = false,
  onPickOnMap,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: Lieu | null;
  /** Code pays imposé (DZ pour l'arrivée) ; sinon l'Europe. */
  country?: "DZ";
  onChoose: (lieu: Lieu) => void;
  onLocate?: () => void;
  locating?: boolean;
  onPickOnMap: () => void;
}) {
  const [text, setText] = useState(value?.label ?? "");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Lieu[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    setText(value?.label ?? "");
  }, [value]);

  // Recherche après une courte pause de frappe, pour ne pas solliciter le service à chaque lettre.
  useEffect(() => {
    const q = text.trim();
    if (!open || q.length < 3 || q === value?.label) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      void searchItineraryAddress({
        data: { query: q, ...(country ? { countryCode: country } : {}) },
      })
        .then((r) => {
          if (!cancelled) setResults(r.map((x) => ({ label: x.label, point: x.point })));
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [text, open, country, value?.label]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) {
        setOpen(false);
        setText(value?.label ?? "");
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open, value?.label]);

  const items: Item[] = [
    ...(onLocate ? [{ kind: "geo" as const }] : []),
    ...results.map((lieu) => ({ kind: "lieu" as const, lieu })),
    { kind: "pick" as const },
  ];
  const choose = (it: Item) => {
    setOpen(false);
    setActive(-1);
    (document.getElementById(id) as HTMLInputElement | null)?.blur();
    if (it.kind === "geo") onLocate?.();
    else if (it.kind === "pick") {
      setText(value?.label ?? "");
      onPickOnMap();
    } else onChoose(it.lieu);
  };
  const q = text.trim();

  return (
    <div className="rdb-place" ref={wrap}>
      <label htmlFor={id}>{label}</label>
      <div className="rdb-place__in">
        <input
          id={id}
          type="text"
          autoComplete="off"
          enterKeyHint="search"
          placeholder={placeholder}
          value={text}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onFocus={(e) => {
            e.currentTarget.select();
            setOpen(true);
          }}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const n = items.length;
              setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
            } else if (e.key === "Enter") {
              e.preventDefault();
              const it = items[active] ?? items.find((x) => x.kind === "lieu");
              if (it) choose(it);
            } else if (e.key === "Escape") {
              setOpen(false);
              setText(value?.label ?? "");
            }
          }}
        />
        {onLocate ? (
          <button
            type="button"
            className="rdb-place__geo"
            onClick={onLocate}
            aria-label={tr("ui.pageRoutesDuBled.maPosition")}
            title={tr("ui.pageRoutesDuBled.maPosition")}
          >
            {locating ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Navigation className="size-4" aria-hidden />
            )}
          </button>
        ) : null}
      </div>
      {open ? (
        <ul className="rdb-sugg" id={listId} role="listbox">
          {items.map((it, i) => (
            <li
              key={it.kind === "lieu" ? `${it.lieu.label}-${i}` : it.kind}
              role="option"
              aria-selected={i === active}
            >
              <button
                type="button"
                data-active={i === active || undefined}
                onClick={() => choose(it)}
              >
                <span className="rdb-sugg__ico" data-kind={it.kind}>
                  {it.kind === "geo" ? (
                    <Navigation className="size-4" aria-hidden />
                  ) : it.kind === "pick" ? (
                    <MapPinned className="size-4" aria-hidden />
                  ) : (
                    <MapPin className="size-4" aria-hidden />
                  )}
                </span>
                <span className="min-w-0">
                  {it.kind === "geo"
                    ? tr("ui.pageRoutesDuBled.maPosition")
                    : it.kind === "pick"
                      ? tr("ui.pageRoutesDuBled.choisirSurLaCarte")
                      : it.lieu.label}
                </span>
              </button>
            </li>
          ))}
          {q.length >= 3 && q !== value?.label && !searching && !results.length ? (
            <li className="rdb-sugg__none">{tr("ui.pageRoutesDuBled.adresseIntrouvable")}</li>
          ) : null}
          {searching ? (
            <li className="rdb-sugg__none">{tr("ui.pageRoutesDuBled.recherche")}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
