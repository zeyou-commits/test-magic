import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/**
 * Mise en page commune des pages d'information (confidentialité, conditions, mentions) :
 * un sommaire cliquable, puis des sections courtes et numérotées.
 */
export function LegalSections({
  sections,
  updated,
}: {
  sections: { id: string; title: string; body: ReactNode }[];
  /** Date de dernière mise à jour, affichée en tête. */
  updated: string;
}) {
  return (
    <div className="mx-auto mt-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
      <p className="text-xs">Dernière mise à jour : {updated}</p>
      <nav aria-label="Sommaire" className="mt-4 rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Sommaire</p>
        <ol className="mt-2 grid gap-1 sm:grid-cols-2">
          {sections.map((section, index) => (
            <li key={section.id}>
              <a className="hover:text-primary hover:underline" href={`#${section.id}`}>
                {index + 1}. {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="mt-6 space-y-7">
        {sections.map((section, index) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="text-base font-semibold text-foreground">
              {index + 1}. {section.title}
            </h2>
            <div className="mt-2 space-y-2 [&_li]:ml-4 [&_li]:list-disc">{section.body}</div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Lien interne souligné, pour le corps des pages. */
export function PageLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to as never} className="font-medium text-primary underline underline-offset-2">
      {children}
    </Link>
  );
}

export const LEGAL_UPDATED = "novembre 2026";
