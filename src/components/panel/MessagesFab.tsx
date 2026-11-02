import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { upcomingDeparturesQuery } from "@/lib/ferry/queries";
import type { Selection } from "@/lib/ferry/types";
import { enterRoom } from "@/lib/ferry/chat";
import { chatFeedQuery } from "./LiveRoom";
import { RoomPicker } from "./RoomPicker";

/** Raccourci mobile au-dessus de Signaler : mon salon, ou le choix d'une traversée. */
export function MessagesFab({ onSelect }: { onSelect: (selection: Selection) => void }) {
  const { user } = useAuth();
  const { trip } = useMyTrip();
  const [open, setOpen] = useState(false);
  const upcoming = useQuery(upcomingDeparturesQuery()).data ?? [];
  const room = useQuery({
    ...chatFeedQuery("crossing", trip?.departure.id ?? "", user?.id),
    refetchInterval: 60_000,
  }).data;
  const count = room?.messages.length ?? 0;
  return (
    <>
      <button
        type="button"
        className="bw-messages-fab"
        aria-label={count ? `Salons, ${count} messages` : "Salons"}
        onClick={() => {
          if (!trip) {
            setOpen(true);
            return;
          }
          onSelect({ type: "departure", id: trip.departure.id });
          enterRoom("crossing", trip.departure.id);
        }}
      >
        <MessagesSquare size={22} aria-hidden />
        {count ? <b>{count > 99 ? "99+" : count}</b> : null}
      </button>
      <RoomPicker
        departures={upcoming.slice(0, 60)}
        onSelect={onSelect}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
