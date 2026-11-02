import { useMemo, useState } from "react";
import { afterOverlayClose, useBackClose } from "@/lib/ferry/backStack";
import { enterRoom } from "@/lib/ferry/chat";
import { revealBlock } from "./ActionHub";
import { useQuery } from "@tanstack/react-query";
import { CircleHelp, MessagesSquare, Search } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { formatDateParts, formatDateTime } from "@/lib/ferry/format";
import { dateKeyInZone } from "@/lib/ferry/time";
import { pickerRows, searchRows } from "@/lib/ferry/portPassage";
import { companiesQuery, portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { CompanyBadge } from "./CompanyBadge";
import { portTimeZone } from "@/lib/ferry/time";
import type { Selection } from "@/lib/ferry/types";

const supabase = typedSupabase as unknown as SupabaseClient;

const scrollTo = (selector: string) => revealBlock(selector, 700);

/** Le nombre de messages de plusieurs traversées, en une seule demande. */
export function useRoomCounts(ids: string[]) {
  return useQuery({
    queryKey: ["bw-chat", "counts", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bw_chat_counts", {
        p_departures: ids.slice(0, 100),
      });
      if (error) return new Map<string, number>();
      return new Map(
        (data as { departure_id: string; messages: number }[]).map((row) => [
          row.departure_id,
          row.messages,
        ]),
      );
    },
    retry: false,
    staleTime: 60_000,
  });
}

/** Un seul bouton Salon : on choisit sa traversée, ou on passe aux questions de la ligne. */
export function RoomPicker({
  departures,
  currentId,
  onSelect,
  open,
  onOpenChange,
  questionsFirst = false,
}: {
  departures: {
    id: string;
    departure_at: string;
    route_id: string;
    company_id?: string | null;
    vessel_id?: string | null;
  }[];
  currentId?: string | undefined;
  onSelect: (selection: Selection) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ouvert depuis la tuile Questions : les lignes d'abord. */
  questionsFirst?: boolean;
}) {
  const [text, setText] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const ids = departures.map((item) => item.id);
  const counts = useRoomCounts(open ? ids : []);
  // La compagnie et le navire de chaque départ : affichés, et retrouvés par la recherche.
  const rows = useMemo(() => {
    const plain = (value: string) =>
      value
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
    const byId = new Map(departures.map((item) => [item.id, item]));
    return pickerRows(departures, routes, ports, (iso, port) =>
      formatDateTime(iso, portTimeZone(port)),
    ).map((row) => {
      const departure = byId.get(row.id);
      const company = companies.find((item) => item.id === departure?.company_id);
      const vessel = vessels.find((item) => item.id === departure?.vessel_id);
      return {
        ...row,
        company,
        vessel: vessel?.name ?? null,
        search: `${row.search} ${plain(`${company?.name ?? ""} ${vessel?.name ?? ""}`)}`,
      };
    });
  }, [departures, routes, ports, companies, vessels]);
  // Les compagnies présentes dans la liste, pour filtrer d'un toucher.
  const present = companies.filter((company) => rows.some((row) => row.company?.id === company.id));
  const shown = searchRows(rows, text).filter((row) => !companyId || row.company?.id === companyId);
  // Regroupés par jour, l'heure en avant : on retrouve son bateau d'un coup d'œil.
  const departureOf = new Map(departures.map((item) => [item.id, item]));
  const routeOf = new Map(routes.map((item) => [item.id, item]));
  const dayLabel = (key: string) => {
    const today = dateKeyInZone(new Date().toISOString(), "Europe/Paris");
    const tomorrow = dateKeyInZone(new Date(Date.now() + 86_400_000).toISOString(), "Europe/Paris");
    if (key === today) return "Aujourd'hui";
    if (key === tomorrow) return "Demain";
    const label = new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${key}T12:00:00Z`));
    return label.charAt(0).toUpperCase() + label.slice(1);
  };
  const days = new Map<string, { row: (typeof shown)[number]; time: string }[]>();
  for (const row of shown) {
    const departure = departureOf.get(row.id);
    if (!departure) continue;
    const route = routeOf.get(departure.route_id);
    const zone = portTimeZone(ports.find((port) => port.id === route?.departure_port_id));
    const key = dateKeyInZone(departure.departure_at, zone);
    days.set(key, [
      ...(days.get(key) ?? []),
      { row, time: formatDateParts(departure.departure_at, zone).time },
    ]);
  }
  const lines = [...new Map(rows.map((row) => [row.routeId, row.line])).entries()];
  useBackClose(open, () => {
    onOpenChange(false);
    setText("");
  });
  if (!departures.length) return null;
  const close = () => {
    onOpenChange(false);
    setText("");
    setCompanyId(null);
  };
  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
        <DialogContent className="bw-room-picker">
          <DialogHeader>
            <DialogTitle>
              {questionsFirst ? "Choisir votre ligne" : "Choisir votre traversée"}
            </DialogTitle>
            <p className="bw-room-picker__intro">
              {questionsFirst
                ? "Posez votre question aux voyageurs de la ligne."
                : "Rejoignez le salon des voyageurs de votre bateau."}
            </p>
          </DialogHeader>
          <label className="bw-room-picker__search">
            <Search size={16} aria-hidden />
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Port, date, compagnie ou navire"
              aria-label="Rechercher une traversée"
            />
          </label>
          {present.length > 1 ? (
            <div className="bw-room-picker__companies" role="group" aria-label="Filtrer par compagnie">
              <button type="button" aria-pressed={!companyId} onClick={() => setCompanyId(null)}>
                Toutes
              </button>
              {present.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  aria-pressed={companyId === company.id}
                  onClick={() => setCompanyId(companyId === company.id ? null : company.id)}
                >
                  <CompanyBadge name={company.name} logoUrl={company.logo_url} size={18} />
                  {company.name}
                </button>
              ))}
            </div>
          ) : null}
          {shown.length ? (
            <div className="bw-room-picker__list">
              {[...days.entries()].map(([key, items]) => (
                <section key={key}>
                  <h3>{dayLabel(key)}</h3>
                  <ul>
                    {items.map(({ row, time }) => {
                      const count = counts.data?.get(row.id) ?? 0;
                      return (
                        <li key={row.id}>
                          <button
                            type="button"
                            aria-current={row.id === currentId || undefined}
                            onClick={() => {
                              close();
                              afterOverlayClose(() => {
                                onSelect({ type: "departure", id: row.id });
                                enterRoom("crossing", row.id);
                              });
                            }}
                          >
                            <time>{time}</time>
                            <span className="bw-room-picker__what">
                              <strong>{row.line}</strong>
                              <small>
                                {row.company ? (
                                  <CompanyBadge
                                    name={row.company.name}
                                    logoUrl={row.company.logo_url}
                                    size={14}
                                  />
                                ) : null}
                                {[row.company?.name, row.vessel].filter(Boolean).join(" · ") ||
                                  "Compagnie à confirmer"}
                              </small>
                            </span>
                            {count ? (
                              <b>
                                <MessagesSquare size={12} aria-hidden /> {count}
                              </b>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <p className="bw-room__empty">Aucune traversée ne correspond.</p>
          )}
          <details className="bw-room-picker__global" open={questionsFirst || lines.length === 1}>
            <summary>
              <CircleHelp size={15} aria-hidden /> Une question générale ?
            </summary>
            <div>
              {lines.map(([routeId, line]) => (
                <button
                  key={routeId}
                  type="button"
                  onClick={() => {
                    close();
                    afterOverlayClose(() => {
                      onSelect({ type: "route", id: routeId });
                      scrollTo(".bw-room--questions");
                    });
                  }}
                >
                  Questions sur {line}
                </button>
              ))}
            </div>
          </details>
        </DialogContent>
      </Dialog>
    </>
  );
}
