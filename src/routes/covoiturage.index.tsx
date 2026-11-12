import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/layout/SiteLayout";
import {
  Breadcrumbs,
  CollectionSchema,
  EditorialHero,
  primaryLink,
  textLink,
} from "@/components/editorial/Editorial";
import { carpoolPlaces } from "@/content/carpool";
import { seoHead } from "@/lib/seo/site";
import { tr } from "@/lib/i18n";
export const Route = createFileRoute("/covoiturage/")({
  head: () =>
    seoHead(
      "Aires de covoiturage sur la route des ports | BledWay",
      "Grans–Salon, Avignon Nord, Gallargues et Narbonne : des points documentés pour organiser un rendez-vous sur la route d'un ferry vers l'Algérie.",
      "/covoiturage",
    ),
  component: Carpool,
});
function Carpool() {
  return (
    <SiteLayout>
      <Breadcrumbs items={[{ name: "Covoiturage", path: "/covoiturage" }]} />
      <CollectionSchema
        path="/covoiturage"
        name="Points de covoiturage sur la route des ports"
        items={carpoolPlaces.map((p) => ({ name: p.name, path: `/covoiturage/${p.slug}` }))}
      />
      <EditorialHero
        label={tr("ui.pageCovoiturageIndex.laRouteDuPort")}
        title={tr("ui.pageCovoiturageIndex.airesDeCovoiturageSurLa")}
        intro={tr("ui.pageCovoiturageIndex.uneSelectionDePointsDocumentes")}
      />
      <p className="mb-8 rounded-xl border bg-secondary/40 p-5 text-sm leading-7">
        {tr("ui.pageCovoiturageIndex.cesLieuxNeConstituentPas")}
      </p>
      <div className="divide-y border-y">
        {carpoolPlaces.map((p) => (
          <a
            key={p.slug}
            href={`/covoiturage/${p.slug}`}
            className="grid gap-3 py-6 md:grid-cols-[8rem_minmax(0,1fr)]"
          >
            <span className="font-display text-xl font-bold text-primary">{p.road}</span>
            <div>
              <h2 className="font-display text-xl font-bold">{p.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{p.area}</p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{p.relevance}</p>
              <span className="mt-3 inline-block text-sm font-semibold text-primary">
                {tr("ui.pageCovoiturageIndex.preparerLeRendezVous")}
              </span>
            </div>
          </a>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-5">
        <a href="/simulateurs/partage-frais" className={primaryLink}>
          {tr("ui.pageCovoiturageIndex.partagerLesFraisDeRoute")}
        </a>
        <a href="/guide/covoiturage-avant-ferry" className={textLink}>
          {tr("ui.pageCovoiturageIndex.laChecklistDuCovoiturageAvant")}
        </a>
      </div>
    </SiteLayout>
  );
}
