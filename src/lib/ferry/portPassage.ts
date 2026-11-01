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
  not_member: "Réservé aux passagers de cette traversée.",
  not_here: "Réservé aux personnes présentes sur le port : votre position n'est pas à proximité.",
  account: "Connectez-vous pour écrire.",
  length: "200 caractères au plus.",
};
export const chatRefusal = (code: string) => REFUSALS[code] ?? "Message refusé. Réessayez.";
