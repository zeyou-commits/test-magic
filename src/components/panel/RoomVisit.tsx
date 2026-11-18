import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { DoorOpen, LogOut, UserPlus } from "lucide-react";
import {
  joinRoomAsVisitor,
  leaveRoomVisit,
  visitRefusal,
  type VisitState,
} from "@/lib/ferry/roomGuests";

/**
 * Le salon d'une autre traversée : on le lit, et l'on peut y entrer « en invité » pour poser une
 * question. Tout est vérifié par la base (limites, retrait, fin) ; ici, on propose et on explique.
 */
export function RoomVisitJoin({
  room,
  visit,
  guard,
  onDone,
}: {
  room: string;
  visit: VisitState | null | undefined;
  /** Charte du salon : affichée avant d'entrer si elle n'est pas encore acceptée. */
  guard: (action: () => void) => void;
  onDone: () => void;
}) {
  const join = useMutation({
    mutationFn: () => joinRoomAsVisitor(room),
    onSuccess: onDone,
  });
  if (!visit) return null;
  if (!visit.open)
    return (
      <p className="bw-visit__note" role="status">
        {visitRefusal(visit.refused)}
      </p>
    );
  return (
    <div className="bw-visit">
      <button
        type="button"
        className="bw-visit__join"
        disabled={join.isPending}
        onClick={() => guard(() => join.mutate())}
      >
        <UserPlus size={16} aria-hidden />
        {join.isPending ? "Un instant…" : "Rejoindre en invité"}
      </button>
      <p className="bw-visit__note">
        Pour poser une question aux passagers. Vos messages porteront la mention « invité · autre
        traversée ».
      </p>
      {join.error ? (
        <p className="bw-visit__error" role="alert">
          {join.error.message}
        </p>
      ) : null}
    </div>
  );
}

/** Invité ici : on le rappelle, avec la sortie à portée de main. */
export function RoomVisitBar({ room, onDone }: { room: string; onDone: () => void }) {
  const [asked, setAsked] = useState(false);
  const leave = useMutation({
    mutationFn: () => leaveRoomVisit(room),
    onSuccess: onDone,
  });
  return (
    <div className="bw-visit__bar" role="status">
      <DoorOpen size={15} aria-hidden />
      <span>
        Vous êtes <b>invité</b> dans ce salon : 1 message par minute, sans photo ni message privé.
      </span>
      {asked ? (
        <span className="bw-visit__confirm">
          <button type="button" disabled={leave.isPending} onClick={() => leave.mutate()}>
            {leave.isPending ? "…" : "Oui, quitter"}
          </button>
          <button type="button" onClick={() => setAsked(false)}>
            Rester
          </button>
        </span>
      ) : (
        <button type="button" className="bw-visit__leave" onClick={() => setAsked(true)}>
          <LogOut size={14} aria-hidden />
          Quitter
        </button>
      )}
      {leave.error ? (
        <p className="bw-visit__error" role="alert">
          {leave.error.message}
        </p>
      ) : null}
    </div>
  );
}
