import { leadMinutesFor } from "./boarding";
import {
  itemForCompany,
  itemsFor,
  type PrepItem,
  type PrepPhase,
  type TripDirection,
  type TripProfile,
} from "./preparation";

/**
 * La route du bled en 8 étapes : du départ jusqu'au bled (et jusqu'à destination au retour).
 * Une seule définition pour « Mon voyage » (réel), la simulation de « Route » et la vue des proches.
 */
export type JourneyStepId =
  "papers" | "vehicle" | "road" | "port" | "sea" | "arrival" | "last" | "home";

export const JOURNEY_STEPS: JourneyStepId[] = [
  "papers",
  "vehicle",
  "road",
  "port",
  "sea",
  "arrival",
  "last",
  "home",
];
/** Un proche suit la traversée et l'arrivée, pas les préparatifs. */
export const RELATIVE_STEPS: JourneyStepId[] = ["sea", "arrival", "last", "home"];

export type JourneyAudience = "traveller" | "relative" | "simulation";

const LABELS: Record<JourneyStepId, string> = {
  papers: "Papiers",
  vehicle: "Véhicule et bagages",
  road: "Route vers le port",
  port: "Au port",
  sea: "En mer",
  arrival: "Arrivée au port",
  last: "Route au bled",
  home: "Au bled",
};

export function stepLabel(
  step: JourneyStepId,
  direction: TripDirection = "outbound",
  audience: JourneyAudience = "traveller",
) {
  if (audience === "relative") {
    if (step === "last") return "Sur la route";
    if (step === "home") return "Bien arrivé·e";
  }
  if (direction === "return") {
    // « Destination » plutôt que « maison » : chacun ne rentre pas chez soi.
    if (step === "last") return "Route vers la destination";
    if (step === "home") return "À destination";
  }
  return LABELS[step];
}

/** Chaque action du parcours de préparation trouve sa place dans la frise. */
const ITEM_STEP: Record<string, JourneyStepId> = {
  tickets: "papers",
  identity: "papers",
  "cash-dz": "papers",
  "cash-eu": "papers",
  kids: "papers",
  pet: "papers",
  "return-papers": "papers",
  checkin: "papers",
  vehicle: "vehicle",
  admission: "vehicle",
  dimensions: "vehicle",
  "return-vehicle": "vehicle",
  "car-service": "vehicle",
  dinars: "vehicle",
  "return-dinars": "vehicle",
  "return-gifts": "vehicle",
  luggage: "vehicle",
  cabin: "vehicle",
  call: "road",
  offline: "road",
  route: "road",
  "boarding-pass": "port",
  controls: "port",
  landing: "arrival",
  "tpd-keep": "arrival",
  family: "arrival",
  "fuel-dz": "last",
  "rest-stop": "last",
};
const PHASE_STEP: Record<PrepPhase, JourneyStepId> = {
  papers: "papers",
  bags: "vehicle",
  eve: "road",
  port: "port",
  arrival: "arrival",
};

export const stepOfItem = (item: Pick<PrepItem, "id" | "phase">): JourneyStepId =>
  ITEM_STEP[item.id] ?? PHASE_STEP[item.phase];

/** Les actions d'une étape, pour ce voyageur et la compagnie de sa traversée. */
export function stepItems(
  step: JourneyStepId,
  profile: TripProfile,
  direction: TripDirection,
  company?: string | null,
) {
  return itemsFor(profile, direction)
    .filter((item) => stepOfItem(item) === step)
    .map((item) => itemForCompany(item, company));
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Débarquement, contrôles et sortie du port : marge repère, comme dans le simulateur. */
export const ARRIVAL_MARGIN_MS = 3 * HOUR;
/** Sans trajet renseigné, la dernière route est comptée large avant de passer à « Au bled ». */
export const DEFAULT_LAST_LEG_MS = 8 * HOUR;

export type JourneyTimeline = Record<JourneyStepId, { start: number; end: number }>;

/**
 * Le calendrier des étapes. Les préparatifs n'ont pas d'heure : on les place avant le départ
 * (7 jours pour le véhicule, 48 h pour la route) ; le reste suit la traversée réelle.
 */
export function journeyTimeline({
  departureMs,
  endMs,
  presentationMinutes,
  lastLegMs = DEFAULT_LAST_LEG_MS,
}: {
  departureMs: number;
  endMs: number;
  presentationMinutes?: number | null;
  lastLegMs?: number;
}): JourneyTimeline {
  const call = departureMs - leadMinutesFor(presentationMinutes, false) * 60_000;
  const arrived = endMs + ARRIVAL_MARGIN_MS;
  return {
    papers: { start: -Infinity, end: departureMs - 7 * DAY },
    vehicle: { start: departureMs - 7 * DAY, end: departureMs - 2 * DAY },
    road: { start: departureMs - 2 * DAY, end: call },
    port: { start: call, end: departureMs },
    sea: { start: departureMs, end: endMs },
    arrival: { start: endMs, end: arrived },
    last: { start: arrived, end: arrived + lastLegMs },
    home: { start: arrived + lastLegMs, end: Infinity },
  };
}

/** Les statuts de « Où en êtes-vous ? » (presence.ts). */
export type TravelStatus = "en_route" | "port" | "onboard" | "landing" | "controls" | "arrived";
const STATUS_STEP: Record<TravelStatus, JourneyStepId> = {
  en_route: "road",
  port: "port",
  onboard: "sea",
  landing: "arrival",
  controls: "arrival",
  // « Sorti du port » : la route commence.
  arrived: "last",
};
/** Les statuts que l'on peut déclarer depuis chaque étape (« J'y suis »). */
export const STEP_STATUSES: Partial<Record<JourneyStepId, TravelStatus[]>> = {
  road: ["en_route"],
  port: ["port"],
  sea: ["onboard"],
  arrival: ["landing", "controls"],
  last: ["arrived"],
};

/**
 * L'étape du moment. « Où en êtes-vous ? » l'emporte sur le calendrier autour du voyage ;
 * avant, une étape dont toutes les actions sont faites laisse place à la suivante.
 */
export function currentStep({
  timeline,
  now = Date.now(),
  status = null,
  steps = JOURNEY_STEPS,
  completed = [],
}: {
  timeline: JourneyTimeline;
  now?: number;
  status?: TravelStatus | null;
  steps?: JourneyStepId[];
  completed?: JourneyStepId[];
}): JourneyStepId {
  const byTime = steps.find((step) => now < timeline[step].end) ?? steps[steps.length - 1]!;
  const aroundTrip = now >= timeline.road.start && now < timeline.last.end;
  let step = byTime;
  if (status && aroundTrip) {
    const declared = STATUS_STEP[status];
    // Garde-fou : une étape annoncée plus de 4 h avant son heure n'est pas plausible (clic d'essai).
    const plausible = now >= timeline[declared].start - 4 * HOUR;
    // Le voyageur sait mieux que l'horaire : en avance, ou en retard d'une étape (départ décalé).
    if (
      plausible &&
      steps.includes(declared) &&
      steps.indexOf(declared) >= steps.indexOf(byTime) - 1
    )
      step = declared;
  }
  // Préparatifs bouclés en avance : l'étape suivante devient celle du moment.
  while (
    (step === "papers" || step === "vehicle") &&
    completed.includes(step) &&
    steps.indexOf(step) < steps.length - 1
  )
    step = steps[steps.indexOf(step) + 1]!;
  return step;
}

export type StepState = "done" | "current" | "todo";
export const stepState = (
  step: JourneyStepId,
  current: JourneyStepId,
  steps: JourneyStepId[] = JOURNEY_STEPS,
): StepState => {
  const delta = steps.indexOf(step) - steps.indexOf(current);
  return delta < 0 ? "done" : delta === 0 ? "current" : "todo";
};

/** Heure locale du port, « mar. 7 · 09:00 ». */
export function stepMoment(ms: number, timeZone: string) {
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms);
  const day = date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", timeZone });
  const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone });
  return `${day} · ${time}`;
}

export const durationLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
};

export type StepLink = { href: string; label: string; external?: boolean };

/** Le texte d'une étape : ce qu'il faut savoir, sans jamais remplacer la consigne du billet. */
export function stepGuide({
  step,
  direction,
  audience,
  from,
  to,
  vesselName,
  presentationMinutes,
  departureMs,
  endMs,
  timeZone,
  arrivalTimeZone,
  vehicle,
  roadMin,
  lastMin,
  destination,
}: {
  step: JourneyStepId;
  direction: TripDirection;
  audience: JourneyAudience;
  from: string;
  to: string;
  vesselName?: string | null;
  presentationMinutes?: number | null;
  departureMs?: number;
  endMs?: number;
  timeZone: string;
  arrivalTimeZone: string;
  vehicle: boolean;
  /** Trajet sur mesure (minutes, pauses comprises), si le voyageur l'a demandé. */
  roadMin?: number | null;
  lastMin?: number | null;
  destination?: string | null;
}): { lead: string; links: StepLink[] } {
  const ship = vesselName ? `du ${vesselName}` : "du navire";
  const hasTime = departureMs !== undefined && Number.isFinite(departureMs);
  const callMs = hasTime ? departureMs - leadMinutesFor(presentationMinutes, false) * 60_000 : NaN;
  const footMs = hasTime ? departureMs - leadMinutesFor(presentationMinutes, true) * 60_000 : NaN;
  const consigne =
    presentationMinutes != null
      ? "consigne de la compagnie"
      : "repère indicatif : 4 h avant en véhicule, 3 h à pied";
  const time = (ms: number, zone: string) =>
    new Date(ms).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: zone,
    });
  if (audience === "relative") {
    const eta =
      endMs !== undefined && Number.isFinite(endMs) ? ` vers ${time(endMs, arrivalTimeZone)}` : "";
    const leads: Partial<Record<JourneyStepId, string>> = {
      sea: `Suivez la traversée ${ship} en direct sur la carte. Arrivée prévue à ${to}${eta}, signalements et alertes compris.`,
      arrival: `Après l'arrivée ${ship}, le débarquement, les contrôles et la sortie du port prennent du temps : l'heure d'accostage n'est pas l'heure de sortie.`,
      last: `Votre proche a quitté le port de ${to} : la route continue jusqu'à destination.`,
      home: "Bien arrivé·e ! Le voyage est terminé.",
    };
    return {
      lead: leads[step] ?? "",
      links: step === "arrival" ? [{ href: "#port", label: `Le port de ${to}` }] : [],
    };
  }
  const simulation = audience === "simulation";
  switch (step) {
    case "papers":
      return {
        lead: "Billets, passeports et documents du voyage : tout se règle avant de partir, au calme. Vérifiez les noms, les dates et les validités.",
        links: [
          { href: "/guide/arrivee-algerie-port-formalites", label: "Les formalités" },
          ...(vehicle
            ? [
                {
                  href: "https://alces.douane.gov.dz",
                  label: "Démarches douanières",
                  external: true,
                },
              ]
            : []),
        ],
      };
    case "vehicle":
      return {
        lead: vehicle
          ? "Véhicule vérifié, hauteur chargée connue, valises et budget prêts : la semaine d'avant suffit, sans précipitation."
          : "Valises et budget prêts, et un petit sac de traversée à garder avec vous à bord.",
        links: [{ href: "/mes-dinars", label: "Mes dinars" }],
      };
    case "road": {
      const arrive = hasTime ? ` à ${time(callMs, timeZone)}` : "";
      const custom =
        roadMin && hasTime
          ? ` Comptez environ ${durationLabel(roadMin)} de route avec les pauses : départ conseillé vers ${new Date(callMs - roadMin * 60_000).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone })}.`
          : roadMin
            ? ` Comptez environ ${durationLabel(roadMin)} de route avec les pauses.`
            : " Prévoyez la route avec des pauses toutes les deux heures.";
      return {
        lead: `Pour être au port de ${from}${arrive} (${consigne}).${custom}`,
        links:
          vehicle && direction === "outbound"
            ? [
                {
                  href: "https://stations-services.fr",
                  label: "Stations sur mon trajet",
                  external: true,
                },
              ]
            : [],
      };
    }
    case "port":
      return {
        lead: hasTime
          ? `Présentation à ${from} : ${time(callMs, timeZone)} en véhicule, ${time(footMs, timeZone)} à pied (${consigne}). L'heure inscrite sur votre billet fait foi.`
          : `Au port de ${from} : retrait de la carte d'embarquement, contrôles, puis embarquement. L'heure inscrite sur votre billet fait foi.`,
        links: [{ href: "#port", label: `Le port de ${from}` }],
      };
    case "sea":
      return {
        lead: `La traversée à bord ${ship} jusqu'à ${to}. Le navire se suit en direct sur la carte ; les signalements et la mer s'affichent au fil du voyage.`,
        links: [],
      };
    case "arrival":
      return {
        lead: `Débarquement, contrôles et sortie du port de ${to}. Gardez passeports${vehicle ? ", TPD et papiers du véhicule" : ""} à portée de main.`,
        links: [{ href: "#port", label: `Le port de ${to}` }],
      };
    case "last":
      return {
        lead:
          direction === "outbound"
            ? `Après une nuit en mer, prévoyez des pauses.${vehicle ? ` Carburant et dinars avant de quitter ${to}.` : ""}${lastMin && destination ? ` ${to} → ${destination} : environ ${durationLabel(lastMin)} avec les pauses.` : ""}`
            : `Route jusqu'à destination : la fatigue de la traversée se fait sentir, arrêtez-vous régulièrement.${lastMin ? ` Environ ${durationLabel(lastMin)} avec les pauses.` : ""}`,
        links: direction === "outbound" ? [{ href: "/mes-dinars", label: "Mes dinars" }] : [],
      };
    case "home":
      return {
        lead: simulation
          ? "Le voyage s'achève. Une fois arrivé·e, vos retours (note de la traversée, passage au port) aideront les prochains voyageurs."
          : "Bien arrivé·e ? Notez la traversée et racontez votre passage au port : vos retours aident les prochains voyageurs.",
        links: [],
      };
  }
}
