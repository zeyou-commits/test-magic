import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Check, LoaderCircle, Share, SquarePlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  devicePushState,
  disableDevicePush,
  registerPush,
  type DevicePushState,
} from "@/lib/notifications/push";

/**
 * « Alertes sur ce téléphone » : l'état réel de cet appareil pour le compte connecté,
 * et un seul geste à la fois (Activer, ou Désactiver dans l'espace voyageur).
 * Sur iPhone, Apple n'envoie les alertes qu'à BledWay ouvert depuis l'écran d'accueil : on le guide.
 */
export function PushStatusLine({ withDisable = false }: { withDisable?: boolean }) {
  const { user } = useAuth();
  const [state, setState] = useState<DevicePushState | "checking">("checking");
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState(false);
  const [note, setNote] = useState("");
  const refresh = useCallback(async () => {
    if (!user) return;
    setState(await devicePushState(user.id).catch(() => "off" as const));
  }, [user]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  if (!user || state === "checking") return null;
  const activate = async () => {
    setBusy(true);
    setNote("");
    try {
      const result = await registerPush(user.id);
      if (result === "denied") setNote("Le navigateur a refusé. Autorisez les notifications pour BledWay dans ses réglages.");
      await refresh();
    } catch {
      setNote("L’activation n’a pas abouti. Réessayez.");
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    setNote("");
    try {
      await disableDevicePush(user.id);
      await refresh();
    } catch {
      setNote("La désactivation n’a pas abouti. Réessayez.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bw-push-line" data-state={state}>
      {state === "on" ? (
        <>
          <p>
            <Check size={15} aria-hidden /> Alertes activées sur ce téléphone
          </p>
          {withDisable ? (
            <button type="button" className="bw-push-line__quiet" disabled={busy} onClick={() => void disable()}>
              {busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : null} Désactiver
            </button>
          ) : null}
        </>
      ) : state === "off" ? (
        <>
          <p>
            <Bell size={15} aria-hidden /> Recevez les alertes de vos traversées sur ce téléphone, même
            BledWay fermé.
          </p>
          <button type="button" disabled={busy} onClick={() => void activate()}>
            {busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : null}
            {busy ? " Activation…" : "Activer"}
          </button>
        </>
      ) : state === "denied" ? (
        <p>
          <BellOff size={15} aria-hidden /> Alertes bloquées par le navigateur : autorisez les
          notifications pour BledWay dans ses réglages, puis revenez ici.
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
      {note ? <p className="bw-push-line__note">{note}</p> : null}
    </div>
  );
}
