import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Megaphone,
  Newspaper,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { activeAlerts, alertLabel, communityQuery, type TravelAlert } from "@/lib/ferry/community";
import {
  newsForContext,
  newsQuery,
  relativeAge,
  type NewsContext,
  type NewsItem,
} from "@/lib/ferry/flash";
import { portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import type { Selection } from "@/lib/ferry/types";
import { AlertIcon } from "./TravelCommunity";
import { SignalAvatars } from "./SignalAvatars";

type FlashCard =
  { type: "news"; at: string; item: NewsItem } | { type: "signal"; at: string; alert: TravelAlert };

const safeHttps = (value: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

function originBadge(item: NewsItem) {
  if (item.kind === "perturbation")
    return { label: "Perturbation", icon: AlertTriangle, tone: "warning" as const };
  if (item.origin === "official")
    return { label: "Compagnie / port", icon: Building2, tone: "official" as const };
  if (item.origin === "bledway")
    return { label: "BledWay", icon: Megaphone, tone: "brand" as const };
  return { label: "Média", icon: Newspaper, tone: "media" as const };
}

/**
 * Flash info : actualités Europe ↔ Algérie sélectionnées par l'équipe (sourcées), complétées des
 * signalements voyageurs en cours. Le contexte (ports, lignes, compagnies) limite aux infos utiles.
 */
export interface FlashScope {
  context?: NewsContext | undefined;
  withSignals?: boolean | undefined;
  /** Restreint les signalements à ces ports (sinon : ceux du contexte, ou tous les ports). */
  signalPortIds?: string[] | undefined;
  signalVesselIds?: string[] | undefined;
  /** Port dont la fiche est ouverte : pas de lien « Voir le port » vers elle-même. */
  currentPortId?: string | undefined;
}

/** Cartes du flash (actualités + signalements), triées : perturbations d'abord, puis les plus récentes. */
export function useFlashCards({
  context,
  withSignals = true,
  signalPortIds,
  signalVesselIds,
}: FlashScope = {}) {
  const { user } = useAuth();
  const news = useQuery(newsQuery);
  const community = useQuery({
    ...communityQuery(undefined, undefined, false, user?.id),
    enabled: withSignals,
  });
  const items = newsForContext(news.data ?? [], context);
  const portFilter = new Set(signalPortIds ?? context?.portIds ?? []);
  const vesselFilter = new Set(signalVesselIds ?? []);
  const scoped = portFilter.size + vesselFilter.size > 0;
  const signals = withSignals
    ? activeAlerts(community.data?.alerts ?? []).filter(
        (alert) =>
          (alert.denials ?? 0) <= alert.confirmations &&
          (!scoped
            ? alert.target_kind === "port"
            : (alert.target_kind === "port" && portFilter.has(alert.target_id)) ||
              (alert.target_kind === "vessel" && vesselFilter.has(alert.target_id))),
      )
    : [];
  const urgent = (card: FlashCard) =>
    card.type === "news" && card.item.kind === "perturbation" ? 1 : 0;
  const cards: FlashCard[] = [
    ...items.map((item): FlashCard => ({ type: "news", at: item.starts_at, item })),
    ...signals.map((alert): FlashCard => ({ type: "signal", at: alert.created_at, alert })),
  ].sort((a, b) => urgent(b) - urgent(a) || Date.parse(b.at) - Date.parse(a.at));
  return {
    cards,
    /** Le module SQL n'est pas encore activé (aucune actualité possible). */
    disabled: news.data === null,
    urgent: cards.some((card) => urgent(card) === 1),
  };
}

export function FlashFeed({
  context,
  title = "Flash info",
  limit = 4,
  withSignals = true,
  signalPortIds,
  signalVesselIds,
  currentPortId,
  onSelect,
  emptyText,
  hideTitle = false,
}: FlashScope & {
  title?: string;
  limit?: number;
  onSelect?: (selection: Selection) => void;
  emptyText?: string;
  hideTitle?: boolean;
}) {
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const flash = useFlashCards({ context, withSignals, signalPortIds, signalVesselIds });
  const cards = flash.cards.slice(0, limit);
  const heading = hideTitle ? null : (
    <h3 className="bw-flash-title">
      <Zap size={15} aria-hidden /> {title}
    </h3>
  );

  if (!cards.length) {
    if (!emptyText || flash.disabled) return null;
    return (
      <section className="bw-flash" aria-label={title}>
        {heading}
        <p className="bw-flash-empty">{emptyText}</p>
      </section>
    );
  }

  const portName = (id: string) => ports.find((port) => port.id === id)?.name;
  const routeLabel = (id: string) => {
    const route = routes.find((item) => item.id === id);
    return route
      ? `${portName(route.departure_port_id) ?? "?"} → ${portName(route.arrival_port_id) ?? "?"}`
      : null;
  };

  return (
    <section className="bw-flash" aria-label={title}>
      {heading}
      <ul className="bw-flash-list">
        {cards.map((card) => {
          if (card.type === "signal") {
            const alert = card.alert;
            const place =
              alert.target_kind === "port"
                ? `Port de ${portName(alert.target_id) ?? "—"}`
                : (vessels.find((vessel) => vessel.id === alert.target_id)?.name ?? "Navire");
            return (
              <li key={`s-${alert.id}`} className="bw-flash-card" data-tone="community">
                <div className="bw-flash-kicker">
                  <span className="bw-flash-badge" data-tone="community">
                    <AlertIcon category={alert.category} size={13} /> Voyageurs
                  </span>
                  <span>{place}</span>
                  <time dateTime={alert.created_at}>{relativeAge(alert.created_at)}</time>
                </div>
                <strong className="bw-flash-headline">{alertLabel(alert)}</strong>
                <div className="bw-flash-footer">
                  <span className="bw-flash-crowd">
                    <SignalAvatars count={1 + alert.confirmations} seed={alert.id} />
                    {1 + alert.confirmations} voyageur{alert.confirmations ? "s" : ""}
                  </span>
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() =>
                        onSelect({ type: alert.target_kind, id: alert.target_id } as Selection)
                      }
                    >
                      Confirmer sur place <ArrowRight size={14} aria-hidden />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          }
          const item = card.item;
          const badge = originBadge(item);
          const Icon = badge.icon;
          const href = safeHttps(item.source_url);
          const route = item.route_ids[0] ? routeLabel(item.route_ids[0]) : null;
          const port = !route && item.port_ids[0] ? portName(item.port_ids[0]) : null;
          return (
            <li key={`n-${item.id}`} className="bw-flash-card" data-tone={badge.tone}>
              <div className="bw-flash-kicker">
                <span className="bw-flash-badge" data-tone={badge.tone}>
                  <Icon size={13} aria-hidden /> {badge.label}
                </span>
                {item.source_name ? <span>{item.source_name}</span> : null}
                <time dateTime={item.starts_at}>{relativeAge(item.starts_at)}</time>
              </div>
              <strong className="bw-flash-headline">{item.title}</strong>
              {item.summary ? <p>{item.summary}</p> : null}
              {route || port ? (
                <span className="bw-flash-chip">{route ?? `Port de ${port}`}</span>
              ) : null}
              <div className="bw-flash-footer">
                {item.origin === "media" ? (
                  <small>Information relayée · vérifiez auprès de la compagnie</small>
                ) : (
                  <span />
                )}
                <span className="bw-flash-actions">
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      Lire à la source <ArrowUpRight size={14} aria-hidden />
                      <span className="sr-only"> (nouvel onglet)</span>
                    </a>
                  ) : null}
                  {onSelect && item.route_ids[0] ? (
                    <button
                      type="button"
                      onClick={() => onSelect({ type: "route", id: item.route_ids[0]! })}
                    >
                      Voir les départs <ArrowRight size={14} aria-hidden />
                    </button>
                  ) : onSelect && item.port_ids[0] && item.port_ids[0] !== currentPortId ? (
                    <button
                      type="button"
                      onClick={() => onSelect({ type: "port", id: item.port_ids[0]! })}
                    >
                      Voir le port <ArrowRight size={14} aria-hidden />
                    </button>
                  ) : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
