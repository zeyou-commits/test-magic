import seoConfig from "../../seo.config.json";
import { seoHead } from "@/lib/seo/site";
import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { tr } from "@/lib/i18n";

const title = "Contact et signalement d'erreur — BledWay";
const description =
  "Signaler un horaire erroné, une ligne manquante ou un port à ajouter sur BledWay, la carte des ferries Europe ↔ Algérie.";

export const Route = createFileRoute("/contact")({
  head: () => seoHead(title, description, "/contact"),
  component: ContactPage,
});

function ContactPage() {
  return (
    <SiteLayout>
      <PageHero
        overline={tr("ui.pageContact.contact")}
        title={tr("ui.pageContact.nousSignalerUneInformation")}
        intro={tr("ui.pageContact.laFaconLaPlusRapide")}
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-display font-semibold">{tr("ui.pageContact.signalerDepuisLaCarte")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {tr("ui.pageContact.surLaFicheDUn")}
          </p>
        </Card>
        <Card>
          <h2 className="font-display font-semibold">{tr("ui.pageContact.nousEcrire")}</h2>
          {seoConfig.contactEmail ? (
            <a
              href={`mailto:${seoConfig.contactEmail}?subject=${encodeURIComponent("Correction documentaire BledWay")}`}
              className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
            >
              {seoConfig.contactEmail}
            </a>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {tr("ui.pageContact.leCanalDeContactPour")}
            </p>
          )}
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {tr("ui.pageContact.pourPreparerUneCorrectionRelevez")}
          </p>
        </Card>
      </div>
    </SiteLayout>
  );
}
