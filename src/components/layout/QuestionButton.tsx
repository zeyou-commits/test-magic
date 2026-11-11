import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CircleHelp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuestionHelp } from "@/components/questions/QuestionHelp";
import { afterOverlayClose } from "@/lib/ferry/backStack";
import { OPEN_ROOM_PICKER_EVENT } from "@/lib/ferry/chatDemo";

/** « Demander aux voyageurs » depuis une autre page : la carte ouvre la liste des salons en arrivant. */
export const HOME_ACTION_KEY = "bledway:open-home-action";

/**
 * « Une question ? » à portée de main sur toutes les pages : les réponses de BledWay d'abord, puis
 * voyageurs, compagnie, BledWay et assistant IA. Un point d'interrogation, pas un mot de plus au menu.
 */
export function QuestionButton() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const askTravellers = () => {
    setOpen(false);
    if (window.location.pathname === "/") {
      afterOverlayClose(() => window.dispatchEvent(new Event(OPEN_ROOM_PICKER_EVENT)));
      return;
    }
    try {
      window.sessionStorage.setItem(HOME_ACTION_KEY, "salons");
    } catch {
      /* sans stockage : la carte s'ouvre simplement */
    }
    void navigate({ to: "/" });
  };
  return (
    <>
      <button
        type="button"
        className="bw-question-button"
        aria-label="Une question ?"
        title="Une question ?"
        onClick={() => setOpen(true)}
      >
        <CircleHelp size={21} aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bw-room-picker bw-room-picker--questions max-w-none">
          <DialogHeader>
            <DialogTitle>Une question ?</DialogTitle>
            <p className="bw-room-picker__intro">
              Les réponses de BledWay d'abord, puis les bons contacts si besoin.
            </p>
          </DialogHeader>
          <div className="bw-room-picker__help">
            <QuestionHelp
              bare
              autoFocus
              onAskTravellers={askTravellers}
              travellersHint="Choisissez votre traversée : ses voyageurs répondent dans le salon."
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
