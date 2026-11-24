import { seoHead } from "@/lib/seo/site";
import { createFileRoute } from "@tanstack/react-router";
import { PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { LEGAL_UPDATED, LegalSections, PageLink } from "@/components/layout/LegalPage";
import { tr } from "@/lib/i18n";

const title = "Politique de confidentialité — BledWay";
const description =
  "Quelles données BledWay collecte, pourquoi, combien de temps elles sont gardées, qui les traite et comment exercer vos droits (RGPD).";

export const Route = createFileRoute("/confidentialite")({
  head: () => seoHead(title, description, "/confidentialite"),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <SiteLayout>
      <PageHero
        overline={tr("ui.pageConfidentialite.confidentialite")}
        title={tr("ui.pageConfidentialite.vosDonneesSurBledway")}
        intro={tr("ui.pageConfidentialite.leMinimumNecessaireGardeLe")}
      />
      <LegalSections
        updated={LEGAL_UPDATED}
        sections={[
          {
            id: "responsable",
            title: tr("ui.pageConfidentialite.quiEstResponsableDeVos"),
            body: (
              <p>
                {tr("ui.pageConfidentialite.lEditeurDeBledwayUn")}{" "}
                <PageLink to="/mentions-legales">{tr("ui.pageConfidentialite.mentionsLegales")}</PageLink>{tr("ui.pageConfidentialite.pourTouteQuestionSurVos")}{" "}
                <PageLink to="/contact">{tr("ui.pageConfidentialite.contact")}</PageLink>.
              </p>
            ),
          },
          {
            id: "sans-compte",
            title: tr("ui.pageConfidentialite.sansCompte"),
            body: (
              <>
                <p>
                  {tr("ui.pageConfidentialite.vousPouvezConsulterLaCarte")}
                </p>
                <ul>
                  <li>
                    <strong>{tr("ui.pageConfidentialite.mesureDAudience")}</strong>{tr("ui.pageConfidentialite.pagesVuesEtEtapesDu")}
                  </li>
                  <li>
                    <strong>{tr("ui.pageConfidentialite.preferencesGardeesSurVotreAppareil")}</strong>{tr("ui.pageConfidentialite.stockageLocalDuNavigateurTraversee")}
                  </li>
                </ul>
              </>
            ),
          },
          {
            id: "compte",
            title: tr("ui.pageConfidentialite.avecUnCompte"),
            body: (
              <ul>
                <li>
                  <strong>{tr("ui.pageConfidentialite.compte")}</strong>{tr("ui.pageConfidentialite.adresseEMailEtMot")}
                </li>
                <li>
                  <strong>{tr("ui.pageConfidentialite.profilVoyageur")}</strong>{tr("ui.pageConfidentialite.pseudoAvatarCouleurHumeurC")}
                </li>
                <li>
                  <strong>{tr("ui.pageConfidentialite.traverseesSuivies")}</strong>{tr("ui.pageConfidentialite.etReglagesDeNotifications")}
                </li>
                <li>
                  <strong>{tr("ui.pageConfidentialite.contributions")}</strong>{tr("ui.pageConfidentialite.avisNotesSignalementsMessagesDes")}
                </li>
                <li>
                  <strong>{tr("ui.pageConfidentialite.photos")}</strong>{tr("ui.pageConfidentialite.jointesAUnAvisNavire")}{" "}
                  <strong>
                    {tr("ui.pageConfidentialite.lesVisagesEtLesPlaques")}
                  </strong>{" "}
                  {tr("ui.pageConfidentialite.detectionSurLAppareilRien")}
                </li>
                <li>
                  <strong>{tr("ui.pageConfidentialite.billetsDeFerry")}</strong>{tr("ui.pageConfidentialite.queVousAjoutezLeDocument")}{" "}
                  <strong>{tr("ui.pageConfidentialite.laLectureSeFaitSur")}</strong>{tr("ui.pageConfidentialite.sansEnvoiAUnService")}
                </li>
              </ul>
            ),
          },
          {
            id: "position",
            title: tr("ui.pageConfidentialite.votrePosition"),
            body: (
              <>
                <p>
                  {tr("ui.pageConfidentialite.signalerUneSituationConfirmerUn")}{" "}
                  <strong>{tr("ui.pageConfidentialite.elleSertACeSeul")}</strong>{tr("ui.pageConfidentialite.vousPouvezRefuserLeSignalement")}
                </p>
                <p>
                  {tr("ui.pageConfidentialite.pourCorrigerLesPannesDe")}
                </p>
              </>
            ),
          },
          {
            id: "finalites",
            title: tr("ui.pageConfidentialite.pourquoiEtSurQuelleBase"),
            body: (
              <ul>
                <li>
                  <strong>{tr("ui.pageConfidentialite.faireFonctionnerLeService")}</strong>{tr("ui.pageConfidentialite.compteTraverseesSuiviesSalonsExecution")}
                </li>
                <li>
                  <strong>{tr("ui.pageConfidentialite.modererEtProtegerLaCommunaute")}</strong>{tr("ui.pageConfidentialite.charteSignalementsLutteContreLes")}
                </li>
                <li>
                  <strong>{tr("ui.pageConfidentialite.ameliorerLaFiabiliteDesInformations")}</strong>{tr("ui.pageConfidentialite.mesureDAudienceAnonymeJournal")}
                </li>
                <li>
                  <strong>{tr("ui.pageConfidentialite.notifications")}</strong>{tr("ui.pageConfidentialite.surVotreTelephoneOuOrdinateur")}
                </li>
              </ul>
            ),
          },
          {
            id: "durees",
            title: tr("ui.pageConfidentialite.combienDeTemps"),
            body: (
              <ul>
                <li>
                  <strong>{tr("ui.pageConfidentialite.messagesDesSalonsDeTraversee")}</strong>{tr("ui.pageConfidentialite.effaces30JoursApresLa")}<strong>{tr("ui.pageConfidentialite.salonsDePortEtQuestions")}</strong>{tr("ui.pageConfidentialite.t30JoursApresLEnvoi")}
                </li>
                <li>
                  <strong>{tr("ui.pageConfidentialite.messagesPrives")}</strong>{tr("ui.pageConfidentialite.effaces7JoursApresLa")}
                </li>
                <li>
                  <strong>{tr("ui.pageConfidentialite.avis")}</strong>{tr("ui.pageConfidentialite.tantQuIlsSontPublies")}
                </li>
                <li>
                  <strong>{tr("ui.pageConfidentialite.signalements")}</strong>{tr("ui.pageConfidentialite.avecLeursConfirmationsEtDementis")}
                </li>
                <li>
                  <strong>{tr("ui.pageConfidentialite.journalTechniqueDeLocalisation")}</strong>{tr("ui.pageConfidentialite.t14Jours")}
                </li>
                <li>
                  <strong>{tr("ui.pageConfidentialite.compteEtProfil")}</strong>{tr("ui.pageConfidentialite.jusquALaSuppressionDu")}
                </li>
                <li>
                  <strong>{tr("ui.pageConfidentialite.photos")}</strong>{tr("ui.pageConfidentialite.avisEtSignalementsPublieesSeulement")}
                </li>
                <li>
                  <strong>{tr("ui.pageConfidentialite.billets")}</strong>{tr("ui.pageConfidentialite.effacesAutomatiquement7JoursApres")}
                </li>
              </ul>
            ),
          },
          {
            id: "destinataires",
            title: tr("ui.pageConfidentialite.quiTraiteVosDonnees"),
            body: (
              <>
                <p>
                  {tr("ui.pageConfidentialite.seuleLEquipeBledwayAdministration")}<strong>{tr("ui.pageConfidentialite.aucuneReventeAucunePubliciteCiblee")}</strong>{tr("ui.pageConfidentialite.nousFaisonsAppelADes")}
                </p>
                <ul>
                  <li>
                    <strong>{tr("ui.pageConfidentialite.vercel")}</strong>{tr("ui.pageConfidentialite.hebergementDuSite")}
                  </li>
                  <li>
                    <strong>{tr("ui.pageConfidentialite.supabase")}</strong>{tr("ui.pageConfidentialite.baseDeDonneesComptesEt")}
                  </li>
                  <li>
                    <strong>{tr("ui.pageConfidentialite.google")}</strong>{tr("ui.pageConfidentialite.connexionAvecGoogleSiVous")}
                  </li>
                  <li>
                    <strong>{tr("ui.pageConfidentialite.servicesDeNotification")}</strong>{tr("ui.pageConfidentialite.deVotreNavigateurGoogleApple")}
                  </li>
                  <li>
                    <strong>{tr("ui.pageConfidentialite.openMeteo")}</strong>{tr("ui.pageConfidentialite.etatDeLaMerVotre")}
                  </li>
                  <li>
                    <strong>{tr("ui.pageConfidentialite.openfreemap")}</strong>{tr("ui.pageConfidentialite.fondDeCarteChargePar")}
                  </li>
                  <li>
                    <strong>{tr("ui.pageConfidentialite.photonEtOsrm")}</strong>{tr("ui.pageConfidentialite.calculDuTrajetDePorte")}
                  </li>
                </ul>
                <p>
                  {tr("ui.pageConfidentialite.certainsDeCesPrestatairesSont")}
                </p>
              </>
            ),
          },
          {
            id: "salons",
            title: tr("ui.pageConfidentialite.salonsMessagesPrivesEtModeration"),
            body: (
              <>
                <p>
                  {tr("ui.pageConfidentialite.lesMessagesDesSalonsSont")}{" "}
                  <PageLink to="/charte">{tr("ui.pageConfidentialite.charteDeLaCommunaute")}</PageLink>{tr("ui.pageConfidentialite.etPeuventEtreRelusPar")}
                </p>
                <p>
                  {tr("ui.pageConfidentialite.lesMessagesPrivesEntreVoyageurs")}
                </p>
              </>
            ),
          },
          {
            id: "securite",
            title: tr("ui.pageConfidentialite.securite"),
            body: (
              <p>
                {tr("ui.pageConfidentialite.connexionsChiffreesHttpsMotsDe")}
              </p>
            ),
          },
          {
            id: "droits",
            title: tr("ui.pageConfidentialite.vosDroits"),
            body: (
              <>
                <p>
                  {tr("ui.pageConfidentialite.vousPouvezAToutMoment")}
                </p>
                <ul>
                  <li>
                    <strong>{tr("ui.pageConfidentialite.depuisMonProfil")}</strong>{tr("ui.pageConfidentialite.pseudoAvatarNotificationsTraverseesSuivies")}
                  </li>
                  <li>
                    <strong>{tr("ui.pageConfidentialite.pourToutLeReste")}</strong>{tr("ui.pageConfidentialite.laPage")}<PageLink to="/contact">{tr("ui.pageConfidentialite.contact")}</PageLink>{tr("ui.pageConfidentialite.reponseSousUnMoisAu")}
                  </li>
                </ul>
                <p>
                  {tr("ui.pageConfidentialite.siVousEstimezQueVos")}
                </p>
              </>
            ),
          },
          {
            id: "suppression-compte",
            title: tr("ui.pageConfidentialite.supprimerVotreCompte"),
            body: (
              <>
                <p>
                  {tr("ui.pageConfidentialite.surLeSiteCommeDans")}
                </p>
                <ul>
                  <li>
                    {tr("ui.pageConfidentialite.depuisMonProfilTouchez")}<strong>{tr("ui.pageConfidentialite.supprimerMonCompte")}</strong>{tr("ui.pageConfidentialite.ouEcrivezA")}{" "}
                    <a href="mailto:contact@bledway.com?subject=Suppression%20de%20mon%20compte%20BledWay">
                      {tr("ui.pageConfidentialite.contactBledwayCom")}
                    </a>{" "}
                    {tr("ui.pageConfidentialite.depuisLAdresseDeVotre")}
                  </li>
                  <li>
                    {tr("ui.pageConfidentialite.leCompteEtLesDonnees")}
                  </li>
                  <li>
                    {tr("ui.pageConfidentialite.seulesLesDonneesQuUne")}
                  </li>
                </ul>
              </>
            ),
          },
          {
            id: "mineurs",
            title: tr("ui.pageConfidentialite.mineurs"),
            body: (
              <p>
                {tr("ui.pageConfidentialite.ilFautAvoirAuMoins")}
              </p>
            ),
          },
          {
            id: "evolution",
            title: tr("ui.pageConfidentialite.evolutionDeCettePolitique"),
            body: (
              <p>
                {tr("ui.pageConfidentialite.cettePageEvolueAvecLe")}
              </p>
            ),
          },
        ]}
      />
    </SiteLayout>
  );
}
