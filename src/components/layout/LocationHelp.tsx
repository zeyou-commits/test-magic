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

/** Navigateur intégré à une appli (Facebook, Instagram, WhatsApp…) : la position y marche rarement. */
function inAppBrowser() {
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Snapchat|TikTok|musical_ly|Line\/|; wv\)/.test(agent);
}

/** Réglages à ouvrir : une fois la position refusée, seul le voyageur peut la rétablir. */
function deniedSteps() {
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  // Application installée : il n'y a pas de barre d'adresse, tout passe par les réglages du téléphone.
  const installed =
    typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;
  if (installed && /Android/.test(agent))
    return [
      "Restez appuyé sur l’icône BledWay de votre écran d’accueil, puis touchez « Infos sur l’application » (ⓘ).",
      "Ouvrez « Autorisations », puis « Position », et choisissez « Autoriser ». Si vous ne la trouvez pas, faites de même pour votre navigateur (Chrome).",
      "Vérifiez que la localisation du téléphone est activée, revenez ici et touchez « Réessayer ».",
    ];
  if (installed && /iPhone|iPad|iPod/.test(agent))
    return [
      "Ouvrez Réglages › Confidentialité et sécurité › Service de localisation, et activez-le.",
      "Dans la liste, ouvrez « Sites web Safari » et choisissez « Lorsque l’app est active ».",
      "Revenez ici et touchez « Réessayer ». Si besoin, fermez puis rouvrez BledWay.",
    ];
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
  const [failedAgain, setFailedAgain] = useState(false);
  useEffect(() => {
    const open = (event: Event) => {
      setFailedAgain(false);
      setProblem((event as CustomEvent<LocationProblem>).detail);
    };
    window.addEventListener(LOCATION_HELP_EVENT, open);
    return () => window.removeEventListener(LOCATION_HELP_EVENT, open);
  }, []);
  // Tant que la position n'est pas refusée, ce nouvel essai fait réapparaître la demande de l'appareil.
  const retry = async () => {
    setBusy(true);
    setFailedAgain(false);
    const here = await currentPosition(10_000);
    setBusy(false);
    if (here) {
      setProblem(null);
      toast.success("Position activée : vous pouvez renvoyer votre action.");
    } else {
      setProblem(locationProblem());
      setFailedAgain(true);
    }
  };
  const inApp = inAppBrowser();
  return (
    <Dialog open={problem !== null} onOpenChange={(open) => !open && setProblem(null)}>
      <DialogContent className="bw-location-help">
        <DialogTitle className="flex items-center gap-2">
          <LocateFixed className="size-5 text-primary" aria-hidden /> Activez votre position
        </DialogTitle>
        <DialogDescription>
          {inApp
            ? "Vous êtes dans le navigateur intégré d’une application (Facebook, WhatsApp…), qui ne donne pas la position. Ouvrez BledWay dans Chrome ou Safari : touchez le menu (⋮ ou …), puis « Ouvrir dans le navigateur »."
            : problem === "silent"
            ? "Ce navigateur ne répond pas à la demande de position. Fermez cette page, ouvrez BledWay dans Chrome ou Safari, puis réessayez."
            : problem === "denied"
            ? "Le partage de position est bloqué pour BledWay sur cet appareil. Pour votre sécurité, le site ne peut pas redemander l’autorisation : il faut la rétablir une fois dans les réglages."
            : problem === "unsupported"
              ? "Cet appareil ou ce navigateur ne donne pas de position. Essayez depuis votre téléphone."
              : "Votre position n’a pas pu être trouvée. Activez la localisation de l’appareil (sur ordinateur : Paramètres › Confidentialité › Localisation), si possible à l’extérieur, puis réessayez."}
        </DialogDescription>
        {problem === "denied" && !inApp ? (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {deniedSteps().map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : null}
        {failedAgain ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            Toujours pas de position sur cet appareil.
          </p>
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
