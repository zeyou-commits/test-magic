import { useEffect, useState } from "react";
import { LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  LOCATION_HELP_EVENT,
  currentPosition,
  locationProblem,
  type LocationProblem,
} from "@/lib/ferry/community";

/** Réglages à ouvrir : une fois la position refusée, seul le voyageur peut la rétablir. */
function deniedSteps() {
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(agent))
    return [
      "Ouvrez Réglages › Confidentialité et sécurité › Service de localisation, et activez-le.",
      "Dans la même liste, ouvrez votre navigateur (Safari ou Chrome) et choisissez « Lorsque l’app est active ».",
      "Revenez ici et touchez « Réessayer ».",
    ];
  if (/Android/.test(agent))
    return [
      "Dans la barre d’adresse, touchez l’icône à gauche de l’adresse, puis « Autorisations ».",
      "Activez « Position ». Vérifiez aussi que la localisation du téléphone est activée.",
      "Revenez ici et touchez « Réessayer ».",
    ];
  return [
    "Cliquez sur l’icône à gauche de l’adresse, dans la barre du navigateur.",
    "Autorisez « Position » pour ce site, puis rechargez la page si le navigateur le demande.",
    "Revenez ici et cliquez sur « Réessayer ».",
  ];
}

/** S'ouvre quand une action exige la position et que l'appareil ne la donne pas. */
export function LocationHelp() {
  const [problem, setProblem] = useState<LocationProblem | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const open = (event: Event) => setProblem((event as CustomEvent<LocationProblem>).detail);
    window.addEventListener(LOCATION_HELP_EVENT, open);
    return () => window.removeEventListener(LOCATION_HELP_EVENT, open);
  }, []);
  // Tant que la position n'est pas refusée, ce nouvel essai fait réapparaître la demande de l'appareil.
  const retry = async () => {
    setBusy(true);
    const here = await currentPosition(10_000);
    setBusy(false);
    if (here) {
      setProblem(null);
      toast.success("Position activée : vous pouvez renvoyer votre action.");
    } else {
      setProblem(locationProblem());
    }
  };
  return (
    <Dialog open={problem !== null} onOpenChange={(open) => !open && setProblem(null)}>
      <DialogContent className="bw-location-help">
        <DialogTitle className="flex items-center gap-2">
          <LocateFixed className="size-5 text-primary" aria-hidden /> Activez votre position
        </DialogTitle>
        <DialogDescription>
          {problem === "denied"
            ? "Le partage de position est bloqué pour BledWay sur cet appareil. Pour votre sécurité, le site ne peut pas redemander l’autorisation : il faut la rétablir une fois dans les réglages."
            : problem === "unsupported"
              ? "Cet appareil ou ce navigateur ne donne pas de position. Essayez depuis votre téléphone."
              : "Votre position n’a pas pu être trouvée. Activez la localisation de l’appareil, si possible à l’extérieur, puis réessayez."}
        </DialogDescription>
        {problem === "denied" ? (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {deniedSteps().map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Votre position sert uniquement à vérifier que vous êtes sur place. Elle n’est pas
          enregistrée.
        </p>
        {problem === "unsupported" ? null : (
          <button
            type="button"
            className="bw-report-send"
            disabled={busy}
            onClick={() => void retry()}
          >
            {busy ? "Recherche…" : "Réessayer"}
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
