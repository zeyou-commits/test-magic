// Inviter au salon dans l'appli quand le voyage change d'état : une seule fenêtre par état.
const HOUR = 3_600_000;
/** Passé ce délai après l'arrêt à quai, plus personne n'attend dans le port. */
const DOCKED_WINDOW = 8 * HOUR;
/** Sans signal de départ, l'invitation de l'embarquement ne traîne pas au-delà. */
const BOARDING_AFTER = 6 * HOUR;
/** Quelques jours avant le départ, le salon se présente. */
const SOON_BEFORE = 7 * 24 * HOUR;
const ACTIVE_WAVES = [5, 15];

export type VoyageStage = "soon" | "boarding" | "sea" | "docked";

export function voyageStage(input: {
  departureAt: string;
  leadMinutes: number;
  /** Départ constaté : signalement validé, correction ou position du navire. */
  departed: boolean;
  arrivedAt: string | null;
  postponed: boolean;
  now: number;
}): VoyageStage | null {
  const { departureAt, leadMinutes, departed, arrivedAt, postponed, now } = input;
  if (postponed) return null;
  if (arrivedAt) return now < Date.parse(arrivedAt) + DOCKED_WINDOW ? "docked" : null;
  if (departed) return "sea";
  const start = Date.parse(departureAt);
  if (now >= start + BOARDING_AFTER) return null;
  if (now >= start - leadMinutes * 60_000) return "boarding";
  return now >= start - SOON_BEFORE ? "soon" : null;
}

const STAGE_TEXT: Record<VoyageStage, { title: string; body: string; examples: string[] }> = {
  soon: {
    title: "Le salon de votre traversée est ouvert",
    body: "Faites connaissance avec ceux qui partent avec vous et posez vos questions.",
    examples: ["Qui voyage avec un fourgon ?", "Vous arrivez à quelle heure au port ?"],
  },
  boarding: {
    title: "L’embarquement approche",
    body: "Dites aux autres passagers comment ça se passe, en un mot.",
    examples: ["La file avance ?", "L’embarquement a commencé ?"],
  },
  sea: {
    title: "Vous voilà en mer",
    body: "Échangez avec les autres passagers pendant la traversée.",
    examples: ["Le restaurant est ouvert ?", "La mer bouge de votre côté ?"],
  },
  docked: {
    title: "Le bateau est à quai",
    body: "Partagez où vous en êtes : ça aide ceux qui attendent encore.",
    examples: ["On descend quand ?", "La douane, ça avance ?"],
  },
};

export const stageInvite = (stage: VoyageStage) => STAGE_TEXT[stage];

/** Le palier atteint par les messages des autres : 2 rappels au plus par traversée. */
export const activeWave = (othersMessages: number) =>
  ACTIVE_WAVES.filter((threshold) => othersMessages >= threshold).length;

export const activeInvite = (count: number) => ({
  title: "Ça discute dans le salon",
  body: `${count} messages des autres voyageurs : venez lire et partager.`,
  examples: [] as string[],
});
