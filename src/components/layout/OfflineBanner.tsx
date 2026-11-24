import { useEffect, useState } from "react";
import { offlineSavedAt } from "@/lib/offline";
import { tr, intlLocale } from "@/lib/i18n";

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
    ? new Date(savedAt).toLocaleTimeString(intlLocale(), { hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <div className="bw-offline-banner" role="status">
      <img src="/cabas/persos/voiture_504.webp" alt="" width={26} height={26} className="shrink-0" />
      <span>
        <b>{tr("ui.offlineBanner.pasDeReseauPasDe")}</b>{" "}
        {time ? tr("ui.offlineBanner.tonVoyageEstLaTel", { time }) : tr("ui.offlineBanner.tonVoyageEstGardeSur")}
        {tr("ui.offlineBanner.caSeRemetAJour")}
      </span>
    </div>
  );
}
