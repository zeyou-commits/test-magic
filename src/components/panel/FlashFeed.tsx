import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Building2,
  ChevronDown,
  Megaphone,
  Newspaper,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  activeAlerts,
  alertLabel,
  communityQuery,
  isPublicAlert,
  useSignalCatalog,
  type TravelAlert,
} from "@/lib/ferry/community";
import {
  newsForContext,
  newsQuery,
  relativeAge,
  type DeparturePorts,
  type NewsContext,
  type NewsItem,
} from "@/lib/ferry/flash";
import { formatDateParts } from "@/lib/ferry/format";
import type { MapPreview } from "@/lib/ferry/mapPresentation";
import {
  fleetDeparturesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { portTimeZone } from "@/lib/ferry/time";
import type { Selection } from "@/lib/ferry/types";
import { AlertIcon } from "./TravelCommunity";
import { SignalAvatars } from "./SignalAvatars";

/** Survol d'une info : la page carte met en évidence le trajet ou le port concerné. */
export const FLASH_PREVIEW_EVENT = "bledway:flash-preview";
function previewOnMap(preview: MapPreview | null) {
  window.dispatchEvent(new CustomEvent(FLASH_PREVIEW_EVENT, { detail: preview }));
}

export type FlashCard =
  | { key: string; type: "news"; at: string; item: NewsItem }
  | { key: string; type: "signal"; at: string; alert: TravelAlert };

const safeHttps = (value: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

function tone(card: FlashCard) {
  if (card.type === "signal") return { label: "Voyageurs", icon: null, tone: "community" as const };
  const item = card.item;
  if (item.kind === "perturbation")
    return { label: "Perturbation", icon: AlertTriangle, tone: "warning" as const };
  if (item.origin === "official")
    return { label: "Compagnie / port", icon: Building2, tone: "official" as const };
  if (item.origin === "bledway")
    return { label: "BledWay", icon: Megaphone, tone: "brand" as const };
  return { label: "Média", icon: Newspaper, tone: "media" as const };
}

export interface FlashScope {
  context?: NewsContext | undefined;
  withSignals?: boolean | undefined;
  /** Restreint les signalements à ces ports (sinon : ceux du contexte, ou tous les ports). */
  signalPortIds?: string[] | undefined;
  signalVesselIds?: string[] | undefined;
  /** Port dont la fiche est ouverte : pas de lien « Voir le port » vers elle-même. */
  currentPortId?: string | undefined;
}

/** Données utiles pour nommer une traversée datée et savoir si un trajet a des départs à venir. */
function useNetwork() {
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: upcoming = [] } = useQuery(upcomingDeparturesQuery());
  const { data: recent = [] } = useQuery(fleetDeparturesQuery);
  const departures = new Map([...recent, ...upcoming].map((d) => [d.id, d]));
  const portById = new Map(ports.map((port) => [port.id, port]));
  const routeById = new Map(routes.map((route) => [route.id, route]));
  const departurePorts: DeparturePorts = new Map(
    [...departures.values()].flatMap((d) => {
      const route = routeById.get(d.route_id);
      return route ? [[d.id, [route.departure_port_id, route.arrival_port_id]] as const] : [];
    }),
  );
  const now = Date.now();
  const routesWithSailings = new Set(
    upcoming
      .filter((d) => d.status !== "cancelled" && Date.parse(d.departure_at) > now)
      .map((d) => d.route_id),
  );
  const routeLabel = (routeId: string) => {
    const route = routeById.get(routeId);
    return route
      ? `${portById.get(route.departure_port_id)?.name ?? "?"} → ${portById.get(route.arrival_port_id)?.name ?? "?"}`
      : null;
  };
  const departureLabel = (departureId: string) => {
    const departure = departures.get(departureId);
    if (!departure) return null;
    const route = routeById.get(departure.route_id);
    const from = route ? portById.get(route.departure_port_id) : undefined;
    const date = formatDateParts(departure.departure_at, portTimeZone(from)).shortDate;
    return {
      text: `Traversée du ${date}${route ? ` · ${routeLabel(route.id)}` : ""}`,
      routeId: departure.route_id,
    };
  };
  return { portById, vessels, departurePorts, routesWithSailings, routeLabel, departureLabel };
}

/** Cartes du flash (actualités + signalements), triées : perturbations d'abord, puis les plus récentes. */
export function useFlashCards({
  context,
  withSignals = true,
  signalPortIds,
  signalVesselIds,
}: FlashScope = {}) {
  const { user } = useAuth();
  useSignalCatalog();
  const news = useQuery(newsQuery);
  const community = useQuery({
    ...communityQuery(undefined, undefined, false, user?.id),
    enabled: withSignals,
  });
  const { departurePorts } = useNetwork();
  const items = newsForContext(news.data ?? [], context, departurePorts);
  const portFilter = new Set(signalPortIds ?? context?.portIds ?? []);
  const vesselFilter = new Set(signalVesselIds ?? []);
  const scoped = portFilter.size + vesselFilter.size > 0;
  const signals = withSignals
    ? activeAlerts(community.data?.alerts ?? []).filter(
        (alert) =>
          isPublicAlert(alert) &&
          (!scoped
            ? alert.target_kind === "port"
            : (alert.target_kind === "port" && portFilter.has(alert.target_id)) ||
              (alert.target_kind === "vessel" && vesselFilter.has(alert.target_id))),
      )
    : [];
  const urgent = (card: FlashCard) =>
    card.type === "news" && card.item.kind === "perturbation" ? 1 : 0;
  const cards: FlashCard[] = [
    ...items.map((item): FlashCard => ({
      key: `n-${item.id}`,
      type: "news",
      at: item.starts_at,
      item,
    })),
    ...signals.map((alert): FlashCard => ({
      key: `s-${alert.id}`,
      type: "signal",
      at: alert.created_at,
      alert,
    })),
  ].sort((a, b) => urgent(b) - urgent(a) || Date.parse(b.at) - Date.parse(a.at));
  return {
    cards,
    /** Le module SQL n'est pas encore activé (aucune actualité possible). */
    disabled: news.data === null,
    urgent: cards.some((card) => urgent(card) === 1),
  };
}

/**
 * Fil Flash info en lignes compactes : une ligne par info (titre, origine, ancienneté),
 * le détail et les actions s'ouvrent au clic. Le survol met en évidence le trajet ou le port.
 */
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
  expandFirst = false,
  seen,
}: FlashScope & {
  title?: string;
  limit?: number;
  onSelect?: (selection: Selection) => void;
  emptyText?: string;
  hideTitle?: boolean;
  /** Ouvre la première info (fiches port et traversée, où les infos sont peu nombreuses). */
  expandFirst?: boolean;
  /** Infos déjà vues : les autres portent un point « nouveau ». */
  seen?: Set<string> | undefined;
}) {
  const network = useNetwork();
  const flash = useFlashCards({ context, withSignals, signalPortIds, signalVesselIds });
  const cards = flash.cards.slice(0, limit);
  const [open, setOpen] = useState<string | null>(null);
  const openKey = open ?? (expandFirst ? (cards[0]?.key ?? null) : null);
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

  return (
    <section className="bw-flash" aria-label={title}>
      {heading}
      <ul className="bw-flash-list">
        {cards.map((card) => {
          const badge = tone(card);
          const isOpen = openKey === card.key;
          const isNew = seen ? !seen.has(card.key) : false;
          let headline: string;
          let place: string | null;
          let preview: MapPreview | null = null;
          let icon;
          if (card.type === "signal") {
            const alert = card.alert;
            headline = alertLabel(alert);
            place =
              alert.target_kind === "port"
                ? `Port de ${network.portById.get(alert.target_id)?.name ?? "—"}`
                : (network.vessels.find((vessel) => vessel.id === alert.target_id)?.name ??
                  "Navire");
            preview =
              alert.target_kind === "port"
                ? { portId: alert.target_id }
                : { vesselId: alert.target_id };
            icon = <AlertIcon category={alert.category} size={15} />;
          } else {
            const item = card.item;
            headline = item.title;
            place = item.source_name || null;
            const departure = item.departure_ids[0]
              ? network.departureLabel(item.departure_ids[0])
              : null;
            const routeId = departure?.routeId ?? item.route_ids[0];
            preview = routeId
              ? { routeId }
              : item.port_ids[0]
                ? { portId: item.port_ids[0] }
                : null;
            const Icon = badge.icon ?? Newspaper;
            icon = <Icon size={15} aria-hidden />;
          }
          return (
            <li
              key={card.key}
              className="bw-flash-row"
              data-tone={badge.tone}
              data-open={isOpen}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") previewOnMap(preview);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") previewOnMap(null);
              }}
            >
              <button
                type="button"
                className="bw-flash-row__head"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? "" : card.key)}
                onFocus={() => previewOnMap(preview)}
                onBlur={() => previewOnMap(null)}
              >
                <span className="bw-flash-row__icon" aria-hidden>
                  {icon}
                </span>
                <span className="bw-flash-row__text">
                  <strong>{headline}</strong>
                  <small>
                    <span className="bw-flash-row__kind">{badge.label}</span>
                    {place ? ` · ${place}` : ""} · {relativeAge(card.at)}
                  </small>
                </span>
                {isNew ? <span className="bw-flash-new" aria-label="Nouveau" /> : null}
                <ChevronDown size={16} aria-hidden className="bw-flash-row__chevron" />
              </button>
              {isOpen ? (
                <FlashDetail
                  card={card}
                  network={network}
                  currentPortId={currentPortId}
                  onSelect={onSelect}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FlashDetail({
  card,
  network,
  currentPortId,
  onSelect,
}: {
  card: FlashCard;
  network: ReturnType<typeof useNetwork>;
  currentPortId?: string | undefined;
  onSelect?: ((selection: Selection) => void) | undefined;
}) {
  if (card.type === "signal") {
    const alert = card.alert;
    return (
      <div className="bw-flash-row__body">
        <div className="bw-flash-footer">
          <span className="bw-flash-crowd">
            <SignalAvatars count={1 + alert.confirmations} seed={alert.id} />
            {1 + alert.confirmations} voyageur{alert.confirmations ? "s" : ""}
          </span>
          {onSelect ? (
            <span className="bw-flash-actions">
              <button
                type="button"
                onClick={() =>
                  onSelect({ type: alert.target_kind, id: alert.target_id } as Selection)
                }
              >
                Confirmer sur place <ArrowRight size={14} aria-hidden />
              </button>
            </span>
          ) : null}
        </div>
      </div>
    );
  }
  const item = card.item;
  const href = safeHttps(item.source_url);
  const departureId = item.departure_ids[0];
  const departure = departureId ? network.departureLabel(departureId) : null;
  const routeId = !departure ? item.route_ids[0] : undefined;
  const routeLabel = routeId ? network.routeLabel(routeId) : null;
  const hasSailings = routeId ? network.routesWithSailings.has(routeId) : false;
  const portId = !departure && !routeId ? item.port_ids[0] : undefined;
  const portName = portId ? network.portById.get(portId)?.name : undefined;
  const chip = departure?.text ?? routeLabel ?? (portName ? `Port de ${portName}` : null);
  return (
    <div className="bw-flash-row__body">
      {item.summary ? <p>{item.summary}</p> : null}
      {chip ? <span className="bw-flash-chip">{chip}</span> : null}
      {routeId && !hasSailings ? (
        <p className="bw-flash-note">Aucune traversée programmée pour le moment.</p>
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
          {onSelect && departureId && departure ? (
            <button type="button" onClick={() => onSelect({ type: "departure", id: departureId })}>
              Voir la traversée <ArrowRight size={14} aria-hidden />
            </button>
          ) : onSelect && routeId && hasSailings ? (
            <button type="button" onClick={() => onSelect({ type: "route", id: routeId })}>
              Voir les départs <ArrowRight size={14} aria-hidden />
            </button>
          ) : onSelect && portId && portId !== currentPortId ? (
            <button type="button" onClick={() => onSelect({ type: "port", id: portId })}>
              Voir le port <ArrowRight size={14} aria-hidden />
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}
