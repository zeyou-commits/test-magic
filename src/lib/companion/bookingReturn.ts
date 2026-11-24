import { useEffect, useState } from "react";
import { tr } from "@/lib/i18n/translate";

/**
 * « T'as pris ton billet ? » : le visiteur part réserver chez une compagnie (nouvel onglet) ;
 * quand il revient sur BledWay, la 504 lui propose d'ajouter son billet pour le suivi.
 */
const KEY = "bledway:booking-leave";
/** En dessous, c'est un clic par erreur ou un aller-retour éclair : on ne demande rien. */
export const MIN_AWAY_MS = 20_000;
/** Au-delà, la question n'a plus de sens. */
export const MAX_AWAY_MS = 2 * 60 * 60_000;

export type BookingLeave = { site: string; at: number };

export function markBookingLeave(site: string | null | undefined) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ site: site || tr("ui.libCompanionBookingReturn.laCompagnie"), at: Date.now() }));
  } catch {
    // Stockage bloqué : la question ne sera simplement pas posée.
  }
}

export function readBookingLeave(): BookingLeave | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<BookingLeave>;
    return typeof value.site === "string" && typeof value.at === "number"
      ? { site: value.site, at: value.at }
      : null;
  } catch {
    return null;
  }
}

export function clearBookingLeave() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // rien
  }
}

/** Le retour compte s'il a duré assez longtemps, mais pas trop. */
export function isBookingReturn(leave: BookingLeave | null, now: number) {
  if (!leave) return false;
  const away = now - leave.at;
  return away >= MIN_AWAY_MS && away <= MAX_AWAY_MS;
}

/** Le site de la compagnie que le visiteur vient de quitter, s'il revient maintenant. */
export function useBookingReturn() {
  const [back, setBack] = useState<BookingLeave | null>(null);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const leave = readBookingLeave();
      if (isBookingReturn(leave, Date.now())) setBack(leave);
      else if (leave && Date.now() - leave.at > MAX_AWAY_MS) clearBookingLeave();
    };
    check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  return {
    back,
    dismiss: () => {
      clearBookingLeave();
      setBack(null);
    },
  };
}
