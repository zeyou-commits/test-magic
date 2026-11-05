import { dateKeyInZone, wallTimeInZone, zonedTimeToUtc } from "@/lib/ferry/time";
import type { TicketLeg } from "./parse";

export type CandidateDeparture = {
  id: string;
  route_id: string;
  company_id: string | null;
  vessel_id: string | null;
  departure_at: string;
  status: string;
};

/** Ce qui ne colle pas entre le billet et BledWay, dit simplement. */
export type LegIssue =
  | { kind: "time"; ticket: string; bledway: string }
  | { kind: "vessel"; ticket: string; bledway: string }
  | { kind: "company" }
  | { kind: "cancelled" }
  | { kind: "none" };

/** L'instant de départ écrit sur le billet (heure locale du port de départ). */
export function ticketInstant(leg: TicketLeg, zone: string): Date | null {
  if (!leg.date) return null;
  return zonedTimeToUtc(leg.date, leg.time ?? "12:00", zone);
}

/**
 * La traversée BledWay du billet : même ligne, même jour (heure locale du port), la plus proche
 * de l'heure imprimée. Sans heure sur le billet, seulement s'il n'y a qu'un départ ce jour-là.
 */
export function bestDeparture(
  leg: TicketLeg,
  candidates: CandidateDeparture[],
  zone: string,
  companyId: string | null,
): CandidateDeparture | null {
  if (!leg.date) return null;
  const sameDay = candidates.filter(
    (d) =>
      dateKeyInZone(d.departure_at, zone) === leg.date &&
      (!companyId || !d.company_id || d.company_id === companyId),
  );
  if (!sameDay.length) return null;
  if (!leg.time) return sameDay.length === 1 ? sameDay[0]! : null;
  const target = ticketInstant(leg, zone)!.getTime();
  return [...sameDay].sort(
    (a, b) =>
      Math.abs(Date.parse(a.departure_at) - target) - Math.abs(Date.parse(b.departure_at) - target),
  )[0]!;
}

/** Écarts entre le billet et la traversée BledWay retenue (15 minutes de tolérance). */
export function legIssues(
  leg: TicketLeg,
  departure: CandidateDeparture,
  zone: string,
  ticket: { companyId: string | null; vesselName: string | null },
  vesselNameOf: (id: string | null) => string | null,
): LegIssue[] {
  const issues: LegIssue[] = [];
  if (departure.status === "cancelled") issues.push({ kind: "cancelled" });
  if (leg.time && leg.date) {
    const gap = Math.abs(Date.parse(departure.departure_at) - ticketInstant(leg, zone)!.getTime());
    if (gap > 15 * 60_000)
      issues.push({
        kind: "time",
        ticket: leg.time,
        bledway: wallTimeInZone(departure.departure_at, zone).slice(0, 5),
      });
  }
  const bledwayVessel = vesselNameOf(departure.vessel_id);
  if (ticket.vesselName && bledwayVessel && ticket.vesselName !== bledwayVessel)
    issues.push({ kind: "vessel", ticket: ticket.vesselName, bledway: bledwayVessel });
  if (ticket.companyId && departure.company_id && ticket.companyId !== departure.company_id)
    issues.push({ kind: "company" });
  return issues;
}

export function issueText(issue: LegIssue) {
  switch (issue.kind) {
    case "time":
      return `Heure du billet ${issue.ticket}, BledWay indique ${issue.bledway}.`;
    case "vessel":
      return `Navire du billet : ${issue.ticket} ; BledWay indique ${issue.bledway}.`;
    case "company":
      return "La compagnie du billet n'est pas celle de cette traversée sur BledWay.";
    case "cancelled":
      return "Cette traversée est annoncée annulée sur BledWay : vérifiez auprès de la compagnie.";
    default:
      return "";
  }
}
