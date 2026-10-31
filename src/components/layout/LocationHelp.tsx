import { createElement, useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  LOCATION_HELP_EVENT,
  currentPosition,
  locationProblem,
  logLocation,
  type LocationProblem,
} from "@/lib/ferry/community";
import {
  chromeIntentUrl,
  deniedSteps,
  isAndroid,
  isInAppBrowser,
  unavailableSteps,
} from "@/lib/ferry/locationHelp";

type BrowserLocationElement = HTMLElement & {
  position: GeolocationPosition | null;
  error: GeolocationPositionError | null;
  isValid?: boolean;
  invalidReason?: string;
};

/**
 * Bouton fourni par le navigateur (Chrome 144 et plus) : lui seul peut rouvrir une autorisation
 * refusée sans passer par les réglages. Un site ne peut ni lever ce blocage, ni ouvrir ces réglages.
 */
function BrowserLocationButton({
  onLocated,
  onFailed,
}: {
  onLocated: () => void;
  onFailed: (code: number) => void;
}) {
  const ref = useRef<BrowserLocationElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const handle = () => {
      if (element.position) {
        logLocation("help", "element_ok", {
          accuracyM: Math.round(element.position.coords.accuracy),
        });
        onLocated();
      } else if (element.error) {
        logLocation("help", "element_error", {
          code: element.error.code,
          message: element.error.message,
        });
        onFailed(element.error.code);
      }
    };
    element.addEventListener("location", handle);
    // Le navigateur désactive ce bouton s'il le juge masqué ou illisible : à voir dans le journal.
    const check = window.setTimeout(
      () =>
        logLocation("help", "element_shown", {
          valid: element.isValid,
          reason: element.invalidReason,
        }),
      1_500,
    );
    return () => {
      element.removeEventListener("location", handle);
      window.clearTimeout(check);
    };
  }, [onFailed, onLocated]);
  return createElement("geolocation", {
    ref,
    lang: "fr",
    accuracymode: "approximate",
    className: "bw-location-help__browser",
  });
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
  const located = useRef(() => {
    setProblem(null);
    toast.success("Position activée : vous pouvez renvoyer votre action.");
  }).current;
  const failed = useRef((code: number) => {
    setProblem(code === 1 ? "denied" : "unavailable");
    setFailedAgain(true);
  }).current;
  // Tant que la position n'est pas refusée, ce nouvel essai fait réapparaître la demande de l'appareil.
  const retry = async () => {
    setBusy(true);
    setFailedAgain(false);
    const here = await currentPosition(10_000);
    setBusy(false);
    if (here) located();
    else {
      setProblem(locationProblem());
      setFailedAgain(true);
    }
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Lien copié : collez-le dans Chrome ou Safari.");
    } catch {
      toast.error("Copie impossible : notez l’adresse de cette page.");
    }
  };
  if (problem === null) return null;

  const agent = navigator.userAgent;
  const installed = window.matchMedia("(display-mode: standalone)").matches;
  const inApp = isInAppBrowser(agent);
  const elsewhere = inApp || problem === "silent";
  const browserButton = problem === "denied" && !inApp && "HTMLGeolocationElement" in window;
  const steps = deniedSteps(agent, installed);
  const retryButton = (
    <button type="button" className="bw-report-send" disabled={busy} onClick={() => void retry()}>
      {busy ? "Recherche…" : problem === "denied" ? "J’ai changé le réglage : réessayer" : "Réessayer"}
    </button>
  );
  return (
    <Dialog open onOpenChange={(open) => !open && setProblem(null)}>
      <DialogContent className="bw-location-help">
        <DialogTitle className="flex items-center gap-2">
          <LocateFixed className="size-5 text-primary" aria-hidden /> Activez votre position
        </DialogTitle>
        <DialogDescription>
          {inApp
            ? "Vous êtes dans le navigateur intégré d’une application (Facebook, WhatsApp…), qui ne donne pas la position. Ouvrez BledWay dans Chrome ou Safari."
            : problem === "silent"
              ? "Ce navigateur ne répond pas à la demande de position. Ouvrez BledWay dans Chrome ou Safari, puis réessayez."
              : browserButton
                ? "Le partage de position est bloqué pour BledWay. Touchez ce bouton puis choisissez d’autoriser : c’est tout."
                : problem === "denied"
                  ? "Le partage de position est bloqué pour BledWay sur cet appareil. Pour votre sécurité, le site ne peut pas ouvrir ce réglage à votre place : il faut le rétablir une fois."
                  : problem === "unsupported"
                    ? "Cet appareil ou ce navigateur ne donne pas de position. Essayez depuis votre téléphone, dans Chrome ou Safari."
                    : "Votre position n’a pas pu être trouvée : la localisation du téléphone est peut-être coupée."}
        </DialogDescription>
        {elsewhere ? (
          <div className="bw-location-help__open">
            {isAndroid(agent) ? (
              <a className="bw-report-send" href={chromeIntentUrl(window.location.href)}>
                <ExternalLink size={17} aria-hidden /> Ouvrir dans Chrome
              </a>
            ) : null}
            <button type="button" onClick={() => void copyLink()}>
              <Copy size={16} aria-hidden /> Copier le lien de la page
            </button>
          </div>
        ) : null}
        {browserButton ? (
          <>
            <div className="bw-location-help__action">
              <BrowserLocationButton onLocated={located} onFailed={failed} />
            </div>
            <details className="bw-location-help__more">
              <summary>Le bouton ne marche pas ?</summary>
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                {steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {retryButton}
            </details>
          </>
        ) : problem === "denied" && !inApp ? (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : problem === "unavailable" && !inApp ? (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {unavailableSteps(agent).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : null}
        {failedAgain ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {problem === "denied"
              ? "La position est toujours bloquée sur cet appareil."
              : "Toujours pas de position sur cet appareil."}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Votre position sert uniquement à vérifier que vous êtes sur place. Elle n’est pas
          enregistrée.
        </p>
        {problem === "unsupported" || browserButton ? null : retryButton}
      </DialogContent>
    </Dialog>
  );
}
