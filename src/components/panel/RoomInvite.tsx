import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { crossingProgress } from "@/lib/ferry/crossingProgress";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { dockedSinceQuery, myTripStatusQuery } from "@/lib/ferry/presence";
import { activeInvite, activeWave, stageInvite, voyageStage } from "@/lib/ferry/roomInvites";
import { useLiveShips } from "@/lib/ferry/useLiveShips";
import type { Selection } from "@/lib/ferry/types";
import { revealBlock } from "./ActionHub";
import { chatFeedQuery } from "./LiveRoom";

const DEFAULT_LEAD_MINUTES = 240;
const CHECK_MS = 30_000;
const SETTLE_MS = 4_000;

const seenKey = (user: string, departure: string, step: string) =>
  `bledway:room-invite:${user}:${departure}:${step}`;
function alreadySeen(key: string) {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    // Sans mémoire possible, on s'abstient plutôt que de répéter la fenêtre.
    return true;
  }
}
function markSeen(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* stockage facultatif */
  }
}

/** Fenêtre dans l'appli : le salon de ma traversée, une fois par état du voyage. */
export function RoomInvite({ onSelect }: { onSelect: (selection: Selection) => void }) {
  const { user } = useAuth();
  const { trip } = useMyTrip();
  const ships = useLiveShips();
  const departureId = trip?.departure.id ?? "";
  const status = useQuery(myTripStatusQuery(departureId, user?.id)).data ?? null;
  const docked = useQuery(dockedSinceQuery(departureId)).data ?? null;
  const room = useQuery({
    ...chatFeedQuery("crossing", departureId, user?.id),
    refetchInterval: 60_000,
  }).data;
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState<{
    key: string;
    title: string;
    body: string;
    examples: string[];
  } | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CHECK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user || !trip || open || room === null || status === "arrived") return;
    if (trip.departure.status === "cancelled") return;
    const { departure } = trip;
    const live = ships.find((ship) => ship.departure.id === departure.id) ?? null;
    const progress =
      trip.from && trip.to ? crossingProgress(departure, trip.from, trip.to, live, now) : null;
    const departed =
      Boolean(departure.reported_departed_at ?? departure.web_departed_at) ||
      (progress?.trust === "live" && (progress.ratio ?? 0) > 0);
    const stage = voyageStage({
      departureAt: departure.departure_at,
      leadMinutes: DEFAULT_LEAD_MINUTES,
      departed,
      arrivedAt: departure.reported_arrived_at ?? departure.web_arrived_at ?? docked,
      postponed: Boolean(departure.reported_postponed_at),
      now,
    });
    const others = room?.messages.filter((message) => !message.me).length ?? 0;
    const wave = stage ? activeWave(others) : 0;
    const stageKey = stage ? seenKey(user.id, departure.id, stage) : null;
    const waveKey = wave ? seenKey(user.id, departure.id, `active-${wave}`) : null;
    const next =
      stage && stageKey && !alreadySeen(stageKey)
        ? { key: stageKey, ...stageInvite(stage) }
        : waveKey && !alreadySeen(waveKey)
          ? { key: waveKey, ...activeInvite(others) }
          : null;
    if (!next) return;
    // Jamais par-dessus une autre fenêtre : on réessaiera au prochain passage.
    const timer = window.setTimeout(() => {
      if (document.querySelector('[role="dialog"]')) return;
      markSeen(next.key);
      setOpen(next);
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [user, trip, open, room, status, docked, ships, now]);

  return (
    <Dialog open={open !== null} onOpenChange={(next) => (next ? null : setOpen(null))}>
      <DialogContent className="bw-room-invite">
        <span className="bw-room-invite__icon" aria-hidden>
          <MessagesSquare size={30} />
        </span>
        <DialogTitle>{open?.title}</DialogTitle>
        <DialogDescription>{open?.body}</DialogDescription>
        {open?.examples.length ? (
          <ul>
            {open.examples.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          className="bw-action-primary w-full"
          onClick={() => {
            setOpen(null);
            onSelect({ type: "departure", id: departureId });
            revealBlock(".bw-recap .bw-room", 700);
          }}
        >
          Aller au salon
        </button>
        <button type="button" className="bw-room-invite__later" onClick={() => setOpen(null)}>
          Plus tard
        </button>
      </DialogContent>
    </Dialog>
  );
}
