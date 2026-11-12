import { useEffect, useState } from "react";
import { Check, Link2, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { tr } from "@/lib/i18n";

const SHARE_TITLE = "BledWay — traversées en ferry";
const PUBLIC_ORIGIN = "https://www.bledway.com";

/** Lien stable : domaine public en production, origine courante en aperçu/local. */
export function stableShareUrl(href: string) {
  try {
    const u = new URL(href);
    if (
      /(^|\.)bledway\.com$/.test(u.hostname) ||
      (u.hostname.endsWith(".lovable.app") && !u.hostname.includes("preview"))
    ) {
      return `${PUBLIC_ORIGIN}${u.pathname}${u.search}`;
    }
    return u.toString();
  } catch {
    return href;
  }
}

export function whatsappUrl(text: string, url: string) {
  return `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Contexte non sécurisé ou permission refusée : repli par champ temporaire.
    try {
      const field = document.createElement("textarea");
      field.value = text;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand("copy");
      field.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Partage de la page courante (l'adresse contient la recherche) : copier le lien + partage natif mobile. */
export function ShareButtons({
  label = "Partager",
  compact = false,
  className = "",
  title = SHARE_TITLE,
  text,
  getUrl,
}: {
  label?: string;
  compact?: boolean;
  className?: string;
  title?: string;
  /** Résumé partagé (trajet, date, heures locales, nature de l'information). */
  text?: string;
  getUrl?: () => string;
}) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const copy = async () => {
    const ok = await copyText(stableShareUrl(getUrl?.() ?? window.location.href));
    if (ok) {
      setCopied(true);
      toast.success("Lien copié");
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Copie impossible : copiez l'adresse depuis la barre du navigateur.");
    }
  };

  const share = async () => {
    try {
      await navigator.share({
        title,
        ...(text ? { text } : {}),
        url: stableShareUrl(getUrl?.() ?? window.location.href),
      });
    } catch {
      // Fenêtre de partage fermée par l'utilisateur.
    }
  };

  const base = compact
    ? "grid size-7 place-items-center rounded-full border bg-card text-muted-foreground transition hover:bg-secondary hover:text-foreground"
    : "inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-semibold text-foreground transition hover:bg-secondary";

  // En-tête de fiche : un seul bouton, le partage de l'appareil ; à défaut, la copie du lien.
  if (compact)
    return (
      <button
        type="button"
        onClick={() => void (canShare ? share() : copy())}
        className={`${base} ${className}`}
        title={label}
        aria-label={label}
      >
        {copied ? (
          <Check className="size-3.5 text-success" aria-hidden />
        ) : (
          <Share2 className="size-3.5" aria-hidden />
        )}
      </button>
    );

  return (
    <div className={`flex items-center gap-1.5 ${className}`} role="group" aria-label={label}>
      <button
        type="button"
        onClick={copy}
        className={base}
        title={tr("ui.shareButtons.copierLeLien")}
        aria-label={tr("ui.shareButtons.copierLeLien")}
      >
        {copied ? (
          <Check className="size-3.5 text-success" aria-hidden />
        ) : (
          <Link2 className="size-3.5" aria-hidden />
        )}
        {compact ? null : copied ? tr("ui.shareButtons.copie") : tr("ui.shareButtons.copierLeLien")}
      </button>
      {canShare ? (
        <button
          type="button"
          onClick={share}
          className={base}
          title={tr("ui.shareButtons.partager")}
          aria-label={tr("ui.shareButtons.partager")}
        >
          <Share2 className="size-3.5" aria-hidden />
          {compact ? null : tr("ui.shareButtons.partager")}
        </button>
      ) : null}
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          window.open(
            whatsappUrl(text ?? title, stableShareUrl(getUrl?.() ?? window.location.href)),
            "_blank",
            "noopener,noreferrer",
          );
        }}
        className={base}
        title={tr("ui.shareButtons.envoyerSurWhatsapp")}
        aria-label={tr("ui.shareButtons.envoyerSurWhatsapp")}
      >
        <MessageCircle className="size-3.5" aria-hidden />
        {compact ? null : tr("ui.shareButtons.whatsapp")}
      </a>
    </div>
  );
}
