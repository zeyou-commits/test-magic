import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { CircleAlert, Share2, X } from "lucide-react";
import { newsQuery, setFlashIgnored, shareAlert, useIgnoredFlash } from "@/lib/ferry/flash";
import { incidentHeadline, incidentsQuery } from "@/lib/ferry/incidents";
import { portsQuery, vesselsQuery } from "@/lib/ferry/queries";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { useTravelAction } from "@/hooks/useTravelAction";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const DISMISSED_KEY = "bledway:alert-ticker-dismissed";

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * Bandeau en haut de toutes les pages : alertes graves en rouge pour les personnes concernées
 * (navire suivi ou de leur traversée) et sur une ligne discrète pour les autres, perturbations de
 * moins de 48 h en ambre s'il n'y a pas d'alerte.
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
  const [copied, setCopied] = useState(false);
  const ignored = useIgnoredFlash();
  const observer = useRef<ResizeObserver | null>(null);
  // Hauteur du bandeau : sur mobile, une fiche en plein écran se place juste en dessous.
  const measure = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    const root = document.documentElement;
    if (!node) {
      root.style.removeProperty("--bw-ticker-h");
      return;
    }
    observer.current = new ResizeObserver(() =>
      root.style.setProperty("--bw-ticker-h", `${node.offsetHeight}px`),
    );
    observer.current.observe(node);
  }, []);
  const request = useTravelAction();
  const { trip } = useMyTrip();
  const { user } = useAuth();
  const followed = useQuery({
    queryKey: ["ticker-followed-vessels", user?.id],
    enabled: Boolean(user),
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase as unknown as import("@supabase/supabase-js").SupabaseClient)
        .from("bw_follows")
        .select("target_kind,target_id")
        .eq("user_id", user!.id)
        .eq("active", true);
      const rows = (data ?? []) as { target_kind: string; target_id: string }[];
      const ids = rows.filter((r) => r.target_kind === "departure").map((r) => r.target_id);
      const departures = ids.length
        ? await supabase.from("departures").select("vessel_id").in("id", ids)
        : { data: [] as { vessel_id: string | null }[] };
      return [
        ...rows.filter((r) => r.target_kind === "vessel").map((r) => r.target_id),
        ...(departures.data ?? []).flatMap((d) => (d.vessel_id ? [d.vessel_id] : [])),
      ];
    },
  });
  useEffect(() => {
    setDismissed(readDismissed());
    setReady(true);
  }, []);
  // Ignorer l'alerte d'un navire vaut aussi pour son dossier : le bandeau et la pastille se taisent.
  const ignoredVessels = new Set(
    (news ?? []).filter((item) => ignored.has(`n-${item.id}`)).map((item) => item.vessel_id),
  );
  const confirmed = incidents
    .filter((i) => i.status === "confirmed" && !ignoredVessels.has(i.vessel_id))
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
          !ignored.has(`n-${item.id}`) &&
          !(item.vessel_id && covered.has(item.vessel_id)) &&
          (kind === "alerte" || Date.now() - Date.parse(item.starts_at) < 48 * 3_600_000),
      )
      .map((item) => ({
        key: `n-${item.id}`,
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
  const share = async (text: string, vesselId: string | null) => {
    if (!(await shareAlert(text, vesselId))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  const close = (
    <button
      type="button"
      className="bw-alert-ticker__close"
      aria-label="Masquer les alertes"
      onClick={() => {
        // Fermer le bandeau, c'est aussi retirer la pastille de ces alertes.
        setFlashIgnored(
          (news ?? [])
            .filter(
              (item) =>
                alerts.some((alert) => alert.key === `n-${item.id}`) ||
                (item.vessel_id && alerts.some((alert) => alert.id === item.vessel_id)),
            )
            .map((item) => `n-${item.id}`),
          true,
        );
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
  // Une alerte sans navire ne se rattache à personne en particulier : elle reste en rouge.
  const concerned = critical.some(
    (alert) => !alert.id || alert.id === trip?.vessel?.id || followed.data?.includes(alert.id),
  );
  const tone = critical.length ? (concerned ? "critical" : "quiet") : "warning";
  const label = critical.length ? "Alertes graves" : "Perturbations";
  // Une seule information : fixe, centrée et avec ses actions. Le défilement sert quand il y en a plusieurs.
  if (alerts.length === 1) {
    const alert = alerts[0]!;
    const vesselId = alert.id;
    const mine = vesselId && trip?.vessel?.id === vesselId ? trip : null;
    return (
      <div
        ref={measure}
        className="bw-alert-ticker"
        data-tone={tone}
        data-single
        role="region"
        aria-label={label}
      >
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
          <button
            type="button"
            className="inline-flex items-center gap-1"
            onClick={() => void share(alert.text, vesselId)}
          >
            <Share2 size={13} aria-hidden /> {copied ? "Lien copié" : "Partager"}
          </button>
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
      ref={measure}
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
