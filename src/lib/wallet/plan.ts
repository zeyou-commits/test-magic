// « Combien je change ? » : une estimation de séjour, à ajuster par le voyageur.
// Les montants par défaut sont des repères BledWay modifiables, jamais des prix officiels.

export type PlanStyle = "econome" | "normal" | "large";
export type StayPlan = {
  days: number;
  adults: number;
  children: number;
  car: boolean;
  /** Kilomètres en voiture sur place (aller-retour depuis le port compris). */
  km: number;
  style: PlanStyle;
  gifts: number;
  /** Prix du litre d'essence en dinars, modifiable. */
  fuelPrice: number;
};

export const PLAN_STYLES: { id: PlanStyle; label: string; factor: number }[] = [
  { id: "econome", label: "Économe", factor: 0.7 },
  { id: "normal", label: "Normal", factor: 1 },
  { id: "large", label: "Large", factor: 1.5 },
];

/** Repères par jour, en dinars, pour un adulte (un enfant compte pour moitié). */
export const DAILY_PER_ADULT = { courses: 1200, resto: 1000, sorties: 600 } as const;
/** Consommation moyenne retenue pour une voiture chargée. */
export const LITRES_PER_100KM = 7.5;
/** Déplacements sur place en plus de la route depuis le port. */
export const LOCAL_KM_PER_DAY = 25;

export const defaultPlan = (): StayPlan => ({
  days: 21,
  adults: 2,
  children: 0,
  car: true,
  km: 0,
  style: "normal",
  gifts: 30000,
  fuelPrice: 47,
});

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

export function sanitizePlan(input: unknown): StayPlan {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const base = defaultPlan();
  return {
    days: clamp(raw["days"], 1, 120, base.days),
    adults: clamp(raw["adults"], 1, 12, base.adults),
    children: clamp(raw["children"], 0, 12, base.children),
    car: typeof raw["car"] === "boolean" ? raw["car"] : base.car,
    km: clamp(raw["km"], 0, 5000, base.km),
    style: PLAN_STYLES.some((style) => style.id === raw["style"]) ? (raw["style"] as PlanStyle) : base.style,
    gifts: clamp(raw["gifts"], 0, 10_000_000, base.gifts),
    fuelPrice: clamp(raw["fuelPrice"], 10, 500, base.fuelPrice),
  };
}

export type PlanLine = { id: "courses" | "resto" | "sorties" | "essence" | "cadeaux"; label: string; dinars: number };

/** Le détail par poste et le total du séjour, en dinars. */
export function planBudget(plan: StayPlan): { lines: PlanLine[]; total: number } {
  const factor = PLAN_STYLES.find((style) => style.id === plan.style)?.factor ?? 1;
  const people = plan.adults + plan.children * 0.5;
  const daily = (amount: number) => Math.round(amount * people * factor * plan.days);
  // La route depuis le port se fait deux fois (arrivée et retour), plus les trajets du quotidien.
  const km = plan.car ? plan.km * 2 + LOCAL_KM_PER_DAY * plan.days : 0;
  const lines: PlanLine[] = [
    { id: "courses", label: "Courses", dinars: daily(DAILY_PER_ADULT.courses) },
    { id: "resto", label: "Resto, cafés", dinars: daily(DAILY_PER_ADULT.resto) },
    { id: "sorties", label: "Sorties, imprévus", dinars: daily(DAILY_PER_ADULT.sorties) },
    { id: "essence", label: "Essence", dinars: Math.round((km * LITRES_PER_100KM * plan.fuelPrice) / 100) },
    { id: "cadeaux", label: "Cadeaux", dinars: plan.gifts },
  ];
  const kept = lines.filter((line) => line.dinars > 0);
  return { lines: kept, total: kept.reduce((sum, line) => sum + line.dinars, 0) };
}

/** Arrondi lisible d'un montant à changer (au billet de 10 supérieur). */
export const roundUpTo = (value: number, step = 10) => Math.ceil(value / step) * step;

/** Ce qu'il reste par jour pour finir le séjour. */
export function perDayLeft(dinars: number, daysLeft: number) {
  if (!Number.isFinite(dinars) || !Number.isFinite(daysLeft) || daysLeft <= 0) return null;
  return Math.floor(Math.max(0, dinars) / daysLeft);
}

/** Les billets et pièces que l'on compte en poche. */
export const POCKET_VALUES = [2000, 1000, 500, 200, 100] as const;
export function pocketTotal(counts: Partial<Record<number, number>>) {
  return POCKET_VALUES.reduce((sum, value) => sum + value * Math.max(0, Math.trunc(counts[value] ?? 0)), 0);
}
