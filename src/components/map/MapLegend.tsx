import { useState } from "react";
import { Info, X } from "lucide-react";

/** Légende de la carte : explique les codes visuels des lignes et des ports. */
export function MapLegend({
  panelOpen: _panelOpen,
  showDateHint,
}: {
  panelOpen: boolean;
  showDateHint: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute left-3 top-3 z-20 transition-all duration-200 md:bottom-6 md:left-auto md:right-32 md:top-auto">
      {open ? (
        <div className="mt-10 w-56 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-border bg-background/95 p-3 text-xs shadow-[var(--shadow-panel)] backdrop-blur md:mt-0 md:w-64 md:p-4 md:text-sm">
          <div className="mb-2 flex items-center justify-between md:mb-3">
            <p className="font-display text-sm font-semibold">Légende</p>
            <button
              type="button"
              aria-label="Fermer la légende"
              onClick={() => setOpen(false)}
              className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <ul className="space-y-1.5 text-[11px] md:space-y-2.5 md:text-[13px]">
            <li className="flex items-center gap-2 md:gap-3">
              <span className="h-[3px] w-6 shrink-0 rounded-full bg-primary md:w-8" aria-hidden />
              Liaison avec un départ connu
            </li>
            <li className="flex items-center gap-2 md:gap-3">
              <span className="h-[4px] w-6 shrink-0 rounded-full bg-primary md:w-8" aria-hidden />
              Ligne ou port sélectionné
            </li>
            <li className="flex items-center gap-2 md:gap-3">
              <span
                className="w-6 shrink-0 border-t-2 border-dashed border-muted-foreground/60 md:w-8"
                aria-hidden
              />
              {showDateHint ? "Pas de départ à la date choisie" : "Aucun départ programmé"}
            </li>
            <li className="flex items-center gap-2 md:gap-3">
              <span className="grid w-6 shrink-0 place-items-center md:w-8" aria-hidden>
                <span className="size-2.5 rounded-full border-2 border-card bg-primary shadow" />
              </span>
              Port ouvert
            </li>
            <li className="flex items-center gap-2 md:gap-3">
              <span className="grid w-6 shrink-0 place-items-center md:w-8" aria-hidden>
                <span className="size-2.5 rounded-full border-2 border-muted-foreground bg-card" />
              </span>
              Port temporairement fermé
            </li>
            <li className="flex items-center gap-2 md:gap-3">
              <span
                className="w-6 shrink-0 text-center text-[10px] font-semibold text-foreground md:w-8 md:text-[11px]"
                aria-hidden
              >
                20 h
              </span>
              Durée typique de traversée
            </li>
          </ul>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground md:mt-3 md:text-xs">
            Tracés indicatifs en ligne droite : ils ne représentent pas la route réelle du navire.
            Les horaires sont en heure locale du port.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Afficher la légende"
          aria-expanded={false}
          className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-background/95 text-sm font-semibold text-foreground shadow-sm backdrop-blur hover:bg-secondary md:size-auto md:min-h-9 md:gap-2 md:px-3"
        >
          <Info className="size-4 text-primary" />
          <span className="sr-only md:not-sr-only">Légende</span>
        </button>
      )}
    </div>
  );
}
