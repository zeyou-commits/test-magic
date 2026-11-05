/**
 * Lecture des informations d'un billet de ferry, à partir du texte (PDF ou OCR) et des codes lus.
 * Règle d'or : un champ n'est rempli que s'il a été trouvé sur le billet. Rien n'est deviné ;
 * ce qui manque reste vide, et le voyageur complète ou corrige avant d'enregistrer.
 */

export type CatalogItem = { id: string; name: string };
export type Catalog = {
  companies: CatalogItem[];
  vessels: (CatalogItem & { company_id?: string | null })[];
  ports: CatalogItem[];
};

export type TicketLeg = {
  fromPortId: string | null;
  toPortId: string | null;
  /** AAAA-MM-JJ */
  date: string | null;
  /** HH:MM, heure locale du port de départ telle qu'imprimée */
  time: string | null;
};

export type TicketDraft = {
  companyId: string | null;
  vesselId: string | null;
  legs: TicketLeg[];
  passengers: string[];
  adults: number | null;
  children: number | null;
  reference: string | null;
  vehicleKind: string | null;
  vehiclePlate: string | null;
  agency: string | null;
  /** Contenu des QR codes et codes-barres, gardé tel quel. */
  codes: string[];
  /** Compagnie absente du texte (logo), retrouvée grâce au navire. */
  companyFromVessel?: boolean;
};

export const emptyLeg = (): TicketLeg => ({
  fromPortId: null,
  toPortId: null,
  date: null,
  time: null,
});

/** Minuscules, sans accents, espaces simples : pour comparer sans se tromper. */
export const plain = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Noms de ports tels qu'ils apparaissent sur les billets (français, espagnol, italien, anglais, arabe translittéré). */
const PORT_ALIASES: Record<string, string[]> = {
  alger: ["alger", "algiers", "argel", "algeri", "el djazair", "al djazair"],
  marseille: ["marseille", "marsella", "marsiglia", "marseilles"],
  oran: ["oran", "wahran"],
  bejaia: ["bejaia", "bougie", "bgayet"],
  annaba: ["annaba"],
  skikda: ["skikda"],
  mostaganem: ["mostaganem"],
  ghazaouet: ["ghazaouet"],
  jijel: ["jijel", "djen djen"],
  sete: ["sete"],
  toulon: ["toulon", "tolone"],
  nice: ["nice", "nizza"],
  barcelone: ["barcelone", "barcelona"],
  valence: ["valence", "valencia"],
  alicante: ["alicante", "alacant"],
  almeria: ["almeria"],
  motril: ["motril"],
  genes: ["genes", "genova", "genoa"],
  civitavecchia: ["civitavecchia"],
  livourne: ["livourne", "livorno"],
  tunis: ["tunis", "la goulette"],
};

const COMPANY_ALIASES: Record<string, string[]> = {
  "algerie ferries": [
    "algerie ferries",
    "enmtv",
    "entreprise nationale de transport maritime de voyageurs",
  ],
  "corsica linea": ["corsica linea"],
  gnv: ["gnv", "grandi navi veloci"],
  balearia: ["balearia"],
  trasmediterranea: ["trasmediterranea", "naviera armas", "armas trasmediterranea"],
  "la meridionale": ["la meridionale", "meridionale"],
  "nouris elbahr": ["nouris elbahr", "nouris el bahr"],
};

/** Agences et revendeurs connus ; les autres sont repérés par « Agence », « émis par »… */
const KNOWN_AGENCIES = [
  "direct ferries",
  "directferries",
  "aferry",
  "ferryhopper",
  "ferryscanner",
  "okeferry",
  "traghettilines",
  "viamare",
  "go ferry",
  "ferriesonline",
];

const MONTHS: Record<string, number> = {
  janvier: 1,
  janv: 1,
  jan: 1,
  january: 1,
  enero: 1,
  gennaio: 1,
  fevrier: 2,
  fev: 2,
  feb: 2,
  february: 2,
  febrero: 2,
  febbraio: 2,
  mars: 3,
  mar: 3,
  march: 3,
  marzo: 3,
  avril: 4,
  avr: 4,
  apr: 4,
  april: 4,
  abril: 4,
  aprile: 4,
  mai: 5,
  may: 5,
  mayo: 5,
  maggio: 5,
  juin: 6,
  jun: 6,
  june: 6,
  junio: 6,
  giugno: 6,
  juillet: 7,
  juil: 7,
  jul: 7,
  july: 7,
  julio: 7,
  luglio: 7,
  aout: 8,
  aug: 8,
  august: 8,
  agosto: 8,
  septembre: 9,
  sept: 9,
  sep: 9,
  september: 9,
  septiembre: 9,
  settembre: 9,
  octobre: 10,
  oct: 10,
  october: 10,
  octubre: 10,
  ottobre: 10,
  novembre: 11,
  nov: 11,
  november: 11,
  noviembre: 11,
  decembre: 12,
  dec: 12,
  december: 12,
  diciembre: 12,
  dicembre: 12,
};

type Hit = { id: string; index: number; length: number };

function findAll(text: string, needle: string): number[] {
  const out: number[] = [];
  const re = new RegExp(
    `(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9])`,
    "g",
  );
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) out.push(match.index + match[1]!.length);
  return out;
}

/** Les ports du catalogue cités dans le texte, dans l'ordre où ils apparaissent. */
export function portHits(text: string, ports: CatalogItem[]): Hit[] {
  const hits: Hit[] = [];
  for (const port of ports) {
    const key = plain(port.name);
    const aliases = new Set([key, ...(PORT_ALIASES[key] ?? [])]);
    for (const alias of aliases)
      for (const index of findAll(text, alias))
        hits.push({ id: port.id, index, length: alias.length });
  }
  return hits.sort((a, b) => a.index - b.index);
}

function matchCatalog(text: string, items: CatalogItem[], aliases: Record<string, string[]> = {}) {
  let best: Hit | null = null;
  for (const item of items) {
    const key = plain(item.name);
    if (key.length < 3) continue;
    for (const alias of new Set([key, ...(aliases[key] ?? [])])) {
      const index = findAll(text, alias)[0];
      if (index !== undefined && (!best || index < best.index))
        best = { id: item.id, index, length: alias.length };
    }
  }
  return best;
}

type DateHit = { date: string; index: number; end: number };

const pad = (n: number) => String(n).padStart(2, "0");
const validDate = (y: number, m: number, d: number) => {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2020 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/** Toutes les dates du texte : 12/07/2026, 12.07.26, 2026-07-12, 12 juillet 2026, 12 jul 2026. */
export function dateHits(text: string): DateHit[] {
  const hits: DateHit[] = [];
  const push = (date: string | null, index: number, length: number) => {
    if (date) hits.push({ date, index, end: index + length });
  };
  for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g))
    push(validDate(+m[3]!, +m[2]!, +m[1]!), m.index!, m[0].length);
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g))
    push(validDate(+m[1]!, +m[2]!, +m[3]!), m.index!, m[0].length);
  for (const m of text.matchAll(/\b(\d{1,2})(?:er)?\s+([a-z]{3,10})\.?\s+(\d{2,4})\b/g)) {
    const month = MONTHS[m[2]!];
    if (month) push(validDate(+m[3]!, month, +m[1]!), m.index!, m[0].length);
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** Dates qui ne sont pas celles du voyage : achat, émission, naissance, validité de document. */
const NOT_TRAVEL =
  /(emis|emission|achat|achete|reserve le|reservation du|date de reservation|booking date|issued|fecha de emision|gestion|reserva|fecha de compra|impres|printed|stampa|nato|ne le|nee le|naissance|birth|nacimiento|expir|validite|valid until|imprime)/;

export function travelDates(text: string): DateHit[] {
  return dateHits(text).filter(
    (hit) => !NOT_TRAVEL.test(text.slice(Math.max(0, hit.index - 28), hit.index)),
  );
}

/** Première heure (08:30, 8h30, 08.30 h) dans la fenêtre donnée. */
export function timeAfter(text: string, from: number, window = 90): string | null {
  const slice = text.slice(from, from + window);
  const m = /\b([01]?\d|2[0-3])\s*[:h]\s*([0-5]\d)\b/.exec(slice);
  return m ? `${pad(+m[1]!)}:${m[2]}` : null;
}

const REFERENCE =
  /(reference|ref|reservation|booking|dossier|pnr|billet n|ticket n|localizador|codice prenotazione|prenotazione|n de reservation|numero de reservation)[^a-z0-9]{0,6}(?:n[o°]?\s*)?[:#]?\s*([a-z0-9][a-z0-9-]{4,15})/;

export function findReference(text: string, raw: string): string | null {
  const m = REFERENCE.exec(text);
  if (!m) return null;
  // La référence est relue dans le texte d'origine pour garder ses majuscules.
  const value = m[2]!;
  const original = new RegExp(value.replace(/[-]/g, "\\-"), "i").exec(raw);
  const result = (original?.[0] ?? value).toUpperCase();
  return /\d/.test(result) ? result : null;
}

const PLATES = [
  /\b([A-Z]{2}[- ]?\d{3}[- ]?[A-Z]{2})\b/, // France, Italie
  /\b(\d{5}[- ]\d{3}[- ]\d{2})\b/, // Algérie
  /\b(\d{4}[- ]?[BCDFGHJKLMNPRSTVWXYZ]{3})\b/, // Espagne
];

export function findVehicle(
  text: string,
  raw: string,
): { kind: string | null; plate: string | null } {
  const kinds: [RegExp, string][] = [
    [/camping[- ]?car|autocaravana|camper/, "Camping-car"],
    [/caravane|caravana|roulotte/, "Voiture avec caravane"],
    [/remorque|trailer|rimorchio/, "Voiture avec remorque"],
    [/fourgon|utilitaire|van\b|furgoneta|furgone/, "Fourgon"],
    [/moto\b|motorcycle|motocicleta/, "Moto"],
    // Pas « car » : en français, c'est aussi une conjonction.
    [/voiture|vehicule|vehicle|\bauto\b|coche|turismo|automobile/, "Voiture"],
  ];
  const kind = kinds.find(([re]) => re.test(text))?.[1] ?? null;
  let plate: string | null = null;
  for (const re of PLATES) {
    const m = re.exec(raw);
    if (m) {
      plate = m[1]!.toUpperCase();
      break;
    }
  }
  // Une plaque sans mention de véhicule reste douteuse (numéro de billet ?) : on ne la garde pas.
  return { kind, plate: kind ? plate : null };
}

const NAME_STOPWORDS = new Set([
  "passager",
  "passagers",
  "passenger",
  "passengers",
  "pasajero",
  "pasajeros",
  "passeggero",
  "nom",
  "name",
  "adulte",
  "adultes",
  "adult",
  "enfant",
  "enfants",
  "child",
  "bebe",
  "infant",
  "mr",
  "mme",
  "mrs",
  "ms",
  "m",
  "cabine",
  "cabin",
  "siege",
  "seat",
  "fauteuil",
  "pont",
  "deck",
  "billet",
  "ticket",
  "aller",
  "retour",
  "depart",
  "arrivee",
  "departure",
  "arrival",
  "date",
  "heure",
  "navire",
  "ship",
  "vessel",
]);

/**
 * Passagers : noms en MAJUSCULES qui suivent « Passager(s) », « Nom », « Passenger(s) »…
 * Un nom = 2 à 4 mots de lettres. Les mots du billet (ports, compagnie, rubriques) sont écartés.
 */
export function findPassengers(raw: string, excluded: string[]): string[] {
  const lines = raw.split(/\r?\n/);
  const names: string[] = [];
  let inBlock = 0;
  const skip = new Set(excluded.map(plain));
  for (const line of lines) {
    const key = plain(line);
    if (/(passager|passenger|pasajero|passeggero|voyageur|nom du|traveller|traveler)/.test(key))
      inBlock = 8;
    if (inBlock <= 0) continue;
    inBlock -= 1;
    for (const m of line.matchAll(
      /\b((?:M\.|MR|MME|MRS|MS)\s+)?([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'-]+){1,3})\b/g,
    )) {
      const words = m[2]!.split(/\s+/).filter((w) => !NAME_STOPWORDS.has(plain(w)));
      if (words.length < 2) continue;
      const name = words.join(" ");
      if (skip.has(plain(name)) || words.some((w) => skip.has(plain(w)))) continue;
      if (!names.includes(name)) names.push(name);
    }
  }
  return names.slice(0, 12);
}

function count(text: string, re: RegExp) {
  const m = re.exec(text);
  return m ? Math.min(20, Number(m[1])) : null;
}

export function findAgency(text: string, raw: string): string | null {
  const known = KNOWN_AGENCIES.find((agency) => findAll(text, agency).length);
  if (known) return known.replace(/\b\w/g, (c) => c.toUpperCase());
  // Lu dans le texte d'origine, accents compris : d'abord le nom après son étiquette
  // (« Nombre agencia : … », « Nom de l'agence : … »), sinon après « Agence », « émis par »…
  const m =
    /(?:nombre (?:de la )?agencia|nom de l.agence|agency name|nome (?:dell.)?agenzia)\s*:\s*([^\n]{3,60})/i.exec(
      raw,
    ) ??
    /(?:agence|agency|agencia|agenzia|[ée]mis par|issued by|vendu par|sold by|distribu[ée] par)\s*:\s*([^\n]{3,60})/i.exec(
      raw,
    ) ??
    /(?:agence|agency|agenzia|[ée]mis par|issued by|vendu par|sold by|distribu[ée] par)\s*-?\s*([^\n]{3,60})/i.exec(
      raw,
    );
  if (!m) return null;
  const value = m[1]!
    .split(
      /\s{2,}|\||;|,|\(|\bsello\b|\bcachet\b|\bstamp\b|\btel\b|\bt[ée]l[ée]phone|\bt[ée]l\b|www\./i,
    )[0]!
    .replace(/[\s\-–:.]+$/, "")
    .trim();
  // Bruit de l'OCR en fin de ligne (« Cl [=] » près d'un QR code) : retiré, avec la lettre isolée qui le précède.
  const words = value.split(/\s+/);
  let noisy = false;
  while (words.length > 1 && /[^\p{L}'’.-]/u.test(words[words.length - 1]!)) {
    words.pop();
    noisy = true;
  }
  if (noisy && words.length > 1 && words[words.length - 1]!.length <= 2) words.pop();
  return words.join(" ").length >= 3 ? words.join(" ").slice(0, 80) : null;
}

// --- Billets à étiquettes (Baleària, Algérie Ferries…) ---------------------------------------
// Aller et retour sont souvent imprimés en deux colonnes que l'OCR lit sur la même ligne :
// « Salida : VALENCIA 18:30   Salida : MOSTAGANEM 18:30 ». On lit donc les étiquettes dans
// l'ordre : la 1re « Salida » est l'aller, la 2e le retour ; idem pour l'arrivée et les dates.
const LABELS = {
  from: /(?:^|[^a-z])(?:salida|depart|departure|from|partenza|origen|origine|port de depart)\s*:\s*/g,
  to: /(?:^|[^a-z])(?:llegada|arrivee|arrival|to|arrivo|destino|destination|port d arrivee)\s*:\s*/g,
  outDate: /(?:^|[^a-z])(?:viaje de ida|aller|outbound|andata|ida|date aller)\s*:\s*/g,
  retDate: /(?:^|[^a-z])(?:viaje de vuelta|retour|return|ritorno|vuelta|date retour)\s*:\s*/g,
};
const labelEnds = (text: string, re: RegExp) =>
  [...text.matchAll(re)].map((m) => m.index! + m[0].length);

export function labelledLegs(text: string, ports: CatalogItem[]): TicketLeg[] {
  const hits = portHits(text, ports);
  const dates = dateHits(text);
  const portAt = (pos: number) => hits.find((h) => h.index >= pos && h.index <= pos + 3) ?? null;
  const legs: TicketLeg[] = [];
  const leg = (i: number) => (legs[i] ??= emptyLeg());
  labelEnds(text, LABELS.from)
    .slice(0, 2)
    .forEach((pos, i) => {
      const port = portAt(pos);
      if (!port) return;
      leg(i).fromPortId = port.id;
      // L'heure est juste après le port (« VALENCIA 18:30 »).
      leg(i).time = timeAfter(text, port.index + port.length, 12);
    });
  labelEnds(text, LABELS.to)
    .slice(0, 2)
    .forEach((pos, i) => {
      const port = portAt(pos);
      if (port) leg(i).toPortId = port.id;
    });
  const dateAt = (pos: number) =>
    dates.find((d) => d.index >= pos && d.index <= pos + 3)?.date ?? null;
  const out = labelEnds(text, LABELS.outDate)[0];
  const ret = labelEnds(text, LABELS.retDate)[0];
  if (out !== undefined && dateAt(out)) leg(0).date = dateAt(out);
  if (ret !== undefined && dateAt(ret)) leg(1).date = dateAt(ret);
  // Un trajet sans aucun port lu n'est pas un trajet.
  return legs.filter((l) => l && (l.fromPortId || l.toPortId));
}

/**
 * Passagers en tableau : une ligne par personne, qui commence par son type (« Adulto ZAHRA … »).
 * Le nom s'arrête au premier mot contenant un chiffre (numéro de document, jamais gardé).
 */
const ROW_TYPES: [RegExp, "adult" | "child"][] = [
  [/^(adulto|adulte|adult|adulti|adulta)$/, "adult"],
  [/^(nino|nina|enfant|child|bambino|bambina|bebe|infant|menor|jeune|joven)$/, "child"],
];
export function passengerRows(raw: string) {
  const names: string[] = [];
  let adults = 0;
  let children = 0;
  for (const line of raw.split(/\r?\n/)) {
    const words = line.trim().split(/\s+/);
    const type = ROW_TYPES.find(([re]) => re.test(plain(words[0] ?? "")))?.[1];
    if (!type) continue;
    const name: string[] = [];
    for (const word of words.slice(1)) {
      if (/\d/.test(word) || !/^[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'’-]*$/.test(word)) break;
      name.push(word);
    }
    if (name.length < 2) continue;
    names.push(name.join(" "));
    if (type === "adult") adults += 1;
    else children += 1;
  }
  return { names, adults, children };
}

/** Le billet lu : chaque information trouvée, rien d'inventé. */
export function parseTicket(raw: string, codes: string[], catalog: Catalog): TicketDraft {
  const text = plain(raw);
  const company = matchCatalog(text, catalog.companies, COMPANY_ALIASES);
  const vessel = matchCatalog(
    text,
    catalog.vessels.filter((v) => !company || !v.company_id || v.company_id === company.id),
  );
  // Nom de la compagnie illisible (logo) : le navire, connu de BledWay, la donne.
  const vesselCompany = vessel
    ? (catalog.vessels.find((v) => v.id === vessel.id)?.company_id ?? null)
    : null;

  // Trajets : les ports dans l'ordre du billet ; le retour est la paire inverse, plus loin.
  const hits = portHits(text, catalog.ports);
  const distinct: Hit[] = [];
  for (const hit of hits) if (distinct[distinct.length - 1]?.id !== hit.id) distinct.push(hit);
  const dates = travelDates(text);
  const legs: TicketLeg[] = [];
  let returnFrom = -1;
  if (distinct.length >= 2) {
    const [a, b] = [distinct[0]!, distinct[1]!];
    const outbound = { ...emptyLeg(), fromPortId: a.id, toPortId: b.id };
    // Retour : après l'aller, le port d'arrivée suivi du port de départ (B puis A).
    const back = distinct.findIndex(
      (hit, i) => i >= 2 && hit.id === a.id && distinct[i - 1]?.id === b.id,
    );
    legs.push(outbound);
    if (back > 0) {
      legs.push({ ...emptyLeg(), fromPortId: b.id, toPortId: a.id });
      returnFrom = distinct[back - 1]!.index;
    }
  } else if (dates.length) {
    legs.push(emptyLeg());
  }
  // Dates de départ seulement (pas « Arrivée le … ») : la 1re pour l'aller ; pour le retour,
  // la 1re date écrite après la mention du trajet retour.
  const departures = dates.filter(
    (d) =>
      !/(arrivee|arrival|llegada|arrivo)\D{0,12}$/.test(
        text.slice(Math.max(0, d.index - 20), d.index),
      ),
  );
  const travel = [...new Map(departures.map((d) => [d.date, d])).values()];
  if (legs[0] && travel[0]) {
    legs[0].date = travel[0].date;
    legs[0].time = timeAfter(text, travel[0].end);
  }
  if (legs[1]) {
    const later =
      travel.find((d) => d.index > returnFrom && legs[0]?.date && d.date > legs[0].date) ??
      travel.find((d) => legs[0]?.date && d.date > legs[0].date);
    if (later) {
      legs[1].date = later.date;
      legs[1].time = timeAfter(text, later.end);
    }
  }

  // Étiquettes « Salida / Llegada / Viaje de ida… » : plus sûres que l'ordre des ports.
  const labelled = labelledLegs(text, catalog.ports);
  const finalLegs = labelled.some((l) => l.fromPortId && l.toPortId)
    ? labelled.map((l, i) => ({
        ...l,
        // Date sans étiquette : celle trouvée par la lecture générale, si elle existe.
        date: l.date ?? legs[i]?.date ?? null,
      }))
    : legs;
  const rows = passengerRows(raw);

  const reference =
    findReference(text, raw) ??
    codes.map((c) => c.trim()).find((c) => /^[A-Z0-9]{5,12}$/.test(c) && /\d/.test(c)) ??
    null;
  const vehicle = findVehicle(text, raw);
  const excluded = [
    ...catalog.ports.map((p) => p.name),
    ...catalog.companies.map((c) => c.name),
    ...catalog.vessels.map((v) => v.name),
  ];
  const adults = count(text, /\b(\d{1,2})\s*(?:x\s*)?(?:adultes?|adults?|adultos?|adulti)\b/);
  const children = count(
    text,
    /\b(\d{1,2})\s*(?:x\s*)?(?:enfants?|children|child|ninos?|bambini|bebes?|infants?)\b/,
  );
  return {
    companyId: company?.id ?? vesselCompany,
    companyFromVessel: !company && Boolean(vesselCompany),
    vesselId: vessel?.id ?? null,
    legs: finalLegs.length ? finalLegs : [emptyLeg()],
    passengers: rows.names.length ? rows.names : findPassengers(raw, excluded),
    // Compté dans le tableau des passagers si le billet ne l'écrit pas en toutes lettres.
    adults: adults ?? (rows.names.length ? rows.adults : null),
    children: children ?? (rows.names.length ? rows.children : null),
    reference,
    vehicleKind: vehicle.kind,
    vehiclePlate: vehicle.plate,
    agency: findAgency(text, raw),
    codes,
  };
}
