import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { enterRoom } from "@/lib/ferry/chat";
import {
  acceptRoomInvite,
  clearRoomInvite,
  PENDING_INVITE_EVENT,
  pendingRoomInvite,
} from "@/lib/ferry/roomGuests";
import { pendingTravelAction } from "@/lib/notifications/actions";

/**
 * Invitation reçue par lien et personne connectée : on l'accepte tout de suite, puis on ouvre le
 * salon. Sans compte, l'invitation attend : elle est acceptée à l'inscription, avec le premier message.
 */
export function RoomGuestAccept() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [tick, setTick] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    const sync = () => setTick((value) => value + 1);
    window.addEventListener(PENDING_INVITE_EVENT, sync);
    return () => window.removeEventListener(PENDING_INVITE_EVENT, sync);
  }, []);

  useEffect(() => {
    const invite = pendingRoomInvite();
    if (!user || !invite || busy.current) return;
    // Un message écrit avant l'inscription accepte l'invitation lui-même, avant de partir.
    const action = pendingTravelAction();
    if (action?.type === "chat" && action.invite === invite.token) return;
    busy.current = true;
    acceptRoomInvite(invite.token)
      .then(async (result) => {
        clearRoomInvite();
        await client.invalidateQueries({ queryKey: ["bw-chat"] });
        if (result.status === "guest")
          toast.success(
            result.inviter
              ? `${result.inviter} vous invite : vous pouvez écrire dans ce salon jusqu'à l'arrivée.`
              : "Invitation acceptée : vous pouvez écrire dans ce salon jusqu'à l'arrivée.",
          );
        enterRoom("crossing", result.departureId);
      })
      .catch((error: Error) => {
        clearRoomInvite();
        toast.error(error.message);
      })
      .finally(() => {
        busy.current = false;
      });
  }, [user, tick, client]);

  return null;
}
