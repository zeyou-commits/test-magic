import { useState } from "react";
import { Info, X } from "lucide-react";

/** Légende de la carte : explique les codes visuels des lignes et des ports. */
export function MapLegend({
  panelOpen,
  showDateHint,
}: {
  panelOpen: boolean;
  showDateHint: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`absolute bottom-6 z-10 hidden transition-all duration-300 md:block ${panelOpen ? "left-[420px]" : "left-10"}`}
    >
      {open ? (
        <div className="w-64 rounded-2xl border border-border bg-background/95 p-4 text-sm shadow-[var(--shadow-panel)] backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-display font-semibold">Légende</p>
            <button
              type="button"
              aria-label="Fermer la légende"
              onClick={() => setOpen(false)}
              className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <ul className="space-y-2.5 text-[13px]">
            <li className="flex items-center gap-3">
              <span className="h-[3px] w-8 shrink-0 rounded-full bg-primary" aria-hidden />
              Ligne maritime (couleur du port de départ)
            </li>
            <li className="flex items-center gap-3">
              <span className="h-[4px] w-8 shrink-0 rounded-full bg-cta" aria-hidden />
              Ligne ou port sélectionné
            </li>
            <li className="flex items-center gap-3">
              <span
                className="w-8 shrink-0 border-t-2 border-dashed border-muted-foreground/60"
                aria-hidden
              />
              {showDateHint
                ? "Pas de départ à la date choisie"
                : "Sans départ à la date choisie (si une date est filtrée)"}
            </li>
            <li className="flex items-center gap-3">
              <span className="grid w-8 shrink-0 place-items-center" aria-hidden>
                <span className="size-2.5 rounded-full border-2 border-card bg-primary shadow" />
              </span>
              Port ouvert
            </li>
            <li className="flex items-center gap-3">
              <span className="grid w-8 shrink-0 place-items-center" aria-hidden>
                <span className="size-2.5 rounded-full border-2 border-muted-foreground bg-card" />
              </span>
              Port temporairement fermé
            </li>
            <li className="flex items-center gap-3">
              <span
                className="w-8 shrink-0 text-center text-[11px] font-semibold text-foreground"
                aria-hidden
              >
                20 h
              </span>
              Durée typique de traversée
            </li>
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Tracés indicatifs en ligne droite : ils ne représentent pas la route réelle du navire.
            Les horaires sont en heure locale du port.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-background/95 px-3 text-sm font-semibold text-foreground shadow-sm backdrop-blur hover:bg-secondary"
        >
          <Info className="size-4 text-primary" />
          Légende
        </button>
      )}
    </div>
  );
}
