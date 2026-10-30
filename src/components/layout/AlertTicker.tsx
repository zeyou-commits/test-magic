import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { CircleAlert, X } from "lucide-react";
import { newsQuery } from "@/lib/ferry/flash";
import { incidentHeadline, incidentsQuery } from "@/lib/ferry/incidents";
import { portsQuery, vesselsQuery } from "@/lib/ferry/queries";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { useTravelAction } from "@/hooks/useTravelAction";

const DISMISSED_KEY = "bledway:alert-ticker-dismissed";

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * Bandeau en haut de toutes les pages : alertes graves en rouge (dossiers confirmés et alertes
 * Flash), et perturbations de moins de 48 h en ambre s'il n'y a pas d'alerte.
 * Absent s'il n'y a rien. Fermé, il revient à la prochaine information.
 */
export function AlertTicker() {
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const { data: news } = useQuery(newsQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const request = useTravelAction();
  const { trip } = useMyTrip();
  useEffect(() => {
    setDismissed(readDismissed());
    setReady(true);
  }, []);
  const confirmed = incidents
    .filter((i) => i.status === "confirmed")
    .map((i) => ({
      key: i.id,
      id: i.vessel_id as string | null,
      version: `${i.id}:${i.updated_at}`,
      text: incidentHeadline(
        i,
        vessels.find((v) => v.id === i.vessel_id)?.name ?? "Un navire",
        ports.find((p) => p.id === i.location_port_id)?.name,
      ),
    }));
  const covered = new Set(confirmed.map((alert) => alert.id));
  const fromNews = (kind: "alerte" | "perturbation") =>
    (news ?? [])
      .filter(
        (item) =>
          item.kind === kind &&
          !(item.vessel_id && covered.has(item.vessel_id)) &&
          (kind === "alerte" || Date.now() - Date.parse(item.starts_at) < 48 * 3_600_000),
      )
      .map((item) => ({
        key: item.id,
        id: item.vessel_id ?? null,
        version: `${item.id}:${item.title}`,
        text: item.title,
      }));
  const critical = [...confirmed, ...fromNews("alerte")];
  const alerts = critical.length ? critical : fromNews("perturbation");
  const version = alerts
    .map((a) => a.version)
    .sort()
    .join("|");
  if (!ready || !alerts.length || dismissed === version) return null;
  const open = (vesselId: string | null) => {
    if (!vesselId) {
      window.dispatchEvent(new Event("bledway:open-inbox"));
      return;
    }
    if (pathname === "/") {
      // Même événement que le fil Flash : la fiche s'ouvre sans recharger la carte.
      window.dispatchEvent(
        new CustomEvent("bledway:flash-select", { detail: { type: "vessel", id: vesselId } }),
      );
      return;
    }
    window.location.assign(`/?select=vessel&id=${vesselId}`);
  };
  const openDeparture = (departureId: string) => {
    if (pathname === "/")
      window.dispatchEvent(
        new CustomEvent("bledway:flash-select", { detail: { type: "departure", id: departureId } }),
      );
    else window.location.assign(`/?select=departure&id=${departureId}`);
  };
  const close = (
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
  );
  const tone = critical.length ? "critical" : "warning";
  const label = critical.length ? "Alertes graves" : "Perturbations";
  // Une seule information : fixe, centrée et avec ses actions. Le défilement sert quand il y en a plusieurs.
  if (alerts.length === 1) {
    const alert = alerts[0]!;
    const vesselId = alert.id;
    const mine = vesselId && trip?.vessel?.id === vesselId ? trip : null;
    return (
      <div className="bw-alert-ticker" data-tone={tone} data-single role="region" aria-label={label}>
        <div className="bw-alert-ticker__single">
          <CircleAlert size={16} aria-hidden className="shrink-0" />
          <strong>{alert.text}</strong>
          {vesselId ? (
            <>
              <button type="button" onClick={() => open(vesselId)}>
                Voir les traversées
              </button>
              {mine ? (
                <button type="button" onClick={() => openDeparture(mine.departure.id)}>
                  Voir ma traversée
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    request({
                      type: "follow",
                      kind: "vessel",
                      targetId: vesselId,
                      label: vessels.find((v) => v.id === vesselId)?.name ?? "Ce navire",
                      upgrade: true,
                    })
                  }
                >
                  Je voyage sur ce navire
                </button>
              )}
            </>
          ) : (
            <button type="button" onClick={() => open(null)}>
              Voir le détail
            </button>
          )}
        </div>
        {close}
      </div>
    );
  }
  const items = (copy: boolean) => (
    <span className="bw-alert-ticker__group" aria-hidden={copy || undefined}>
      {alerts.map((alert) => (
        <button
          key={alert.key}
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
    <div
      className="bw-alert-ticker"
      data-tone={tone}
      role="region"
      aria-label={label}
    >
      <CircleAlert size={16} aria-hidden className="shrink-0" />
      <div className="bw-alert-ticker__window">
        <div className="bw-alert-ticker__track" style={{ animationDuration: `${seconds}s` }}>
          {items(false)}
          {items(true)}
        </div>
      </div>
      {close}
    </div>
  );
}
