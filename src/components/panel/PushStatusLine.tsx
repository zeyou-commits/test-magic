import { useEffect, useState } from "react";
import { Bell, BellOff, Check, Share, SquarePlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { pushCapability, registerPush } from "@/lib/notifications/push";

type State = "checking" | "on" | "off" | "denied" | "ios-install" | "unsupported";

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * « Alertes sur ce téléphone » : où en est cet appareil, et le geste pour les activer.
 * Sur iPhone, Apple n'envoie les alertes qu'à BledWay ouvert depuis l'écran d'accueil : on le guide.
 */
export function PushStatusLine() {
  const { user } = useAuth();
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (isIos() && !isStandalone()) return "ios-install" as const;
      const capability = pushCapability();
      if (capability === "unavailable") return "unsupported" as const;
      if (capability === "denied") return "denied" as const;
      if (capability === "prompt") return "off" as const;
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      return (await registration?.pushManager.getSubscription()) ? ("on" as const) : ("off" as const);
    };
    void check()
      .catch(() => "off" as const)
      .then((next) => !cancelled && setState(next));
    return () => {
      cancelled = true;
    };
  }, []);
  if (!user || state === "checking") return null;
  const activate = async () => {
    setBusy(true);
    try {
      const result = await registerPush(user.id);
      setState(result === "enabled" ? "on" : result === "denied" ? "denied" : "unsupported");
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bw-push-line" data-state={state}>
      {state === "on" ? (
        <p>
          <Check size={15} aria-hidden /> Alertes activées sur ce téléphone
        </p>
      ) : state === "off" ? (
        <>
          <p>
            <Bell size={15} aria-hidden /> Recevez les alertes de votre traversée sur ce téléphone.
          </p>
          <button type="button" disabled={busy} onClick={() => void activate()}>
            {busy ? "Activation…" : "Activer"}
          </button>
        </>
      ) : state === "denied" ? (
        <p>
          <BellOff size={15} aria-hidden /> Alertes bloquées : autorisez les notifications pour BledWay
          dans les réglages du navigateur.
        </p>
      ) : state === "ios-install" ? (
        <>
          <p>
            <Bell size={15} aria-hidden /> Sur iPhone, les alertes demandent d’ajouter BledWay à l’écran
            d’accueil.
          </p>
          <button type="button" onClick={() => setGuide(!guide)} aria-expanded={guide}>
            Comment faire
          </button>
          {guide ? (
            <ol className="bw-push-line__guide">
              <li>
                <Share size={15} aria-hidden /> Dans Safari, touchez le bouton <strong>Partager</strong>.
              </li>
              <li>
                <SquarePlus size={15} aria-hidden /> Choisissez <strong>Sur l’écran d’accueil</strong>.
              </li>
              <li>
                <Bell size={15} aria-hidden /> Ouvrez BledWay depuis la nouvelle icône, puis touchez{" "}
                <strong>Activer</strong> ici.
              </li>
            </ol>
          ) : null}
        </>
      ) : (
        <p>
          <BellOff size={15} aria-hidden /> Ce navigateur ne reçoit pas les alertes. Elles restent dans
          la cloche, en haut à droite.
        </p>
      )}
    </div>
  );
}
