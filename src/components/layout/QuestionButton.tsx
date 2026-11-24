import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CircleHelp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuestionHelp } from "@/components/questions/QuestionHelp";
import { afterOverlayClose } from "@/lib/ferry/backStack";
import { OPEN_ROOM_PICKER_EVENT } from "@/lib/ferry/chatDemo";
import { tr } from "@/lib/i18n";
import { canAutoFocus, keepKeyboardClosedOnTouch } from "@/lib/utils";

/** « Demander aux voyageurs » depuis une autre page : la carte ouvre la liste des salons en arrivant. */
export const HOME_ACTION_KEY = "bledway:open-home-action";

/** La ligne « FAQ » du menu ☰ ouvre cette même fenêtre. */
export const OPEN_QUESTIONS_EVENT = "bledway:open-questions";

/**
 * « Une question ? » sur toutes les pages : les réponses de BledWay d'abord, puis voyageurs,
 * compagnie, BledWay et assistant IA. S'ouvre depuis la ligne « FAQ » du menu ☰ ; `showTrigger`
 * garde le point d'interrogation visible là où on le place.
 */
export function QuestionButton({ showTrigger = true }: { showTrigger?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_QUESTIONS_EVENT, show);
    return () => window.removeEventListener(OPEN_QUESTIONS_EVENT, show);
  }, []);
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
      {showTrigger ? (
        <button
          type="button"
          className="bw-question-button"
          aria-label={tr("ui.questionButton.uneQuestion")}
          title={tr("ui.questionButton.uneQuestion")}
          onClick={() => setOpen(true)}
        >
          <CircleHelp size={21} aria-hidden />
        </button>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onOpenAutoFocus={keepKeyboardClosedOnTouch} className="bw-room-picker bw-room-picker--questions max-w-none">
          <DialogHeader>
            <DialogTitle>{tr("ui.questionButton.uneQuestion")}</DialogTitle>
            <p className="bw-room-picker__intro">
              {tr("ui.questionButton.lesReponsesDeBledwayD")}
            </p>
          </DialogHeader>
          <div className="bw-room-picker__help">
            <QuestionHelp
              bare
              autoFocus={canAutoFocus()}
              onAskTravellers={askTravellers}
              travellersHint="Choisissez votre traversée : ses voyageurs répondent dans le salon."
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
