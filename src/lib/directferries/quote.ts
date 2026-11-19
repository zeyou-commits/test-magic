// Direct Ferries Connect : la partie « calcul » (sans réseau), partagée par le serveur et les tests.
// Le client ne voit jamais les clés : il reçoit seulement un LiveFare déjà résumé.

/** Véhicule tel que le catalogue Direct Ferries le décrit (dimensions en centimètres). */
export interface CarModel {
  typeId: number | null;
  makeModelId: number | null;
  make: string;
  model: string;
  height: number | null;
  length: number | null;
}

/** Ce que le voyageur charge en plus : hauteur et longueur ajoutées, en centimètres. */
export interface CarLoad {
  extraHeight: number;
  extraLength: number;
}

export interface PassengerCounts {
  adults: number;
  seniors: number;
  children: number;
  babies: number;
}

/** Tranche d'âge d'une compagnie sur une ligne (route passengerinfo). */
export interface AgeBand {
  label: string;
  from: number;
  to: number;
}

export interface DfPort {
  code: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

export interface DfRoute {
  routeId: number;
  name: string;
  isVehicle: boolean;
  isFootPassenger: boolean;
  portTo: { code: string; name: string };
  operator: { id: number; name: string };
}

/** Prix réel résumé pour l'écran. Les montants sont dans la devise demandée. */
export type LiveFare =
  | { status: "off" }
  | { status: "unavailable"; reason: string }
  | {
      status: "ok";
      /** Prix à payer : couchage obligatoire compris quand la compagnie en impose un. */
      total: number;
      /** Prix du devis, sans couchage. */
      baseTotal: number;
      currency: string;
      /** Le devis porte bien sur l'heure de départ affichée (à 90 minutes près). */
      sameSailing: boolean;
      departureLocal: string;
      operator: string;
      tariff: string | null;
      amendable: boolean | null;
      amendmentFee: boolean | null;
      cancellable: boolean | null;
      refundFee: boolean | null;
      cabinCompulsory: boolean;
      checkInMinutes: number | null;
      vehicle: string | null;
      quotedAt: string;
      /** Couchage obligatoire déjà inclus dans `total` (null si aucun, ou s'il est inconnu). */
      included: SleepOption | null;
      /** Couchages en option, supplément compté par rapport à `total`, du moins cher au plus cher. */
      options: SleepOption[];
    };

/** Un couchage proposé en plus du prix de base, déjà calculé pour tout le groupe. */
export interface SleepOption {
  id: number | null;
  kind: "seat" | "berth" | "cabin";
  label: string;
  /** Supplément total pour le groupe, dans la devise du devis. */
  extra: number;
  /** Nombre de cabines (ou de places) nécessaires pour le groupe. */
  units: number;
}

export type RawAccommodation = {
  accommodationId?: number | null;
  capacity?: number | null;
  description?: string | null;
  isCabin?: boolean | null;
  isDeckSpace?: boolean | null;
  isSeat?: boolean | null;
  isShared?: boolean | null;
  price?: number | null;
  availability?: number | null;
};

/**
 * Les couchages utiles à montrer : le fauteuil le moins cher, la couchette partagée la moins chère
 * et la cabine privée la moins chère pour loger tout le groupe. Le prix API est compté par unité
 * (place ou cabine) : à confirmer avec les vraies réponses de la sandbox.
 */
export function summarizeAccommodations(list: RawAccommodation[], travellers: number): SleepOption[] {
  const usable = list.filter(
    (item) =>
      typeof item.price === "number" &&
      item.price >= 0 &&
      !item.isDeckSpace &&
      (item.availability == null || item.availability > 0),
  );
  const seat = usable
    .filter((item) => item.isSeat)
    .map((item) => ({ item, units: travellers, extra: item.price! * travellers }));
  const berth = usable
    .filter((item) => item.isCabin && item.isShared)
    .map((item) => ({ item, units: travellers, extra: item.price! * travellers }));
  const cabin = usable
    .filter((item) => item.isCabin && !item.isShared && (item.capacity ?? 0) > 0)
    .map((item) => {
      const units = Math.ceil(travellers / item.capacity!);
      return { item, units, extra: item.price! * units };
    })
    .filter((entry) => entry.item.availability == null || entry.item.availability >= entry.units);
  const cheapest = <T extends { extra: number }>(rows: T[]) => [...rows].sort((a, b) => a.extra - b.extra)[0];
  const options: SleepOption[] = [];
  const s = cheapest(seat);
  if (s) options.push({ id: s.item.accommodationId ?? null, kind: "seat", label: travellers > 1 ? `${travellers} fauteuils` : "Fauteuil", extra: s.extra, units: s.units });
  const b = cheapest(berth);
  if (b) options.push({ id: b.item.accommodationId ?? null, kind: "berth", label: travellers > 1 ? `${travellers} couchettes` : "Couchette", extra: b.extra, units: b.units });
  const c = cheapest(cabin);
  if (c)
    options.push({
      id: c.item.accommodationId ?? null,
      kind: "cabin",
      label: c.units > 1 ? `${c.units} cabines ${c.item.capacity} pers.` : `Cabine ${c.item.capacity} pers.`,
      extra: c.extra,
      units: c.units,
    });
  return options
    .map((option) => ({ ...option, extra: Math.ceil(option.extra) }))
    .sort((x, y) => x.extra - y.extra);
}

// Tranches utilisées quand la compagnie n'en publie pas (même découpage que le profil BledWay).
export const DEFAULT_AGE_BANDS: AgeBand[] = [
  { label: "Infant", from: 0, to: 3 },
  { label: "Child", from: 4, to: 11 },
  { label: "Adult", from: 12, to: 59 },
  { label: "Senior", from: 60, to: 120 },
];

// Âge représentatif de chaque compteur du profil, pour trouver la tranche de la compagnie.
const REPRESENTATIVE_AGE = { adults: 35, seniors: 65, children: 8, babies: 1 } as const;
const FALLBACK_LABEL = { adults: "Adult", seniors: "Senior", children: "Child", babies: "Infant" } as const;

function bandFor(age: number, bands: AgeBand[]): AgeBand | null {
  return bands.find((band) => age >= band.from && age <= band.to) ?? null;
}

/** Les passagers au format Direct Ferries, avec les tranches d'âge de la ligne quand on les a. */
export function buildPassengers(counts: PassengerCounts, bands: AgeBand[] | null) {
  const usable = bands?.length ? bands : DEFAULT_AGE_BANDS;
  const list: {
    type: string;
    ageRange: { from: number; to: number };
    isWheelchairUser: boolean;
    isLeadPassenger: boolean;
  }[] = [];
  for (const key of ["adults", "seniors", "children", "babies"] as const) {
    const band =
      bandFor(REPRESENTATIVE_AGE[key], usable) ??
      bandFor(REPRESENTATIVE_AGE[key], DEFAULT_AGE_BANDS)!;
    for (let i = 0; i < Math.max(0, counts[key]); i += 1) {
      list.push({
        type: band.label || FALLBACK_LABEL[key],
        ageRange: { from: band.from, to: band.to },
        isWheelchairUser: false,
        isLeadPassenger: false,
      });
    }
  }
  // Un devis demande au moins un adulte responsable : le premier passager majeur le devient.
  const lead = list.find((p) => p.ageRange.to >= 18) ?? list[0];
  if (lead) lead.isLeadPassenger = true;
  return list;
}

/** Le véhicule au format Direct Ferries, chargement compris (galerie, coffre, remorque…). */
export function buildVehicle(car: CarModel, load: CarLoad) {
  return {
    typeId: car.typeId,
    makeModelId: car.makeModelId,
    make: car.make,
    model: car.model,
    height: car.height,
    length: car.length,
    additionalHeight: Math.max(0, Math.round(load.extraHeight)) || null,
    additionalLength: Math.max(0, Math.round(load.extraLength)) || null,
  };
}

const RAD = Math.PI / 180;
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

// Noms français de BledWay → noms anglais probables chez Direct Ferries (repli si pas de coordonnées).
const NAME_ALIASES: Record<string, string[]> = {
  alger: ["algiers", "alger"],
  barcelone: ["barcelona"],
  valence: ["valencia"],
  genes: ["genoa", "genova"],
  sete: ["sete"],
  bejaia: ["bejaia", "bejaja"],
  almeria: ["almeria"],
  marseille: ["marseille", "marseilles"],
};

/**
 * Le port Direct Ferries qui correspond à un port BledWay : le plus proche à moins de 15 km,
 * sinon le même nom. Jamais un port lointain : mieux vaut pas de prix qu'un prix faux.
 */
export function matchPort(
  port: { name: string; latitude: number; longitude: number },
  candidates: DfPort[],
): DfPort | null {
  let best: { port: DfPort; km: number } | null = null;
  for (const candidate of candidates) {
    if (candidate.latitude == null || candidate.longitude == null) continue;
    const km = distanceKm(
      { lat: port.latitude, lon: port.longitude },
      { lat: candidate.latitude, lon: candidate.longitude },
    );
    if (km <= 15 && (!best || km < best.km)) best = { port: candidate, km };
  }
  if (best) return best.port;
  const own = normalizeName(port.name);
  const names = new Set([own, ...(NAME_ALIASES[own] ?? [])]);
  return candidates.find((candidate) => names.has(normalizeName(candidate.name))) ?? null;
}

/** La ligne Direct Ferries vers le port d'arrivée, de préférence chez la même compagnie. */
export function pickRoute(
  routes: DfRoute[],
  arrivalCode: string,
  companyName: string | null | undefined,
  withVehicle: boolean,
): DfRoute | null {
  const usable = routes.filter(
    (route) =>
      route.portTo.code === arrivalCode && (withVehicle ? route.isVehicle : route.isFootPassenger),
  );
  if (!usable.length) return null;
  const company = companyName ? normalizeName(companyName) : "";
  if (company) {
    const same = usable.find((route) => {
      const operator = normalizeName(route.operator.name);
      return operator.includes(company) || company.includes(operator);
    });
    if (same) return same;
    // Une autre compagnie sur la même ligne ne donnerait pas le prix de CE départ.
    return null;
  }
  return usable[0]!;
}

type QuoteLeg = {
  departureDateTime?: string | null;
  isAccommodationCompulsory?: boolean | null;
  latestCheckInMinutes?: number | null;
  operator?: { name?: string | null } | null;
  ticketTariff?: {
    title?: string | null;
    isAmendable?: boolean | null;
    isAmendmentFeeCharged?: boolean | null;
    isCancellable?: boolean | null;
    isRefundFeeCharged?: boolean | null;
    compulsoryAccommodationId?: number | null;
  } | null;
};
export type RawQuote = {
  quoteToken?: string | null;
  hasAccommodations?: boolean | null;
  isSuccess?: boolean | null;
  selectedCurrency?: string | null;
  price?: { totalInSelectedCurrency?: number | null } | null;
  legs?: QuoteLeg[] | null;
};

/** Minutes écoulées depuis minuit pour « AAAA-MM-JJTHH:MM… » (heure locale du port). */
function minutesOf(localDateTime: string): number | null {
  const match = localDateTime.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const day = Date.UTC(
    Number(match[1]!.slice(0, 4)),
    Number(match[1]!.slice(5, 7)) - 1,
    Number(match[1]!.slice(8, 10)),
  );
  return day / 60000 + Number(match[2]) * 60 + Number(match[3]);
}

/**
 * Le devis à montrer : celui du départ affiché (à 90 min près), sinon le moins cher du jour,
 * signalé comme « autre horaire ». Aucun devis valable → null.
 */
export function pickQuote(
  quotes: RawQuote[],
  wantedLocal: string,
): { quote: RawQuote; sameSailing: boolean } | null {
  const valid = quotes.filter(
    (quote) =>
      quote.isSuccess !== false &&
      typeof quote.price?.totalInSelectedCurrency === "number" &&
      quote.price.totalInSelectedCurrency > 0,
  );
  if (!valid.length) return null;
  const wanted = minutesOf(wantedLocal);
  const gap = (quote: RawQuote) => {
    const time = minutesOf(quote.legs?.[0]?.departureDateTime ?? "");
    return wanted == null || time == null ? Infinity : Math.abs(time - wanted);
  };
  const near = valid
    .filter((quote) => gap(quote) <= 90)
    .sort((a, b) => gap(a) - gap(b))[0];
  if (near) return { quote: near, sameSailing: true };
  const cheapest = [...valid].sort(
    (a, b) => a.price!.totalInSelectedCurrency! - b.price!.totalInSelectedCurrency!,
  )[0]!;
  return { quote: cheapest, sameSailing: false };
}

/** Résumé écran d'un devis brut. */
export function summarizeQuote(
  picked: { quote: RawQuote; sameSailing: boolean },
  fallbackCurrency: string,
  vehicle: string | null,
  now: Date = new Date(),
  options: SleepOption[] = [],
): LiveFare {
  const leg = picked.quote.legs?.[0] ?? {};
  const tariff = leg.ticketTariff ?? null;
  const baseTotal = Math.round(picked.quote.price!.totalInSelectedCurrency! * 100) / 100;
  const compulsory = Boolean(leg.isAccommodationCompulsory);
  // Couchage imposé : celui que la compagnie désigne, sinon le moins cher qui loge tout le groupe.
  const included = compulsory
    ? (options.find((option) => option.id != null && option.id === tariff?.compulsoryAccommodationId) ??
      options[0] ??
      null)
    : null;
  const upgrades = included
    ? options
        .filter((option) => option !== included && option.extra > included.extra)
        .map((option) => ({ ...option, extra: option.extra - included.extra }))
    : options;
  return {
    status: "ok",
    total: baseTotal + (included?.extra ?? 0),
    baseTotal,
    currency: picked.quote.selectedCurrency || fallbackCurrency,
    sameSailing: picked.sameSailing,
    departureLocal: leg.departureDateTime ?? "",
    operator: leg.operator?.name ?? "",
    tariff: tariff?.title ?? null,
    amendable: tariff?.isAmendable ?? null,
    amendmentFee: tariff?.isAmendmentFeeCharged ?? null,
    cancellable: tariff?.isCancellable ?? null,
    refundFee: tariff?.isRefundFeeCharged ?? null,
    cabinCompulsory: compulsory,
    checkInMinutes: leg.latestCheckInMinutes ?? null,
    vehicle,
    quotedAt: now.toISOString(),
    included,
    options: upgrades,
  };
}

/** Modèle « type » par gabarit, quand le voyageur n'a pas choisi sa voiture exacte. */
export const REPRESENTATIVE_MODELS: Record<string, { make: string; model: string }> = {
  city: { make: "Renault", model: "Clio" },
  sedan: { make: "Peugeot", model: "308" },
  suv: { make: "Dacia", model: "Duster" },
  van: { make: "Renault", model: "Kangoo" },
  utility: { make: "Renault", model: "Trafic" },
};

/**
 * Hauteur et longueur ajoutées par les options du profil. Ordres de grandeur prudents :
 * le voyageur peut les corriger, et la compagnie mesure au port.
 */
export function loadFromAccessories(
  accessories: readonly string[],
  override?: Partial<CarLoad> | null,
): CarLoad {
  const roof = accessories.includes("roofbox") ? 50 : 0;
  const bikes = accessories.includes("bikes") ? 60 : 0;
  return {
    extraHeight: override?.extraHeight ?? roof,
    extraLength: override?.extraLength ?? bikes,
  };
}
