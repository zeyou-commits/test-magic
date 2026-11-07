import { useState } from "react";
import type { ReactNode } from "react";
import {
  absoluteUrl,
  breadcrumbSchema,
  displayDate,
  EDITORIAL_DATE,
  jsonLdString,
} from "@/lib/seo/site";
import { sources } from "@/content/sources";
import type { Section } from "@/content/types";

export const primaryLink =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary";
export const textLink =
  "font-semibold text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary";

export function StructuredData({ value }: { value: unknown }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(value) }} />
  );
}
export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  return (
    <>
      <StructuredData value={breadcrumbSchema(items)} />
      <nav aria-label="Fil d'Ariane" className="mt-6 text-sm text-muted-foreground">
        <ol className="flex flex-wrap gap-x-2 gap-y-1">
          <li>
            <a href="/" className="hover:text-primary">
              Accueil
            </a>
          </li>
          {items.map((item, i) => (
            <li key={item.path} className="flex gap-2">
              <span aria-hidden="true">/</span>
              {i === items.length - 1 ? (
                <span aria-current="page">{item.name}</span>
              ) : (
                <a href={item.path} className="hover:text-primary">
                  {item.name}
                </a>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
/**
 * Introduction de page : en entier sur ordinateur ; sur téléphone, 2 lignes puis « Lire la suite »
 * (le texte reste dans la page, lu par les moteurs de recherche).
 */
export function ClampedIntro({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`bw-clamp ${className}`} data-open={open || undefined}>
      <p>{children}</p>
      {open ? null : (
        <button type="button" className="bw-clamp__more" onClick={() => setOpen(true)}>
          Lire la suite
        </button>
      )}
    </div>
  );
}

export function EditorialHero({
  label,
  title,
  intro,
}: {
  label: string;
  title: string;
  intro: string;
}) {
  return (
    <header className="max-w-4xl py-6 md:py-14">
      <p className="text-xs font-bold uppercase tracking-widest text-primary">{label}</p>
      <h1 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight md:text-5xl">
        {title}
      </h1>
      <ClampedIntro className="mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground md:mt-5">
        {intro}
      </ClampedIntro>
    </header>
  );
}
export function AnswerBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-5 md:p-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">
        Le repère utile
      </p>
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
/** Questions visibles et balisage FAQPage : les deux viennent toujours de la même liste. */
export function FaqSection({
  faq,
  path,
  title = "Questions fréquentes",
}: {
  faq: { q: string; a: string }[];
  path: string;
  title?: string;
}) {
  if (!faq.length) return null;
  return (
    <section id="questions" className="mt-10">
      <FaqSchema faq={faq} path={path} />
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      <div className="mt-4 divide-y rounded-xl border">
        {faq.map((item) => (
          <details key={item.q} className="group px-5 py-4">
            <summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-primary">
              {item.q}
            </summary>
            <p className="mt-3 leading-7 text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
export function FaqSchema({ faq, path }: { faq: { q: string; a: string }[]; path: string }) {
  return (
    <StructuredData
      value={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        url: absoluteUrl(path),
        inLanguage: "fr",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      }}
    />
  );
}
export function SourceList({ ids }: { ids: string[] }) {
  return (
    <section id="sources" className="mt-10 scroll-mt-20 border-t pt-6">
      <h2 className="font-display text-xl font-bold">Sources et vérification</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Sélection documentaire mise à jour le{" "}
        <time dateTime={EDITORIAL_DATE}>{displayDate(EDITORIAL_DATE)}</time>. Les règles, accès et
        services peuvent évoluer.
      </p>
      <ul className="mt-4 space-y-4">
        {ids.map((id) => {
          const source = sources[id];
          return source ? (
            <li key={id}>
              <a
                href={source.url}
                className={`${textLink} text-sm`}
                rel="noreferrer"
                target="_blank"
              >
                {source.name}
                <span className="sr-only"> (nouvel onglet)</span>
              </a>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{source.note}</p>
            </li>
          ) : null;
        })}
      </ul>
      <p className="mt-5 text-sm">
        <a href="/methode-editoriale" className={textLink}>
          Notre méthode et les limites des informations
        </a>{" "}
        ·{" "}
        <a href="/contact" className={textLink}>
          Contact et signalements
        </a>
      </p>
    </section>
  );
}
export function ContentSection({ section }: { section: Section }) {
  return (
    <section id={section.id} className="mt-10 scroll-mt-20">
      <h2 className="font-display text-2xl font-bold tracking-tight">{section.title}</h2>
      {section.paragraphs.map((p, i) => (
        <p key={i} className="mt-4 leading-7 text-muted-foreground">
          {p}
        </p>
      ))}
      {section.bullets ? (
        <ul className="mt-4 list-disc space-y-3 pl-5 leading-7 text-muted-foreground">
          {section.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {section.table ? (
        <div
          role="region"
          aria-label={section.title}
          tabIndex={0}
          className="mt-5 overflow-x-auto rounded-xl border focus-visible:outline-2 focus-visible:outline-primary"
        >
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary">
              <tr>
                {section.table.headers.map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {section.table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) =>
                    j === 0 ? (
                      <th key={j} scope="row" className="min-w-32 px-4 py-3 align-top font-medium">
                        {cell}
                      </th>
                    ) : (
                      <td
                        key={j}
                        className="min-w-48 px-4 py-3 align-top leading-relaxed text-muted-foreground"
                      >
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
export function ReadingLayout({
  sections,
  children,
}: {
  sections: Section[];
  children: ReactNode;
}) {
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-12">
      <div className="min-w-0">{children}</div>
      <aside className="order-first rounded-xl border bg-card p-5 lg:sticky lg:top-20 lg:order-last">
        <nav aria-label="Sommaire du dossier">
          <p className="font-semibold">Dans ce dossier</p>
          <ul className="mt-3 space-y-3 text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="leading-relaxed text-muted-foreground hover:text-primary"
                >
                  {s.title}
                </a>
              </li>
            ))}
            <li>
              <a href="#sources" className="text-primary">
                Sources et vérification
              </a>
            </li>
          </ul>
        </nav>
        <a href="/horaires" className={`${primaryLink} mt-6 w-full`}>
          Voir les départs
        </a>
        <a
          href="/simulateurs"
          className="mt-3 block text-center text-sm font-semibold text-primary"
        >
          Calculer mon budget
        </a>
      </aside>
    </div>
  );
}
export function CollectionSchema({
  path,
  name,
  items,
}: {
  path: string;
  name: string;
  items: { path: string; name: string }[];
}) {
  return (
    <StructuredData
      value={{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name,
        url: absoluteUrl(path),
        inLanguage: "fr",
        mainEntity: {
          "@type": "ItemList",
          itemListElement: items.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            url: absoluteUrl(item.path),
          })),
        },
      }}
    />
  );
}
