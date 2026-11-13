/**
 * Papiers et formalités pour un voyage en Algérie, voyageur par voyageur.
 * Chaque règle cite la page officielle d'où elle vient (lue le 13 novembre 2026).
 * Ce qu'aucune source officielle ne tranche est marqué « à faire confirmer », jamais affirmé.
 */
export {
  consulats,
  consulatForDepartment,
  departmentFromPostcode,
  type Consulat,
} from "./consulats";

export const FORMALITES_CHECKED = "2026-11-13";
/** Fin de la mesure qui dispense de visa les binationaux munis d'un document algérien. */
export const BINATIONAL_MEASURE_END = "31 décembre 2026";

export const formaliteSources = {
  "fd-entree": {
    name: "France Diplomatie, Algérie : entrée et séjour",
    short: "France Diplomatie",
    url: "https://www.diplomatie.gouv.fr/fr/information-par-pays/algerie/conseils-aux-voyageurs-entree-sejour",
    updated: "mise à jour du 15 septembre 2026",
  },
  "amb-visa": {
    name: "Ambassade d'Algérie en France : formalités de visa",
    short: "Ambassade d'Algérie",
    url: "https://amb-algerie.fr/formalites-visa/",
  },
  "amb-consulats": {
    name: "Ambassade d'Algérie en France : réseau consulaire et circonscriptions",
    short: "Ambassade d'Algérie",
    url: "https://www.amb-algerie.fr/reseau-consulaire/",
  },
  "mfa-representations": {
    name: "Ministère algérien des Affaires étrangères : représentations à l'étranger",
    short: "Ministère algérien des Affaires étrangères",
    url: "https://www.mfa.gov.dz/fr/embassys-locations-list",
  },
  "cons-binationaux": {
    name: "Consulat d'Algérie à Montpellier : accès au territoire pour les binationaux",
    short: "Consulat d'Algérie",
    url: "https://consulat-montpellier-algerie.fr/5027/nouvelles-modalites-dacces-au-territoire-national-pour-les-binationaux-2/",
    updated: "mesure valable jusqu'au 31 décembre 2026",
  },
  "cons-visa-familial": {
    name: "Consulat général d'Algérie à Paris : visa familial",
    short: "Consulat d'Algérie",
    url: "https://consulat-paris-algerie.fr/visas/visa-familial/",
  },
  "cons-livret": {
    name: "Consulat général d'Algérie à Paris : transcription de mariage et livret de famille",
    short: "Consulat d'Algérie",
    url: "https://consulat-paris-algerie.fr/etat-civil/livret-famille/",
  },
  "cons-12s": {
    name: "Consulat général d'Algérie à Paris : acte de naissance 12S",
    short: "Consulat d'Algérie",
    url: "https://consulat-paris-algerie.fr/etat-civil/acte-naissance-12s/",
  },
  "cons-autorisation": {
    name: "Consulat général d'Algérie à Paris : autorisation paternelle de voyage",
    short: "Consulat d'Algérie",
    url: "https://consulat-paris-algerie.fr/legalisation-documents-divers/autorisation-voyage-paternelle/",
  },
  "cons-recensement": {
    name: "Consulat général d'Algérie à Paris : service national, recensement",
    short: "Consulat d'Algérie",
    url: "https://consulat-paris-algerie.fr/service-national/recensement/",
  },
  "cons-passeport": {
    name: "Consulat d'Algérie à Montpellier : passeport biométrique",
    short: "Consulat d'Algérie",
    url: "https://consulat-montpellier-algerie.fr/les-principales-missions-dun-consulat/passeport/",
  },
  "cons-immat": {
    name: "Consulat d'Algérie à Montpellier : immatriculation consulaire",
    short: "Consulat d'Algérie",
    url: "https://consulat-montpellier-algerie.fr/les-principales-missions-dun-consulat/limmatriculation-consulaire/",
  },
  "dz-cnibe": {
    name: "Ministère de l'Intérieur algérien : carte d'identité biométrique en ligne",
    short: "Ministère de l'Intérieur algérien",
    url: "https://passeport.interieur.gov.dz/fr/DemandeCNIBE_Fr/Demande",
  },
  "be-pratique": {
    name: "Affaires étrangères de Belgique, Algérie : informations pratiques",
    short: "Affaires étrangères de Belgique",
    url: "https://diplomatie.belgium.be/fr/pays/algerie/voyager-en-algerie-conseils-aux-voyageurs/informations-pratiques-lors-de-votre-voyage-en-algerie",
    updated: "mise à jour du 12 novembre 2026",
  },
  "be-legislation": {
    name: "Affaires étrangères de Belgique, Algérie : législation locale",
    short: "Affaires étrangères de Belgique",
    url: "https://diplomatie.belgium.be/fr/pays/algerie/voyager-en-algerie-conseils-aux-voyageurs/legislation-locale-en-algerie",
    updated: "mise à jour du 12 novembre 2026",
  },
  "justice-algerie": {
    name: "Justice.fr : documents pour se rendre en Algérie",
    short: "Justice.fr",
    url: "https://www.justice.fr/fiche/documents-francais-se-rendre-algerie",
    updated: "mise à jour du 11 octobre 2024",
  },
  "sp-mineur": {
    name: "Service-Public.fr : documents d'un mineur qui voyage à l'étranger",
    short: "Service-Public.fr",
    url: "https://www.service-public.gouv.fr/particuliers/vosdroits/F1922",
    updated: "vérifiée le 16 avril 2025",
  },
} as const satisfies Record<string, { name: string; short: string; url: string; updated?: string }>;

export type FormaliteSourceId = keyof typeof formaliteSources;

/* ------------------------------------------------------------------ Réponses du voyageur */

/** dz : algérien seulement · bi : algérien et autre nationalité · etr : sans nationalité algérienne. */
export type Nat = "dz" | "bi" | "etr";
/** Le document algérien d'un binational. */
export type DzDoc = "passeport" | "cnibe" | "passeportExpire" | "aucun";
/** Pour un Algérien qui vit en Europe : le titre qui lui permettra de revenir. */
export type Residence = "titre" | "fragile";

export interface Traveller {
  id: string;
  kind: "adult" | "child";
  nat: Nat;
  dzDoc: DzDoc;
  /** Âge des enfants, en années. */
  age: number;
  /** Homme algérien de 19 ans ou plus : service national. */
  man: boolean;
  residence: Residence;
  /** Passeport algérien encore valable au retour (absent des anciennes réponses : « je ne sais pas »). */
  dzValid?: DzValid;
}

/** tight : valable au retour, mais il expire peu après (aucune règle ne fixe de marge). */
export type DzValid = "yes" | "tight" | "no" | "unknown";

export type Couple = "married" | "unmarried" | "none";
export type KidsWith = "both" | "father" | "mother" | "other" | "alone";
export type Stay = "family" | "hotel" | "both";

export interface Answers {
  postcode: string;
  /** Habite hors de France : consulat du pays de résidence. */
  abroad: boolean;
  travellers: Traveller[];
  couple: Couple;
  /** Mariage déjà transcrit à l'état civil algérien (couple mixte). */
  transcribed: "yes" | "no" | "unknown";
  kidsWith: KidsWith;
  /** Parents séparés ou divorcés. */
  separated: boolean;
  /** Après séparation, la garde est confiée à la mère. */
  motherCustody: boolean;
  stay: Stay;
}

export function newTraveller(kind: Traveller["kind"]): Traveller {
  return {
    id: `${kind}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    nat: "bi",
    dzDoc: "passeport",
    age: kind === "child" ? 8 : 30,
    man: false,
    residence: "titre",
    dzValid: "unknown",
  };
}

export const defaultAnswers: Answers = {
  postcode: "",
  abroad: false,
  travellers: [
    {
      id: "adult-moi",
      kind: "adult",
      nat: "bi",
      dzDoc: "passeport",
      age: 30,
      man: false,
      residence: "titre",
      dzValid: "unknown",
    },
  ],
  couple: "none",
  transcribed: "unknown",
  kidsWith: "both",
  separated: false,
  motherCustody: false,
  stay: "family",
};

/** « Vous », « Adulte 2 », « Enfant 1 »… */
export function travellerLabel(t: Traveller, all: Traveller[]): string {
  const same = all.filter((x) => x.kind === t.kind);
  const n = same.findIndex((x) => x.id === t.id) + 1;
  if (t.kind === "adult") return n === 1 ? "Vous" : `Adulte ${n}`;
  return `Enfant ${n}`;
}

/* ------------------------------------------------------------------ Ce qu'il faut faire */

/** Quand le faire : la liste se lit de haut en bas, comme un compte à rebours. */
export type When = "first" | "weeks" | "months3" | "pack" | "there" | "back";

export const whenOrder: When[] = ["first", "weeks", "months3", "pack", "there", "back"];

export const whenLabels: Record<When, { title: string; hint: string }> = {
  first: {
    title: "À lancer tout de suite",
    hint: "Aucun délai n'est publié : plus tôt c'est lancé, mieux c'est.",
  },
  weeks: { title: "Plusieurs semaines avant", hint: "Avant d'acheter un billet non remboursable." },
  months3: {
    title: "Dans les 3 mois avant",
    hint: "Ces papiers ne sont valables que peu de temps.",
  },
  pack: {
    title: "Dans la pochette du voyage",
    hint: "À présenter au port, à l'aller comme au retour.",
  },
  there: { title: "Sur place", hint: "Pendant le séjour en Algérie." },
  back: { title: "Pour rentrer", hint: "Le retour se prépare dès le départ." },
};

export interface Task {
  id: string;
  when: When;
  title: string;
  detail: string;
  /** Voyageurs concernés ; vide = tout le groupe. */
  who: string[];
  sources: FormaliteSourceId[];
  /** Aucune source officielle ne tranche : à faire confirmer par le consulat ou la préfecture. */
  toConfirm?: boolean;
  /** Se fait au consulat d'Algérie : ce qu'on y fait, pour dire pourquoi on cherche le consulat. */
  consulate?: string;
  /** Les démarches à avoir faites avant celle-ci (ids). */
  needs?: string[];
  /** Un conseil de prudence de BledWay, pas une obligation tirée d'une source. */
  advice?: boolean;
}

/** À faire (rendez-vous, dossier) ou seulement à emporter ? */
export const isPaperToDo = (task: Task) =>
  task.when === "first" || task.when === "weeks" || task.when === "months3";

const isMinorDz = (t: Traveller) => t.kind === "child" && t.age < 19;
const isMinorFr = (t: Traveller) => t.kind === "child" && t.age < 18;

/** La liste des papiers du groupe, dans l'ordre où il faut s'en occuper. */
export function tasksFor(a: Answers): Task[] {
  const tasks: Task[] = [];
  const all = a.travellers;
  const label = (t: Traveller) => travellerLabel(t, all);
  const adults = all.filter((t) => t.kind === "adult");
  const children = all.filter((t) => t.kind === "child");
  const foreigners = all.filter((t) => t.nat === "etr");
  const algerianAdults = adults.filter((t) => t.nat !== "etr");
  const mixedCouple =
    a.couple === "married" && adults.some((t) => t.nat === "etr") && algerianAdults.length > 0;
  const add = (task: Task) => {
    const existing = tasks.find((x) => x.id === task.id);
    if (existing) existing.who = [...new Set([...existing.who, ...task.who])];
    else tasks.push(task);
  };

  /* Couple mixte : la transcription conditionne le visa du conjoint, c'est la première démarche. */
  if (mixedCouple && a.transcribed !== "yes")
    add({
      id: "transcription-mariage",
      when: "first",
      title: "Faire transcrire le mariage à l'état civil algérien",
      detail:
        "Le visa familial du conjoint étranger demande l'acte de mariage transcrit sur les registres algériens. La transcription se fait au consulat avec la pièce d'identité algérienne du conjoint algérien, l'acte de mariage original de moins de 3 mois et les actes de naissance des deux époux de moins de 3 mois. Elle précède aussi le livret de famille algérien. Aucun délai n'est publié.",
      who: algerianAdults.map(label),
      sources: ["cons-visa-familial", "cons-livret"],
      consulate: "la transcription du mariage",
    });

  for (const t of all) {
    const who = [label(t)];
    const child = t.kind === "child";

    if (t.nat === "etr") {
      const spouse = mixedCouple && !child;
      add({
        id: `visa-${t.id}`,
        when: "weeks",
        title: spouse
          ? "Demander le visa familial de conjoint"
          : child
            ? "Demander son visa (un enfant aussi)"
            : "Demander le visa",
        detail: [
          "Le visa est obligatoire. Il se demande avant le départ, au consulat d'Algérie du lieu de résidence, sur rendez-vous ; il n'y a pas de visa à l'arrivée pour un voyage individuel. Délai annoncé par l'ambassade : 1 à 14 jours.",
          "Pièces de base : formulaire, passeport valable au moins 6 mois, photo, assurance voyage, justificatif de domicile de moins de 3 mois et justificatif d'activité. Un dossier incomplet est rejeté.",
          spouse
            ? "Pour le conjoint d'un Algérien : l'acte de mariage transcrit à l'état civil algérien et la preuve de la nationalité algérienne du conjoint (carte consulaire, passeport ou carte d'identité)."
            : "",
          child
            ? "Pour un mineur : un parent ou le tuteur l'accompagne au rendez-vous, avec le livret de famille ou sa copie conforme."
            : "",
          "Coût annoncé par l'ambassade pour 90 jours ou moins : 80 € à partir de 12 ans, 40 € de 6 à 12 ans, gratuit avant 6 ans, plus 30 € de frais de dossier. Vérifiez le tarif sur le site du consulat.",
        ]
          .filter(Boolean)
          .join("\n"),
        who,
        sources: spouse
          ? ["fd-entree", "cons-visa-familial", "amb-visa"]
          : ["fd-entree", "amb-visa", "justice-algerie"],
        consulate: "le visa",
        ...(spouse && a.transcribed !== "yes" ? { needs: ["transcription-mariage"] } : {}),
      });
      continue;
    }

    /* Binational : avec quel document algérien ? */
    if (t.nat === "bi") {
      if (t.dzDoc === "passeport")
        add({
          id: "entree-passeport-dz",
          when: "pack",
          title: "Le passeport algérien, et l'autre passeport",
          detail:
            "En Algérie, un binational est traité comme un Algérien : il entre et sort avec son passeport algérien valide. Emportez aussi le passeport de l'autre nationalité.",
          who,
          sources: ["be-pratique", "justice-algerie"],
        });
      else if (t.dzDoc === "cnibe" || t.dzDoc === "passeportExpire")
        add({
          id: `entree-mesure-${t.dzDoc}`,
          when: "pack",
          title:
            t.dzDoc === "cnibe"
              ? "Passeport étranger + carte d'identité algérienne : pas de visa"
              : "Passeport étranger + passeport algérien expiré : pas de visa",
          detail: `Jusqu'au ${BINATIONAL_MEASURE_END}, un Algérien muni d'un passeport étranger valide entre sans visa s'il présente ${
            t.dzDoc === "cnibe"
              ? "sa carte d'identité biométrique algérienne, même expirée"
              : "son passeport biométrique algérien expiré (à défaut de carte d'identité)"
          }. Les mêmes documents sont demandés à la sortie. Si les noms diffèrent d'un document à l'autre, ajoutez une attestation d'individualité. Après cette date, vérifiez auprès du consulat si la mesure est prolongée.`,
          who,
          sources: ["cons-binationaux"],
        });
      else if (child && t.age <= 15 && a.kidsWith !== "alone" && a.kidsWith !== "other")
        add({
          id: "entree-enfant-livret",
          when: "pack",
          title: "Enfant sans papier algérien : le livret de famille suffit",
          detail: `Jusqu'au ${BINATIONAL_MEASURE_END}, un enfant de 15 ans ou moins sans document biométrique algérien, qui voyage avec ses parents, entre avec son passeport étranger et le livret de famille, la fiche familiale ou le jugement de tutelle ou de kafala. Mêmes documents à la sortie.`,
          who,
          sources: ["cons-binationaux"],
        });
      else
        add({
          id: `sans-document-${t.id}`,
          when: "first",
          title: "Faire établir un papier algérien, ou demander un visa",
          detail:
            "Avec seulement un passeport étranger et aucun document algérien, la dispense de visa des binationaux ne s'applique pas. Deux solutions : demander un visa comme un étranger, ou faire d'abord établir le passeport ou la carte d'identité algérienne. Pour une personne née en France, l'acte de naissance doit d'abord être transcrit (acte 12S), obligatoire pour le passeport biométrique.",
          who,
          sources: ["cons-binationaux", "cons-12s", "amb-visa"],
          consulate: "le papier algérien ou le visa",
        });

      add({
        id: "retour-binational",
        when: "back",
        title: "Une pièce d'identité européenne valide pour rentrer",
        detail:
          "Même entré en Algérie avec ses papiers algériens, il faut présenter une pièce d'identité française (ou de l'autre nationalité) en cours de validité pour rentrer.",
        who,
        sources: ["justice-algerie"],
      });
    }

    // Le passeport algérien : rien à faire s'il est valable au retour, à renouveler sinon.
    const dzValid = t.dzValid ?? "unknown";
    if ((t.nat === "dz" || (t.nat === "bi" && t.dzDoc === "passeport")) && dzValid === "no")
      add({
        id: "renouveler-passeport-dz",
        when: "first",
        title: "Renouveler le passeport algérien",
        detail:
          "Il doit être valable pendant tout le séjour, et même quelques jours au-delà du retour. Le renouvellement se demande au consulat sur rendez-vous ; le passeport est fabriqué en Algérie et aucun délai n'est publié : lancez-le dès maintenant, avant d'acheter un billet non remboursable. Vérifiez sur le site du consulat qu'il est prêt avant d'aller le chercher. La carte d'identité biométrique peut aussi se demander en ligne.",
        who,
        sources: ["be-pratique", "cons-passeport", "dz-cnibe"],
        consulate: "le renouvellement du passeport",
        needs: ["carte-consulaire"],
      });
    else if ((t.nat === "dz" || (t.nat === "bi" && t.dzDoc === "passeport")) && dzValid === "tight")
      add({
        id: "marge-passeport-dz",
        when: "first",
        title: "Renouveler si possible le passeport, qui expire peu après le retour",
        detail:
          "Il est en règle : les sources officielles demandent seulement qu'il couvre la date du retour, « et même plusieurs jours au-delà », sans fixer de marge. Le risque est un retour retardé (traversée annulée, séjour prolongé, souci de santé) : passé la date d'expiration, il faudrait le renouveler depuis l'Algérie, sans délai publié.\nSi le rendez-vous au consulat est possible avant le départ, renouvelez-le ; sinon, partez avec et gardez une copie de vos autres pièces d'identité.",
        who,
        sources: ["be-pratique", "cons-passeport"],
        consulate: "le renouvellement conseillé du passeport",
        needs: ["carte-consulaire"],
        advice: true,
      });
    else if (
      (t.nat === "dz" || (t.nat === "bi" && t.dzDoc === "passeport")) &&
      dzValid === "unknown"
    )
      add({
        id: "validite-passeport-dz",
        when: "first",
        title: "Regarder la date d'expiration du passeport algérien",
        detail:
          "Il doit être valable pendant tout le séjour, et même quelques jours au-delà du retour. S'il expire avant, il faut le renouveler au consulat, sur rendez-vous ; le passeport est fabriqué en Algérie et aucun délai n'est publié. Modifiez vos réponses une fois la date vérifiée : la liste s'adapte.",
        who,
        sources: ["be-pratique", "cons-passeport"],
      });

    if (t.nat === "dz" && !child && t.residence === "fragile")
      add({
        id: "titre-sejour",
        when: "first",
        title: "Titre qui expire ou récépissé : demander à la préfecture",
        detail:
          "Aucune page officielle consultée ne dit si l'on peut revenir en France avec un titre expiré, un récépissé de renouvellement ou une attestation de prolongation. Posez la question à la préfecture avant d'acheter le billet, et gardez la réponse écrite.",
        who,
        sources: [],
        toConfirm: true,
      });

    if (t.nat === "dz" && isMinorFr(t))
      add({
        id: "retour-enfant-dz",
        when: "back",
        title: "Le document qui permet à l'enfant de revenir en France",
        detail:
          "Un enfant algérien qui vit en France a besoin d'un document délivré par la préfecture pour revenir sans visa. Vérifiez qu'il est valable jusqu'au retour : aucune page officielle consultée ne détaille ce point.",
        who,
        sources: [],
        toConfirm: true,
      });

    if (!child && t.man)
      add({
        id: "service-national",
        when: "first",
        title: "Être en règle avec le service national",
        detail:
          "Le service national est obligatoire à 19 ans révolus. Les Algériens qui vivent à l'étranger se font recenser au consulat, qui remet une attestation de recensement ; une dispense existe notamment pour soutien de famille ou raison médicale. Ce qui se passe à la sortie d'Algérie pour un homme qui n'est pas en règle n'est écrit sur aucune page consultée : demandez au consulat.",
        who,
        sources: ["cons-recensement"],
        consulate: "le recensement du service national",
        toConfirm: true,
      });
  }

  /* Enfants : les autorisations dépendent de l'adulte qui les accompagne. */
  if (children.length) {
    const withoutFather =
      a.kidsWith === "mother" || a.kidsWith === "other" || a.kidsWith === "alone";
    const dzKids = children.filter((t) => t.nat !== "etr" && isMinorDz(t));
    if (dzKids.length && withoutFather) {
      const dispensed = a.kidsWith === "mother" && a.separated && a.motherCustody;
      add(
        dispensed
          ? {
              id: "dispense-autorisation",
              when: "pack",
              title: "Pas d'autorisation paternelle : le jugement de garde",
              detail:
                "Les enfants de parents séparés ou divorcés dont la mère a la garde sont dispensés de l'autorisation paternelle. Emportez le jugement qui fixe la garde.",
              who: dzKids.map(label),
              sources: ["cons-autorisation"],
            }
          : {
              id: "autorisation-paternelle",
              when: "months3",
              title: "L'autorisation paternelle de sortie",
              detail:
                "Un mineur algérien (la majorité est à 19 ans en Algérie) qui voyage sans son père la présente à la sortie d'Algérie. Elle se fait au consulat et vaut 3 mois : demandez-la dans les 3 mois avant le retour.\nPièces : pièce d'identité algérienne du parent, livret de famille, titre de séjour de l'enfant, en cas de divorce le jugement sur l'autorité parentale, et un timbre de 2 €.\nUne loi en dispense les enfants qui vivent à l'étranger avec un passeport étranger, mais la police aux frontières la demande souvent : mieux vaut l'avoir.",
              who: dzKids.map(label),
              sources: ["cons-autorisation", "be-pratique", "justice-algerie"],
              consulate: "l'autorisation paternelle",
            },
      );
      if (dzKids.some((t) => t.age === 18))
        add({
          id: "majorite-19",
          when: "months3",
          title: "À 18 ans, encore mineur en Algérie",
          detail:
            "Majeur en France, un jeune de 18 ans reste mineur en Algérie jusqu'à 19 ans : l'autorisation paternelle le concerne encore.",
          who: dzKids.filter((t) => t.age === 18).map(label),
          sources: ["justice-algerie", "be-pratique"],
        });
    }

    const frMinors = children.filter(isMinorFr);
    if (frMinors.length && (a.kidsWith === "other" || a.kidsWith === "alone"))
      add({
        id: "ast",
        when: "pack",
        title: "L'autorisation de sortie du territoire (AST)",
        detail:
          "Un mineur qui quitte la France sans aucun de ses parents présente l'AST signée par un parent, avec la copie de la pièce d'identité de ce parent. Le formulaire se remplit soi-même.",
        who: frMinors.map(label),
        sources: ["sp-mineur"],
      });
    const etrKids = children.filter((t) => t.nat === "etr");
    if (etrKids.length && (a.kidsWith === "other" || a.kidsWith === "alone"))
      add({
        id: "lettre-parents",
        when: "pack",
        title: "La lettre des parents, signatures légalisées",
        detail:
          "Un mineur étranger seul ou avec un autre adulte présente à l'arrivée en Algérie une lettre d'autorisation des parents dont les signatures sont légalisées.",
        who: etrKids.map(label),
        sources: ["justice-algerie"],
      });
    const biKids = children.filter((t) => t.nat === "bi" && t.dzDoc === "passeport");
    if (biKids.length)
      add({
        id: "deux-passeports",
        when: "pack",
        title: "Ses deux passeports, à son nom",
        detail:
          "Un enfant binational qui ne voyage pas en même temps que le parent inscrit sur son passeport algérien doit avoir son propre passeport étranger.",
        who: biKids.map(label),
        sources: ["be-pratique"],
      });
    add({
      id: "livret",
      when: "pack",
      title: "Le livret de famille",
      detail:
        "En France, il ne peut pas être exigé à la sortie, même si l'enfant ne porte pas le nom du parent. Emportez-le quand même : le consulat d'Algérie le demande et il prouve le lien de parenté.",
      who: [],
      sources: ["sp-mineur", "justice-algerie"],
    });
    if (a.separated && !(a.kidsWith === "mother" && a.motherCustody))
      add({
        id: "jugement-garde",
        when: "pack",
        title: "Le jugement qui fixe la garde",
        detail: "Parents séparés ou divorcés : emportez une copie du jugement de garde.",
        who: [],
        sources: ["justice-algerie", "cons-autorisation"],
      });
  }

  /* Hébergement */
  if (foreigners.length && a.stay !== "hotel")
    add({
      id: "certificat-hebergement",
      when: "weeks",
      title: "Le certificat d'hébergement de la famille",
      detail:
        "Le visa d'une visite familiale demande un certificat d'hébergement de moins de 3 mois, établi par un membre de la famille en Algérie et légalisé par sa mairie, avec la copie de sa pièce d'identité. Comptez le temps de l'envoi.",
      who: foreigners.map(label),
      sources: ["amb-visa", "cons-visa-familial"],
    });
  if (foreigners.length && a.stay !== "family")
    add({
      id: "reservation-hotel",
      when: "weeks",
      title: "La réservation d'hôtel pour le visa",
      detail:
        "Pour un séjour à l'hôtel, la réservation remplace le certificat d'hébergement dans le dossier de visa.",
      who: foreigners.map(label),
      sources: ["justice-algerie"],
    });
  if (a.stay !== "family" && adults.length >= 2 && a.couple !== "none")
    add(
      a.couple === "married"
        ? {
            id: "acte-mariage",
            when: "pack",
            title: "Un extrait d'acte de mariage pour l'hôtel",
            detail:
              "Certains hôtels n'acceptent un couple dans la même chambre que s'il est marié : emportez un extrait d'acte de mariage.",
            who: [],
            sources: ["be-legislation"],
          }
        : {
            id: "chambres-separees",
            when: "weeks",
            title: "Couple non marié : demander à l'hôtel avant de réserver",
            detail: "Certains hôtels demandent à un couple non marié de prendre deux chambres.",
            who: [],
            sources: ["be-legislation"],
          },
    );

  /* Pour tout le monde */
  add({
    id: "devises",
    when: "pack",
    title: "Déclarer ses devises à partir de 1 000 €",
    detail:
      "À l'entrée comme à la sortie, les billets et moyens de paiement en devises sont à déclarer à la douane à partir de l'équivalent de 1 000 €. Seuls les résidents peuvent emporter ou rapporter des dinars, dans la limite de 10 000 DA.",
    who: [],
    sources: ["fd-entree"],
  });
  add({
    id: "papiers-sur-soi",
    when: "there",
    title: "Garder ses papiers d'identité sur soi",
    detail:
      "La loi algérienne s'applique aux étrangers comme aux Algériens, et il faut avoir ses papiers d'identité sur soi.",
    who: [],
    sources: ["be-legislation"],
  });
  if (foreigners.length)
    add({
      id: "bureau-etrangers",
      when: "there",
      title: "Se signaler à la wilaya ?",
      detail:
        "La fiche officielle française indique que les étrangers doivent se signaler au bureau des étrangers de la wilaya de leur lieu de résidence, sans dire si cela vaut pour un court séjour chez des proches. Posez la question au consulat en déposant le visa, et notez la réponse.",
      who: foreigners.map(label),
      sources: ["fd-entree"],
      toConfirm: true,
    });
  if (all.some((t) => t.nat !== "dz"))
    add({
      id: "ariane",
      when: "weeks",
      title: "S'inscrire sur Fil d'Ariane (Français)",
      detail:
        "Facultatif : le ministère des Affaires étrangères envoie ses alertes pendant le séjour.",
      who: [],
      sources: ["fd-entree"],
    });

  // La carte consulaire n'est utile que pour une démarche au consulat (le consulat la demande) :
  // pas de rendez-vous inutile quand tout est déjà en règle.
  const atConsulate = tasks.some((t) => t.consulate && !t.id.startsWith("visa-"));
  if (atConsulate && algerianAdults.length)
    add({
      id: "carte-consulaire",
      when: "first",
      title: "Avoir sa carte consulaire à jour",
      detail:
        "Le consulat la demande pour les démarches de cette liste. Elle est gratuite et valable 5 ans : si la vôtre est à jour, cochez simplement cette ligne.",
      who: algerianAdults.map(label),
      sources: ["cons-immat"],
      consulate: "la carte consulaire",
    });

  return tasks.sort((x, y) => whenOrder.indexOf(x.when) - whenOrder.indexOf(y.when));
}

/** Les démarches qui se font au consulat : sans elles, inutile de chercher le consulat. */
export const consulateTasks = (a: Answers) => tasksFor(a).filter((t) => t.consulate);

/** « le visa (Adulte 2) et le renouvellement du passeport (Vous) » */
export function consulateReasons(a: Answers): string {
  const reasons = consulateTasks(a)
    .filter((t) => t.id !== "carte-consulaire")
    .map((t) => (t.who.length ? `${t.consulate} (${t.who.join(", ")})` : t.consulate!));
  const unique = [...new Set(reasons)];
  if (unique.length <= 1) return unique[0] ?? "";
  return `${unique.slice(0, -1).join(", ")} et ${unique.at(-1)}`;
}

/** Situations sans papier particulier : on le dit, pour rassurer. */
export function reassurances(a: Answers): string[] {
  const notes: string[] = [];
  const adults = a.travellers.filter((t) => t.kind === "adult");
  const kids = a.travellers.some((t) => t.kind === "child");
  if (adults.length === 1 && !kids)
    notes.push(
      "Vous voyagez seul : les sources officielles ne prévoient aucun papier particulier pour une personne seule, femme ou homme.",
    );
  if (kids && (a.kidsWith === "both" || a.kidsWith === "father"))
    notes.push(
      "Les enfants voyagent avec leur père : ni autorisation paternelle, ni autorisation de sortie du territoire.",
    );
  if (!a.travellers.some((t) => t.nat === "etr"))
    notes.push("Personne n'a besoin de visa dans votre groupe.");
  return notes;
}

/** Quand s'y prendre : uniquement les délais publiés ; sinon, on le dit. */
export const delais: {
  demarche: string;
  ou: string;
  delai: string;
  conseil: string;
  sources: FormaliteSourceId[];
}[] = [
  {
    demarche: "Visa (passeport étranger)",
    ou: "Consulat d'Algérie du lieu de résidence, sur rendez-vous",
    delai: "1 à 14 jours après le dépôt",
    conseil:
      "Déposez la demande plusieurs semaines avant le départ, avant de payer un billet non remboursable.",
    sources: ["amb-visa", "be-pratique"],
  },
  {
    demarche: "Transcription du mariage (couple mixte)",
    ou: "Consulat d'Algérie",
    delai: "Non publié",
    conseil: "À faire en premier : le visa du conjoint en dépend.",
    sources: ["cons-livret", "cons-visa-familial"],
  },
  {
    demarche: "Certificat d'hébergement",
    ou: "Mairie de la famille qui vous reçoit en Algérie",
    delai: "Non publié",
    conseil:
      "Il doit avoir moins de 3 mois au dépôt du visa : demandez-le environ un mois avant le rendez-vous.",
    sources: ["amb-visa"],
  },
  {
    demarche: "Passeport ou carte d'identité algérienne",
    ou: "Consulat sur rendez-vous ; carte d'identité aussi en ligne",
    delai: "Non publié",
    conseil:
      "Prenez rendez-vous dès que vos dates sont fixées. Pour une personne née en France, l'acte 12S passe avant.",
    sources: ["cons-passeport", "cons-12s", "dz-cnibe"],
  },
  {
    demarche: "Autorisation paternelle de sortie",
    ou: "Consulat d'Algérie",
    delai: "Non publié · valable 3 mois",
    conseil: "Faites-la dans les 3 mois qui précèdent le retour.",
    sources: ["cons-autorisation"],
  },
  {
    demarche: "Autorisation de sortie du territoire (AST)",
    ou: "Formulaire à remplir soi-même",
    delai: "Immédiat",
    conseil: "Seulement si l'enfant part sans aucun de ses parents.",
    sources: ["sp-mineur"],
  },
];

/* ------------------------------------------------------------------ Progression enregistrée */

export const PAPERS_STORAGE_KEY = "bledway:papiers:v1";

export interface SavedPapers {
  answers: Answers;
  done: string[];
  finished: boolean;
}

export function loadPapers(): SavedPapers | null {
  try {
    const raw = window.localStorage.getItem(PAPERS_STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedPapers;
    return { ...saved, answers: { ...defaultAnswers, ...saved.answers } };
  } catch {
    return null;
  }
}

export function savePapers(value: SavedPapers) {
  try {
    window.localStorage.setItem(PAPERS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* Navigation privée : la liste reste à l'écran, sans être retenue. */
  }
}

/** « 3 sur 9 » pour la checklist de Mon voyage ; null si la liste n'a jamais été faite. */
export function papersProgress(): { done: number; total: number } | null {
  const saved = typeof window === "undefined" ? null : loadPapers();
  if (!saved?.finished) return null;
  const ids = tasksFor(saved.answers).map((t) => t.id);
  return { done: ids.filter((id) => saved.done.includes(id)).length, total: ids.length };
}
