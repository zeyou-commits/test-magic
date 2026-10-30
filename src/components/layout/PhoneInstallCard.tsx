import { useEffect, useState } from "react";

/** Ordinateur : souris et grand écran. Une tablette ou un téléphone installe directement. */
export function isDesktopBrowser() {
  return window.matchMedia("(min-width: 768px) and (hover: hover) and (pointer: fine)").matches;
}

export function isInstalledApp() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

/** QR code vers le site avec `?installer=1` : le téléphone affiche aussitôt comment l'installer. */
export function PhoneInstallCard({ text }: { text?: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(isDesktopBrowser() && !isInstalledApp()), []);
  if (!visible) return null;
  return (
    <div className="bw-phone-install">
      <img src="/install-qr.svg" alt="QR code pour installer BledWay" width={92} height={92} />
      <span>
        <strong>Emportez BledWay sur votre téléphone</strong>
        <small>
          {text ??
            "Scannez avec l’appareil photo pour installer l’application et recevoir les alertes, même au port."}
        </small>
      </span>
    </div>
  );
}
