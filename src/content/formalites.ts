/**
 * Papiers et formalités pour un voyage en Algérie.
 * Chaque règle cite la page officielle d'où elle vient (lue le 13 novembre 2026).
 * Ce qui n'est écrit nulle part n'est pas affirmé : la fiche renvoie alors au consulat.
 */

export const FORMALITES_CHECKED = "2026-11-13";

export type FormaliteSourceId =
  | "fd-entree"
  | "amb-visa"
  | "amb-consulats"
  | "be-pratique"
  | "be-legislation"
  | "justice-algerie"
  | "sp-mineur"
  | "cons-montpellier-passeport"
  | "cons-montpellier-autorisation"
  | "cons-montpellier-immat"
  | "dz-cnibe";

export const formaliteSources: Record<
  FormaliteSourceId,
  { name: string; short: string; url: string; updated?: string }
> = {
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
  "cons-montpellier-passeport": {
    name: "Consulat d'Algérie à Montpellier : passeport biométrique",
    short: "Consulat d'Algérie",
    url: "https://consulat-montpellier-algerie.fr/les-principales-missions-dun-consulat/passeport/",
  },
  "cons-montpellier-autorisation": {
    name: "Consulat d'Algérie à Montpellier : autorisation paternelle de voyage",
    short: "Consulat d'Algérie",
    url: "https://consulat-montpellier-algerie.fr/legalisation-documents-divers/autorisation-voyage-paternelle/",
  },
  "cons-montpellier-immat": {
    name: "Consulat d'Algérie à Montpellier : immatriculation consulaire",
    short: "Consulat d'Algérie",
    url: "https://consulat-montpellier-algerie.fr/les-principales-missions-dun-consulat/limmatriculation-consulaire/",
  },
  "dz-cnibe": {
    name: "Ministère de l'Intérieur algérien : demande de carte d'identité biométrique en ligne",
    short: "Ministère de l'Intérieur algérien",
    url: "https://passeport.interieur.gov.dz/fr/DemandeCNIBE_Fr/Demande",
  },
};

/** Avec quels papiers la personne entre en Algérie. */
export type Nationality = "algerian" | "binational" | "foreign";
export type Children = "none" | "withBoth" | "withoutFather" | "alone";
export type Stay = "family" | "hotel";

export interface Profile {
  nationality: Nationality;
  children: Children;
  married: boolean;
  stay: Stay;
}

export type Moment = "avant" | "frontiere" | "surPlace" | "retour";

export const momentLabels: Record<Moment, string> = {
  avant: "Avant de partir",
  frontiere: "Au port, à l'aller comme au retour",
  surPlace: "Sur place",
  retour: "Pour rentrer",
};

export interface Formalite {
  id: string;
  moment: Moment;
  title: string;
  detail: string;
  sources: FormaliteSourceId[];
  /** Point qu'aucune source officielle ne tranche : à faire confirmer par le consulat. */
  toConfirm?: boolean;
}

/** La liste des papiers pour un profil donné, dans l'ordre du voyage. */
export function formalitesFor(profile: Profile): Formalite[] {
  const list: Formalite[] = [];
  const { nationality, children, married, stay } = profile;
  const algerian = nationality !== "foreign";
  const minors = children !== "none";

  if (nationality === "foreign") {
    list.push(
      {
        id: "visa",
        moment: "avant",
        title: "Demander le visa avant de partir",
        detail:
          "Le visa est obligatoire. Il se demande au consulat d'Algérie de votre lieu de résidence, en personne et sur rendez-vous. Il n'y a pas de visa à l'arrivée pour un voyage individuel : la délivrance à l'arrivée est réservée aux voyages en groupe organisés par une agence agréée vers le Grand Sud.",
        sources: ["fd-entree", "justice-algerie"],
      },
      {
        id: "visa-pieces",
        moment: "avant",
        title: "Réunir les pièces du visa",
        detail:
          "Formulaire de demande, passeport valable au moins 6 mois à la date de la demande, photos et assurance voyage. Le consulat peut demander d'autres pièces selon le motif.",
        sources: ["amb-visa", "justice-algerie"],
      },
      {
        id: "visa-tarif",
        moment: "avant",
        title: "Prévoir le coût du visa",
        detail:
          "Pour un séjour de 90 jours ou moins : 80 € de plus de 12 ans, 40 € de 6 à 12 ans, gratuit avant 6 ans. Au-delà de 90 jours : 100 €. S'y ajoutent 30 € de frais de dossier. Vérifiez le tarif sur le site de votre consulat au moment de la demande.",
        sources: ["amb-visa"],
      },
    );
    list.push(
      stay === "family"
        ? {
            id: "hebergement",
            moment: "avant",
            title: "Demander à la famille un certificat d'hébergement",
            detail:
              "Pour une visite familiale, le dossier de visa comprend un certificat d'hébergement de moins de 3 mois, légalisé par la mairie de la personne qui vous reçoit, avec une copie de sa pièce d'identité. Comptez le temps de l'envoi depuis l'Algérie.",
            sources: ["justice-algerie"],
          }
        : {
            id: "hebergement",
            moment: "avant",
            title: "Joindre la réservation d'hôtel au visa",
            detail:
              "À l'hôtel, la réservation remplace le certificat d'hébergement dans le dossier de visa.",
            sources: ["justice-algerie"],
          },
    );
  } else {
    list.push(
      {
        id: "passeport-dz",
        moment: "avant",
        title: "Vérifier son passeport algérien",
        detail:
          nationality === "binational"
            ? "En Algérie, un binational est traité comme un Algérien : il entre avec ses papiers algériens. Si vous n'avez qu'un passeport étranger, demandez au consulat ce qui s'applique à votre cas avant d'acheter le billet."
            : "Passeport valable pour toute la durée du séjour, et même quelques jours au-delà de la date de retour prévue.",
        sources:
          nationality === "binational" ? ["be-pratique", "justice-algerie"] : ["be-pratique"],
      },
      {
        id: "renouvellement",
        moment: "avant",
        title: "Renouveler à temps passeport ou carte d'identité",
        detail:
          "Les passeports et les cartes d'identité biométriques se demandent au consulat sur rendez-vous, et le passeport est fabriqué en Algérie. Aucun délai n'est publié : prenez rendez-vous dès que vos dates sont fixées, puis vérifiez sur le site du consulat que le document est prêt avant d'aller le retirer. La carte d'identité biométrique peut aussi se demander en ligne.",
        sources: ["cons-montpellier-passeport", "dz-cnibe"],
      },
      {
        id: "immatriculation",
        moment: "avant",
        title: "Avoir sa carte consulaire à jour",
        detail:
          "La carte d'immatriculation consulaire est gratuite et valable 5 ans. Le consulat la demande pour la plupart des démarches.",
        sources: ["cons-montpellier-immat"],
      },
    );
  }

  if (minors) {
    if (algerian) {
      if (children === "withoutFather" || children === "alone")
        list.push({
          id: "autorisation-paternelle",
          moment: "avant",
          title: "Autorisation paternelle de sortie pour les enfants",
          detail:
            "Un mineur algérien (la majorité est à 19 ans) qui voyage sans son père doit présenter une autorisation paternelle de sortie du territoire. En Europe, le consulat la délivre en présence du père ; elle est valable 3 mois. Une loi en dispense les enfants qui vivent à l'étranger avec un passeport étranger, mais la police aux frontières la demande souvent : mieux vaut l'avoir.",
          sources: ["be-pratique", "cons-montpellier-autorisation", "justice-algerie"],
        });
      if (nationality === "binational")
        list.push({
          id: "passeports-enfants",
          moment: "avant",
          title: "Les deux passeports pour un enfant binational",
          detail:
            "Un enfant franco-algérien voyage avec ses passeports français et algérien valides. S'il ne voyage pas en même temps que le parent inscrit sur son passeport algérien, donnez-lui son propre passeport étranger.",
          sources: ["justice-algerie", "be-pratique"],
        });
    } else {
      list.push({
        id: "visa-enfants",
        moment: "avant",
        title: "Un visa pour chaque enfant",
        detail:
          "Chaque mineur a besoin de son visa et d'un passeport valable 6 mois. Un parent ou le tuteur l'accompagne au rendez-vous. Le consulat demande le livret de famille ou sa copie conforme ; en cas de divorce, emportez aussi le jugement qui fixe la garde.",
        sources: ["justice-algerie"],
      });
    }
    list.push({
      id: "livret",
      moment: "frontiere",
      title: "Emporter le livret de famille",
      detail:
        "En France, à la sortie, il ne peut pas vous être exigé, même si l'enfant ne porte pas votre nom. Gardez-le quand même avec vous : il sert au consulat d'Algérie et pour prouver le lien de parenté.",
      sources: ["sp-mineur", "justice-algerie"],
    });
    if (children === "withoutFather" || children === "alone")
      list.push({
        id: "ast",
        moment: "frontiere",
        title: "Autorisation de sortie du territoire (AST) côté France",
        detail:
          "Un mineur qui quitte la France sans l'un de ses parents présente l'AST signée par un parent, avec la copie de la pièce d'identité de ce parent. Le formulaire se remplit soi-même, sans démarche en mairie.",
        sources: ["sp-mineur"],
      });
    if (children === "alone" && !algerian)
      list.push({
        id: "lettre-parents",
        moment: "frontiere",
        title: "Lettre d'autorisation des parents",
        detail:
          "Un mineur seul ou avec un adulte qui n'est pas son parent présente aussi, à l'arrivée en Algérie, une lettre d'autorisation des parents dont les signatures sont légalisées.",
        sources: ["justice-algerie"],
      });
  }

  list.push(
    {
      id: "devises",
      moment: "frontiere",
      title: "Déclarer ses devises à partir de 1 000 €",
      detail:
        "À l'entrée comme à la sortie, les billets et moyens de paiement en devises sont à déclarer à la douane à partir de l'équivalent de 1 000 €. Seuls les résidents peuvent emporter ou rapporter des dinars, dans la limite de 10 000 DA.",
      sources: ["fd-entree"],
    },
    {
      id: "papiers-sur-soi",
      moment: "surPlace",
      title: "Garder ses papiers d'identité sur soi",
      detail: "La loi algérienne s'applique aux étrangers comme aux Algériens, et il faut avoir ses papiers d'identité sur soi.",
      sources: ["be-legislation"],
    },
  );

  if (nationality === "foreign")
    list.push({
      id: "bureau-etrangers",
      moment: "surPlace",
      title: "Se signaler à la wilaya : à faire confirmer",
      detail:
        "La fiche officielle française indique que les étrangers doivent se signaler au bureau des étrangers de la wilaya de leur lieu de résidence. Elle ne dit pas si cela vaut pour un court séjour chez des proches. Posez la question au consulat en déposant le visa, et notez la réponse.",
      sources: ["fd-entree"],
      toConfirm: true,
    });

  if (stay === "hotel")
    list.push({
      id: "hotel",
      moment: "surPlace",
      title: married ? "Emporter un extrait d'acte de mariage" : "Hôtel : chambres séparées possibles",
      detail: married
        ? "Certains hôtels n'acceptent un couple dans la même chambre que s'il est marié : les autorités belges conseillent aux couples mariés d'avoir un extrait d'acte de mariage."
        : "Certains hôtels demandent à un couple non marié de prendre deux chambres. Renseignez-vous auprès de l'hôtel avant de réserver.",
      sources: ["be-legislation"],
    });
  else if (married)
    list.push({
      id: "mariage",
      moment: "surPlace",
      title: "Un extrait d'acte de mariage dans le dossier",
      detail:
        "Si vous passez une nuit à l'hôtel sur la route, certains établissements le demandent à un couple pour une chambre commune.",
      sources: ["be-legislation"],
    });

  list.push(
    nationality === "binational"
      ? {
          id: "retour-france",
          moment: "retour",
          title: "Une pièce d'identité française pour rentrer",
          detail:
            "Même entré en Algérie avec votre passeport algérien, vous devez présenter une pièce d'identité française en cours de validité pour rentrer en France.",
          sources: ["justice-algerie"],
        }
      : {
          id: "retour-titre",
          moment: "retour",
          title: "Le titre qui vous permet de rentrer",
          detail:
            nationality === "algerian"
              ? "Vérifiez la validité de votre titre de séjour européen jusqu'à la date du retour, et emportez-le avec votre passeport."
              : "Passeport valable au-delà de la date de retour prévue, et même quelques jours de plus.",
          sources: ["be-pratique"],
          toConfirm: nationality === "algerian",
        },
  );

  if (nationality !== "algerian")
    list.push({
      id: "ariane",
      moment: "avant",
      title: "S'inscrire sur Fil d'Ariane (Français)",
      detail:
        "Facultatif : le ministère des Affaires étrangères vous envoie ses alertes pendant le séjour.",
      sources: ["fd-entree"],
    });

  return list;
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
    ou: "Consulat d'Algérie de votre lieu de résidence, sur rendez-vous",
    delai: "1 à 14 jours après le dépôt",
    conseil: "Déposez la demande plusieurs semaines avant le départ, avant de payer un billet non remboursable.",
    sources: ["amb-visa", "be-pratique"],
  },
  {
    demarche: "Certificat d'hébergement",
    ou: "Mairie de la personne qui vous reçoit en Algérie",
    delai: "Non publié",
    conseil: "Il doit avoir moins de 3 mois au dépôt du visa : demandez-le environ un mois avant le rendez-vous.",
    sources: ["justice-algerie"],
  },
  {
    demarche: "Passeport biométrique algérien",
    ou: "Consulat, sur rendez-vous ; fabriqué en Algérie",
    delai: "Non publié",
    conseil: "Prenez rendez-vous dès que vos dates sont fixées. Vérifiez sur le site du consulat qu'il est prêt avant d'aller le chercher.",
    sources: ["cons-montpellier-passeport"],
  },
  {
    demarche: "Carte d'identité biométrique algérienne",
    ou: "Consulat sur rendez-vous, ou demande en ligne",
    delai: "Non publié",
    conseil: "Même conseil que pour le passeport.",
    sources: ["cons-montpellier-passeport", "dz-cnibe"],
  },
  {
    demarche: "Autorisation paternelle de sortie (mineur algérien)",
    ou: "Consulat, en présence du père",
    delai: "Non publié · valable 3 mois",
    conseil: "Faites-la dans les 3 mois qui précèdent le retour, pour qu'elle soit encore valable à la sortie d'Algérie.",
    sources: ["cons-montpellier-autorisation"],
  },
  {
    demarche: "Autorisation de sortie du territoire (AST, France)",
    ou: "Formulaire à remplir soi-même",
    delai: "Immédiat",
    conseil: "Imprimez-la avant de partir, avec la copie de la pièce d'identité du parent qui signe.",
    sources: ["sp-mineur"],
  },
];

/** Les 18 postes consulaires d'Algérie en France et les départements qu'ils couvrent. */
export interface Consulat {
  id: string;
  name: string;
  address: string;
  phone: string;
  site: string;
  departments: string[];
}

export const consulats: Consulat[] = [
  { id: "paris", name: "Consulat général d'Algérie à Paris", address: "1 passage du Trône, 75011 Paris", phone: "01 53 72 07 00", site: "https://consulat-paris-algerie.fr/", departments: ["75", "18", "36", "37", "41", "45", "971", "972", "973", "974", "975", "976", "977", "978", "986", "987", "988"] },
  { id: "bobigny", name: "Consulat d'Algérie à Bobigny", address: "17 rue Hector-Berlioz, 93000 Bobigny", phone: "01 41 50 58 58", site: "https://consulat-bobigny-algerie.fr/", departments: ["93"] },
  { id: "creteil", name: "Consulat d'Algérie à Créteil", address: "9 rue Olof-Palme, parc de la Brèche, 94000 Créteil", phone: "01 46 80 78 00", site: "https://consulat-creteil-algerie.fr/", departments: ["58", "77", "89", "91", "94"] },
  { id: "pontoise", name: "Consulat d'Algérie à Pontoise", address: "25 quai Eugène-Turpin, 95300 Pontoise", phone: "01 30 73 27 75", site: "https://consulat-pontoise-algerie.fr/", departments: ["14", "27", "50", "60", "61", "76", "95"] },
  { id: "nanterre", name: "Consulat d'Algérie à Nanterre", address: "63 avenue Georges-Clemenceau, 92000 Nanterre", phone: "01 47 25 12 71", site: "https://consulat-nanterre-algerie.fr/", departments: ["92", "28", "78"] },
  { id: "marseille", name: "Consulat général d'Algérie à Marseille", address: "363 rue Paradis, 13008 Marseille", phone: "04 91 13 99 50", site: "https://www.consulat-marseille-algerie.fr/", departments: ["13", "84"] },
  { id: "lyon", name: "Consulat général d'Algérie à Lyon", address: "126 rue Vauban, 69006 Lyon", phone: "04 72 83 85 50", site: "https://consulat-lyon-algerie.fr/", departments: ["01", "07", "26", "69", "71"] },
  { id: "strasbourg", name: "Consulat général d'Algérie à Strasbourg", address: "37 allée de la Robertsau, 67000 Strasbourg", phone: "03 88 30 17 51", site: "https://consulat-strasbourg-algerie.fr/", departments: ["67", "68", "88"] },
  { id: "lille", name: "Consulat général d'Algérie à Lille", address: "120 rue Solférino, 59800 Lille", phone: "03 28 38 01 40", site: "https://consulat-lille-algerie.fr/", departments: ["02", "59", "62", "80"] },
  { id: "saint-etienne", name: "Consulat d'Algérie à Saint-Étienne", address: "6 rue Richard, 42100 Saint-Étienne", phone: "04 77 80 67 83", site: "https://consulat-saint-etienne-algerie.fr/", departments: ["03", "15", "42", "43", "63"] },
  { id: "nice", name: "Consulat d'Algérie à Nice", address: "20 bis avenue Mont-Rabeau, 06200 Nice", phone: "04 93 97 71 00", site: "https://consulat-nice-algerie.fr/", departments: ["04", "06", "2A", "2B", "83"] },
  { id: "besancon", name: "Consulat d'Algérie à Besançon", address: "1 rue de l'Industrie, 25000 Besançon", phone: "03 81 80 31 79", site: "https://consulat-besancon-algerie.fr/", departments: ["21", "25", "39", "70", "90"] },
  { id: "grenoble", name: "Consulat d'Algérie à Grenoble", address: "7 quai Stéphane-Jay, 38000 Grenoble", phone: "04 76 54 30 18", site: "https://consulat-grenoble-algerie.fr/", departments: ["05", "38", "73", "74"] },
  { id: "metz", name: "Consulat d'Algérie à Metz", address: "1 bis avenue Leclerc-de-Hauteclocque, 57000 Metz", phone: "03 87 66 41 61", site: "https://consulat-metz-algerie.fr/", departments: ["08", "10", "51", "52", "54", "55", "57"] },
  { id: "bordeaux", name: "Consulat d'Algérie à Bordeaux", address: "41 rue Frantz-Despagnet, 33000 Bordeaux", phone: "05 56 99 03 36", site: "https://consulat-bordeaux-algerie.fr/", departments: ["16", "17", "19", "23", "24", "33", "40", "47", "64", "87"] },
  { id: "nantes", name: "Consulat d'Algérie à Nantes", address: "57 rue Général-Buat, 44000 Nantes", phone: "02 40 74 38 19", site: "https://consulat-nantes-algerie.fr/", departments: ["22", "29", "35", "44", "49", "53", "56", "72", "79", "85", "86"] },
  { id: "toulouse", name: "Consulat d'Algérie à Toulouse", address: "67 boulevard de Strasbourg, 31000 Toulouse", phone: "05 61 62 97 07", site: "https://consulat-toulouse-algerie.fr/", departments: ["09", "31", "32", "46", "65", "81", "82"] },
  { id: "montpellier", name: "Consulat d'Algérie à Montpellier", address: "198 rue Yves-Montand, parc 2000, 34080 Montpellier", phone: "04 67 54 54 15", site: "https://consulat-montpellier-algerie.fr/", departments: ["11", "12", "30", "34", "48", "66"] },
];

/** Département d'un code postal français (Corse et outre-mer compris). */
export function departmentFromPostcode(raw: string): string | null {
  const code = raw.replace(/\s/g, "");
  if (!/^\d{5}$/.test(code)) return null;
  if (code.startsWith("97") || code.startsWith("98")) return code.slice(0, 3);
  if (code.startsWith("20")) return Number(code) < 20200 ? "2A" : "2B";
  return code.slice(0, 2);
}

export function consulatForDepartment(department: string): Consulat | null {
  const dep = department.toUpperCase() === "20" ? "2A" : department.toUpperCase();
  return consulats.find((c) => c.departments.includes(dep)) ?? null;
}
