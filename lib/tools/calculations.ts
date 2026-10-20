/** Calculs purs : aucune donnée de formulaire envoyée à un serveur. */
export function parseAmount(value: string): number | null {
  if (!value.trim()) return null;
  const amount = Number(value.trim().replace(",", "."));
  return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000_000 ? amount : null;
}
export function parseOccupants(value: string): number | null {
  const n = parseAmount(value);
  return n !== null && Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}
export function dateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}
export function vehicleAge(firstUse: string, declaration: string) {
  const start = dateOnly(firstUse);
  const end = dateOnly(declaration);
  if (!start || !end || end < start) return null;
  const year = start.getUTCFullYear() + 3;
  const month = start.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const anniversary = new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay)));
  const remainingDays = Math.round((anniversary.getTime() - end.getTime()) / 86_400_000);
  return {
    anniversary: anniversary.toISOString().slice(0, 10),
    remainingDays,
    state:
      remainingDays > 0
        ? ("before" as const)
        : remainingDays === 0
          ? ("limit" as const)
          : ("after" as const),
    leapConvention: month === 1 && start.getUTCDate() === 29,
  };
}
export function fuelCost(km: number, litresPer100: number, pricePerLitre: number) {
  return ((km * litresPer100) / 100) * pricePerLitre;
}
export interface JourneyInput {
  ticket: number;
  km: number;
  consumption: number;
  fuelPrice: number;
  tolls: number;
  lodging: number;
  other: number;
}
export function journeyBudget(input: JourneyInput) {
  const fuel = fuelCost(input.km, input.consumption, input.fuelPrice);
  return { fuel, total: input.ticket + fuel + input.tolls + input.lodging + input.other };
}
export function importBudget(
  purchase: number,
  transport: number,
  fees: number,
  taxDzd: number | null,
  rate: number | null,
  reservePercent: number,
) {
  const knownSubtotal = purchase + transport + fees;
  const taxEur = taxDzd !== null && rate !== null && rate > 0 ? taxDzd / rate : null;
  const base = knownSubtotal + (taxEur ?? 0);
  const reserve = (base * reservePercent) / 100;
  return { knownSubtotal, taxEur, reserve, total: taxEur === null ? null : base + reserve };
}
export function splitRoadCosts(
  km: number,
  consumption: number,
  fuelPrice: number,
  tolls: number,
  parking: number,
  occupants: number,
) {
  const fuel = fuelCost(km, consumption, fuelPrice);
  const total = fuel + tolls + parking;
  return { fuel, total, perPerson: total / occupants };
}
export const euros = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
