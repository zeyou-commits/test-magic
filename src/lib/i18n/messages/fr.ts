// Dictionnaire de référence : chaque texte de l'interface, rangé par zone de l'écran.
// Les autres langues reprennent les mêmes clés ; un texte absent retombe sur le français.
export const fr = {
  nav: {
    map: "Carte",
    departuresArrivals: "Départs & arrivées",
    departures: "Départs",
    route: "Route",
    explore: "Explorer",
    find: "Trouver",
    myTrip: "Mon voyage",
    news: "Actualités",
    ports: "Ports",
    lines: "Lignes",
    companies: "Compagnies",
    guide: "Guide",
    vessels: "Navires",
    simulators: "Simulateurs",
    priceBarometer: "Baromètre des prix",
    myDinars: "Mes dinars",
    faq: "Questions fréquentes",
    travelAlgeria: "Voyage en Algérie",
    vehiclesUnder3: "Véhicules de moins de 3 ans",
    carpool: "Covoiturage",
    about: "À propos",
    contact: "Contact",
    editorialMethod: "Méthode éditoriale",
    allGuides: "Tous les dossiers",
    legalNotice: "Mentions légales",
    privacy: "Confidentialité",
    communityCharter: "Charte de la communauté",
    charter: "Charte",
    terms: "Conditions d'utilisation",
  },
  menu: {
    groupTravel: "Voyager",
    groupPrepare: "Préparer",
    groupTools: "Outils",
    groupBledway: "BledWay",
    sheetTitle: "Explorer BledWay",
    sheetDescription: "Toutes les rubriques, rangées par famille.",
    open: "Ouvrir le menu",
    mainNav: "Navigation principale",
    mobileNav: "Navigation mobile",
    myTripLabel: "Mon voyage, étape par étape",
    findLabel: "Trouver une traversée",
    homeLabel: "BledWay, retour à la carte",
    beta: "Bêta",
    skipToContent: "Aller au contenu",
  },
  footer: {
    taglineSea: "La mer entre nous.",
    taglineTrip: "Le voyage qui nous rapproche.",
    scope: "Ferries Europe ↔ Algérie",
    explore: "Explorer",
    prepare: "Préparer le voyage",
    withYou: "À vos côtés",
    question: "Une question ?",
    disclaimer:
      "© {year} BledWay · Informations indépendantes. Horaires et offres à confirmer auprès des compagnies.",
  },
  language: {
    label: "Langue",
    fr: "Français",
    ar: "العربية",
    en: "English",
  },
} as const;

/** Même forme que le français, mais n'importe quel texte : c'est le modèle des autres langues. */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Messages = Widen<typeof fr>;

/** Une traduction peut être incomplète : ce qui manque s'affiche en français. */
type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };
export type PartialMessages = DeepPartial<Messages>;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
/** Toutes les clés, par exemple "nav.map" : une faute de frappe est refusée à la compilation. */
export type MessageKey = Leaves<Messages>;
