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

export function MapStatusBar({ chips, filters, onFiltersChange, onReset, loading, hasError, onRetry, panelOpen }: MapStatusBarProps) {
  if (!chips.length && !loading && !hasError) return null;

  return (
    <div className={`pointer-events-none absolute left-0 right-0 top-4 z-10 flex flex-wrap items-center justify-center gap-2 px-4 transition-all duration-300 md:justify-start ${panelOpen ? "md:left-[436px]" : ""}`}>
      {hasError ? (
        <div className="pointer-events-auto inline-flex min-h-9 items-center gap-2 rounded-full border border-destructive/20 bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive backdrop-blur">
          <span>Chargement impossible</span>
          <button onClick={onRetry} className="underline hover:text-destructive/80">Réessayer</button>
        </div>
      ) : null}
      {loading ? (
        <div className="pointer-events-auto inline-flex min-h-9 items-center rounded-full border border-border bg-background/95 px-3 py-1 text-sm font-medium text-muted-foreground shadow-sm backdrop-blur">
          Actualisation…
        </div>
      ) : null}
      {chips.map((chip) => (
        <button
          key={chip.key}
          onClick={() => onFiltersChange(chip.remove(filters))}
          className="pointer-events-auto inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-background/95 py-1 pl-3 pr-2 text-xs font-semibold text-foreground shadow-sm backdrop-blur hover:bg-secondary"
        >
          {chip.label}
          <X className="size-3.5 text-muted-foreground" />
        </button>
      ))}
      {chips.length > 1 ? (
        <button
          onClick={onReset}
          className="pointer-events-auto inline-flex min-h-9 items-center gap-1.5 rounded-full bg-secondary/80 px-3 py-1 text-xs font-semibold text-muted-foreground backdrop-blur hover:bg-secondary hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
          Tout effacer
        </button>
      ) : null}
    </div>
  );
}
