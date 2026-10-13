import { useEffect, useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { toast } from "sonner";

const SHARE_TITLE = "Batogo — traversées en ferry";

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
}: {
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const copy = async () => {
    const ok = await copyText(window.location.href);
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
      await navigator.share({ title: SHARE_TITLE, url: window.location.href });
    } catch {
      // Fenêtre de partage fermée par l'utilisateur.
    }
  };

  const base = compact
    ? "grid size-9 place-items-center rounded-full border bg-card text-muted-foreground transition hover:bg-secondary hover:text-foreground"
    : "inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-semibold text-foreground transition hover:bg-secondary";

  return (
    <div className={`flex items-center gap-1.5 ${className}`} role="group" aria-label={label}>
      <button
        type="button"
        onClick={copy}
        className={base}
        title="Copier le lien"
        aria-label="Copier le lien"
      >
        {copied ? (
          <Check className="size-4 text-success" aria-hidden />
        ) : (
          <Link2 className="size-4" aria-hidden />
        )}
        {compact ? null : copied ? "Copié" : "Copier le lien"}
      </button>
      {canShare ? (
        <button
          type="button"
          onClick={share}
          className={base}
          title="Partager"
          aria-label="Partager"
        >
          <Share2 className="size-4" aria-hidden />
          {compact ? null : "Partager"}
        </button>
      ) : null}
    </div>
  );
}
