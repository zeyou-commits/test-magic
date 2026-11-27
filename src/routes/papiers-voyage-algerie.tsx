import { useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Breadcrumbs, FaqSection } from "@/components/editorial/Editorial";
import {
  PapersDelais,
  PapersResult,
  Sources,
  papersSteps,
  usePapersState,
} from "@/components/papers/PapersFlow";
import { PapersQuestions } from "@/components/papers/PapersQuestions";
import { FORMALITES_CHECKED } from "@/content/formalites";
import { displayDate, seoHead } from "@/lib/seo/site";
import { tr } from "@/lib/i18n";

const PATH = "/papiers-voyage-algerie";

export const Route = createFileRoute("/papiers-voyage-algerie")({
  head: () =>
    seoHead(
      tr("ui.pagePapiersVoyageAlgerie.papiersPourVoyagerEnAlgerie"),
      tr("ui.pagePapiersVoyageAlgerie.visaBinationauxConjointEtrangerAutorisation"),
      PATH,
    ),
  component: PapersPage,
});

const faq = [
  {
    get q() { return tr("ui.pagePapiersVoyageAlgerie.fautIlUnVisaPour"); },
    get a() { return tr("ui.pagePapiersVoyageAlgerie.ouiSiVousNAvez"); },
  },
  {
    get q() { return tr("ui.pagePapiersVoyageAlgerie.binationalPuisJeEntrerSans"); },
    get a() { return tr("ui.pagePapiersVoyageAlgerie.jusquAu31Decembre2026"); },
  },
  {
    get q() { return tr("ui.pagePapiersVoyageAlgerie.monConjointNEstPas"); },
    get a() { return tr("ui.pagePapiersVoyageAlgerie.unVisaFamilialLeConsulat"); },
  },
  {
    get q() { return tr("ui.pagePapiersVoyageAlgerie.monEnfantAlgerienPartAvec"); },
    get a() { return tr("ui.pagePapiersVoyageAlgerie.uneAutorisationPaternelleDeSortie"); },
  },
  {
    get q() { return tr("ui.pagePapiersVoyageAlgerie.fautIlPrendreLeLivret"); },
    get a() { return tr("ui.pagePapiersVoyageAlgerie.ouiDesQuUnEnfant"); },
  },
  {
    get q() { return tr("ui.pagePapiersVoyageAlgerie.fautIlSeDeclarerA"); },
    get a() { return tr("ui.pagePapiersVoyageAlgerie.aucuneSourceOfficielleConsulteeNe"); },
    get note() { return tr("ui.pagePapiersVoyageAlgerie.pointNonTrancheParLes"); },
  },
  {
    get q() { return tr("ui.pagePapiersVoyageAlgerie.unCouplePeutIlPartager"); },
    get a() { return tr("ui.pagePapiersVoyageAlgerie.certainsHotelsDemandentAUn"); },
  },
];

function PapersPage() {
  const state = usePapersState();
  const top = useRef<HTMLDivElement>(null);
  const toTop = () =>
    requestAnimationFrame(() =>
      top.current?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
  const steps = papersSteps(state.answers);

  return (
    <SiteLayout>
      <Breadcrumbs items={[{ name: tr("ui.pagePapiersVoyageAlgerie.mesPapiers"), path: PATH }]} />
      <div ref={top} className="scroll-mt-24" />
      {state.finished ? (
        <PapersResult
          answers={state.answers}
          patch={state.patch}
          done={state.done}
          setDone={state.setDone}
          onEdit={() => {
            state.setFinished(false);
            toTop();
          }}
        />
      ) : (
        <section className="mx-auto max-w-2xl py-6 md:py-10" aria-labelledby="question">
          {/* Titre de la page pour les lecteurs d'écran et les moteurs : l'écran montre une question. */}
          <h1 className="sr-only">{tr("ui.pagePapiersVoyageAlgerie.titrePage")}</h1>
          {/* Les mêmes questions que l'étape Papiers de « Préparer mon voyage », une par écran,
              et les mêmes réponses (enregistrées sur l'appareil) : commencer ici ou là-bas revient
              au même. */}
          {state.loaded ? (
            <PapersQuestions
              state={state}
              steps={steps}
              onFinish={() => {
                state.setFinished(true);
                toTop();
              }}
            />
          ) : null}
          <p className="mt-6 text-sm text-muted-foreground">
            {tr("ui.pagePapiersVoyageAlgerie.uneQuestionParEcranSans")}{" "}
            <a
              href="/preparer-mon-voyage"
              className="font-semibold text-primary underline underline-offset-4"
            >
              {tr("ui.pagePapiersVoyageAlgerie.preparerMonVoyage")}
            </a>
            {tr("ui.pagePapiersVoyageAlgerie.reglesReluesLe")}{displayDate(FORMALITES_CHECKED)}.
          </p>
        </section>
      )}
      <PapersDelais />
      <FaqSection faq={faq} path={PATH} />
      <Sources />
    </SiteLayout>
  );
}
