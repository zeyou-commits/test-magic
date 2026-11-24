import { seoHead } from "@/lib/seo/site";
import { createFileRoute } from "@tanstack/react-router";
import { PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { LEGAL_UPDATED, LegalSections, PageLink } from "@/components/layout/LegalPage";
import { tr } from "@/lib/i18n";

const title = "Conditions d'utilisation — BledWay";
const description =
  "Conditions d'utilisation de BledWay : accès au service, compte, contenus publiés par les voyageurs, modération et responsabilité.";

export const Route = createFileRoute("/conditions-utilisation")({
  head: () => seoHead(title, description, "/conditions-utilisation"),
  component: TermsPage,
});

function TermsPage() {
  return (
    <SiteLayout>
      <PageHero
        overline={tr("ui.pageConditionsUtilisation.informationsLegales")}
        title={tr("ui.pageConditionsUtilisation.conditionsDUtilisation")}
        intro={tr("ui.pageConditionsUtilisation.lesReglesDUsageDe")}
      />
      <LegalSections
        updated={LEGAL_UPDATED}
        sections={[
          {
            id: "service",
            title: tr("ui.pageConditionsUtilisation.leService"),
            body: (
              <>
                <p>
                  {tr("ui.pageConditionsUtilisation.bledwayRassembleDesHorairesDes")}
                </p>
                <ul>
                  <li>
                    <strong>{tr("ui.pageConditionsUtilisation.gratuit")}</strong>{tr("ui.pageConditionsUtilisation.sansAbonnement")}
                  </li>
                  <li>
                    <strong>{tr("ui.pageConditionsUtilisation.bledwayNeVendAucunBillet")}</strong>{tr("ui.pageConditionsUtilisation.etNAgitPasPour")}
                  </li>
                  <li>
                    {tr("ui.pageConditionsUtilisation.leServicePeutEvoluerEtre")}
                  </li>
                </ul>
              </>
            ),
          },
          {
            id: "fiabilite",
            title: tr("ui.pageConditionsUtilisation.desInformationsIndicatives"),
            body: (
              <>
                <p>
                  {tr("ui.pageConditionsUtilisation.horairesRetardsPositionsDureesPrix")}
                </p>
                <p>
                  <strong>
                    {tr("ui.pageConditionsUtilisation.seulesLesCompagniesMaritimesEt")}
                  </strong>{" "}
                  {tr("ui.pageConditionsUtilisation.verifiezToujoursVotreTraverseeAupres")}
                </p>
              </>
            ),
          },
          {
            id: "compte",
            title: tr("ui.pageConditionsUtilisation.votreCompte"),
            body: (
              <ul>
                <li>{tr("ui.pageConditionsUtilisation.t15AnsMinimumPourCreer")}</li>
                <li>{tr("ui.pageConditionsUtilisation.unSeulCompteParPersonne")}</li>
                <li>
                  {tr("ui.pageConditionsUtilisation.vousEtesResponsableDeVos")}
                </li>
                <li>
                  {tr("ui.pageConditionsUtilisation.lePseudoNePeutEtre")}
                </li>
              </ul>
            ),
          },
          {
            id: "contenus",
            title: tr("ui.pageConditionsUtilisation.ceQueVousPubliez"),
            body: (
              <>
                <p>
                  {tr("ui.pageConditionsUtilisation.vousRestezResponsableDeVos")}{" "}
                  <PageLink to="/charte">{tr("ui.pageConditionsUtilisation.charteDeLaCommunaute")}</PageLink>{tr("ui.pageConditionsUtilisation.laLoiEtLesDroits")}
                </p>
                <ul>
                  <li>{tr("ui.pageConditionsUtilisation.proposHaineuxInjurieuxDiscriminatoiresOu")}</li>
                  <li>{tr("ui.pageConditionsUtilisation.faussesInformationsVolontairesNotammentDes")}</li>
                  <li>{tr("ui.pageConditionsUtilisation.publiciteDemarchageReventeDeBillets")}</li>
                  <li>
                    {tr("ui.pageConditionsUtilisation.donneesPersonnellesDAutruiNumero")}
                  </li>
                </ul>
                <p>
                  {tr("ui.pageConditionsUtilisation.vousAutorisezBledwayAAfficher")}{" "}
                  <PageLink to="/confidentialite">{tr("ui.pageConditionsUtilisation.politiqueDeConfidentialite")}</PageLink>).
                </p>
              </>
            ),
          },
          {
            id: "moderation",
            title: tr("ui.pageConditionsUtilisation.moderationEtSignalement"),
            body: (
              <>
                <p>
                  {tr("ui.pageConditionsUtilisation.lesAvisEtLeursPhotos")}
                </p>
                <p>
                  {tr("ui.pageConditionsUtilisation.unContenuIlliciteSeSignale")}<PageLink to="/contact">{tr("ui.pageConditionsUtilisation.contact")}</PageLink>{tr("ui.pageConditionsUtilisation.enIndiquantLeContenuSon")}
                </p>
              </>
            ),
          },
          {
            id: "propriete",
            title: tr("ui.pageConditionsUtilisation.proprieteIntellectuelle"),
            body: (
              <p>
                {tr("ui.pageConditionsUtilisation.leSiteSesTextesIllustrations")}
              </p>
            ),
          },
          {
            id: "responsabilite",
            title: tr("ui.pageConditionsUtilisation.responsabilite"),
            body: (
              <p>
                {tr("ui.pageConditionsUtilisation.bledwayNePeutEtreTenu")}
              </p>
            ),
          },
          {
            id: "donnees",
            title: tr("ui.pageConditionsUtilisation.donneesPersonnelles"),
            body: (
              <p>
                {tr("ui.pageConditionsUtilisation.leurUsageEstDecritDans")}{" "}
                <PageLink to="/confidentialite">{tr("ui.pageConditionsUtilisation.politiqueDeConfidentialite")}</PageLink>.
              </p>
            ),
          },
          {
            id: "evolution",
            title: tr("ui.pageConditionsUtilisation.evolutionDroitApplicable"),
            body: (
              <>
                <p>
                  {tr("ui.pageConditionsUtilisation.cesConditionsEtLaCharte")}
                </p>
                <p>
                  {tr("ui.pageConditionsUtilisation.cesConditionsSontRegiesPar")}{" "}
                  <PageLink to="/contact">{tr("ui.pageConditionsUtilisation.contact")}</PageLink>.
                </p>
              </>
            ),
          },
        ]}
      />
    </SiteLayout>
  );
}
