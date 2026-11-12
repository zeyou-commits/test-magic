import { useDataOffline } from "@/lib/ferry/offline";
import { tr } from "@/lib/i18n";

export function DataUnavailableNotice({ className = "" }: { className?: string }) {
  const offline = useDataOffline();
  if (!offline) return null;
  return (
    <div role="status" className={`rounded-xl border border-border bg-card/95 p-4 text-sm shadow-sm backdrop-blur ${className}`}>
      <p className="font-semibold text-foreground">{tr("ui.dataUnavailableNotice.title")}</p>
      <p className="mt-1 text-muted-foreground">{tr("ui.dataUnavailableNotice.body")}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-3 inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        {tr("ui.dataUnavailableNotice.refresh")}
      </button>
    </div>
  );
}
