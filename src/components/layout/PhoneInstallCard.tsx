import { useEffect, useState } from "react";
import { tr } from "@/lib/i18n";

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
      <img src="/install-qr.svg" alt={tr("ui.phoneInstallCard.qrCodePourInstallerBledway")} width={92} height={92} />
      <span>
        <strong>{tr("ui.phoneInstallCard.emportezBledwaySurVotreTelephone")}</strong>
        <small>
          {text ??
            tr("ui.phoneInstallCard.scannezAvecLAppareilPhoto")}
        </small>
      </span>
    </div>
  );
}
