import { Link } from "@tanstack/react-router";
import { Share2 } from "lucide-react";

/**
 * Au début, pendant ou à la fin : la préparation en une page aux couleurs de BledWay, à envoyer
 * en lien (consultable sans compte) ou à télécharger en PDF.
 */
export function SharePreparation({ compact = false }: { compact?: boolean }) {
  if (compact)
    return (
      <Link
        to="/ma-preparation"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold hover:bg-secondary"
      >
        <Share2 size={14} aria-hidden /> Partager · PDF
      </Link>
    );
  return (
    <Link
      to="/ma-preparation"
      className="mt-4 flex items-center gap-3 rounded-2xl border border-primary/25 bg-white p-3.5 text-left shadow-sm transition hover:border-primary"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Share2 size={18} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <strong className="block text-sm">Partager ma préparation</strong>
        <small className="block text-xs text-muted-foreground">
          Une page claire pour la famille : lien à envoyer ou PDF à imprimer.
        </small>
      </span>
    </Link>
  );
}
