import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown, ChevronUp, Info, Pin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { looksInternal, newsForContext, newsQuery, type NewsItem } from "@/lib/ferry/flash";
import { isPublicNews, newsSlug } from "@/lib/ferry/newsFeed";

/**
 * Info BledWay épinglée en haut d'un salon (remplace la cloche de l'en-tête).
 * Une actualité rattachée à la traversée, à son navire, à ses ports ou à sa compagnie (traversée
 * dans les 30 jours) reste visible tant qu'elle est en cours. Elle est toujours repliée sur une
 * ligne (la place reste à la conversation) ; elle clignote tant qu'une nouveauté n'a pas été
 * ouverte. Un tap la déplie ; elle se replie dès qu'on fait défiler ou qu'on écrit.
 */

type RoomKind = "crossing" | "port";
const COMPANY_WINDOW_MS = 30 * 24 * 3_600_000;
const SEEN_KEY = "bledway:pin-seen";

function readSeen(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function markSeen(room: string, version: string) {
  try {
    const all = readSeen();
    all[room] = version;
    const entries = Object.entries(all).slice(-200);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* stockage indisponible : l'info se redépliera à la prochaine visite */
  }
}

type DepartureScope = {
  route_id: string;
  company_id: string;
  vessel_id: string | null;
  departure_at: string;
  routes: { departure_port_id: string; arrival_port_id: string } | null;
};

function useRoomScope(kind: RoomKind, room: string) {
  return useQuery({
    queryKey: ["pinned-scope", kind, room],
    enabled: kind === "crossing",
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("departures")
        .select("route_id,company_id,vessel_id,departure_at,routes(departure_port_id,arrival_port_id)")
        .eq("id", room)
        .maybeSingle();
      return (data as DepartureScope | null) ?? null;
    },
  });
}

export function usePinnedNews(kind: RoomKind, room: string): NewsItem[] {
  const news = useQuery(newsQuery);
  const scope = useRoomScope(kind, room);
  return useMemo(() => {
    const now = Date.now();
    const live = (news.data ?? []).filter(
      (item) =>
        isPublicNews(item) &&
        !looksInternal(`${item.title} ${item.summary}`) &&
        (!item.ends_at || Date.parse(item.ends_at) > now),
    );
    if (kind === "port") return newsForContext(live, { portIds: [room], attachedOnly: true });
    const d = scope.data;
    if (!d) return [];
    const ports = d.routes ? [d.routes.departure_port_id, d.routes.arrival_port_id] : [];
    const soon = Date.parse(d.departure_at) - now < COMPANY_WINDOW_MS;
    return newsForContext(live, {
      departureIds: [room],
      routeIds: [d.route_id],
      portIds: ports,
      companyIds: soon ? [d.company_id] : [],
      vesselId: d.vessel_id,
      attachedOnly: true,
    });
  }, [news.data, scope.data, kind, room]);
}

const ago = (iso: string) => {
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
};

export function PinnedInfo({
  kind,
  room,
  activity,
}: {
  kind: RoomKind;
  room: string;
  /** Change à chaque défilement ou saisie dans le salon : l'info se replie. */
  activity: number;
}) {
  const items = usePinnedNews(kind, room);
  const version = items.map((item) => `${item.id}:${item.kind}:${item.ends_at ?? ""}`).join("|");
  const [open, setOpen] = useState(false);
  // Nouveauté pas encore ouverte : la ligne clignote, sans se déplier toute seule.
  const [unseen, setUnseen] = useState(false);
  useEffect(() => {
    setUnseen(Boolean(version) && readSeen()[room] !== version);
  }, [room, version]);
  useEffect(() => {
    if (!activity) return;
    setOpen((current) => {
      if (current && version) markSeen(room, version);
      return false;
    });
  }, [activity]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!items.length) return null;
  const top = items[0]!;
  const tone = top.kind === "alerte" ? "critical" : top.kind === "perturbation" ? "warning" : "info";
  const Icon = top.kind === "info" ? Info : AlertTriangle;
  const toggle = () => {
    if (!open) {
      markSeen(room, version);
      setUnseen(false);
    }
    setOpen(!open);
  };
  return (
    <section
      className="bw-pinned"
      data-tone={tone}
      data-open={open || undefined}
      data-new={(unseen && !open) || undefined}
      aria-label="Info BledWay épinglée"
    >
      <button type="button" className="bw-pinned__bar" onClick={toggle} aria-expanded={open}>
        <Pin size={14} aria-hidden />
        <span className="bw-pinned__label">Info BledWay</span>
        {unseen && !open ? <span className="sr-only">(nouveau)</span> : null}
        <span className="bw-pinned__title">{top.title}</span>
        {items.length > 1 ? <span className="bw-pinned__count">{items.length} infos</span> : null}
        {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
      </button>
      {open ? (
        <ul className="bw-pinned__list">
          {items.slice(0, 3).map((item) => (
            <li key={item.id} data-kind={item.kind}>
              <p className="bw-pinned__head">
                <Icon size={14} aria-hidden /> <b>{item.title}</b>
                <small>{ago(item.starts_at)}</small>
              </p>
              <p className="bw-pinned__summary">{item.summary}</p>
              <Link to="/actualites/$slug" params={{ slug: newsSlug(item) }}>
                Lire l’actu
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
