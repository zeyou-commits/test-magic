import { useEffect, useRef, useState, type ReactNode } from "react";
import { Baby, User } from "lucide-react";
import {
  BINATIONAL_MEASURE_END,
  ageBandOf,
  ageBands,
  travellerLabel,
  travelsWithDzPassport,
  type Answers,
  type FormaliteSourceId,
  type SnStatus,
  type Traveller,
  type AskedQ,
  type Couple,
  type DzTravel,
  type DzValid,
  type GroupQ,
  type KidsWith,
  type Nat,
  type Residence,
  fromDzHas,
  hasAnswered,
  hasAsked,
  markAsked,
} from "@/content/formalites";

/** Ajoute une question à celles que le voyageur a répondues. */
const mark = (t: Traveller, q: AskedQ): AskedQ[] => [...new Set([...(t.answered ?? []), q])];
import { Bw504Note } from "@/components/companion/Bw504Note";
import { WizardNav, useWizardScreen } from "@/components/prepare/WizardFrame";
import {
  DzDocsField,
  GroupStep,
  HomeStep,
  Options,
  Question,
  RuleDetails,
  StayStep,
  type EditTarget,
  type PapersState,
  type PapersStep,
} from "@/components/papers/PapersFlow";
import { tr } from "@/lib/i18n";

/**
 * « Mes papiers » dans le guide de « Préparer mon voyage » : une seule question par écran,
 * voyageur par voyageur. Une réponse à choix fait passer d'elle-même à la suivante.
 */

type TravellerQ = "age" | "nat" | "dzDoc" | "dzTravel" | "dzValid" | "residence" | "man" | "sn";
type FamilyQ = "couple" | "transcribed" | "kidsWith" | "separated" | "custody";
export type PaperQ =
  | { kind: "step"; step: PapersStep }
  | { kind: "traveller"; q: TravellerQ; id: string }
  | { kind: "family"; q: FamilyQ }
  | { kind: "names" };

const keyOf = (q: PaperQ) =>
  q.kind === "names"
    ? "names"
    : q.kind === "step"
      ? q.step
      : q.kind === "family"
        ? q.q
        : `${q.id}:${q.q}`;

/** La première question d'une partie à modifier (prénoms, un voyageur, la famille, le séjour). */
export function questionIndexFor(list: PaperQ[], target: EditTarget): number {
  const index = list.findIndex((q) =>
    target.kind === "names"
      ? q.kind === "names"
      : target.kind === "traveller"
        ? q.kind === "traveller" && q.id === target.id
        : target.kind === "family"
          ? q.kind === "family"
          : q.kind === "step" && q.step === "stay",
  );
  return Math.max(0, index);
}

/** Les questions qui se posent vraiment, d'après les réponses déjà données. */
export function paperQuestions(a: Answers, steps: PapersStep[]): PaperQ[] {
  const out: PaperQ[] = [];
  for (const step of steps) {
    if (step === "people") {
      // Les prénoms ne prennent plus d'écran : ils se donnent dans le récap, ou avant le PDF.
      for (const t of a.travellers) {
        const child = t.kind === "child";
        const add = (q: TravellerQ) => out.push({ kind: "traveller", q, id: t.id });
        if (child) add("age");
        add("nat");
        // Un adulte a déjà 19 ans ou plus : seul le sexe compte pour le service national.
        if (!child && t.nat !== "etr") add("man");
        if (!child && t.nat !== "etr" && t.man) add("sn");
        // Les papiers algériens, puis (s'il a un passeport valide) celui de la frontière : deux
        // écrans, une question chacun.
        if (t.nat === "bi") add("dzDoc");
        if (t.nat === "bi" && (t.dzHas ?? []).includes("passeport")) add("dzTravel");
        if (travelsWithDzPassport(t)) add("dzValid");
        if (!child && t.nat === "dz") add("residence");
      }
    } else if (step === "family") {
      const adults = a.travellers.filter((t) => t.kind === "adult");
      const kids = a.travellers.some((t) => t.kind === "child");
      const mixed = adults.some((t) => t.nat === "etr") && adults.some((t) => t.nat !== "etr");
      if (adults.length > 1) out.push({ kind: "family", q: "couple" });
      if (a.couple === "married" && mixed) out.push({ kind: "family", q: "transcribed" });
      if (kids) {
        out.push({ kind: "family", q: "kidsWith" });
        out.push({ kind: "family", q: "separated" });
        if (a.separated) out.push({ kind: "family", q: "custody" });
      }
    } else out.push({ kind: "step", step });
  }
  return out;
}

/** À qui s'adresse la question : « Vous », « Mineur 1 »… */
function Who({
  t,
  all,
  step = 0,
  total = 0,
}: {
  t: Traveller;
  all: Traveller[];
  step?: number;
  total?: number;
}) {
  const Icon = t.kind === "child" ? Baby : User;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
        <Icon size={15} aria-hidden /> {travellerLabel(t, all)}
      </p>
      {total > 1 ? (
        <span className="sr-only">
          {tr("ui.papersQuestions.question")}{step}{tr("ui.papersQuestions.sur")}{total}{tr("ui.papersQuestions.pourCeVoyageur")}
        </span>
      ) : null}
    </div>
  );
}

export function PapersQuestions({
  state,
  steps,
  homeSlot,
  start = 0,
  onFinish,
}: {
  state: PapersState;
  steps: PapersStep[];
  homeSlot?: ReactNode;
  /** L'écran d'où repartir : le dernier quand on revient de la liste. */
  start?: "last" | number;
  onFinish: () => void;
}) {
  const { answers, patch } = state;
  const list = paperQuestions(answers, steps);
  const [index, setIndex] = useState(() =>
    start === "last" ? Math.max(0, list.length - 1) : start,
  );
  const at = Math.min(index, list.length - 1);
  const q = list[at]!;
  useWizardScreen(at, list.length + 1);

  // Après une réponse, la liste a pu changer : on avance d'après la version à jour.
  const latest = useRef({ list, at });
  latest.current = { list, at };
  const forward = () => {
    const { list: now, at: here } = latest.current;
    if (here + 1 < now.length) setIndex(here + 1);
    else onFinish();
  };
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const answered = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(forward, 240);
  };

  const t = q.kind === "traveller" ? (answers.travellers.find((x) => x.id === q.id) ?? null) : null;
  const child = t?.kind === "child";
  // « Vous » pour le premier adulte ; pour les autres, la pastille dit déjà de qui il s'agit.
  const me = !!t && t.id === answers.travellers[0]?.id;
  const update = (p: Partial<Traveller>) => {
    if (!t) return;
    patch({ travellers: answers.travellers.map((x) => (x.id === t.id ? { ...x, ...p } : x)) });
    answered();
  };
  const set = (p: Partial<Answers>) => {
    patch(p);
    answered();
  };
  // Une question du groupe : répondue, elle est marquée (rien n'est coché d'avance).
  const setGroup = (q: GroupQ, p: Partial<Answers>) => set({ ...p, asked: markAsked(answers, q) });
  const groupValue = <T extends string>(q: GroupQ, value: T) =>
    (hasAsked(answers, q) ? value : "") as T;
  const travellerValue = <T extends string>(q: AskedQ, value: T) =>
    (t && hasAnswered(t, q) ? value : "") as T;
  const choice = <T extends string>(
    label: string,
    value: T,
    onChange: (v: T) => void,
    options: { value: T; label: string; hint?: string }[],
  ) => <Options label={label} value={value} onChange={onChange} options={options} />;

  // Le « pourquoi » d'une question : sous les réponses, dit par la 504. La règle de droit qui le
  // justifie n'est pas dans sa bulle : elle va dans « Bon à savoir », avec sa source officielle.
  const why = (
    title: string,
    text: ReactNode,
    rule?: { text: ReactNode; sources: FormaliteSourceId[] },
  ) => (
    <div className="mt-4 grid gap-3">
      <Bw504Note title={title}>{text}</Bw504Note>
      {rule ? <RuleDetails sources={rule.sources}>{rule.text}</RuleDetails> : null}
    </div>
  );

  let body: ReactNode = null;
  if (q.kind === "names") {
    body = null;
  } else if (q.kind === "step") {
    if (q.step === "home") body = homeSlot ?? <HomeStep answers={answers} patch={patch} />;
    else if (q.step === "group") body = <GroupStep answers={answers} patch={patch} />;
    else if (q.step === "stay") body = <StayStep answers={answers} patch={(p) => set(p)} />;
  } else if (q.kind === "traveller" && t) {
    // Mini fil d'Ariane du voyageur : « Youssef · 2 sur 4 », pour savoir combien il en reste.
    const mine = list.filter((item) => item.kind === "traveller" && item.id === t.id);
    const who = (
      <Who
        t={t}
        all={answers.travellers}
        step={mine.findIndex((item) => item === q) + 1}
        total={mine.length}
      />
    );
    if (q.q === "age")
      body = (
        <>
          {who}
          <Question title={tr("ui.papersQuestions.quelSeraSonAgeLe")}>
            {choice(
              tr("ui.papersQuestions.ageLeJourDuDepart"),
              hasAnswered(t, "age") ? String(ageBandOf(t.age).age) : "",
              (v) => update({ age: Number(v), answered: mark(t, "age") }),
              ageBands.map((band) => ({
                value: String(band.age),
                label: band.label,
                ...("hint" in band ? { hint: band.hint } : {}),
              })),
            )}
            {why(
              tr("ui.papersQuestions.pourquoiLAge"),
              tr("ui.papersQuestions.selonLAgeJeN"),
              {
                text: tr("ui.papersQuestions.leVisaEstGratuitAvant", { BINATIONALMEASUREEND: BINATIONAL_MEASURE_END }),
                sources: ["amb-visa", "cons-binationaux", "justice-algerie"],
              },
            )}
          </Question>
        </>
      );
    if (q.q === "nat")
      body = (
        <>
          {who}
          <Question
            title={me ? tr("ui.papersQuestions.quelleEstVotreNationalite") : tr("ui.papersQuestions.quelleEstSaNationalite")}
          >
            {choice(tr("ui.papersQuestions.nationalite"), (hasAnswered(t, "nat") ? t.nat : "") as Nat, (nat) => update({ nat, answered: mark(t, "nat") }), [
              { value: "bi", label: tr("ui.papersQuestions.algerienEtFrancaisOuAutre"), hint: tr("ui.papersQuestions.binational") },
              {
                value: "dz",
                label: tr("ui.papersQuestions.algerienSeulement"),
                hint: child ? tr("ui.papersQuestions.vitEnEurope") : tr("ui.papersQuestions.vitEnEuropeAvecUn"),
              },
              {
                value: "etr",
                label: tr("ui.papersQuestions.pasAlgerien"),
                hint: tr("ui.papersQuestions.francaisBelgeSansNationaliteAlgerienne"),
              },
            ])}
            {why(
              tr("ui.papersQuestions.pourquoiLaNationalite"),
              tr("ui.papersQuestions.cEstElleQuiDecide"),
            )}
          </Question>
        </>
      );
    if (q.q === "dzDoc")
      body = (
        <>
          {who}
          <Question
            title={me ? tr("ui.papersQuestions.quelsPapiersAlgeriensAvezVous") : tr("ui.papersQuestions.quelsSontSesPapiersAlgeriens")}
            hint={tr("ui.papersQuestions.plusieursReponsesPossiblesCochezTout")}
          >
            <DzDocsField
              t={t}
              me={me}
              withTravel={false}
              fresh={!hasAnswered(t, "dzDoc")}
              name={travellerLabel(t, answers.travellers)}
              onChange={(p) =>
                patch({
                  travellers: answers.travellers.map((x) =>
                    x.id === t.id ? { ...x, ...p, answered: mark(t, "dzDoc") } : x,
                  ),
                })
              }
            />
            {why(
              tr("ui.papersQuestions.pourquoiTousLesPapiers"),
              tr("ui.papersQuestions.ceSontLesPapiersAlgeriens"),
              {
                text: tr("ui.papersQuestions.enAlgerieUnBinationalEst", { BINATIONALMEASUREEND: BINATIONAL_MEASURE_END }),
                sources: ["cons-binationaux", "be-pratique"],
              },
            )}
          </Question>
        </>
      );
    if (q.q === "dzTravel")
      body = (
        <>
          {who}
          <Question
            title={
              me
                ? tr("ui.papersQuestions.avecQuelPasseportPasserezVous")
                : tr("ui.papersQuestions.avecQuelPasseportPasseraT")
            }
          >
            {choice<DzTravel>(
              tr("ui.papersQuestions.passeportMontreALaFrontiere"),
              travellerValue("dzTravel", t.dzTravel ?? "dz"),
              (dzTravel) =>
                update({
                  ...fromDzHas(t.dzHas ?? ["passeport"], dzTravel),
                  answered: mark(t, "dzTravel"),
                }),
              [
                { value: "dz", label: tr("ui.papersQuestions.monPasseportAlgerien") },
                {
                  value: "foreign",
                  label: tr("ui.papersQuestions.monPasseportFrancaisOuAutre"),
                  hint: tr("ui.papersQuestions.lePasseportAlgerienResteA"),
                },
              ],
            )}
            {why(
              tr("ui.papersQuestions.pourquoiLePasseportDeLa"),
              tr("ui.papersQuestions.cEstLuiQuiDecide"),
            )}
          </Question>
        </>
      );
    if (q.q === "dzValid")
      body = (
        <>
          {who}
          <Question
            title={tr("ui.papersQuestions.passeportAlgerienSeraTIl", { v: me ? "Votre" : "Son" })}
            hint={tr("ui.papersQuestions.laDateDeFinEst")}
          >
            {choice<DzValid>(
              tr("ui.papersQuestions.passeportValableAuRetour"),
              travellerValue("dzValid", t.dzValid ?? "unknown"),
              (dzValid) => update({ dzValid, answered: mark(t, "dzValid") }),
              [
                { value: "yes", label: tr("ui.papersQuestions.ouiAvecDeLaMarge") },
                {
                  value: "tight",
                  label: tr("ui.papersQuestions.ouiMaisIlExpirePeu"),
                  hint: tr("ui.papersQuestions.quelquesJoursOuSemainesApres"),
                },
                { value: "no", label: tr("ui.papersQuestions.nonIlExpireAvant") },
                { value: "unknown", label: tr("ui.papersQuestions.jeNeSaisPas") },
              ],
            )}
            {why(
              tr("ui.papersQuestions.pourquoiLeRetour"),
              tr("ui.papersQuestions.cEstAvecCePasseport"),
              {
                text: tr("ui.papersQuestions.lePasseportAlgerienDoitCouvrir"),
                sources: ["be-pratique", "cons-passeport"],
              },
            )}
          </Question>
        </>
      );
    if (q.q === "residence")
      body = (
        <>
          {who}
          <Question
            title={tr("ui.papersQuestions.titreDeSejourSeraT", { v: me ? "Votre" : "Son" })}
          >
            {choice<Residence>(tr("ui.papersQuestions.titreDeSejour"), travellerValue("residence", t.residence), (residence) => update({ residence, answered: mark(t, "residence") }), [
              { value: "titre", label: tr("ui.papersQuestions.oui") },
              { value: "fragile", label: tr("ui.papersQuestions.nonOuJAiUn") },
            ])}
            {why(
              tr("ui.papersQuestions.pourquoiLeTitreDeSejour"),
              tr("ui.papersQuestions.jeRegardeSIlCouvre"),
            )}
          </Question>
        </>
      );
    if (q.q === "sn")
      body = (
        <>
          {who}
          <Question
            title={
              me
                ? tr("ui.papersQuestions.ouEnEtesVousAvec")
                : tr("ui.papersQuestions.ouEnEstIlAvec")
            }
          >
            {choice<SnStatus>(
              tr("ui.papersQuestions.serviceNational"),
              travellerValue("sn", t.sn === "exempt" ? "ok" : (t.sn ?? "unknown")),
              (sn) => update({ sn, answered: mark(t, "sn") }),
              [
                {
                  value: "ok",
                  label: tr("ui.papersQuestions.recenseOuDispenseAuConsulat"),
                  hint: tr("ui.papersQuestions.attestationDeRecensementCarteOu"),
                },
                ...(t.nat === "bi"
                  ? [
                      {
                        value: "option" as const,
                        label: tr("ui.papersQuestions.declarationDOptionPourLa"),
                        hint: tr("ui.papersQuestions.faiteALaPrefectureEntre"),
                      },
                      {
                        value: "jdc" as const,
                        label: tr("ui.papersQuestions.jAiFaitLaJdc"),
                        hint: tr("ui.papersQuestions.journeeDefenseEtCitoyenneteEx"),
                      },
                    ]
                  : []),
                { value: "todo", label: tr("ui.papersQuestions.rienDeFait") },
                { value: "unknown", label: tr("ui.papersQuestions.jeNeSaisPas") },
              ],
            )}
            {why(
              tr("ui.papersQuestions.pourquoiLeServiceNational"),
              tr("ui.papersQuestions.selonTaReponseJeMets"),
              t.nat === "bi"
                ? {
                    text: tr("ui.papersQuestions.pourUnFrancoAlgerienL"),
                    sources: ["accord-1983", "pref-accord-sn"],
                  }
                : undefined,
            )}
          </Question>
        </>
      );
    if (q.q === "man")
      body = (
        <>
          {who}
          <Question
            title={me ? tr("ui.papersQuestions.vousEtesUnHommeOu") : tr("ui.papersQuestions.unHommeOuUneFemme")}
          >
            {choice(tr("ui.papersQuestions.hommeOuFemme"), (hasAnswered(t, "man") ? (t.man ? "yes" : "no") : "") as "yes" | "no", (v) => update({ man: v === "yes", answered: mark(t, "man") }), [
              { value: "yes", label: tr("ui.papersQuestions.unHomme") },
              { value: "no", label: tr("ui.papersQuestions.uneFemme") },
            ])}
            {why(
              tr("ui.papersQuestions.pourquoiJeLeDemande"),
              tr("ui.papersQuestions.pourSavoirSiLeService"),
              {
                text: tr("ui.papersQuestions.leServiceNationalEstObligatoire"),
                sources: ["cons-recensement"],
              },
            )}
          </Question>
        </>
      );
  } else if (q.kind === "family") {
    if (q.q === "couple")
      body = (
        <Question
          title={tr("ui.papersQuestions.deuxDesAdultesSontIls")}
        >
          {choice<Couple>(tr("ui.papersQuestions.couple"), groupValue("couple", answers.couple), (couple) => setGroup("couple", { couple }), [
            { value: "married", label: tr("ui.papersQuestions.ouiMaries") },
            { value: "unmarried", label: tr("ui.papersQuestions.ouiSansEtreMaries") },
            { value: "none", label: tr("ui.papersQuestions.non") },
          ])}
          {why(
            tr("ui.papersQuestions.pourquoiLeCouple"),
            tr("ui.papersQuestions.unMariagePeutChangerLes"),
            {
              text: tr("ui.papersQuestions.marieAUnAlgerienUn"),
              sources: ["cons-visa-familial"],
            },
          )}
        </Question>
      );
    if (q.q === "transcribed")
      body = (
        <Question
          title={tr("ui.papersQuestions.leMariageEstIlTranscrit")}
        >
          {choice<Answers["transcribed"]>(tr("ui.papersQuestions.mariageTranscrit"), groupValue("transcribed", answers.transcribed), (transcribed) => setGroup("transcribed", { transcribed }), [
            { value: "yes", label: tr("ui.papersQuestions.oui") },
            { value: "no", label: tr("ui.papersQuestions.non") },
            { value: "unknown", label: tr("ui.papersQuestions.jeNeSaisPas") },
          ])}
          {why(
            tr("ui.papersQuestions.pourquoiLaTranscription"),
            tr("ui.papersQuestions.siElleNEstPas"),
            {
              text: tr("ui.papersQuestions.leVisaFamilialDeConjoint"),
              sources: ["cons-visa-familial"],
            },
          )}
        </Question>
      );
    if (q.q === "kidsWith")
      body = (
        <Question
          title={tr("ui.papersQuestions.avecQuiVoyagentLesEnfants")}
        >
          {choice<KidsWith>(tr("ui.papersQuestions.lesEnfantsVoyagentAvec"), groupValue("kidsWith", answers.kidsWith), (kidsWith) => setGroup("kidsWith", { kidsWith }), [
            { value: "both", label: tr("ui.papersQuestions.leursDeuxParents") },
            { value: "father", label: tr("ui.papersQuestions.leurPere") },
            { value: "mother", label: tr("ui.papersQuestions.leurMereSansLePere") },
            { value: "other", label: tr("ui.papersQuestions.unAutreAdulte"), hint: tr("ui.papersQuestions.grandsParentsOncleTante") },
            { value: "alone", label: tr("ui.papersQuestions.seuls") },
          ])}
          {why(
            tr("ui.papersQuestions.pourquoiLAccompagnant"),
            tr("ui.papersQuestions.selonLAdulteQuiPart"),
            {
              text: tr("ui.papersQuestions.unMineurAlgerienQuiVoyage"),
              sources: ["cons-autorisation", "justice-algerie"],
            },
          )}
        </Question>
      );
    if (q.q === "separated")
      body = (
        <Question title={tr("ui.papersQuestions.lesParentsSontIlsSepares")}>
          {choice(
            tr("ui.papersQuestions.parentsSepares"),
            groupValue<"yes" | "no">("separated", answers.separated ? "yes" : "no"),
            (v) =>
              setGroup("separated", {
                separated: v === "yes",
                ...(v === "no" ? { motherCustody: false } : {}),
              }),
            [
              { value: "no", label: tr("ui.papersQuestions.non") },
              { value: "yes", label: tr("ui.papersQuestions.oui") },
            ],
          )}
        </Question>
      );
    if (q.q === "custody")
      body = (
        <Question title={tr("ui.papersQuestions.laGardeDesEnfantsEst")}>
          {choice(
            tr("ui.papersQuestions.gardeALaMere"),
            groupValue<"yes" | "no">("custody", answers.motherCustody ? "yes" : "no"),
            (v) => setGroup("custody", { motherCustody: v === "yes" }),
            [
              { value: "yes", label: tr("ui.papersQuestions.ouiParJugement") },
              { value: "no", label: tr("ui.papersQuestions.nonOuPasDeJugement") },
            ],
          )}
          {why(
            tr("ui.papersQuestions.pourquoiLaGarde"),
            tr("ui.papersQuestions.selonTaReponseJeMets2"),
            {
              text: tr("ui.papersQuestions.lesEnfantsDeParentsSepares"),
              sources: ["cons-autorisation"],
            },
          )}
        </Question>
      );
  }

  return (
    <div key={keyOf(q)}>
      {body}
      <WizardNav
        {...(at > 0 ? { back: () => setIndex(at - 1) } : {})}
        next={{
          label: at + 1 < list.length ? tr("ui.papersQuestions.continuer") : tr("ui.papersQuestions.voirMonPlanDAction"),
          onClick: forward,
          // Aucune réponse par défaut : « Continuer » attend que le voyageur ait choisi.
          disabled:
            q.kind === "traveller"
              ? !!t && !hasAnswered(t, q.q as AskedQ)
              : q.kind === "family"
                ? !hasAsked(answers, q.q)
                : q.kind === "step" && q.step === "stay"
                  ? !hasAsked(answers, "stay")
                  : false,
        }}
      />
    </div>
  );
}
