// Le passage du port : après l'arrêt à quai, le voyage continue jusqu'à la sortie du port.
import type { TripStatus } from "./presence";
import { tr } from "@/lib/i18n/translate";
import { lazyConst } from "@/lib/i18n/translate";

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
      question: tr("ui.libFerryPortPassage.auxControlesCaAvance"),
      answers: [
        tr("ui.libFerryPortPassage.caRouleAuxControles"),
        tr("ui.libFerryPortPassage.lentAuxControles"),
        tr("ui.libFerryPortPassage.bloqueAuxControles"),
        tr("ui.libFerryPortPassage.fouilleEnCours"),
      ],
    };
  if (status === "landing")
    return {
      question: tr("ui.libFerryPortPassage.leDebarquementCaDonneQuoi"),
      answers: [
        tr("ui.libFerryPortPassage.onDescendEnfin"),
        tr("ui.libFerryPortPassage.encoreBloquesABord"),
        tr("ui.libFerryPortPassage.longueFileSurLeQuai"),
        tr("ui.libFerryPortPassage.personneNeSaitRien"),
      ],
    };
  return {
    question: tr("ui.libFerryPortPassage.vousEnEtesOu"),
    answers: [tr("ui.libFerryPortPassage.encoreABord"), tr("ui.libFerryPortPassage.surLeQuai"), tr("ui.libFerryPortPassage.jAiTropChaud"), tr("ui.libFerryPortPassage.lesEnfantsNEnPeuvent")],
  };
}

const REFUSALS: Record<string, string> = {
  get link() { return tr("ui.libFerryPortPassage.pasDeLienDansLe"); },
  get email() { return tr("ui.libFerryPortPassage.pasDAdresseEMail"); },
  get phone() { return tr("ui.libFerryPortPassage.pasDeNumeroDeTelephone"); },
  get word() { return tr("ui.libFerryPortPassage.ceMessageContientUnMot"); },
  get rate() { return tr("ui.libFerryPortPassage.doucementAttendezUnPeuAvant"); },
  get slow() { return tr("ui.libFerryPortPassage.salonGeneralUnMessageToutes"); },
  get room() { return tr("ui.libFerryPortPassage.ceSalonNExistePas"); },
  get muted() { return tr("ui.libFerryPortPassage.vousNePouvezPlusEcrire"); },
  get charter() { return tr("ui.libFerryPortPassage.acceptezDAbordLaCharte"); },
  get banned() { return tr("ui.libFerryPortPassage.lEquipeBledwayVousA"); },
  get staff_target() { return tr("ui.libFerryPortPassage.actionImpossibleSurUnMembre"); },
  get not_member() { return tr("ui.libFerryPortPassage.reserveAuxPassagersDeCette"); },
  get not_here() { return tr("ui.libFerryPortPassage.reserveAuxPersonnesPresentesSur"); },
  get account() { return tr("ui.libFerryPortPassage.connectezVousPourEcrire"); },
  get length() { return tr("ui.libFerryPortPassage.t200CaracteresAuPlus"); },
  get dm_not_same() { return tr("ui.libFerryPortPassage.lesMessagesPrivesSeFont"); },
  get dm_unavailable() { return tr("ui.libFerryPortPassage.vousNePouvezPasEcrire"); },
  get dm_exists() { return tr("ui.libFerryPortPassage.uneConversationExisteDejaAvec"); },
  get dm_pending() { return tr("ui.libFerryPortPassage.vousAvezDeja3Demandes"); },
  get dm_closed() { return tr("ui.libFerryPortPassage.cetteConversationEstFermee"); },
  get dm_quota() { return tr("ui.libFerryPortPassage.vousAvezUtiliseVos3"); },
};
export const chatRefusal = (code: string) => REFUSALS[code] ?? tr("ui.libFerryPortPassage.messageRefuseReessayez");

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
export const searchRows = <T extends PickerRow>(rows: T[], text: string) => {
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

const EXAMPLES: Record<RoomMoment | "port" | "questions", string[]> = lazyConst(() => ({
  before: [
    tr("ui.libFerryPortPassage.quiPartAussiDeSur"),
    tr("ui.libFerryPortPassage.premiereTraverseeVersDesConseils"),
    tr("ui.libFerryPortPassage.vousComptezArriverAQuelle"),
  ],
  boarding: [
    tr("ui.libFerryPortPassage.laFileAuPortDe"),
    tr("ui.libFerryPortPassage.lEmbarquementDuACommence"),
    tr("ui.libFerryPortPassage.combienDeTempsPourLes"),
  ],
  sea: [
    tr("ui.libFerryPortPassage.caBougeBeaucoupDeVotre"),
    tr("ui.libFerryPortPassage.leRestaurantDuEstOuvert"),
    tr("ui.libFerryPortPassage.unePriseLibreQuelquePart"),
  ],
  arrival: [
    tr("ui.libFerryPortPassage.onDebarqueBientotA"),
    tr("ui.libFerryPortPassage.laDouaneACaAvance"),
    tr("ui.libFerryPortPassage.bienArrivesA"),
  ],
  over: [],
  port: [
    tr("ui.libFerryPortPassage.laFileAuPortDe2"),
    tr("ui.libFerryPortPassage.leParkingDuPortDe"),
    tr("ui.libFerryPortPassage.lesControlesACaVa"),
  ],
  questions: [
    tr("ui.libFerryPortPassage.aQuelleHeureArriverAu"),
    tr("ui.libFerryPortPassage.peutOnEmbarquerUneRemorque"),
    tr("ui.libFerryPortPassage.combienDeTempsDureVraiment"),
  ],
}));
export const roomExamples = (moment: keyof typeof EXAMPLES) => EXAMPLES[moment];
