/** Majuscule à la première lettre seulement (règle typographique française). */
export function capitalizeFirst(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

// Les fonctions ci-dessous acceptent un fuseau (celui du port concerné).
// Sans fuseau, elles utilisent celui du navigateur : à réserver aux dates qui ne
// sont pas des horaires de traversée (date d'un avis, d'un signalement…).

export function formatDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone }).format(
    new Date(iso),
  );
}

export function formatTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(
    new Date(iso),
  );
}

export function formatDateTime(iso: string, timeZone?: string): string {
  return `${formatDate(iso, timeZone)} · ${formatTime(iso, timeZone)}`;
}

/** « mar. 14 oct. » */
export function formatShortDay(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(new Date(iso));
}

/** Date courte et heure séparées, pour les listes compactes. */
export function formatDateParts(iso: string, timeZone?: string) {
  const date = new Date(iso);
  return {
    weekday: new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone })
      .format(date)
      .replace(".", ""),
    dayMonth: new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
    }).format(date),
    shortDate: new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      timeZone,
    }).format(date),
    time: new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(
      date,
    ),
  };
}

export const facilityLabels: Record<string, string> = {
  priere: "Lieu de prière",
  proprete: "Propreté",
  salle_attente: "Salle d'attente",
  douane: "Douane",
  sanitaires: "Sanitaires",
  parking: "Parking",
  acces: "Accès",
  transports: "Transports",
  restauration: "Restauration",
  pmr: "Accessibilité PMR",
  wifi: "Wi-Fi",
  boutique: "Boutique",
  dedouanement_vehicule: "Dédouanement véhicules -3 ans",
};

/** Critères qui relèvent d'une note des voyageurs et non d'un service du port. */
export const ratingOnlyFacilities = new Set(["proprete"]);

/** Valeurs de service considérées comme « non renseignées » : on ne les affiche pas. */
export function isFacilityFilled(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized !== "" &&
    normalized !== "non renseigné" &&
    normalized !== "non renseigne" &&
    normalized !== "—"
  );
}

export const weekdayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
