import { SiteLayout } from "@/components/layout/SiteLayout";
import { articles } from "@/content/articles";
import type { Article } from "@/content/types";
import { absoluteUrl, displayDate, EDITORIAL_DATE } from "@/lib/seo/site";
import { sources } from "@/content/sources";
import {
  AnswerBox,
  Breadcrumbs,
  ContentSection,
  EditorialHero,
  primaryLink,
  ReadingLayout,
  SourceList,
  StructuredData,
  textLink,
} from "./Editorial";

export function ArticlePage({ article }: { article: Article }) {
  const related = articles.filter((a) => article.related.includes(a.slug));
  return (
    <SiteLayout>
      <StructuredData
        value={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: article.title,
          description: article.description,
          mainEntityOfPage: absoluteUrl(`/guide/${article.slug}`),
          inLanguage: "fr",
          dateModified: EDITORIAL_DATE,
          author: { "@type": "Organization", name: "Batogo", url: absoluteUrl("/a-propos") },
          publisher: { "@id": absoluteUrl("/#organisation") },
          citation: article.sources.map((id) => sources[id]?.url).filter(Boolean),
        }}
      />
      <Breadcrumbs
        items={[
          { name: "Guide", path: "/guide" },
          { name: article.title, path: `/guide/${article.slug}` },
        ]}
      />
      <article>
        <EditorialHero label="Dossier pratique" title={article.title} intro={article.description} />
        <p className="mb-6 text-sm text-muted-foreground">
          Batogo · Dossier documentaire ·{" "}
          <time dateTime={EDITORIAL_DATE}>Mis à jour le {displayDate(EDITORIAL_DATE)}</time>
        </p>
        <ReadingLayout sections={article.sections}>
          <AnswerBox>{article.answer}</AnswerBox>
          {article.sections.map((section) => (
            <ContentSection key={section.id} section={section} />
          ))}
          {article.tool ? (
            <div className="mt-8 rounded-xl bg-secondary p-5">
              <p className="mb-3 font-semibold">Passer du dossier à votre situation</p>
              <a href={`/simulateurs/${article.tool}`} className={primaryLink}>
                Ouvrir le simulateur associé
              </a>
            </div>
          ) : null}
          <section id="questions" className="mt-10">
            <h2 className="font-display text-2xl font-bold">Questions fréquentes</h2>
            <div className="mt-4 divide-y rounded-xl border">
              {article.faq.map((item) => (
                <details key={item.q} className="group px-5 py-4">
                  <summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-primary">
                    {item.q}
                  </summary>
                  <p className="mt-3 leading-7 text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
          <SourceList ids={article.sources} />
        </ReadingLayout>
      </article>
      <section className="mt-12 border-t pt-6">
        <h2 className="font-display text-xl font-bold">Pour la suite de votre préparation</h2>
        <ul className="mt-4 space-y-3">
          {related.map((a) => (
            <li key={a.slug}>
              <a href={`/guide/${a.slug}`} className={textLink}>
                {a.title}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </SiteLayout>
  );
}
