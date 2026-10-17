import { createFileRoute, notFound } from "@tanstack/react-router";
import { SiteLayout } from "@/components/layout/SiteLayout";
import {
  AnswerBox,
  Breadcrumbs,
  ContentSection,
  EditorialHero,
  ReadingLayout,
  SourceList,
  StructuredData,
  textLink,
} from "@/components/editorial/Editorial";
import { vesselDossiers } from "@/content/vessels";
import { absoluteUrl, seoHead } from "@/lib/seo/site";
export const Route = createFileRoute("/bateaux/$slug")({
  loader: ({ params }) => {
    const v = vesselDossiers.find((v) => v.slug === params.slug);
    if (!v) throw notFound();
    return v;
  },
  head: ({ loaderData: v }) =>
    v
      ? seoHead(
          `${v.name} : caractéristiques et voyage à bord | Batogo`,
          v.summary,
          `/bateaux/${v.slug}`,
        )
      : {
          meta: [{ title: "Bateau introuvable | Batogo" }, { name: "robots", content: "noindex" }],
        },
  component: Boat,
});
function Boat() {
  const v = Route.useLoaderData();
  return (
    <SiteLayout>
      <StructuredData
        value={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `${v.name} : dossier du navire`,
          url: absoluteUrl(`/bateaux/${v.slug}`),
          inLanguage: "fr",
          description: v.summary,
        }}
      />
      <Breadcrumbs
        items={[
          { name: "Bateaux", path: "/bateaux" },
          { name: v.name, path: `/bateaux/${v.slug}` },
        ]}
      />
      <EditorialHero label={v.company} title={v.name} intro={v.summary} />
      <ReadingLayout sections={v.sections}>
        <AnswerBox>
          Les caractéristiques décrivent un navire. Pour connaître le bateau affecté, les places
          disponibles et les prestations incluses, vérifiez votre départ auprès de la compagnie.
        </AnswerBox>
        <section className="mt-8">
          <h2 className="font-display text-2xl font-bold">Les repères du dossier</h2>
          <dl className="mt-4 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
            {v.specs.map((s) => (
              <div key={s.label} className="bg-card p-4">
                <dt className="text-sm text-muted-foreground">{s.label}</dt>
                <dd className="mt-1 font-display text-lg font-bold">{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        {v.sections.map((s) => (
          <ContentSection section={s} key={s.id} />
        ))}
        <SourceList ids={v.sources} />
      </ReadingLayout>
      <p className="mt-10 text-sm">
        <a href="/guide/cabine-ou-fauteuil-ferry" className={textLink}>
          Cabine ou fauteuil : faire le bon choix
        </a>{" "}
        ·{" "}
        <a href="/guide/voyage-algerie-voiture-checklist" className={textLink}>
          Préparer la voiture et le sac de traversée
        </a>
      </p>
    </SiteLayout>
  );
}
