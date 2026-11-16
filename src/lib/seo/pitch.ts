// La promesse de BledWay et ce que l'on dit de la billetterie : un seul endroit, repris partout
// (titres, données structurées, llms.txt, FAQ, À propos, Préparer).

/** La promesse, telle qu'on l'écrit au voyageur. Même ordre que le menu : Préparer · Réserver · Suivre. */
export const PROMISE = "Préparez, réservez et suivez votre traversée vers l'Algérie";

/**
 * BledWay vend-il lui-même des billets ?
 * `false` : la réservation et le paiement se font chez la compagnie ou le distributeur indiqué.
 * `true`  : à passer le jour où la billetterie est réellement en service. Les textes de ce cas sont
 * un premier jet à relire avant la bascule. Les pages légales (mentions, conditions d'utilisation,
 * charte) ne dépendent pas de cet interrupteur : elles se réécrivent à part.
 */
export const SELLS_TICKETS: boolean = false;

type TicketingTexts = {
  /** Fin de la présentation générale (données structurées, llms.txt). */
  pitch: string;
  /** Fin de la réponse « Qu'est-ce que BledWay ? ». */
  whatIs: string;
  /** Suite d'une phrase sur la comparaison des départs. */
  afterCompare: string;
  /** Réponse à « Peut-on réserver son billet sur BledWay ? ». */
  faqAnswer: string;
  /** Phrase courte, sous un bouton de réservation. */
  short: string;
  /** Phrase courte, avec le paiement. */
  shortPayment: string;
  /** Fin de la réponse « Comment réserver ma traversée ? ». */
  howToBook: string;
  /** Page À propos : pilier « Informer d'abord ». */
  aboutPillar: string;
  /** Page À propos : fin de l'étape « Réserver ». */
  aboutStep: string;
};

const WITHOUT_SALES: TicketingTexts = {
  pitch:
    "La réservation se fait chez la compagnie ou le distributeur indiqué : BledWay ne vend pas de billets lui-même.",
  whatIs: "Indépendant et gratuit, BledWay ne vend pas de billets lui-même : il est de votre côté.",
  afterCompare: "La réservation se fait ensuite chez la compagnie.",
  faqAnswer:
    "Vous choisissez votre traversée sur BledWay, puis vous réservez et payez chez la compagnie ou le distributeur indiqué. BledWay ne vend pas de billets lui-même.",
  short:
    "Vous réservez chez la compagnie ou le distributeur indiqué : BledWay ne vend pas de billets lui-même.",
  shortPayment:
    "Vous réservez et payez chez la compagnie ou le distributeur indiqué : BledWay ne vend pas de billets lui-même.",
  howToBook:
    "BledWay affiche les départs connus et vous dirige vers la compagnie ou le distributeur indiqué. La réservation et le paiement se font sur leur site.",
  aboutPillar:
    "Nous rassemblons et présentons clairement les ports, lignes, durées et départs, toutes compagnies confondues. La réservation se fait chez la compagnie : nous ne vendons pas de billets nous-mêmes.",
  aboutStep: "Vous réservez ensuite chez la compagnie ou le distributeur indiqué.",
};

// Premier jet, à relire avant de passer SELLS_TICKETS à true.
const WITH_SALES: TicketingTexts = {
  pitch: "La réservation se fait depuis BledWay, auprès de son partenaire de billetterie, qui encaisse le paiement.",
  whatIs: "Indépendant et gratuit, BledWay est de votre côté.",
  afterCompare: "La réservation se fait ensuite depuis BledWay, auprès de son partenaire de billetterie.",
  faqAnswer:
    "Oui. Vous choisissez votre traversée sur BledWay et vous réservez auprès de son partenaire de billetterie, qui encaisse le paiement et émet le billet.",
  short: "Vous réservez depuis BledWay, auprès de son partenaire de billetterie.",
  shortPayment:
    "Vous réservez depuis BledWay : le paiement est encaissé par son partenaire de billetterie, qui émet le billet.",
  howToBook:
    "BledWay affiche les départs connus et vous réservez auprès de son partenaire de billetterie, qui encaisse le paiement et émet le billet.",
  aboutPillar:
    "Nous rassemblons et présentons clairement les ports, lignes, durées et départs, toutes compagnies confondues, sans classer les traversées selon qui paie.",
  aboutStep: "Vous réservez ensuite depuis BledWay, auprès de son partenaire de billetterie.",
};

export const TICKETING: TicketingTexts = SELLS_TICKETS ? WITH_SALES : WITHOUT_SALES;

/** Présentation générale, identique dans les données structurées et dans llms.txt. */
export const PITCH = `BledWay est le Waze du ferry entre l'Europe et le Maghreb : ${PROMISE.charAt(0).toLowerCase()}${PROMISE.slice(1)}. Navires en direct, alertes de retard, de report ou d'annulation, signalements et salons des voyageurs, départs de toutes les compagnies et voyage préparé de porte à porte. Indépendant et gratuit. ${TICKETING.pitch} Disponible dès aujourd'hui pour l'Algérie ; la Tunisie et le Maroc arrivent dans les prochains mois.`;
