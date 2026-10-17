import { createFileRoute, notFound } from "@tanstack/react-router";
import { SiteLayout } from "@/components/layout/SiteLayout";
import {
  Breadcrumbs,
  EditorialHero,
  StructuredData,
  textLink,
} from "@/components/editorial/Editorial";
import { VehicleAge } from "@/components/tools/VehicleAge";
import { ImportBudget } from "@/components/tools/ImportBudget";
import { TravelBudget } from "@/components/tools/TravelBudget";
import { CostSharing } from "@/components/tools/CostSharing";
import { toolsCatalog } from "@/content/tools";
import { absoluteUrl, seoHead } from "@/lib/seo/site";
export const Route = createFileRoute("/simulateurs/$slug")({
  loader: ({ params }) => {
    const t = toolsCatalog.find((t) => t.slug === params.slug);
    if (!t) throw notFound();
    return t;
  },
  head: ({ loaderData: t }) =>
    t
      ? seoHead(`${t.title} : simulateur | Batogo`, t.description, `/simulateurs/${t.slug}`)
      : { meta: [{ title: "Outil introuvable | Batogo" }, { name: "robots", content: "noindex" }] },
  component: Tool,
});
function Tool() {
  const t = Route.useLoaderData();
  return (
    <SiteLayout>
      <StructuredData
        value={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: t.title,
          description: t.description,
          url: absoluteUrl(`/simulateurs/${t.slug}`),
          inLanguage: "fr",
        }}
      />
      <Breadcrumbs
        items={[
          { name: "Simulateurs", path: "/simulateurs" },
          { name: t.title, path: `/simulateurs/${t.slug}` },
        ]}
      />
      <EditorialHero
        label="Calcul transparent · sans compte"
        title={t.title}
        intro={t.description}
      />
      <div className="max-w-4xl rounded-xl border bg-card p-5 md:p-8">
        {t.slug === "age-vehicule" ? (
          <VehicleAge />
        ) : t.slug === "budget-importation" ? (
          <ImportBudget />
        ) : t.slug === "budget-voyage" ? (
          <TravelBudget />
        ) : (
          <CostSharing />
        )}
      </div>
      <section className="mt-8 max-w-3xl">
        <h2 className="font-display text-xl font-bold">Comprendre avant de décider</h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Les champs ne sont pas des prix de marché ou des taux officiels. Le résultat dépend
          uniquement de vos entrées. Consultez le dossier associé pour les sources, les hypothèses
          et les vérifications à faire.
        </p>
        <a href={`/guide/${t.guide}`} className={`${textLink} mt-4 inline-block`}>
          Lire le dossier et les sources de cet outil →
        </a>
      </section>
    </SiteLayout>
  );
}
