import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { acceptCharter, CHARTER_VERSION } from "@/lib/ferry/chat";
import { tr } from "@/lib/i18n";

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
        <DialogTitle>{tr("ui.charterGate.avantVotrePremierMessage")}</DialogTitle>
        <DialogDescription>
          {tr("ui.charterGate.lesSalonsBledwaySontFaits")}
        </DialogDescription>
        <ul>
          {CHARTER_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <p className="bw-charter__note">
          {tr("ui.charterGate.lEquipeBledwayPeutMasquer")}
        </p>
        <label className="bw-charter__check">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>
            {tr("ui.charterGate.jAiLuEtJ")}{" "}
            <a href="/charte" target="_blank" rel="noreferrer">
              {tr("ui.charterGate.charteDeLaCommunaute")}
            </a>{" "}
            {tr("ui.charterGate.etLes")}{" "}
            <a href="/conditions-utilisation" target="_blank" rel="noreferrer">
              {tr("ui.charterGate.conditionsDUtilisation")}
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
          {tr("ui.charterGate.jAccepteEtJEnvoie")}
        </button>
      </DialogContent>
    </Dialog>
  );
  return { accepted: ok, guard, dialog, version: CHARTER_VERSION };
}
