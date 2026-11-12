import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { offlineSavedAt } from "@/lib/offline";
import { tr } from "@/lib/i18n";

/** Sans réseau (en mer, au port) : on dit d'où viennent les informations affichées. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  useEffect(() => {
    const sync = () => {
      setOffline(!navigator.onLine);
      setSavedAt(offlineSavedAt());
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  if (!offline) return null;
  const time = savedAt
    ? new Date(savedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <div className="bw-offline-banner" role="status">
      <WifiOff size={15} aria-hidden />
      <span>
        <b>{tr("ui.offlineBanner.horsLigne")}</b>
        {time ? ` : votre voyage tel qu’enregistré à ${time}.` : "."}{tr("ui.offlineBanner.ilSeMetAJour")}
      </span>
    </div>
  );
}
