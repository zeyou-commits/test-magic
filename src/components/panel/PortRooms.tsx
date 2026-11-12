import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, MessagesSquare } from "lucide-react";
import { enterRoom } from "@/lib/ferry/chat";
import { formatDateParts, formatDateTime } from "@/lib/ferry/format";
import { portRooms, type PortRoom } from "@/lib/ferry/portRooms";
import { portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { portTimeZone } from "@/lib/ferry/time";
import type { Departure, Selection } from "@/lib/ferry/types";
import { useRoomCounts } from "./RoomPicker";
import { tr } from "@/lib/i18n";

/**
 * Le port, porte d'entrée des salons : en avant, les traversées qui partent ou arrivent dans les
 * prochaines heures ; en dessous, les suivantes. Chaque salon vit avec sa traversée.
 */
export function PortRooms({
  portId,
  departures,
  onSelect,
}: {
  portId: string;
  departures: Departure[];
  onSelect: (selection: Selection) => void;
}) {
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { soon, later } = portRooms(portId, routes, departures);
  const counts = useRoomCounts([...soon, ...later].map((room) => room.departureId)).data;
  if (!soon.length && !later.length) return null;
  const port = ports.find((item) => item.id === portId);
  const open = (room: PortRoom) => {
    onSelect({ type: "departure", id: room.departureId });
    enterRoom("crossing", room.departureId);
  };
  const row = (room: PortRoom, highlighted: boolean) => {
    const other = ports.find((item) => item.id === room.otherPortId);
    const zone = portTimeZone(port);
    const vessel = vessels.find((item) => item.id === room.vesselId)?.name;
    const count = counts?.get(room.departureId) ?? 0;
    return (
      <li key={room.departureId}>
        <button
          type="button"
          className="bw-port-rooms__item"
          data-soon={highlighted || undefined}
          onClick={() => open(room)}
        >
          {room.kind === "departure" ? (
            <ArrowUpRight size={15} aria-hidden />
          ) : (
            <ArrowDownLeft size={15} aria-hidden />
          )}
          <span>
            <strong>
              {room.kind === "departure" ? tr("ui.portRooms.vers") : "De"} {other?.name ?? "—"}
            </strong>
            <small>
              {room.kind === "departure" ? tr("ui.portRooms.depart") : tr("ui.portRooms.arrivee")}{" "}
              {highlighted ? formatDateParts(room.at, zone).time : formatDateTime(room.at, zone)}
              {vessel ? ` · ${vessel}` : ""}
            </small>
          </span>
          <b>{count ? `${count} message${count > 1 ? "s" : ""}` : tr("ui.portRooms.salon")}</b>
        </button>
      </li>
    );
  };
  return (
    <section className="bw-port-rooms" aria-label={tr("ui.portRooms.salonsDesTraverseesDuPort")}>
      <header>
        <MessagesSquare size={17} aria-hidden />
        <h3>{tr("ui.portRooms.salonsDesTraversees")}</h3>
      </header>
      {soon.length ? (
        <>
          <p className="bw-port-rooms__hint">{tr("ui.portRooms.dansLesProchainesHeures")}</p>
          <ul>{soon.map((room) => row(room, true))}</ul>
        </>
      ) : (
        <p className="bw-port-rooms__hint">{tr("ui.portRooms.aucuneTraverseeDansLes12")}</p>
      )}
      {later.length ? (
        <details>
          <summary>{tr("ui.portRooms.traverseesSuivantes")}{later.length})</summary>
          <ul>{later.map((room) => row(room, false))}</ul>
        </details>
      ) : null}
    </section>
  );
}
