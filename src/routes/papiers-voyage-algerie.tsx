import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Breadcrumbs, FaqSection } from "@/components/editorial/Editorial";
import {
  PapersDelais,
  PapersResult,
  PapersWizard,
  Sources,
  papersSteps,
  usePapersState,
  type PapersStep,
} from "@/components/papers/PapersFlow";
import { FORMALITES_CHECKED } from "@/content/formalites";
import { displayDate, seoHead } from "@/lib/seo/site";

const PATH = "/papiers-voyage-algerie";

export const Route = createFileRoute("/papiers-voyage-algerie")({
  head: () =>
    seoHead(
      "Papiers pour voyager en Algérie : visa, enfants, consulat | BledWay",
      "Visa, binationaux, conjoint étranger, autorisation paternelle, livret de famille, service national et consulat compétent : votre liste de papiers, voyageur par voyageur, avec les sources officielles.",
      PATH,
    ),
  component: PapersPage,
});

const faq = [
  {
    q: "Faut-il un visa pour aller en Algérie avec un passeport français ?",
    a: "Oui, si vous n'avez pas la nationalité algérienne. Le visa se demande avant le départ, au consulat d'Algérie de votre lieu de résidence, sur rendez-vous. L'ambassade annonce un délai habituel de 1 à 14 jours.",
  },
  {
    q: "Binational, puis-je entrer sans passeport algérien ?",
    a: "Jusqu'au 31 décembre 2026, oui, sans visa, avec un passeport étranger valide et votre carte d'identité biométrique algérienne (même expirée) ou, à défaut, votre passeport biométrique algérien expiré. Les mêmes documents sont demandés à la sortie. Sans aucun document algérien, il faut un visa.",
  },
  {
    q: "Mon conjoint n'est pas algérien : que faut-il ?",
    a: "Un visa familial. Le consulat demande l'acte de mariage transcrit à l'état civil algérien et la preuve de votre nationalité algérienne. Faites transcrire le mariage en premier : aucun délai n'est publié.",
  },
  {
    q: "Mon enfant algérien part avec sa mère, sans son père : que faut-il ?",
    a: "Une autorisation paternelle de sortie, faite au consulat et valable 3 mois. Si les parents sont séparés ou divorcés et que la mère a la garde, l'enfant en est dispensé : emportez le jugement de garde. Côté France, aucune autorisation de sortie n'est demandée quand l'enfant voyage avec l'un de ses parents.",
  },
  {
    q: "Faut-il prendre le livret de famille ?",
    a: "Oui, dès qu'un enfant voyage. En France, il ne peut pas être exigé à la sortie, mais le consulat d'Algérie le demande, et pour un enfant binational de 15 ans ou moins sans papier algérien, il sert de document d'entrée jusqu'au 31 décembre 2026.",
  },
  {
    q: "Faut-il se déclarer à la police quand on loge en famille ?",
    a: "Aucune source officielle consultée ne le prévoit pour un Algérien. Pour les étrangers, la fiche française indique de se signaler au bureau des étrangers de la wilaya de résidence, sans dire si cela vaut pour un court séjour chez des proches : demandez au consulat.",
    note: "Point non tranché par les sources officielles : BledWay ne l'affirme pas.",
  },
  {
    q: "Un couple peut-il partager une chambre d'hôtel ?",
    a: "Certains hôtels demandent à un couple non marié de prendre deux chambres. Les couples mariés emportent un extrait d'acte de mariage.",
  },
];

function PapersPage() {
  const state = usePapersState();
  const [step, setStep] = useState<PapersStep>("home");
  const top = useRef<HTMLDivElement>(null);
  const toTop = () => requestAnimationFrame(() => top.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  const steps = papersSteps(state.answers);

  return (
    <SiteLayout>
      <Breadcrumbs items={[{ name: "Mes papiers", path: PATH }]} />
      <div ref={top} className="scroll-mt-24" />
      {state.finished ? (
        <PapersResult
          answers={state.answers}
          done={state.done}
          setDone={state.setDone}
          onEdit={() => {
            state.setFinished(false);
            setStep("home");
            toTop();
          }}
        />
      ) : (
        <section className="mx-auto max-w-2xl py-6 md:py-10" aria-labelledby="question">
          <PapersWizard
            state={state}
            steps={steps}
            step={step}
            setStep={(next) => {
              setStep(next);
              toTop();
            }}
            onFinish={() => {
              state.setFinished(true);
              toTop();
            }}
          />
          {step === "home" ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Quatre ou cinq questions, une minute. Vos réponses restent sur cet appareil. Chaque
              règle cite sa source officielle, lue le {displayDate(FORMALITES_CHECKED)}.{" "}
              <a href="/preparer-mon-voyage" className="font-semibold text-primary underline underline-offset-4">
                Préparer tout le voyage pas à pas
              </a>
            </p>
          ) : null}
        </section>
      )}
      <PapersDelais />
      <FaqSection faq={faq} path={PATH} />
      <Sources />
    </SiteLayout>
  );
}
