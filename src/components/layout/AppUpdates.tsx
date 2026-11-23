import { useEffect } from "react";

const buildKey = "bledway:build-version";

/**
 * Le site reste à jour tout seul : le service worker est enregistré (hors ligne, notifications) et
 * une nouvelle version publiée recharge la page au retour sur l'onglet. Plus aucune invitation à
 * installer l'appli depuis le navigateur : l'application arrive sur le Play Store.
 */
export function AppUpdates() {
  useEffect(() => {
    // Chrome sur Android afficherait sinon sa propre bannière « Ajouter à l'écran d'accueil ».
    const noInstallBanner = (event: Event) => event.preventDefault();
    window.addEventListener("beforeinstallprompt", noInstallBanner);
    let registration: ServiceWorkerRegistration | null = null;
    let stopped = false;
    const update = () => {
      if (document.visibilityState === "visible" && registration) void registration.update();
    };
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((current) => {
          if (stopped) return;
          registration = current;
          update();
        })
        .catch(() => {});
    }
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);

    let checking = false;
    const checkBuild = async () => {
      if (!import.meta.env.PROD || checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const response = await fetch("/build-version.json", { cache: "no-store" });
        if (!response.ok) return;
        const { version } = (await response.json()) as { version?: string };
        if (!version) return;
        const previous = window.sessionStorage.getItem(buildKey);
        window.sessionStorage.setItem(buildKey, version);
        if (previous && previous !== version) window.location.reload();
      } catch {
        // L'application reste utilisable hors connexion ; un nouvel essai aura lieu au retour.
      } finally {
        checking = false;
      }
    };
    void checkBuild();
    document.addEventListener("visibilitychange", checkBuild);
    window.addEventListener("pageshow", checkBuild);
    return () => {
      stopped = true;
      window.removeEventListener("beforeinstallprompt", noInstallBanner);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", checkBuild);
      window.removeEventListener("pageshow", checkBuild);
    };
  }, []);
  return null;
}
