import { useDataOffline } from "@/lib/ferry/offline";

export function DataUnavailableNotice({ className = "" }: { className?: string }) {
  const offline = useDataOffline();
  if (!offline) return null;
  return (
    <div role="status" className={`rounded-xl border border-border bg-card/95 p-4 text-sm shadow-sm backdrop-blur ${className}`}>
      <p className="font-semibold text-foreground">Les horaires et traversées sont momentanément indisponibles</p>
      <p className="mt-1 text-muted-foreground">Les informations reviennent très vite. Réessayez dans quelques instants.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-3 inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        Rafraîchir
      </button>
    </div>
  );
}
