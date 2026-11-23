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
          Question {step} sur {total} pour ce voyageur
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
          <Question title="Quel sera son âge le jour du départ ?">
            {choice(
              "Âge le jour du départ",
              hasAnswered(t, "age") ? String(ageBandOf(t.age).age) : "",
              (v) => update({ age: Number(v), answered: mark(t, "age") }),
              ageBands.map((band) => ({
                value: String(band.age),
                label: band.label,
                ...("hint" in band ? { hint: band.hint } : {}),
              })),
            )}
            {why(
              "Pourquoi l'âge ?",
              "Selon l'âge, je n'ajoute pas les mêmes papiers à ta liste.",
              {
                text: `Le visa est gratuit avant 6 ans et moins cher avant 12 ans. Jusqu'au ${BINATIONAL_MEASURE_END}, un binational de 15 ans ou moins peut entrer avec son passeport étranger, sous conditions. Majeur en France à 18 ans, on reste mineur en Algérie jusqu'à 19 ans.`,
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
            title={me ? "Quelle est votre nationalité ?" : "Quelle est sa nationalité ?"}
          >
            {choice("Nationalité", (hasAnswered(t, "nat") ? t.nat : "") as Nat, (nat) => update({ nat, answered: mark(t, "nat") }), [
              { value: "bi", label: "Algérien et français (ou autre)", hint: "Binational" },
              {
                value: "dz",
                label: "Algérien seulement",
                hint: child ? "Vit en Europe" : "Vit en Europe avec un titre de séjour",
              },
              {
                value: "etr",
                label: "Pas algérien",
                hint: "Français, belge… sans nationalité algérienne",
              },
            ])}
            {why(
              "Pourquoi la nationalité ?",
              "C'est elle qui décide presque tout : s'il faut un visa, et quels papiers algériens présenter à la frontière.",
            )}
          </Question>
        </>
      );
    if (q.q === "dzDoc")
      body = (
        <>
          {who}
          <Question
            title={me ? "Quels papiers algériens avez-vous ?" : "Quels sont ses papiers algériens ?"}
            hint="Plusieurs réponses possibles. Cochez tout ce qui existe, même expiré."
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
              "Pourquoi tous les papiers ?",
              "Ce sont les papiers algériens, même expirés, qui me disent si un visa est nécessaire.",
              {
                text: `En Algérie, un binational est traité comme un Algérien. Avec le passeport étranger seul, la carte d'identité algérienne, même expirée, évite le visa jusqu'au ${BINATIONAL_MEASURE_END}.`,
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
                ? "Avec quel passeport passerez-vous la frontière algérienne ?"
                : "Avec quel passeport passera-t-il la frontière algérienne ?"
            }
          >
            {choice<DzTravel>(
              "Passeport montré à la frontière",
              travellerValue("dzTravel", t.dzTravel ?? "dz"),
              (dzTravel) =>
                update({
                  ...fromDzHas(t.dzHas ?? ["passeport"], dzTravel),
                  answered: mark(t, "dzTravel"),
                }),
              [
                { value: "dz", label: "Mon passeport algérien" },
                {
                  value: "foreign",
                  label: "Mon passeport français (ou autre)",
                  hint: "Le passeport algérien reste à la maison",
                },
              ],
            )}
            {why(
              "Pourquoi le passeport de la frontière ?",
              "C'est lui qui décide : je regarde s'il faut un visa, et quel passeport doit tenir jusqu'au retour.",
            )}
          </Question>
        </>
      );
    if (q.q === "dzValid")
      body = (
        <>
          {who}
          <Question
            title={`${me ? "Votre" : "Son"} passeport algérien sera-t-il encore valable au retour ?`}
            hint="La date de fin est sur la page de la photo."
          >
            {choice<DzValid>(
              "Passeport valable au retour",
              travellerValue("dzValid", t.dzValid ?? "unknown"),
              (dzValid) => update({ dzValid, answered: mark(t, "dzValid") }),
              [
                { value: "yes", label: "Oui, avec de la marge" },
                {
                  value: "tight",
                  label: "Oui, mais il expire peu après le retour",
                  hint: "Quelques jours ou semaines après",
                },
                { value: "no", label: "Non, il expire avant" },
                { value: "unknown", label: "Je ne sais pas" },
              ],
            )}
            {why(
              "Pourquoi le retour ?",
              "C'est avec ce passeport qu'on ressort d'Algérie : je regarde s'il tient jusqu'au retour, sinon je te dis quoi faire avant de partir.",
              {
                text: "Le passeport algérien doit couvrir la date du retour, et même plusieurs jours au-delà.",
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
            title={`${me ? "Votre" : "Son"} titre de séjour sera-t-il encore valable au retour ?`}
          >
            {choice<Residence>("Titre de séjour", travellerValue("residence", t.residence), (residence) => update({ residence, answered: mark(t, "residence") }), [
              { value: "titre", label: "Oui" },
              { value: "fragile", label: "Non, ou j'ai un récépissé" },
            ])}
            {why(
              "Pourquoi le titre de séjour ?",
              "Je regarde s'il couvre le retour en France. Sinon, je te dis quoi faire avant de partir.",
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
                ? "Où en êtes-vous avec le service national algérien ?"
                : "Où en est-il avec le service national algérien ?"
            }
          >
            {choice<SnStatus>(
              "Service national",
              travellerValue("sn", t.sn === "exempt" ? "ok" : (t.sn ?? "unknown")),
              (sn) => update({ sn, answered: mark(t, "sn") }),
              [
                {
                  value: "ok",
                  label: "Recensé ou dispensé au consulat",
                  hint: "Attestation de recensement, carte ou dispense",
                },
                ...(t.nat === "bi"
                  ? [
                      {
                        value: "option" as const,
                        label: "Déclaration d'option pour la France",
                        hint: "Faite à la préfecture, entre 16 et 25 ans",
                      },
                      {
                        value: "jdc" as const,
                        label: "J'ai fait la JDC en France",
                        hint: "Journée défense et citoyenneté (ex-JAPD)",
                      },
                    ]
                  : []),
                { value: "todo", label: "Rien de fait" },
                { value: "unknown", label: "Je ne sais pas" },
              ],
            )}
            {why(
              "Pourquoi le service national ?",
              "Selon ta réponse, je mets la preuve dans la pochette du voyage, ou la démarche dans ta liste.",
              t.nat === "bi"
                ? {
                    text: "Pour un franco-algérien, l'accord franco-algérien de 1983 fait compter le service national choisi en France (JDC ou déclaration d'option).",
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
            title={me ? "Vous êtes un homme ou une femme ?" : "Un homme ou une femme ?"}
          >
            {choice("Homme ou femme", (hasAnswered(t, "man") ? (t.man ? "yes" : "no") : "") as "yes" | "no", (v) => update({ man: v === "yes", answered: mark(t, "man") }), [
              { value: "yes", label: "Un homme" },
              { value: "no", label: "Une femme" },
            ])}
            {why(
              "Pourquoi je le demande ?",
              "Pour savoir si le service national algérien entre en jeu. Si oui, je regarde quelle preuve emporter.",
              {
                text: "Le service national est obligatoire pour un homme algérien de 19 ans révolus. Une preuve (recensement ou dispense) peut être demandée à la sortie d'Algérie.",
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
          title="Deux des adultes sont-ils en couple ?"
        >
          {choice<Couple>("Couple", groupValue("couple", answers.couple), (couple) => setGroup("couple", { couple }), [
            { value: "married", label: "Oui, mariés" },
            { value: "unmarried", label: "Oui, sans être mariés" },
            { value: "none", label: "Non" },
          ])}
          {why(
            "Pourquoi le couple ?",
            "Un mariage peut changer les papiers d'un conjoint qui n'est pas algérien : je regarde lesquels.",
            {
              text: "Marié à un Algérien, un conjoint étranger peut demander le visa familial de conjoint.",
              sources: ["cons-visa-familial"],
            },
          )}
        </Question>
      );
    if (q.q === "transcribed")
      body = (
        <Question
          title="Le mariage est-il transcrit à l'état civil algérien ?"
        >
          {choice<Answers["transcribed"]>("Mariage transcrit", groupValue("transcribed", answers.transcribed), (transcribed) => setGroup("transcribed", { transcribed }), [
            { value: "yes", label: "Oui" },
            { value: "no", label: "Non" },
            { value: "unknown", label: "Je ne sais pas" },
          ])}
          {why(
            "Pourquoi la transcription ?",
            "Si elle n'est pas faite, je l'ajoute à tes démarches, en premier.",
            {
              text: "Le visa familial de conjoint demande l'acte de mariage transcrit à l'état civil algérien.",
              sources: ["cons-visa-familial"],
            },
          )}
        </Question>
      );
    if (q.q === "kidsWith")
      body = (
        <Question
          title="Avec qui voyagent les enfants ?"
        >
          {choice<KidsWith>("Les enfants voyagent avec", groupValue("kidsWith", answers.kidsWith), (kidsWith) => setGroup("kidsWith", { kidsWith }), [
            { value: "both", label: "Leurs deux parents" },
            { value: "father", label: "Leur père" },
            { value: "mother", label: "Leur mère, sans le père" },
            { value: "other", label: "Un autre adulte", hint: "Grands-parents, oncle, tante…" },
            { value: "alone", label: "Seuls" },
          ])}
          {why(
            "Pourquoi l'accompagnant ?",
            "Selon l'adulte qui part avec eux, je te dis quels papiers ajouter.",
            {
              text: "Un mineur algérien qui voyage sans son père présente une autorisation paternelle à la sortie d'Algérie. Elle se fait au consulat.",
              sources: ["cons-autorisation", "justice-algerie"],
            },
          )}
        </Question>
      );
    if (q.q === "separated")
      body = (
        <Question title="Les parents sont-ils séparés ou divorcés ?">
          {choice(
            "Parents séparés",
            groupValue<"yes" | "no">("separated", answers.separated ? "yes" : "no"),
            (v) =>
              setGroup("separated", {
                separated: v === "yes",
                ...(v === "no" ? { motherCustody: false } : {}),
              }),
            [
              { value: "no", label: "Non" },
              { value: "yes", label: "Oui" },
            ],
          )}
        </Question>
      );
    if (q.q === "custody")
      body = (
        <Question title="La garde des enfants est-elle confiée à la mère ?">
          {choice(
            "Garde à la mère",
            groupValue<"yes" | "no">("custody", answers.motherCustody ? "yes" : "no"),
            (v) => setGroup("custody", { motherCustody: v === "yes" }),
            [
              { value: "yes", label: "Oui, par jugement" },
              { value: "no", label: "Non, ou pas de jugement" },
            ],
          )}
          {why(
            "Pourquoi la garde ?",
            "Selon ta réponse, je mets dans la pochette du voyage le jugement de garde ou l'autorisation paternelle.",
            {
              text: "Les enfants de parents séparés ou divorcés dont la mère a la garde sont dispensés de l'autorisation paternelle : on emporte le jugement qui fixe la garde.",
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
          label: at + 1 < list.length ? "Continuer" : "Voir mon plan d'action",
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
