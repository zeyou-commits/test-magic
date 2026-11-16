import { useEffect, useRef, useState, type ReactNode } from "react";
import { Baby, User } from "lucide-react";
import {
  ageBandOf,
  ageBands,
  travellerLabel,
  travelsWithDzPassport,
  type Answers,
  type SnStatus,
  type Traveller,
} from "@/content/formalites";
import { Bw504Note } from "@/components/companion/Bw504Note";
import { WizardNav, useWizardScreen } from "@/components/prepare/WizardFrame";
import {
  DzDocsField,
  GroupStep,
  HomeStep,
  Options,
  Question,
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
        // Document algérien et passeport du voyage : une seule question.
        if (t.nat === "bi") add("dzDoc");
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
        <span className="bw-who-steps" aria-label={`Question ${step} sur ${total} pour ce voyageur`}>
          {Array.from({ length: total }, (_, i) => (
            <i key={i} data-on={i < step || undefined} />
          ))}
          <small>
            {step}/{total}
          </small>
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
  const choice = <T extends string>(
    label: string,
    value: T,
    onChange: (v: T) => void,
    options: { value: T; label: string; hint?: string }[],
  ) => <Options label={label} value={value} onChange={onChange} options={options} />;

  // Le « pourquoi » d'une question : sous les réponses, dit par la 504.
  const why = (title: string, text: ReactNode) => (
    <div className="mt-4">
      <Bw504Note title={title}>{text}</Bw504Note>
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
              String(ageBandOf(t.age).age),
              (v) => update({ age: Number(v) }),
              ageBands.map((band) => ({
                value: String(band.age),
                label: band.label,
                ...("hint" in band ? { hint: band.hint } : {}),
              })),
            )}
            {why(
              "Pourquoi l'âge ?",
              "Il change les papiers : le prix du visa (gratuit avant 6 ans, moins cher avant 12 ans), l'entrée des binationaux de 15 ans ou moins avec le passeport étranger, et à 18 ans on est majeur en France mais encore mineur en Algérie, jusqu'à 19 ans.",
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
            {choice("Nationalité", t.nat, (nat) => update({ nat }), [
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
            hint="Cochez tout ce qui existe, même expiré."
          >
            <DzDocsField
              t={t}
              me={me}
              name={travellerLabel(t, answers.travellers)}
              onChange={(p) =>
                patch({
                  travellers: answers.travellers.map((x) => (x.id === t.id ? { ...x, ...p } : x)),
                })
              }
            />
            {why(
              "Pourquoi tous les papiers ?",
              "En Algérie, un binational est traité comme un Algérien : ce sont ses papiers algériens qui disent s'il lui faut un visa. Avec le passeport étranger seul, la carte d'identité algérienne, même expirée, évite le visa jusqu'au 31 décembre 2026.",
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
            {choice(
              "Passeport valable au retour",
              t.dzValid ?? "unknown",
              (dzValid) => update({ dzValid }),
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
              "C'est avec ce passeport qu'on ressort d'Algérie. S'il expire pendant le séjour, le retour se complique : mieux vaut le renouveler avant de partir.",
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
            {choice("Titre de séjour", t.residence, (residence) => update({ residence }), [
              { value: "titre", label: "Oui" },
              { value: "fragile", label: "Non, ou j'ai un récépissé" },
            ])}
            {why(
              "Pourquoi le titre de séjour ?",
              "Pour revenir en France, un Algérien présente son titre de séjour à la frontière. S'il n'est plus valable au retour, je vous dis quoi faire avant de partir.",
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
              t.sn === "exempt" ? "ok" : (t.sn ?? "unknown"),
              (sn) => update({ sn }),
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
              t.nat === "bi"
                ? "Un homme algérien a des obligations de service national dès 19 ans. Pour un franco-algérien, l'accord de 1983 fait compter le service choisi en France : je vous dis si vous êtes en règle, ou quoi faire."
                : "Un homme algérien a des obligations de service national dès 19 ans. La preuve (recensement ou dispense) peut être demandée à la sortie d'Algérie : je l'ajoute à la pochette, ou la démarche à votre liste.",
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
            {choice("Homme ou femme", t.man ? "yes" : "no", (v) => update({ man: v === "yes" }), [
              { value: "yes", label: "Un homme" },
              { value: "no", label: "Une femme" },
            ])}
            {why(
              "Pourquoi je le demande ?",
              "Un homme algérien a des obligations de service national dès 19 ans : une preuve peut lui être demandée à la sortie d'Algérie. Je vérifie s'il en faut une.",
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
          {choice("Couple", answers.couple, (couple) => set({ couple }), [
            { value: "married", label: "Oui, mariés" },
            { value: "unmarried", label: "Oui, sans être mariés" },
            { value: "none", label: "Non" },
          ])}
          {why(
            "Pourquoi le couple ?",
            "Le mariage change les papiers : marié à un Algérien, un conjoint étranger peut demander le visa familial de conjoint.",
          )}
        </Question>
      );
    if (q.q === "transcribed")
      body = (
        <Question
          title="Le mariage est-il transcrit à l'état civil algérien ?"
        >
          {choice("Mariage transcrit", answers.transcribed, (transcribed) => set({ transcribed }), [
            { value: "yes", label: "Oui" },
            { value: "no", label: "Non" },
            { value: "unknown", label: "Je ne sais pas" },
          ])}
          {why(
            "Pourquoi la transcription ?",
            "Le visa familial de conjoint en dépend. Si elle n'est pas faite, je l'ajoute à vos démarches, en premier.",
          )}
        </Question>
      );
    if (q.q === "kidsWith")
      body = (
        <Question
          title="Avec qui voyagent les enfants ?"
        >
          {choice("Les enfants voyagent avec", answers.kidsWith, (kidsWith) => set({ kidsWith }), [
            { value: "both", label: "Leurs deux parents" },
            { value: "father", label: "Leur père" },
            { value: "mother", label: "Leur mère, sans le père" },
            { value: "other", label: "Un autre adulte", hint: "Grands-parents, oncle, tante…" },
            { value: "alone", label: "Seuls" },
          ])}
          {why(
            "Pourquoi l'accompagnant ?",
            "Un mineur qui part sans l'un de ses parents a besoin de papiers en plus, comme l'autorisation paternelle de sortie : je vous dis lesquels.",
          )}
        </Question>
      );
    if (q.q === "separated")
      body = (
        <Question title="Les parents sont-ils séparés ou divorcés ?">
          {choice(
            "Parents séparés",
            answers.separated ? "yes" : "no",
            (v) => set({ separated: v === "yes", ...(v === "no" ? { motherCustody: false } : {}) }),
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
            answers.motherCustody ? "yes" : "no",
            (v) => set({ motherCustody: v === "yes" }),
            [
              { value: "yes", label: "Oui, par jugement" },
              { value: "no", label: "Non, ou pas de jugement" },
            ],
          )}
          {why(
            "Pourquoi la garde ?",
            "Si les enfants partent avec leur mère, le jugement qui lui confie la garde remplace l'autorisation paternelle : il part alors dans la pochette du voyage.",
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
        }}
      />
    </div>
  );
}
