import { useEffect, useState } from "react";
import { offlineSavedAt } from "@/lib/offline";

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
      <img src="/cabas/persos/voiture_504.webp" alt="" width={26} height={26} className="shrink-0" />
      <span>
        <b>Pas de réseau, pas de panique.</b>{" "}
        {time ? `Ton voyage est là, tel qu’enregistré à ${time}. ` : "Ton voyage est gardé sur le téléphone. "}
        Ça se remet à jour dès que ça capte.
      </span>
    </div>
  );
}
