import { createFileRoute } from "@tanstack/react-router";
import { PageHero, SiteLayout } from "@/components/layout/SiteLayout";

const title = "Mentions légales — Batogo";
const description =
  "Mentions légales du site Batogo : éditeur, hébergement, propriété intellectuelle et limites de responsabilité sur les informations maritimes publiées.";

export const Route = createFileRoute("/mentions-legales")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: LegalPage,
});

function LegalPage() {
  return (
    <SiteLayout>
      <PageHero
        overline="Informations légales"
        title="Mentions légales"
        intro="Batogo est un service d'information indépendant sur les traversées maritimes vers l'Algérie."
      />
      <div className="mt-8 max-w-3xl space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-base font-semibold text-foreground">Éditeur</h2>
          <p className="mt-1">
            Les coordonnées de l'éditeur (raison sociale, adresse, responsable de publication)
            doivent être complétées avant la mise en ligne publique du site.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">Responsabilité</h2>
          <p className="mt-1">
            Les horaires, durées et disponibilités publiés sont donnés à titre indicatif. Seules
            les compagnies maritimes et les autorités portuaires font foi. Batogo ne vend aucun
            billet et ne garantit pas l'exactitude des informations transmises par des tiers.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">Propriété intellectuelle</h2>
          <p className="mt-1">
            Les noms des compagnies et des navires appartiennent à leurs détenteurs respectifs. Le
            fond cartographique est fourni par OpenFreeMap à partir des données OpenStreetMap.
          </p>
        </section>
      </div>
    </SiteLayout>
  );
}
