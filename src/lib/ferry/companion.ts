import type { VehicleKind } from "@/components/panel/TripProfile";
import { estimateFerryFare, priceSeason, type FareEstimate, type PriceSeason } from "./pricing";
import type { Sailing } from "./trips";
import type { Port, RouteLine } from "./types";

/**
 * Le compagnon « Préparer mon voyage » : quatre réponses données une fois (domicile, voyageurs,
 * voiture, période), puis papiers, voiture, route, budget et réservation sur la même page.
 * Gardé sur cet appareil, repris à chaque visite. Le domicile et les voyageurs sont ceux de
 * « Mes papiers » (une seule saisie pour les deux).
 */

export type CompanionStep = "profile" | "papers" | "car" | "route" | "budget" | "book";

export type CompanionPlan = {
  /** L'accueil (ce que l'outil propose, la destination) a été passé. */
  started: boolean;
  /** Commune trouvée par le code postal : nom et centre [longitude, latitude]. */
  home: { postcode: string; name: string; point: [number, number] } | null;
  vehicle: VehicleKind;
  /** Mois de départ, AAAA-MM. */
  month: string;
  /** Jour précis, facultatif, AAAA-MM-JJ. */
  date: string;
  /** Où l'on va en Algérie (facultatif) : sert à l'itinéraire porte à porte. */
  destination: { label: string; point: [number, number] } | null;
  fromPortId: string | null;
  toPortId: string | null;
  /** Ports choisis à la main : on ne les remplace plus par les plus proches. */
  portsChosen: boolean;
  /** La voiture importée (moins de 3 ans) : autre démarche que l'admission temporaire. */
  importCar: boolean;
  carDone: string[];
  done: CompanionStep[];
};

export const COMPANION_KEY = "bledway:compagnon:v1";

export const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export function nextMonths(count = 12, from = new Date()) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(from.getFullYear(), from.getMonth() + index, 1);
    const key = monthKey(date);
    return {
      key,
      label: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(date).replace(".", ""),
      year: date.getFullYear(),
      season: priceSeason(`${key}-15`),
    };
  });
}

export const defaultPlan = (): CompanionPlan => ({
  started: false,
  home: null,
  vehicle: "sedan",
  // Par défaut, le prochain mois de juillet : le départ le plus courant, à changer d'un geste.
  month: (nextMonths(12).find((m) => m.key.endsWith("-07")) ?? nextMonths(1)[0]!).key,
  date: "",
  destination: null,
  fromPortId: null,
  toPortId: null,
  portsChosen: false,
  importCar: false,
  carDone: [],
  done: [],
});

export function loadPlan(): CompanionPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COMPANION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<CompanionPlan>;
    // Un plan d'avant l'accueil : déjà commencé s'il a des étapes faites.
    return { ...defaultPlan(), ...saved, started: saved.started ?? Boolean(saved.done?.length) };
  } catch {
    return null;
  }
}

export function savePlan(plan: CompanionPlan) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COMPANION_KEY, JSON.stringify(plan));
  } catch {
    /* sans stockage, le plan reste celui de l'écran */
  }
}

/** Les étapes du voyage : sans voiture, pas d'étape voiture. */
export function companionSteps(plan: Pick<CompanionPlan, "vehicle">): CompanionStep[] {
  const steps: CompanionStep[] = ["profile", "papers", "car", "route", "budget", "book"];
  return plan.vehicle === "none" ? steps.filter((step) => step !== "car") : steps;
}

export function nextOpenStep(plan: CompanionPlan): CompanionStep | null {
  return companionSteps(plan).find((step) => !plan.done.includes(step)) ?? null;
}

/** Distance à vol d'oiseau, en kilomètres. */
export function haversineKm(a: [number, number], b: [number, number]) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export type PortChoice = { port: Port; km: number | null; lines: { route: RouteLine; to: Port }[] };

/** Les ports d'Europe qui ont une ligne active vers l'Algérie, du plus proche au plus loin. */
export function departurePorts(
  ports: Port[],
  routes: RouteLine[],
  home: [number, number] | null,
): PortChoice[] {
  const byId = new Map(ports.map((port) => [port.id, port]));
  const choices = new Map<string, PortChoice>();
  for (const route of routes) {
    const from = byId.get(route.departure_port_id);
    const to = byId.get(route.arrival_port_id);
    if (!from || !to || from.country_code === "DZ" || to.country_code !== "DZ") continue;
    const choice = choices.get(from.id) ?? {
      port: from,
      km: home ? Math.round(haversineKm(home, [from.longitude, from.latitude])) : null,
      lines: [],
    };
    choice.lines.push({ route, to });
    choices.set(from.id, choice);
  }
  for (const choice of choices.values())
    choice.lines.sort(
      (a, b) =>
        (a.route.typical_duration_minutes ?? 9999) - (b.route.typical_duration_minutes ?? 9999),
    );
  return [...choices.values()].sort((a, b) =>
    a.km !== null && b.km !== null ? a.km - b.km : a.port.name.localeCompare(b.port.name, "fr"),
  );
}

/** Le port algérien le plus proche de la destination, parmi ceux que dessert le port de départ. */
export function closestArrival(
  choice: PortChoice,
  destination: [number, number] | null,
): Port | null {
  if (!choice.lines.length) return null;
  if (!destination) return choice.lines[0]!.to;
  return [...choice.lines]
    .map((line) => line.to)
    .sort(
      (a, b) =>
        haversineKm(destination, [a.longitude, a.latitude]) -
        haversineKm(destination, [b.longitude, b.latitude]),
    )[0]!;
}

/** Le jour retenu pour les prix et la recherche : le jour précis, sinon le 15 du mois. */
export const planDay = (plan: Pick<CompanionPlan, "month" | "date">) =>
  plan.date && plan.date.startsWith(plan.month) ? plan.date : `${plan.month}-15`;

export function planFare(
  plan: CompanionPlan,
  from: Port,
  to: Port,
  people: { adults: number; children: number },
): FareEstimate {
  // L'estimation ne lit que les noms, le pays de départ et le jour : pas besoin d'un départ publié.
  const sailing = { from, to, dayKey: planDay(plan) } as unknown as Sailing;
  return estimateFerryFare(sailing, {
    vehicle: plan.vehicle,
    accessories: [],
    passengers: {
      adults: Math.max(1, people.adults),
      seniors: 0,
      children: people.children,
      babies: 0,
      pets: 0,
    },
  });
}

/** Le centre de la commune d'un code postal (service public API Géo). */
export async function communeOfPostcode(postcode: string): Promise<CompanionPlan["home"]> {
  const code = postcode.trim();
  if (!/^\d{5}$/.test(code)) return null;
  const res = await fetch(
    `https://geo.api.gouv.fr/communes?codePostal=${code}&fields=nom,centre,population&format=json`,
  );
  if (!res.ok) return null;
  const list = (await res.json()) as {
    nom: string;
    population?: number;
    centre?: { coordinates: [number, number] };
  }[];
  // Plusieurs communes pour un code : la plus peuplée sert de repère.
  const best = list
    .filter((c) => c.centre)
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];
  return best?.centre ? { postcode: code, name: best.nom, point: best.centre.coordinates } : null;
}

export const seasonLabels: Record<PriceSeason, string> = {
  calme: "Basse saison",
  intermediaire: "Saison moyenne",
  forte: "Haute saison",
  pointe: "Pic de l'été",
};

/** La recherche de traversées, déjà remplie : ports, jour (± 3 jours). */
export function bookingSearch(plan: CompanionPlan) {
  const params = new URLSearchParams();
  if (plan.fromPortId) params.set("from", plan.fromPortId);
  if (plan.toPortId) params.set("to", plan.toPortId);
  params.set("date", planDay(plan));
  params.set("flex", "3");
  return `/?${params.toString()}`;
}

/** L'itinéraire de la carte, prérempli par le compagnon (lu une fois à l'ouverture). */
export const ITINERARY_SEED_KEY = "bledway:itinerary-seed:v1";
export type ItinerarySeed = {
  origin: string;
  originPoint: [number, number] | null;
  destination: string;
  destinationPoint: [number, number] | null;
  period: string;
};

export function saveItinerarySeed(seed: ItinerarySeed) {
  try {
    window.sessionStorage.setItem(ITINERARY_SEED_KEY, JSON.stringify(seed));
  } catch {
    /* facultatif */
  }
}

export function takeItinerarySeed(): ItinerarySeed | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ITINERARY_SEED_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(ITINERARY_SEED_KEY);
    return JSON.parse(raw) as ItinerarySeed;
  } catch {
    return null;
  }
}

export const formatDuration = (minutes: number | null) => {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
};
