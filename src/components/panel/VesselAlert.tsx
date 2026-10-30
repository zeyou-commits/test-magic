import { CircleAlert, ExternalLink } from "lucide-react";
import { useVesselAlert } from "@/lib/ferry/vesselAlerts";
import { safeExternalUrl } from "./shared";

/** Étiquette à côté du nom d'un navire, partout où il est mentionné. */
export function VesselAlertTag({ vesselId }: { vesselId: string | null | undefined }) {
  const alert = useVesselAlert(vesselId);
  if (!alert) return null;
  return (
    <span className="bw-vessel-alert-tag" data-level={alert.level} title={alert.label}>
      <b aria-hidden>!</b> {alert.short}
    </span>
  );
}

/** Bandeau posé sur la photo du navire. */
export function VesselPhotoAlert({ vesselId }: { vesselId: string | null | undefined }) {
  const alert = useVesselAlert(vesselId);
  if (!alert) return null;
  return (
    <span className="bw-vessel-photo-alert" data-level={alert.level}>
      <CircleAlert size={15} aria-hidden /> {alert.label}
    </span>
  );
}

/**
 * Tout en haut des fiches : l'alerte Flash et sa source. Un dossier ouvert a déjà sa carte
 * détaillée, et seule la compagnie décide du sort d'un départ.
 */
export function VesselAlertBanner({
  vesselId,
  onDeparture = false,
}: {
  vesselId: string | null | undefined;
  onDeparture?: boolean;
}) {
  const alert = useVesselAlert(vesselId);
  if (!alert || alert.fromIncident) return null;
  const href = safeExternalUrl(alert.sourceUrl);
  return (
    <div role="status" className="bw-vessel-alert-banner">
      <p className="bw-vessel-alert-banner__title">
        <CircleAlert size={17} aria-hidden /> {alert.label}
      </p>
      {alert.note ? <p>{alert.note}</p> : null}
      <p className="bw-vessel-alert-banner__meta">
        {onDeparture
          ? "Départ à confirmer auprès de la compagnie"
          : "Vérifiez votre traversée auprès de la compagnie"}
        {alert.source ? ` · Source : ${alert.source}` : ""}
        {href ? (
          <>
            {" · "}
            <a href={href} target="_blank" rel="noopener noreferrer">
              Voir la source <ExternalLink size={11} aria-hidden />
            </a>
          </>
        ) : null}
      </p>
    </div>
  );
}
