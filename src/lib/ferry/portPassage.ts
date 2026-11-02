// Le passage du port : après l'arrêt à quai, le voyage continue jusqu'à la sortie du port.
import type { TripStatus } from "./presence";

const HOUR = 3_600_000;
/** Au-delà, le parcours se referme de lui-même, même sans « sorti ». */
export const PASSAGE_MAX_MS = 8 * HOUR;
/** Les étapes de l'arrivée se proposent peu avant l'heure prévue. */
const ARRIVAL_STEPS_BEFORE_MS = 30 * 60_000;

export type PassageInput = {
  /** Arrivée constatée ou premier arrêt observé à quai. */
  dockedSince: string | null;
  scheduledEnd: number;
  status: TripStatus | null;
  now: number;
};

export function portPassage({ dockedSince, scheduledEnd, status, now }: PassageInput) {
  const docked = dockedSince ? Date.parse(dockedSince) : NaN;
  const known = Number.isFinite(docked) && docked <= now;
  const declared = status === "landing" || status === "controls";
  const reference = known ? docked : scheduledEnd;
  const open = (known || declared) && status !== "arrived" && now < reference + PASSAGE_MAX_MS;
  return {
    active: open,
    /** Depuis combien de temps à quai ; null si seule la personne l'a déclaré. */
    minutes: open && known ? Math.round((now - docked) / 60_000) : null,
  };
}

/** Les 4 étapes proposées : celles du voyage, puis celles de l'arrivée. */
export function visibleSteps(
  status: TripStatus | null,
  scheduledEnd: number,
  now: number,
): TripStatus[] {
  const arriving =
    status === "landing" ||
    status === "controls" ||
    status === "arrived" ||
    now >= scheduledEnd - ARRIVAL_STEPS_BEFORE_MS;
  return arriving
    ? ["onboard", "landing", "controls", "arrived"]
    : ["en_route", "port", "onboard", "landing"];
}

export function formatDocked(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

export type PassageQuestion = { question: string; answers: string[] };

/** Une seule question à la fois ; chaque réponse part dans le salon de la traversée. */
export function passageQuestion(status: TripStatus | null): PassageQuestion {
  if (status === "controls")
    return {
      question: "Aux contrôles, ça avance ?",
      answers: [
        "Ça roule aux contrôles",
        "Lent aux contrôles",
        "Bloqué aux contrôles",
        "Fouille en cours",
      ],
    };
  if (status === "landing")
    return {
      question: "Le débarquement, ça donne quoi ?",
      answers: [
        "On descend enfin",
        "Encore bloqués à bord",
        "Longue file sur le quai",
        "Personne ne sait rien",
      ],
    };
  return {
    question: "Vous en êtes où ?",
    answers: ["Encore à bord", "Sur le quai", "J'ai trop chaud", "Les enfants n'en peuvent plus"],
  };
}

const REFUSALS: Record<string, string> = {
  link: "Pas de lien dans le salon.",
  email: "Pas d'adresse e-mail dans le salon.",
  phone: "Pas de numéro de téléphone dans le salon.",
  word: "Ce message contient un mot refusé. Reformulez-le.",
  rate: "Doucement : attendez un peu avant de renvoyer un message.",
  muted: "Vous ne pouvez plus écrire pendant 24 h, après plusieurs messages refusés ou masqués.",
  charter: "Acceptez d'abord la charte de la communauté : elle s'affiche à votre premier message.",
  banned: "L'équipe BledWay vous a retiré l'accès aux salons pour le moment.",
  staff_target: "Action impossible sur un membre de l'équipe.",
  not_member: "Réservé aux passagers de cette traversée.",
  not_here: "Réservé aux personnes présentes sur le port : votre position n'est pas à proximité.",
  account: "Connectez-vous pour écrire.",
  length: "200 caractères au plus.",
  dm_not_same: "Les messages privés se font entre passagers de la même traversée.",
  dm_unavailable: "Vous ne pouvez pas écrire à cette personne.",
  dm_exists: "Une conversation existe déjà avec cette personne sur cette traversée.",
  dm_pending: "Vous avez déjà 3 demandes en attente. Patientez qu'on vous réponde.",
  dm_closed: "Cette conversation est fermée.",
  dm_quota: "Vous avez utilisé vos 3 messages sur cette traversée.",
};
export const chatRefusal = (code: string) => REFUSALS[code] ?? "Message refusé. Réessayez.";

export type PickerRow = { id: string; routeId: string; line: string; when: string; search: string };

const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Les lignes du choix de traversée, de la plus proche à la plus lointaine. */
export function pickerRows<P extends { id: string; name: string }>(
  departures: { id: string; departure_at: string; route_id: string }[],
  routes: { id: string; departure_port_id: string; arrival_port_id: string }[],
  ports: P[],
  format: (iso: string, port: P | undefined) => string,
): PickerRow[] {
  return [...departures]
    .sort((a, b) => a.departure_at.localeCompare(b.departure_at))
    .map((departure) => {
      const route = routes.find((item) => item.id === departure.route_id);
      const from = ports.find((port) => port.id === route?.departure_port_id);
      const to = ports.find((port) => port.id === route?.arrival_port_id);
      const line = `${from?.name ?? "—"} → ${to?.name ?? "—"}`;
      const when = format(departure.departure_at, from);
      return {
        id: departure.id,
        routeId: departure.route_id,
        line,
        when,
        search: plain(`${line} ${when}`),
      };
    });
}

/** Chaque mot doit se retrouver : « oran 12 nov » ; accents et majuscules ne comptent pas. */
export const searchRows = (rows: PickerRow[], text: string) => {
  const words = plain(text).split(/\s+/).filter(Boolean);
  return rows.filter((row) => words.every((word) => row.search.includes(word)));
};

export type RoomMoment = "before" | "boarding" | "sea" | "arrival" | "over";

/** Où en est la traversée, pour proposer les bons exemples et fermer l'écriture. */
export function roomMoment(departureAt: string, arrivalAt: string | null, now: number): RoomMoment {
  const start = Date.parse(departureAt);
  const end = arrivalAt ? Date.parse(arrivalAt) : start + 48 * HOUR;
  if (now > end + PASSAGE_MAX_MS) return "over";
  if (now >= end - ARRIVAL_STEPS_BEFORE_MS) return "arrival";
  if (now >= start) return "sea";
  return now >= start - 8 * HOUR ? "boarding" : "before";
}

const EXAMPLES: Record<RoomMoment | "port" | "questions", string[]> = {
  before: [
    "Qui voyage avec un fourgon ?",
    "Vous arrivez à quelle heure au port ?",
    "Quelqu'un a déjà fait ce trajet ?",
  ],
  boarding: ["La file avance ?", "L'embarquement a commencé ?", "Où est l'entrée véhicules ?"],
  sea: [
    "Le restaurant est ouvert ?",
    "La mer bouge de votre côté ?",
    "Une prise libre quelque part ?",
  ],
  arrival: ["On descend quand ?", "La douane, ça avance ?", "Bien arrivés !"],
  over: [],
  port: ["La file est longue ?", "Le parking est plein ?", "Où trouver un café ?"],
  questions: [
    "À quelle heure arriver au port ?",
    "Y a-t-il de quoi manger à bord ?",
    "Comment embarquer avec une remorque ?",
  ],
};
export const roomExamples = (moment: keyof typeof EXAMPLES) => EXAMPLES[moment];
