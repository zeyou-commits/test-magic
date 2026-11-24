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
            title: tr("ui.pageMentionsLegales.editeur"),
            body: (
              <p>
                {tr("ui.pageMentionsLegales.bledwayEstEditeATitre")}<PageLink to="/contact">{tr("ui.pageMentionsLegales.contact")}</PageLink>.
              </p>
            ),
          },
          {
            id: "hebergement",
            title: tr("ui.pageMentionsLegales.hebergement"),
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
            title: tr("ui.pageMentionsLegales.sourcesDesInformations"),
            body: (
              <p>
                {tr("ui.pageMentionsLegales.horairesIssusDesProgrammesPublies")}{" "}
                <PageLink to="/methode-editoriale">{tr("ui.pageMentionsLegales.methodeEditoriale")}</PageLink>.
              </p>
            ),
          },
          {
            id: "responsabilite",
            title: tr("ui.pageMentionsLegales.responsabilite"),
            body: (
              <p>
                {tr("ui.pageMentionsLegales.lesHorairesDureesEtDisponibilites")}<PageLink to="/conditions-utilisation">{tr("ui.pageMentionsLegales.conditionsDUtilisation")}</PageLink>.
              </p>
            ),
          },
          {
            id: "propriete",
            title: tr("ui.pageMentionsLegales.proprieteIntellectuelleEtCredits"),
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
            title: tr("ui.pageMentionsLegales.donneesPersonnelles"),
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
