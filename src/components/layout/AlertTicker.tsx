import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { CircleAlert, X } from "lucide-react";
import { incidentHeadline, incidentsQuery } from "@/lib/ferry/incidents";
import { portsQuery, vesselsQuery } from "@/lib/ferry/queries";

const DISMISSED_KEY = "bledway:alert-ticker-dismissed";

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * Bandeau des alertes graves : seulement les navires immobilisés confirmés, avec leur source.
 * Absent s'il n'y a rien. Fermé, il revient à la prochaine alerte.
 */
export function AlertTicker() {
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setDismissed(readDismissed());
    setReady(true);
  }, []);
  const alerts = incidents
    .filter((i) => i.status === "confirmed")
    .map((i) => ({
      id: i.vessel_id,
      version: `${i.id}:${i.updated_at}`,
      text: incidentHeadline(
        i,
        vessels.find((v) => v.id === i.vessel_id)?.name ?? "Un navire",
        ports.find((p) => p.id === i.location_port_id)?.name,
      ),
    }));
  const version = alerts
    .map((a) => a.version)
    .sort()
    .join("|");
  if (!ready || !alerts.length || dismissed === version) return null;
  const open = (vesselId: string) => {
    if (pathname === "/") {
      // Même événement que le fil Flash : la fiche s'ouvre sans recharger la carte.
      window.dispatchEvent(
        new CustomEvent("bledway:flash-select", { detail: { type: "vessel", id: vesselId } }),
      );
      return;
    }
    window.location.assign(`/?select=vessel&id=${vesselId}`);
  };
  const items = (copy: boolean) => (
    <span className="bw-alert-ticker__group" aria-hidden={copy || undefined}>
      {alerts.map((alert) => (
        <button
          key={alert.id}
          type="button"
          tabIndex={copy ? -1 : undefined}
          onClick={() => open(alert.id)}
        >
          {alert.text}
        </button>
      ))}
    </span>
  );
  const seconds = Math.max(18, alerts.map((a) => a.text).join("").length * 0.22);
  return (
    <div className="bw-alert-ticker" role="region" aria-label="Alertes navires">
      <CircleAlert size={16} aria-hidden className="shrink-0" />
      <div className="bw-alert-ticker__window">
        <div className="bw-alert-ticker__track" style={{ animationDuration: `${seconds}s` }}>
          {items(false)}
          {items(true)}
        </div>
      </div>
      <button
        type="button"
        className="bw-alert-ticker__close"
        aria-label="Masquer les alertes"
        onClick={() => {
          setDismissed(version);
          try {
            window.localStorage.setItem(DISMISSED_KEY, version);
          } catch {
            /* sans stockage, le bandeau reviendra au prochain chargement */
          }
        }}
      >
        <X size={15} aria-hidden />
      </button>
    </div>
  );
}
