import { ListFilter, X } from "lucide-react";

export function AdminFilterNotice({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
      <ListFilter className="size-4 shrink-0 text-primary" aria-hidden />
      <span role="status" className="min-w-0 flex-1 font-medium">
        {label}
      </span>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
      >
        Voir tout <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
