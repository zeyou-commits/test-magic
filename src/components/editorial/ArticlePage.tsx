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
  FaqSection,
  primaryLink,
  ReadingLayout,
  SourceList,
  StructuredData,
  textLink,
} from "./Editorial";
import { DossierHero, DurationBars } from "./DossierVisuals";
import { LineBooking, LineMapCard, LineVessels } from "./LineBlocks";
import { tr } from "@/lib/i18n";

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
          dateModified: article.updated ?? EDITORIAL_DATE,
          image: article.illustration
            ? {
                "@type": "ImageObject",
                url: absoluteUrl(article.illustration.src),
                width: article.illustration.width,
                height: article.illustration.height,
                caption: article.illustration.alt,
              }
            : absoluteUrl("/bledway-brand.png"),
          author: { "@type": "Organization", name: "BledWay", url: absoluteUrl("/a-propos") },
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
        {article.illustration ? (
          <DossierHero article={article} updated={displayDate(article.updated ?? EDITORIAL_DATE)} />
        ) : (
          <>
            <EditorialHero label={tr("ui.articlePage.dossierPratique")} title={article.title} intro={article.description} />
            <p className="mb-6 text-sm text-muted-foreground">
              {tr("ui.articlePage.bledwayDossierDocumentaire")}{" "}
              <time dateTime={EDITORIAL_DATE}>{tr("ui.articlePage.misAJourLe")}{displayDate(EDITORIAL_DATE)}</time>
            </p>
          </>
        )}
        <ReadingLayout sections={article.sections}>
          <AnswerBox>{article.answer}</AnswerBox>
          {article.line ? <LineMapCard line={article.line} /> : null}
          {article.sections.map((section) =>
            section.bars ? (
              <section key={section.id} id={section.id} className="mt-10 scroll-mt-20">
                <h2 className="font-display text-2xl font-bold tracking-tight">{section.title}</h2>
                {section.paragraphs.map((p, i) => (
                  <p key={i} className="mt-4 leading-7 text-muted-foreground">
                    {p}
                  </p>
                ))}
                <DurationBars bars={section.bars} title={section.title} />
                {article.line ? <LineVessels line={article.line} /> : null}
              </section>
            ) : (
              <ContentSection key={section.id} section={section} />
            ),
          )}
          {article.tool ? (
            <div className="mt-8 rounded-xl bg-secondary p-5">
              <p className="mb-3 font-semibold">{tr("ui.articlePage.passerDuDossierAVotre")}</p>
              <a href={`/simulateurs/${article.tool}`} className={primaryLink}>
                {tr("ui.articlePage.ouvrirLeSimulateurAssocie")}
              </a>
            </div>
          ) : null}
          {article.line ? <LineBooking line={article.line} /> : null}
          <FaqSection faq={article.faq} path={`/guide/${article.slug}`} />
          <SourceList ids={article.sources} />
        </ReadingLayout>
      </article>
      <section className="mt-12 border-t pt-6">
        <h2 className="font-display text-xl font-bold">{tr("ui.articlePage.pourLaSuiteDeVotre")}</h2>
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
