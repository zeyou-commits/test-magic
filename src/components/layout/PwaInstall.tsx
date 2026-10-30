import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { isDesktopBrowser, PhoneInstallCard } from "./PhoneInstallCard";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const dismissedKey = "bledway:pwa-dismissed-at";
const buildKey = "bledway:build-version";

/** Invite à l'installation uniquement lorsque le navigateur le permet. */
export function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [desktop, setDesktop] = useState(false);
  const [desktopReady, setDesktopReady] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const lastDismissed = Number(window.localStorage.getItem(dismissedKey) || 0);
    // Arrivée par le QR code : on montre comment installer, même après un ancien refus.
    const fromQr = new URLSearchParams(window.location.search).has("installer");
    setDismissed(
      standalone ||
        window.location.pathname === "/auth" ||
        (!fromQr && Date.now() - lastDismissed < 7 * 24 * 60 * 60 * 1000),
    );
    const onDesktop = isDesktopBrowser();
    setDesktop(onDesktop);
    setManual(fromQr && !onDesktop);
    // Sur ordinateur, on laisse le temps de découvrir le site avant de proposer le téléphone.
    const desktopTimer = window.setTimeout(() => setDesktopReady(true), 30_000);
    setShowIos(/iPhone|iPad|iPod/.test(navigator.userAgent) && !standalone);
    const onInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setPrompt(null);
      setShowIos(false);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("appinstalled", onInstalled);

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
      window.clearTimeout(desktopTimer);
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("appinstalled", onInstalled);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", checkBuild);
      window.removeEventListener("pageshow", checkBuild);
    };
  }, []);

  if (dismissed || (desktop ? !desktopReady : !prompt && !showIos && !manual)) return null;
  return (
    <aside
      className="fixed bottom-20 left-4 right-4 z-[90] mx-auto max-w-sm rounded-2xl border border-primary/15 bg-card p-4 shadow-2xl md:bottom-5 md:left-auto md:right-5"
      aria-label="Installer BledWay"
    >
      <div className="flex items-start gap-3">
        {desktop ? (
          <div className="min-w-0 flex-1">
            <PhoneInstallCard />
          </div>
        ) : (
          <>
            <img src="/pwa-icon-192.png" alt="" className="size-11 rounded-xl" />
            <div className="min-w-0 flex-1">
              <strong className="block text-sm text-foreground">BledWay à portée de main</strong>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {showIos && !prompt
                  ? "Sur iPhone, touchez Partager puis « Sur l’écran d’accueil »."
                  : prompt
                    ? "Retrouvez la carte et vos traversées depuis votre écran d’accueil."
                    : "Ouvrez le menu de votre navigateur (⋮), puis « Installer l’application » ou « Ajouter à l’écran d’accueil »."}
              </p>
            </div>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem(dismissedKey, String(Date.now()));
            setDismissed(true);
          }}
          aria-label="Masquer la proposition d’installation"
          className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-secondary"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      {prompt ? (
        <button
          type="button"
          onClick={() => {
            void prompt
              .prompt()
              .then(() => prompt.userChoice)
              .then(() => setPrompt(null));
          }}
          className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
        >
          <Download size={16} aria-hidden /> {desktop ? "Installer aussi sur cet ordinateur" : "Installer BledWay"}
        </button>
      ) : null}
    </aside>
  );
}
