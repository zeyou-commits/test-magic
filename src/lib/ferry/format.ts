import type { Reliability } from "./types";

export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
});

const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} — ${formatTime(iso)}`;
}

export const reliabilityLabel: Record<Reliability, string> = {
  verified: "Vérifié",
  to_verify: "À vérifier",
  possibly_outdated: "Potentiellement obsolète",
};

export const reliabilityTone: Record<Reliability, string> = {
  verified: "text-[oklch(0.55_0.13_150)]",
  to_verify: "text-accent",
  possibly_outdated: "text-destructive",
};

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
};

export const weekdayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
