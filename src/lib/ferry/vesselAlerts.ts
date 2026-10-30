import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { newsQuery, type NewsItem } from "./flash";
import { incidentsQuery, isOpenIncident, type VesselIncident } from "./incidents";

export type VesselAlert = {
  vesselId: string;
  /** Vérifié ou publié comme alerte par l'équipe ; « possible » tant que le dossier se vérifie. */
  level: "critical" | "possible";
  label: string;
  short: string;
  title: string;
  note: string;
  source: string;
  sourceUrl: string | null;
  /** Un dossier ouvert a déjà sa propre carte détaillée sur les fiches. */
  fromIncident: boolean;
};

function labelsFromTitle(title: string) {
  if (/immobilis/i.test(title)) return { label: "Navire immobilisé", short: "Immobilisé" };
  if (/arr[êe]t/i.test(title)) return { label: "Navire arrêté", short: "Arrêté" };
  return { label: "Alerte sur ce navire", short: "Alerte" };
}

/**
 * Navires à signaler partout où ils apparaissent : dossier public, sinon alerte Flash en cours
 * rattachée au navire. Un dossier encore « signalé » n'est pas public : il ne compte pas ici.
 */
export function vesselAlerts(incidents: VesselIncident[], news: NewsItem[]) {
  const alerts = new Map<string, VesselAlert>();
  for (const item of news) {
    if (item.kind !== "alerte" || !item.vessel_id || alerts.has(item.vessel_id)) continue;
    alerts.set(item.vessel_id, {
      vesselId: item.vessel_id,
      level: "critical",
      ...labelsFromTitle(item.title),
      title: item.title,
      note: item.summary,
      source: item.source_name,
      sourceUrl: item.source_url,
      fromIncident: false,
    });
  }
  for (const incident of incidents.filter(isOpenIncident)) {
    const confirmed = incident.status === "confirmed";
    // Un dossier encore en vérification ne doit pas adoucir une alerte déjà publiée par l'équipe.
    if (!confirmed && alerts.has(incident.vessel_id)) continue;
    alerts.set(incident.vessel_id, {
      vesselId: incident.vessel_id,
      level: confirmed ? "critical" : "possible",
      label: confirmed ? "Navire immobilisé" : "Immobilisation possible",
      short: confirmed ? "Immobilisé" : "À vérifier",
      title: "",
      note: incident.public_note,
      source: incident.source_name,
      sourceUrl: incident.source_url,
      fromIncident: true,
    });
  }
  return alerts;
}

export function useVesselAlerts() {
  const { data: incidents } = useQuery(incidentsQuery);
  const { data: news } = useQuery(newsQuery);
  return useMemo(() => vesselAlerts(incidents ?? [], news ?? []), [incidents, news]);
}

export function useVesselAlert(vesselId: string | null | undefined) {
  const alerts = useVesselAlerts();
  return vesselId ? (alerts.get(vesselId) ?? null) : null;
}
