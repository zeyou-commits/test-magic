import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { UserPlus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { copyText, stableShareUrl } from "./ShareButtons";
import { tr } from "@/lib/i18n";
import { createRoomInvite } from "@/lib/ferry/roomGuests";

/** Distance (px) du glissé vers le bas au-delà de laquelle le salon se ferme. */
const SWIPE_CLOSE = 110;

/** L'adresse qui ouvre directement ce salon : la fiche de la traversée (ou du port), puis le salon.
 * Avec une invitation personnelle, la personne invitée pourra aussi y écrire. */
export function roomInviteUrl(kind: "crossing" | "port", room: string, token?: string | null) {
  const params = new URLSearchParams({
    select: kind === "crossing" ? "departure" : "port",
    id: room,
    room: "1",
  });
  if (token) params.set("invite", token);
  return stableShareUrl(`${window.location.origin}/?${params}`);
}

async function inviteToRoom(
  kind: "crossing" | "port",
  room: string,
  title: string,
  token: string | null,
  container: HTMLElement,
) {
  // Passager : un lien personnel qui donne le droit d'écrire ; sinon, le lien du salon à lire.
  const url = roomInviteUrl(kind, room, token);
  const line = title.replace(/^Salon · /, "");
  const text = token
    ? `Je t'invite dans le salon de ma traversée sur BledWay (${line}) : tu pourras y écrire et suivre le navire en direct jusqu'à l'arrivée.`
    : kind === "crossing"
      ? `Rejoins-moi dans le salon de cette traversée sur BledWay (${line}) : on y suit le navire en direct.`
      : `Rejoins-moi sur BledWay, dans le salon « ${title} ».`;
  // Téléphone : la feuille de partage (WhatsApp, SMS…). Ordinateur : le lien copié, plus sûr.
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Salon BledWay", text, url });
      return;
    } catch (error) {
      // Partage annulé par la personne : rien à faire.
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  const dialog = container.closest<HTMLElement>('[role="dialog"]') ?? document.body;
  if (await copyText(`${text}\n${url}`, dialog))
    toast.success("Lien d'invitation copié : collez-le dans un message.");
  else toast.error("Impossible de copier le lien. Réessayez.");
}

/**
 * Le salon ouvert en grand : sur téléphone, un volet qui monte du bas et se referme d'un glissé
 * vers le bas (poignée et en-tête) ; sur ordinateur, la même fenêtre qu'avant.
 * En haut à droite : inviter un proche (partage d'un lien qui ouvre ce salon).
 */
export function RoomSheet({
  open,
  onOpenChange,
  kind,
  room,
  title,
  canInvite = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "crossing" | "port";
  room: string;
  title: string;
  /** Passager de cette traversée (ou équipe) : son lien permet à l'invité d'écrire. */
  canInvite?: boolean;
  children: ReactNode;
}) {
  const [drag, setDrag] = useState(0);
  // Préparé à l'ouverture : la feuille de partage du téléphone doit s'ouvrir dès le toucher.
  const { data: invite } = useQuery({
    queryKey: ["bw-room-invite-mine", room],
    queryFn: () => createRoomInvite(room),
    enabled: open && canInvite && kind === "crossing",
    staleTime: Infinity,
    retry: false,
  });
  const start = useRef<{ y: number; x: number; vertical: boolean | null } | null>(null);

  const onTouchStart = (event: TouchEvent) => {
    const target = event.target as HTMLElement;
    // Seuls la poignée et l'en-tête tirent le volet : la conversation garde son défilement.
    if (!target.closest(".bw-chat-sheet__grip, .bw-chat__head")) return;
    if (target.closest("button, a, input")) return;
    const point = event.touches[0];
    if (point) start.current = { y: point.clientY, x: point.clientX, vertical: null };
  };
  const onTouchMove = (event: TouchEvent) => {
    const from = start.current;
    const point = event.touches[0];
    if (!from || !point) return;
    const dy = point.clientY - from.y;
    const dx = point.clientX - from.x;
    if (from.vertical === null && Math.abs(dx) + Math.abs(dy) > 8)
      from.vertical = Math.abs(dy) > Math.abs(dx);
    if (from.vertical) setDrag(Math.max(0, dy));
  };
  const onTouchEnd = () => {
    if (!start.current) return;
    start.current = null;
    if (drag > SWIPE_CLOSE) onOpenChange(false);
    setDrag(0);
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setDrag(0);
        onOpenChange(next);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="bw-chat-sheet__overlay" />
        <DialogPrimitive.Content
          className="bw-chat-window bw-chat-sheet"
          data-dragging={drag > 0 || undefined}
          style={drag ? { transform: `translateY(${drag}px)` } : undefined}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <span className="bw-chat-sheet__grip" aria-hidden />
          {children}
          <div className="bw-chat-sheet__actions">
            <button
              type="button"
              className="bw-chat-sheet__invite"
              aria-label={tr("ui.roomSheet.inviter")}
              title={tr("ui.roomSheet.inviter")}
              onClick={(event) =>
                void inviteToRoom(kind, room, title, invite ?? null, event.currentTarget)
              }
            >
              <UserPlus size={20} aria-hidden />
            </button>
            {/* Ordinateur : la croix reste à côté ; sur téléphone, le glissé vers le bas ferme. */}
            <DialogPrimitive.Close className="bw-chat-sheet__close" aria-label={tr("ui.roomSheet.fermer")}>
              <X size={18} aria-hidden />
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
