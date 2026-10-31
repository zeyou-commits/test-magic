import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Megaphone } from "lucide-react";
import { alertLabel, isImpact } from "@/lib/ferry/community";
import { departureEventsQuery } from "@/lib/ferry/flash";
import { useFlashCards } from "./FlashFeed";

const HOUR = 3_600_000;
const FOCUS_KEY = "bledway:focus-signal";

export type LiveItem = { key: string; label: string; tone: "official" | "traveller" | "alert" };
export type LiveInfo = {
  /** Changements officiels de la traversée et infos BledWay ou compagnie rattachées à la fiche. */
  official: number;
  /** Signalements des voyageurs encore actifs. */
  travellers: number;
  /** Les deux premières lignes du résumé, dans l'ordre : BledWay d'abord, puis les voyageurs. */
  headlines: LiveItem[];
};

/**
 * Ce qui se passe autour d'une fiche (port, traversée, navire), compté de la même façon partout.
 * - Une info BledWay rattachée à aucune ligne, aucun port ni aucune compagnie ne compte pas.
 * - Une info BledWay sort du compteur après 24 h (elle reste dans la liste) ; un changement de
 *   traversée après 72 h.
 * - Un signalement voyageur grave (sur place, confirmé) remonte dans le résumé, même derrière BledWay.
 */
export function useLiveInfo(scope: {
  departureId?: string | undefined;
  routeIds?: string[];
  portIds?: string[];
  companyIds?: string[];
  signalPortIds?: string[];
  signalVesselIds?: string[];
  vesselId?: string | null | undefined;
}): LiveInfo {
  const now = Date.now();
  const events =
    useQuery({
      ...departureEventsQuery(scope.departureId ?? ""),
      enabled: Boolean(scope.departureId),
    }).data ?? [];
  const flash = useFlashCards({
    context: {
      departureIds: scope.departureId ? [scope.departureId] : [],
      routeIds: scope.routeIds ?? [],
      portIds: scope.portIds ?? [],
      companyIds: scope.companyIds ?? [],
      vesselId: scope.vesselId,
    },
    signalPortIds: scope.signalPortIds ?? [],
    signalVesselIds: scope.signalVesselIds ?? [],
  });
  const changes: LiveItem[] = events
    .filter((event) => now - Date.parse(event.created_at) < 72 * HOUR)
    .map((event) => ({ key: event.id, label: event.title, tone: "official" }));
  // Sans ligne, port, compagnie ni traversée, aucune info BledWay ne concerne la fiche.
  const scoped =
    Boolean(scope.departureId) ||
    Boolean(scope.vesselId) ||
    (scope.routeIds?.length ?? 0) + (scope.portIds?.length ?? 0) + (scope.companyIds?.length ?? 0) >
      0;
  const news: LiveItem[] = flash.cards.flatMap((card) =>
    scoped &&
    card.type === "news" &&
    (card.item.kind === "alerte" || now - Date.parse(card.item.starts_at) < 24 * HOUR) &&
    card.item.route_ids.length +
      card.item.port_ids.length +
      card.item.company_ids.length +
      card.item.departure_ids.length +
      (card.item.vessel_id ? 1 : 0) >
      0
      ? [
          {
            key: card.key,
            label: card.item.title,
            tone: card.item.kind === "alerte" ? ("alert" as const) : ("official" as const),
          },
        ]
      : [],
  );
  const signals = flash.cards.flatMap((card) => (card.type === "signal" ? [card.alert] : []));
  const travellerItems: LiveItem[] = signals.map((alert) => ({
    key: alert.id,
    label: alertLabel(alert),
    tone: isImpact(alert) ? "alert" : "traveller",
  }));
  const ordered = [
    ...news.filter((item) => item.tone === "alert"),
    ...changes,
    ...news.filter((item) => item.tone !== "alert"),
    ...travellerItems,
  ];
  const headlines = ordered.slice(0, 2);
  const urgent = ordered.find((item) => item.tone === "alert");
  if (urgent && !headlines.includes(urgent)) headlines.splice(1, 1, urgent);
  return {
    official: changes.length + news.length,
    travellers: travellerItems.length,
    headlines,
  };
}

/**
 * Le bandeau « en direct », identique sur les fiches : mégaphone, compteurs (vert : BledWay,
 * rouge : voyageurs), résumé, et un toucher qui ouvre la liste. « Signaler » en option.
 */
export function LivePulse({
  info,
  onOpen,
  onReport,
}: {
  info: LiveInfo;
  onOpen: () => void;
  onReport?: (() => void) | undefined;
}) {
  const total = info.official + info.travellers;
  const parts = [
    info.official ? `${info.official} info${info.official > 1 ? "s" : ""} BledWay` : "",
    info.travellers
      ? `${info.travellers} signalement${info.travellers > 1 ? "s" : ""} voyageur${info.travellers > 1 ? "s" : ""}`
      : "",
  ].filter(Boolean);
  const urgent = info.headlines.some((item) => item.tone === "alert");
  return (
    <div className="bw-pulse" data-alert={total > 0} data-urgent={urgent || undefined}>
      <button
        type="button"
        className="bw-pulse__main"
        onClick={onOpen}
        aria-label={total ? `Voir ${parts.join(" et ")}` : "Voir les infos en direct"}
      >
        <span className="bw-pulse__icon" aria-hidden>
          <Megaphone size={17} />
          <span className="bw-pulse__counts">
            {info.official ? <b data-kind="official">{cap(info.official)}</b> : null}
            {info.travellers ? <b data-kind="traveller">{cap(info.travellers)}</b> : null}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <strong>{total ? parts.join(" · ") : "Rien à signaler pour le moment"}</strong>
          <small>
            {total
              ? info.headlines.map((item) => item.label).join(" · ")
              : "Infos BledWay et voyageurs sur place"}
          </small>
        </span>
        {total ? <ChevronRight size={16} aria-hidden /> : null}
      </button>
      {onReport ? (
        <button type="button" className="bw-pulse__add" onClick={onReport}>
          <Megaphone size={15} aria-hidden /> Signaler
        </button>
      ) : null}
    </div>
  );
}
const cap = (count: number) => (count > 9 ? "9+" : String(count));

/**
 * Fait défiler le volet (et lui seul : ni la page, ni la carte) pour amener un élément en haut,
 * ou au centre, de la zone visible.
 */
export function scrollWithin(target: HTMLElement, align: "start" | "center" = "start") {
  let box = target.parentElement;
  while (box) {
    const style = getComputedStyle(box);
    if (/(auto|scroll)/.test(style.overflowY) && box.scrollHeight > box.clientHeight) break;
    box = box.parentElement;
  }
  if (!box) return;
  const offset = target.getBoundingClientRect().top - box.getBoundingClientRect().top;
  const top =
    align === "center"
      ? box.scrollTop + offset - (box.clientHeight - target.offsetHeight) / 2
      : box.scrollTop + offset - 8;
  const goal = Math.max(0, Math.min(top, box.scrollHeight - box.clientHeight));
  const start = box.scrollTop;
  box.scrollTo({ top: goal, behavior: "smooth" });
  // Défilement doux impossible (onglet en arrière-plan, économie d'énergie) : on y va directement.
  window.setTimeout(() => {
    if (box && Math.abs(box.scrollTop - start) < 1 && Math.abs(goal - start) > 1)
      box.scrollTop = goal;
  }, 700);
}
/** Ouvre la liste « en direct » : défilement jusqu'à elle, puis mise en évidence un instant. */
export function revealLive(id: string) {
  // Deux images d'attente : l'onglet vient d'être affiché.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (!target) return;
      scrollWithin(target);
      target.classList.remove("is-revealed");
      void target.offsetWidth;
      target.classList.add("is-revealed");
      window.setTimeout(() => target.classList.remove("is-revealed"), 1600);
    }),
  );
}

/** Pastille de la carte touchée : la fiche s'ouvrira cadrée sur ce signalement. */
export function requestSignalFocus(alertId: string) {
  try {
    window.sessionStorage.setItem(FOCUS_KEY, alertId);
  } catch {
    /* stockage indisponible : la fiche s'ouvre simplement */
  }
}
// Lien d'une notification : le signalement visé est lu à l'ouverture, avant que l'adresse ne change.
const linkedSignal =
  typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("signal");
let linkedSignalUsed = false;
/** Lu une seule fois par la liste qui contient ce signalement. */
export function takeSignalFocus(ids: string[]) {
  try {
    if (!linkedSignalUsed && linkedSignal && ids.includes(linkedSignal)) {
      linkedSignalUsed = true;
      return linkedSignal;
    }
    const wanted = window.sessionStorage.getItem(FOCUS_KEY);
    if (!wanted || !ids.includes(wanted)) return null;
    window.sessionStorage.removeItem(FOCUS_KEY);
    return wanted;
  } catch {
    return null;
  }
}
export function hasSignalFocus() {
  try {
    return Boolean(window.sessionStorage.getItem(FOCUS_KEY));
  } catch {
    return false;
  }
}
