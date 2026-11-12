import { seoHead } from "@/lib/seo/site";
import { createFileRoute } from "@tanstack/react-router";
import { PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { CHARTER_RULES } from "@/components/panel/CharterGate";
import { tr } from "@/lib/i18n";

const title = "Charte de la communauté — BledWay";
const description =
  "Les règles des salons, questions et messages privés BledWay : entraide entre voyageurs, respect, informations vérifiées et modération.";

export const Route = createFileRoute("/charte")({
  head: () => seoHead(title, description, "/charte"),
  component: CharterPage,
});

function CharterPage() {
  return (
    <SiteLayout>
      <PageHero
        overline={tr("ui.pageCharte.communaute")}
        title={tr("ui.pageCharte.charteDeLaCommunaute")}
        intro={tr("ui.pageCharte.lesSalonsBledwayServentA")}
      />
      <div className="mx-auto mt-8 max-w-3xl space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-base font-semibold text-foreground">{tr("ui.pageCharte.lEssentiel")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {CHARTER_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">{tr("ui.pageCharte.ceQuiEstInterdit")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              {tr("ui.pageCharte.lesInsultesLeHarcelementLes")}
            </li>
            <li>
              {tr("ui.pageCharte.lesNumerosDeTelephoneAdresses")}
            </li>
            <li>{tr("ui.pageCharte.laPubliciteLaReventeDe")}</li>
            <li>{tr("ui.pageCharte.lesFaussesInformationsVolontairesSur")}</li>
            <li>{tr("ui.pageCharte.lesMessagesRepetesAL")}</li>
            <li>{tr("ui.pageCharte.toutContenuIllegalOuContraire")}</li>
          </ul>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">
            {tr("ui.pageCharte.lesInformationsDesVoyageurs")}
          </h2>
          <p className="mt-1">
            {tr("ui.pageCharte.ceQuePartagentLesVoyageurs")}
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">{tr("ui.pageCharte.lesMessagesOfficiels")}</h2>
          <p className="mt-1">
            {tr("ui.pageCharte.lesMembresDeLEquipe")}
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">{tr("ui.pageCharte.laModeration")}</h2>
          <p className="mt-1">
            {tr("ui.pageCharte.lesMessagesContenantUnLien")}
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">{tr("ui.pageCharte.vosNotifications")}</h2>
          <p className="mt-1">
            {tr("ui.pageCharte.vousEtesPrevenuQuandQuelqu")}
          </p>
        </section>
        <p>
          {tr("ui.pageCharte.enEcrivantDansUnSalon")}{" "}
          <a className="text-primary underline" href="/conditions-utilisation">
            {tr("ui.pageCharte.conditionsDUtilisation")}
          </a>
          .
        </p>
      </div>
    </SiteLayout>
  );
}
