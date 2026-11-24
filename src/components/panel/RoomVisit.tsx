import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { DoorOpen, LogOut, UserPlus } from "lucide-react";
import {
  joinRoomAsVisitor,
  leaveRoomVisit,
  visitRefusal,
  type VisitState,
} from "@/lib/ferry/roomGuests";
import { tr } from "@/lib/i18n";

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
        {join.isPending ? tr("ui.roomVisit.unInstant") : tr("ui.roomVisit.rejoindreEnInvite")}
      </button>
      <p className="bw-visit__note">
        {tr("ui.roomVisit.pourPoserUneQuestionAux")}
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
        {tr("ui.roomVisit.vousEtes")}<b>{tr("ui.roomVisit.invite")}</b>{tr("ui.roomVisit.dansCeSalon1Message")}
      </span>
      {asked ? (
        <span className="bw-visit__confirm">
          <button type="button" disabled={leave.isPending} onClick={() => leave.mutate()}>
            {leave.isPending ? "…" : tr("ui.roomVisit.ouiQuitter")}
          </button>
          <button type="button" onClick={() => setAsked(false)}>
            {tr("ui.roomVisit.rester")}
          </button>
        </span>
      ) : (
        <button type="button" className="bw-visit__leave" onClick={() => setAsked(true)}>
          <LogOut size={14} aria-hidden />
          {tr("ui.roomVisit.quitter")}
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
