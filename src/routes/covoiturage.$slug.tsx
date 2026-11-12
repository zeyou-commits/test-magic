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
import { tr } from "@/lib/i18n";
export const Route = createFileRoute("/covoiturage/$slug")({
  loader: ({ params }) => {
    const p = carpoolPlaces.find((p) => p.slug === params.slug);
    if (!p) throw notFound();
    return p;
  },
  head: ({ loaderData: p }) =>
    p
      ? seoHead(
          `Covoiturage ${p.name} : accès et rendez-vous | BledWay`,
          p.relevance,
          `/covoiturage/${p.slug}`,
        )
      : { meta: [{ title: "Aire introuvable | BledWay" }, { name: "robots", content: "noindex" }] },
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
          <h2 className="font-display text-2xl font-bold">{tr("ui.pageCovoiturageSlug.fixerUnRendezVousQui")}</h2>
          <p className="mt-4 leading-7 text-muted-foreground">{p.rendezvous}</p>
          <ul className="mt-4 list-disc space-y-3 pl-5 leading-7 text-muted-foreground">
            <li>
              {tr("ui.pageCovoiturageSlug.verifiezLaLocalisationAvecLe")}
            </li>
            <li>{tr("ui.pageCovoiturageSlug.precisezLeNombreDePersonnes")}</li>
            <li>
              {tr("ui.pageCovoiturageSlug.ajoutezLeTrajetJusquAu")}
            </li>
            <li>
              {tr("ui.pageCovoiturageSlug.prevoyezUneSolutionSiLe")}
            </li>
          </ul>
        </section>
        <section className="mt-8">
          <h2 className="font-display text-2xl font-bold">
            {tr("ui.pageCovoiturageSlug.stationnementEtServicesCeQui")}
          </h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            {tr("ui.pageCovoiturageSlug.cetteFicheNePrometNi")}
          </p>
        </section>
        <a href="/simulateurs/partage-frais" className={`${primaryLink} mt-6`}>
          {tr("ui.pageCovoiturageSlug.calculerUnPartageDesFrais")}
        </a>
        <p className="mt-4">
          <a href="/guide/covoiturage-avant-ferry" className={textLink}>
            {tr("ui.pageCovoiturageSlug.lireLeGuideAvantDe")}
          </a>
        </p>
        <SourceList ids={[p.source, "national"]} />
      </div>
    </SiteLayout>
  );
}
