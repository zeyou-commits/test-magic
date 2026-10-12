import { RotateCcw, X } from "lucide-react";
import type { FilterChip } from "@/lib/ferry/filtering";
import type { Filters } from "@/lib/ferry/types";

interface MapStatusBarProps {
  chips: FilterChip[];
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  onReset: () => void;
  loading: boolean;
  hasError: boolean;
  onRetry: () => void;
  panelOpen: boolean;
}

/**
 * Bandeau au-dessus de la carte : état de chargement et filtres actifs, chacun supprimable.
 * Sur mobile, seuls le chargement et les erreurs s'affichent (la recherche Départ/Arrivée
 * de l'en-tête montre déjà les filtres).
 */
export function MapStatusBar({
  chips,
  filters,
  onFiltersChange,
  onReset,
  loading,
  hasError,
  onRetry,
  panelOpen,
}: MapStatusBarProps) {
  if (!chips.length && !loading && !hasError) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute left-0 right-0 top-[4.75rem] z-10 flex flex-wrap items-center justify-center gap-2 px-4 transition-all duration-300 md:top-[4.5rem] md:justify-start ${panelOpen ? "md:left-[420px]" : "md:left-10"}`}
    >
      {hasError ? (
        <div className="pointer-events-auto inline-flex min-h-9 items-center gap-2 rounded-full border border-destructive/20 bg-background px-3 py-1 text-sm font-medium text-destructive shadow-sm">
          <span>Chargement impossible</span>
          <button type="button" onClick={onRetry} className="underline hover:text-destructive/80">
            Réessayer
          </button>
        </div>
      ) : null}
      {loading ? (
        <div className="pointer-events-auto inline-flex min-h-9 items-center rounded-full border border-border bg-background/95 px-3 py-1 text-sm font-medium text-muted-foreground shadow-sm backdrop-blur">
          Chargement des traversées…
        </div>
      ) : null}
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          aria-label={`Retirer le filtre ${chip.label}`}
          onClick={() => onFiltersChange(chip.remove(filters))}
          className="pointer-events-auto hidden min-h-9 items-center gap-1.5 rounded-full border border-border bg-background/95 py-1 pl-3 pr-2 text-sm font-semibold text-foreground shadow-sm backdrop-blur hover:bg-secondary md:inline-flex"
        >
          {chip.label}
          <X className="size-3.5 text-muted-foreground" />
        </button>
      ))}
      {chips.length > 1 ? (
        <button
          type="button"
          onClick={onReset}
          className="pointer-events-auto hidden min-h-9 items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-muted-foreground shadow-sm hover:text-foreground md:inline-flex"
        >
          <RotateCcw className="size-3.5" />
          Tout effacer
        </button>
      ) : null}
    </div>
  );
}
