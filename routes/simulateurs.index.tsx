import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Breadcrumbs, CollectionSchema, EditorialHero } from "@/components/editorial/Editorial";
import { toolsCatalog } from "@/content/tools";
import { seoHead } from "@/lib/seo/site";
export const Route = createFileRoute("/simulateurs/")({
  head: () =>
    seoHead(
      "Simulateurs Algérie : âge voiture et budgets de voyage | Batogo",
      "Quatre outils gratuits pour calculer l'âge d'une voiture, construire un budget d'importation, comparer deux voyages et partager les frais de la route.",
      "/simulateurs",
    ),
  component: Tools,
});
function Tools() {
  return (
    <SiteLayout>
      <Breadcrumbs items={[{ name: "Simulateurs", path: "/simulateurs" }]} />
      <CollectionSchema
        path="/simulateurs"
        name="Simulateurs Batogo"
        items={toolsCatalog.map((t) => ({ name: t.title, path: `/simulateurs/${t.slug}` }))}
      />
      <EditorialHero
        label="Les outils Batogo"
        title="Préparer avec vos chiffres"
        intro="Des calculs transparents, sans compte : vous choisissez les dates, les devis et les hypothèses. Les résultats restent des aides à la préparation et sont accompagnés de leur méthode."
      />
      <div className="grid gap-5 md:grid-cols-2">
        {toolsCatalog.map((t, i) => (
          <a
            key={t.slug}
            href={`/simulateurs/${t.slug}`}
            className="rounded-xl border bg-card p-6 hover:border-primary/40"
          >
            <span className="text-sm font-semibold text-primary">Outil {i + 1}</span>
            <h2 className="mt-3 font-display text-2xl font-bold">{t.title}</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{t.description}</p>
            <span className="mt-5 inline-block text-sm font-semibold text-primary">
              Faire mon calcul →
            </span>
          </a>
        ))}
      </div>
    </SiteLayout>
  );
}
