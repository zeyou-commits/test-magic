import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/layout/SiteLayout";
import {
  Breadcrumbs,
  CollectionSchema,
  EditorialHero,
  textLink,
} from "@/components/editorial/Editorial";
import { vesselDossiers } from "@/content/vessels";
import { seoHead } from "@/lib/seo/site";
export const Route = createFileRoute("/bateaux/")({
  head: () =>
    seoHead(
      "Bateaux vers l'Algérie : caractéristiques et vie à bord | Batogo",
      "Dossiers Jean Nicoli, Danielle Casanova, Méditerranée et Badji Mokhtar III : caractéristiques sourcées, installations et points à confirmer avant le départ.",
      "/bateaux",
    ),
  component: Boats,
});
function Boats() {
  return (
    <SiteLayout>
      <Breadcrumbs items={[{ name: "Bateaux", path: "/bateaux" }]} />
      <CollectionSchema
        path="/bateaux"
        name="Dossiers bateaux"
        items={vesselDossiers.map((v) => ({ name: v.name, path: `/bateaux/${v.slug}` }))}
      />
      <EditorialHero
        label="Les navires"
        title="Connaître le bateau avant de monter à bord"
        intro="Des caractéristiques attribuées à leur source, des installations expliquées et une distinction claire entre le dossier d'un navire et sa disponibilité sur votre traversée."
      />
      <div className="grid gap-5 md:grid-cols-2">
        {vesselDossiers.map((v) => (
          <a
            key={v.slug}
            href={`/bateaux/${v.slug}`}
            className="rounded-xl border bg-card p-6 hover:border-primary/40"
          >
            <p className="text-xs font-bold uppercase tracking-widest text-primary">{v.company}</p>
            <h2 className="mt-3 font-display text-2xl font-bold">{v.name}</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{v.summary}</p>
            <span className="mt-5 inline-block font-semibold text-primary">
              Ouvrir le dossier →
            </span>
          </a>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        Cette première sélection sera enrichie avec des sources primaires. Les capacités générales
        ne sont pas des places disponibles.{" "}
        <a href="/guide/cabine-ou-fauteuil-ferry" className={textLink}>
          Choisir une cabine ou un fauteuil
        </a>
        .
      </p>
    </SiteLayout>
  );
}
