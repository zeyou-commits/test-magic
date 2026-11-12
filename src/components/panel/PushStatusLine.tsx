import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Check, LoaderCircle, Share, SquarePlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isDesktopBrowser } from "@/components/layout/PhoneInstallCard";
import {
  devicePushState,
  disableDevicePush,
  registerPush,
  type DevicePushState,
} from "@/lib/notifications/push";
import { tr } from "@/lib/i18n";

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
  const device = isDesktopBrowser() ? "cet ordinateur" : "ce téléphone";
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
            <Check size={15} aria-hidden />{tr("ui.pushStatusLine.alertesActiveesSur")}{device}
          </p>
          {withDisable ? (
            <button type="button" className="bw-push-line__quiet" disabled={busy} onClick={() => void disable()}>
              {busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : null}{tr("ui.pushStatusLine.desactiver")}
            </button>
          ) : null}
        </>
      ) : state === "off" ? (
        <>
          <p>
            <Bell size={15} aria-hidden />{tr("ui.pushStatusLine.recevezLesAlertesDeVos")}{device}{tr("ui.pushStatusLine.memeBledwayFerme")}
          </p>
          <button type="button" disabled={busy} onClick={() => void activate()}>
            {busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : null}
            {busy ? " Activation…" : tr("ui.pushStatusLine.activer")}
          </button>
        </>
      ) : state === "denied" ? (
        <p>
          <BellOff size={15} aria-hidden />{tr("ui.pushStatusLine.alertesBloqueesParLeNavigateur")}
        </p>
      ) : state === "ios-install" ? (
        <>
          <p>
            <Bell size={15} aria-hidden />{tr("ui.pushStatusLine.surIphoneLesAlertesDemandent")}
          </p>
          <button type="button" onClick={() => setGuide(!guide)} aria-expanded={guide}>
            {tr("ui.pushStatusLine.commentFaire")}
          </button>
          {guide ? (
            <ol className="bw-push-line__guide">
              <li>
                <Share size={15} aria-hidden />{tr("ui.pushStatusLine.dansSafariTouchezLeBouton")}<strong>{tr("ui.pushStatusLine.partager")}</strong>.
              </li>
              <li>
                <SquarePlus size={15} aria-hidden />{tr("ui.pushStatusLine.choisissez")}<strong>{tr("ui.pushStatusLine.surLEcranDAccueil")}</strong>.
              </li>
              <li>
                <Bell size={15} aria-hidden />{tr("ui.pushStatusLine.ouvrezBledwayDepuisLaNouvelle")}{" "}
                <strong>{tr("ui.pushStatusLine.activer")}</strong>{tr("ui.pushStatusLine.ici")}
              </li>
            </ol>
          ) : null}
        </>
      ) : (
        <p>
          <BellOff size={15} aria-hidden />{tr("ui.pushStatusLine.ceNavigateurNeRecoitPas")}
        </p>
      )}
      {note ? <p className="bw-push-line__note">{note}</p> : null}
    </div>
  );
}
