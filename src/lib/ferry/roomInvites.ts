// Inviter au salon dans l'appli quand le voyage change d'état : une seule fenêtre par état.
import { tr, lazyConst } from "@/lib/i18n/translate";
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

const STAGE_TEXT: Record<VoyageStage, { title: string; body: string; examples: string[] }> = lazyConst(() => ({
  soon: {
    get title() { return tr("ui.libFerryRoomInvites.leSalonDeVotreTraversee"); },
    get body() { return tr("ui.libFerryRoomInvites.faitesConnaissanceAvecCeuxQui"); },
    examples: [tr("ui.libFerryRoomInvites.quiVoyageAvecUnFourgon"), tr("ui.libFerryRoomInvites.vousArrivezAQuelleHeure")],
  },
  boarding: {
    get title() { return tr("ui.libFerryRoomInvites.lEmbarquementApproche"); },
    get body() { return tr("ui.libFerryRoomInvites.ditesAuxAutresPassagersComment"); },
    examples: [tr("ui.libFerryRoomInvites.laFileAvance"), tr("ui.libFerryRoomInvites.lEmbarquementACommence")],
  },
  sea: {
    // Être en mer ne se suppose pas : la fenêtre demande d'abord « à bord ? » (RoomInvite).
    get title() { return tr("ui.libFerryRoomInvites.leNavireAPrisLa"); },
    get body() { return tr("ui.libFerryRoomInvites.echangezAvecLesAutresPassagers"); },
    examples: [tr("ui.libFerryRoomInvites.leRestaurantEstOuvert"), tr("ui.libFerryRoomInvites.laMerBougeDeVotre")],
  },
  docked: {
    get title() { return tr("ui.libFerryRoomInvites.leBateauEstAQuai"); },
    get body() { return tr("ui.libFerryRoomInvites.partagezOuVousEnEtes"); },
    examples: [tr("ui.libFerryRoomInvites.onDescendQuand"), tr("ui.libFerryRoomInvites.laDouaneCaAvance")],
  },
}));

export const stageInvite = (stage: VoyageStage) => STAGE_TEXT[stage];

/** Le palier atteint par les messages des autres : 2 rappels au plus par traversée. */
export const activeWave = (othersMessages: number) =>
  ACTIVE_WAVES.filter((threshold) => othersMessages >= threshold).length;

export const activeInvite = (count: number) => ({
  title: tr("ui.libFerryRoomInvites.caDiscuteDansLeSalon"),
  body: `${count} messages des autres voyageurs : venez lire et partager.`,
  examples: [] as string[],
});
