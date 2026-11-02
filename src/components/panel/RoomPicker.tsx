import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleHelp, MessagesSquare, Search } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/ferry/format";
import { pickerRows, searchRows } from "@/lib/ferry/portPassage";
import { portsQuery, routesQuery } from "@/lib/ferry/queries";
import { portTimeZone } from "@/lib/ferry/time";
import type { Selection } from "@/lib/ferry/types";

const supabase = typedSupabase as unknown as SupabaseClient;

const scrollTo = (selector: string) =>
  window.setTimeout(() => document.querySelector(selector)?.scrollIntoView(), 700);

/** Un seul bouton Salon : on choisit sa traversée, ou on passe aux questions de la ligne. */
export function RoomPicker({
  departures,
  currentId,
  onSelect,
}: {
  departures: { id: string; departure_at: string; route_id: string }[];
  currentId?: string | undefined;
  onSelect: (selection: Selection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const ids = departures.map((item) => item.id);
  const counts = useQuery({
    queryKey: ["bw-chat", "counts", ids.join(",")],
    enabled: open && ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bw_chat_counts", { p_departures: ids });
      if (error) return new Map<string, number>();
      return new Map(
        (data as { departure_id: string; messages: number }[]).map((row) => [
          row.departure_id,
          row.messages,
        ]),
      );
    },
    retry: false,
  });
  const rows = useMemo(
    () =>
      pickerRows(departures, routes, ports, (iso, port) => formatDateTime(iso, portTimeZone(port))),
    [departures, routes, ports],
  );
  const shown = searchRows(rows, text);
  const lines = [...new Map(rows.map((row) => [row.routeId, row.line])).entries()];
  if (!departures.length) return null;
  const close = () => {
    setOpen(false);
    setText("");
  };
  return (
    <>
      <button type="button" className="bw-room-open" onClick={() => setOpen(true)}>
        <MessagesSquare size={16} aria-hidden /> Salon
      </button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="bw-room-picker">
          <DialogHeader>
            <DialogTitle>Choisir votre traversée</DialogTitle>
          </DialogHeader>
          <label className="bw-room-picker__search">
            <Search size={16} aria-hidden />
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Port ou date"
              aria-label="Rechercher une traversée"
            />
          </label>
          {shown.length ? (
            <ul>
              {shown.map((row) => {
                const count = counts.data?.get(row.id) ?? 0;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      aria-current={row.id === currentId || undefined}
                      onClick={() => {
                        close();
                        onSelect({ type: "departure", id: row.id });
                        scrollTo(".bw-room");
                      }}
                    >
                      <span>
                        <strong>{row.line}</strong>
                        <small>{row.when}</small>
                      </span>
                      {count ? (
                        <b>
                          {count} message{count > 1 ? "s" : ""}
                        </b>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="bw-room__empty">Aucune traversée ne correspond.</p>
          )}
          <details className="bw-room-picker__global" open={lines.length === 1}>
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
                    onSelect({ type: "route", id: routeId });
                    scrollTo(".bw-room--questions");
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
