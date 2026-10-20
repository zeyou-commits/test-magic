import { createFileRoute, notFound } from "@tanstack/react-router";
import { SiteLayout } from "@/components/layout/SiteLayout";
import {
  AnswerBox,
  Breadcrumbs,
  EditorialHero,
  primaryLink,
  SourceList,
  textLink,
} from "@/components/editorial/Editorial";
import { carpoolPlaces } from "@/content/carpool";
import { seoHead } from "@/lib/seo/site";
export const Route = createFileRoute("/covoiturage/$slug")({
  loader: ({ params }) => {
    const p = carpoolPlaces.find((p) => p.slug === params.slug);
    if (!p) throw notFound();
    return p;
  },
  head: ({ loaderData: p }) =>
    p
      ? seoHead(
          `Covoiturage ${p.name} : accès et rendez-vous | Batogo`,
          p.relevance,
          `/covoiturage/${p.slug}`,
        )
      : { meta: [{ title: "Aire introuvable | Batogo" }, { name: "robots", content: "noindex" }] },
  component: Place,
});
function Place() {
  const p = Route.useLoaderData();
  return (
    <SiteLayout>
      <Breadcrumbs
        items={[
          { name: "Covoiturage", path: "/covoiturage" },
          { name: p.name, path: `/covoiturage/${p.slug}` },
        ]}
      />
      <EditorialHero
        label={`${p.road} · ${p.area}`}
        title={`Covoiturage à ${p.name}`}
        intro={p.relevance}
      />
      <div className="max-w-3xl">
        <AnswerBox>{p.access}</AnswerBox>
        <section className="mt-8">
          <h2 className="font-display text-2xl font-bold">Fixer un rendez-vous qui fonctionne</h2>
          <p className="mt-4 leading-7 text-muted-foreground">{p.rendezvous}</p>
          <ul className="mt-4 list-disc space-y-3 pl-5 leading-7 text-muted-foreground">
            <li>
              Vérifiez la localisation avec le conducteur et tous les passagers, puis confirmez le
              point exact sur le parking.
            </li>
            <li>Précisez le nombre de personnes et de bagages avant de vous engager.</li>
            <li>
              Ajoutez le trajet jusqu'au terminal et la présentation demandée par la compagnie après
              le regroupement.
            </li>
            <li>
              Prévoyez une solution si le rendez-vous est manqué ou si un accès est temporairement
              fermé.
            </li>
          </ul>
        </section>
        <section className="mt-8">
          <h2 className="font-display text-2xl font-bold">
            Stationnement et services : ce qui reste à vérifier
          </h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            Cette fiche ne promet ni place libre, ni gardiennage, ni durée de stationnement.
            Demandez au gestionnaire les règles actuelles. Pour un séjour de plusieurs semaines en
            Algérie, vérifiez une solution de stationnement explicitement adaptée à cette durée.
          </p>
        </section>
        <a href="/simulateurs/partage-frais" className={`${primaryLink} mt-6`}>
          Calculer un partage des frais
        </a>
        <p className="mt-4">
          <a href="/guide/covoiturage-avant-ferry" className={textLink}>
            Lire le guide avant de confirmer le trajet
          </a>
        </p>
        <SourceList ids={[p.source, "national"]} />
      </div>
    </SiteLayout>
  );
}
