import { seoHead } from "@/lib/seo/site";
import { createFileRoute } from "@tanstack/react-router";
import { PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { LEGAL_UPDATED, LegalSections, PageLink } from "@/components/layout/LegalPage";
import { tr } from "@/lib/i18n";

const title = "Mentions légales — BledWay";
const description =
  "Mentions légales du site BledWay : éditeur, hébergement, propriété intellectuelle et limites de responsabilité sur les informations maritimes publiées.";

export const Route = createFileRoute("/mentions-legales")({
  head: () => seoHead(title, description, "/mentions-legales"),
  component: LegalPage,
});

function LegalPage() {
  return (
    <SiteLayout>
      <PageHero
        overline={tr("ui.pageMentionsLegales.informationsLegales")}
        title={tr("ui.pageMentionsLegales.mentionsLegales")}
        intro={tr("ui.pageMentionsLegales.bledwayWwwBledwayComEst")}
      />
      <LegalSections
        updated={LEGAL_UPDATED}
        sections={[
          {
            id: "editeur",
            title: "Éditeur",
            body: (
              <p>
                {tr("ui.pageMentionsLegales.bledwayEstEditeATitre")}<PageLink to="/contact">{tr("ui.pageMentionsLegales.contact")}</PageLink>.
              </p>
            ),
          },
          {
            id: "hebergement",
            title: "Hébergement",
            body: (
              <ul>
                <li>
                  <strong>{tr("ui.pageMentionsLegales.site")}</strong>{tr("ui.pageMentionsLegales.vercelInc440NBarranca")}
                </li>
                <li>
                  <strong>{tr("ui.pageMentionsLegales.baseDeDonneesEtComptes")}</strong>{tr("ui.pageMentionsLegales.supabaseIncSupabaseCom")}
                </li>
                <li>
                  <strong>{tr("ui.pageMentionsLegales.nomDeDomaine")}</strong>{tr("ui.pageMentionsLegales.ovhSas2RueKellermann")}
                </li>
              </ul>
            ),
          },
          {
            id: "sources",
            title: "Sources des informations",
            body: (
              <p>
                {tr("ui.pageMentionsLegales.horairesIssusDesProgrammesPublies")}{" "}
                <PageLink to="/methode-editoriale">{tr("ui.pageMentionsLegales.methodeEditoriale")}</PageLink>.
              </p>
            ),
          },
          {
            id: "responsabilite",
            title: "Responsabilité",
            body: (
              <p>
                {tr("ui.pageMentionsLegales.lesHorairesDureesEtDisponibilites")}<PageLink to="/conditions-utilisation">{tr("ui.pageMentionsLegales.conditionsDUtilisation")}</PageLink>.
              </p>
            ),
          },
          {
            id: "propriete",
            title: "Propriété intellectuelle et crédits",
            body: (
              <ul>
                <li>
                  {tr("ui.pageMentionsLegales.textesIllustrationsPersonnagesEtLogo")}
                </li>
                <li>
                  {tr("ui.pageMentionsLegales.nomsEtLogosDesCompagnies")}
                </li>
                <li>
                  {tr("ui.pageMentionsLegales.fondDeCarteOpenfreemapDonnees")}
                </li>
                <li>{tr("ui.pageMentionsLegales.previsionsMarinesOpenMeteoLicence")}</li>
              </ul>
            ),
          },
          {
            id: "donnees",
            title: "Données personnelles",
            body: (
              <p>
                {tr("ui.pageMentionsLegales.voirLa")}<PageLink to="/confidentialite">{tr("ui.pageMentionsLegales.politiqueDeConfidentialite")}</PageLink>.
              </p>
            ),
          },
        ]}
      />
    </SiteLayout>
  );
}
