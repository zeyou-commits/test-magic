import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { acceptCharter, CHARTER_VERSION } from "@/lib/ferry/chat";

/** Les règles affichées avant le premier message : celles de la charte, en bref. */
export const CHARTER_RULES = [
  "Je reste courtois : pas d'insulte, de moquerie ni de propos haineux.",
  "Je ne publie ni numéro, ni adresse, ni lien, ni publicité.",
  "Je partage ce que je vois vraiment ; seule la compagnie confirme un départ.",
  "Face à un message gênant, je le signale au lieu d'y répondre.",
  "Mes photos ne montrent ni visage reconnaissable ni plaque lisible, et j'ai le droit de les publier.",
];

/**
 * Avant le premier message d'un compte, la charte s'affiche une fois. Le message écrit est gardé
 * et part dès l'acceptation. Le serveur refuse de toute façon un message sans charte acceptée.
 */
export function useCharterGate(accepted: boolean | undefined) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const [done, setDone] = useState(false);
  const ok = accepted || done;
  const guard = (action: () => void) => {
    if (ok) return action();
    pending.current = action;
    setProblem(null);
    setOpen(true);
  };
  const accept = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await acceptCharter();
      setDone(true);
      setOpen(false);
      void client.invalidateQueries({ queryKey: ["bw-chat"] });
      pending.current?.();
      pending.current = null;
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  };
  const dialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bw-charter">
        <ShieldCheck size={30} className="bw-charter__icon" aria-hidden />
        <DialogTitle>Avant votre premier message</DialogTitle>
        <DialogDescription>
          Les salons BledWay sont faits pour s'entraider entre voyageurs. Quelques règles, pour que
          ça le reste :
        </DialogDescription>
        <ul>
          {CHARTER_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <p className="bw-charter__note">
          L'équipe BledWay peut masquer un message et suspendre un compte qui ne respecte pas ces
          règles.
        </p>
        <label className="bw-charter__check">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>
            J'ai lu et j'accepte la{" "}
            <a href="/charte" target="_blank" rel="noreferrer">
              charte de la communauté
            </a>{" "}
            et les{" "}
            <a href="/conditions-utilisation" target="_blank" rel="noreferrer">
              conditions d'utilisation
            </a>
            .
          </span>
        </label>
        {problem ? (
          <p role="alert" className="bw-charter__error">
            {problem}
          </p>
        ) : null}
        <button
          type="button"
          className="bw-action-primary w-full"
          disabled={!checked || busy}
          onClick={() => void accept()}
        >
          J'accepte et j'envoie
        </button>
      </DialogContent>
    </Dialog>
  );
  return { accepted: ok, guard, dialog, version: CHARTER_VERSION };
}
