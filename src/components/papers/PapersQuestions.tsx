import { useEffect, useRef, useState, type ReactNode } from "react";
import { Baby, User } from "lucide-react";
import {
  travellerLabel,
  travelsWithDzPassport,
  type Answers,
  type Traveller,
} from "@/content/formalites";
import { WizardNav, useWizardScreen } from "@/components/prepare/WizardFrame";
import { genderFromName } from "@/lib/papers/genderFromName";
import {
  GroupStep,
  HomeStep,
  Options,
  Question,
  StayStep,
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

/** Les questions qui se posent vraiment, d'après les réponses déjà données. */
export function paperQuestions(a: Answers, steps: PapersStep[]): PaperQ[] {
  const out: PaperQ[] = [];
  for (const step of steps) {
    if (step === "people") {
      // D'abord les prénoms (facultatifs) : la suite parle de Sarah ou Hamid, pas d'« Adulte 2 ».
      out.push({ kind: "names" });
      for (const t of a.travellers) {
        const child = t.kind === "child";
        const add = (q: TravellerQ) => out.push({ kind: "traveller", q, id: t.id });
        if (child) add("age");
        add("nat");
        // Un adulte a déjà 19 ans ou plus : seul le sexe compte pour le service national.
        if (!child && t.nat !== "etr") add("man");
        if (!child && t.nat !== "etr" && t.man) add("sn");
        if (t.nat === "bi") add("dzDoc");
        if (t.nat === "bi" && t.dzDoc === "passeport") add("dzTravel");
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
function Who({ t, all }: { t: Traveller; all: Traveller[] }) {
  const Icon = t.kind === "child" ? Baby : User;
  return (
    <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
      <Icon size={15} aria-hidden /> {travellerLabel(t, all)}
    </p>
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

  let body: ReactNode = null;
  if (q.kind === "names") {
    const rename = (id: string, name: string) =>
      patch({
        travellers: answers.travellers.map((x) => {
          if (x.id !== id) return x;
          // Le prénom présélectionne homme ou femme ; la question suivante reste modifiable.
          const guess = x.kind === "adult" ? genderFromName(name) : null;
          return { ...x, name: name.slice(0, 24), ...(guess ? { man: guess === "m" } : {}) };
        }),
      });
    body = (
      <Question
        title={answers.travellers.length > 1 ? "Comment s'appellent les voyageurs ?" : "Quel est votre prénom ?"}
        hint="Facultatif. Votre liste dira « pour Sarah », « pour Hamid » : plus simple à partager avec la famille. Les prénoms restent sur votre téléphone."
      >
        <div className="grid gap-2.5">
          {answers.travellers.map((x, i) => {
            const fallback = travellerLabel({ ...x, name: "" }, answers.travellers);
            const Icon = x.kind === "child" ? Baby : User;
            return (
              <label key={x.id} className="flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Icon size={17} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {fallback}
                    {x.kind === "child" ? "" : i === 0 ? " (vous)" : ""}
                  </span>
                  <input
                    type="text"
                    value={x.name ?? ""}
                    onChange={(e) => rename(x.id, e.target.value)}
                    placeholder={i === 0 ? "Votre prénom" : "Prénom"}
                    autoComplete={i === 0 ? "given-name" : "off"}
                    enterKeyHint="next"
                    className="mt-0.5 w-full bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
                  />
                </span>
              </label>
            );
          })}
        </div>
      </Question>
    );
  } else if (q.kind === "step") {
    if (q.step === "home") body = homeSlot ?? <HomeStep answers={answers} patch={patch} />;
    else if (q.step === "group") body = <GroupStep answers={answers} patch={patch} />;
    else if (q.step === "stay") body = <StayStep answers={answers} patch={(p) => set(p)} />;
  } else if (q.kind === "traveller" && t) {
    const who = <Who t={t} all={answers.travellers} />;
    if (q.q === "age")
      body = (
        <>
          {who}
          <Question title="Quel est son âge ?" hint="Au moment du voyage.">
            <div
              role="radiogroup"
              aria-label="Âge"
              className="grid grid-cols-4 gap-2 sm:grid-cols-5"
            >
              {Array.from({ length: 19 }, (_, age) => (
                <button
                  key={age}
                  type="button"
                  role="radio"
                  aria-checked={t.age === age}
                  onClick={() => update({ age })}
                  className={`min-h-12 rounded-xl border px-2 text-sm font-semibold transition-colors ${
                    t.age === age
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "bg-background hover:border-primary/40"
                  }`}
                >
                  {age === 0 ? "< 1 an" : `${age} an${age > 1 ? "s" : ""}`}
                </button>
              ))}
            </div>
          </Question>
        </>
      );
    if (q.q === "nat")
      body = (
        <>
          {who}
          <Question
            title={me ? "Quelle est votre nationalité ?" : "Quelle est sa nationalité ?"}
            hint="La nationalité décide presque tout : visa ou non, et quels documents algériens."
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
          </Question>
        </>
      );
    if (q.q === "dzDoc")
      body = (
        <>
          {who}
          <Question
            title={me ? "Quel document algérien avez-vous ?" : "Quel est son document algérien ?"}
          >
            {choice("Document algérien", t.dzDoc, (dzDoc) => update({ dzDoc }), [
              { value: "passeport", label: "Un passeport algérien valide" },
              { value: "cnibe", label: "Une carte d'identité algérienne", hint: "Même expirée" },
              { value: "passeportExpire", label: "Un passeport algérien expiré" },
              { value: "aucun", label: "Aucun document algérien" },
            ])}
          </Question>
        </>
      );
    if (q.q === "dzTravel")
      body = (
        <>
          {who}
          <Question
            title={me ? "Avec quel passeport partez-vous ?" : "Avec quel passeport part-il ?"}
            hint="À l'entrée en Algérie, un binational est traité comme un Algérien."
          >
            {choice("Passeport du voyage", t.dzTravel ?? "dz", (dzTravel) => update({ dzTravel }), [
              {
                value: "dz",
                label: "Avec le passeport algérien",
                hint: "Et l'autre passeport aussi",
              },
              {
                value: "foreign",
                label: "Avec le passeport français (ou autre) seulement",
                hint: "Le passeport algérien reste à la maison",
              },
            ])}
          </Question>
        </>
      );
    if (q.q === "dzValid")
      body = (
        <>
          {who}
          <Question
            title={`${me ? "Votre" : "Son"} passeport algérien sera-t-il encore valable au retour ?`}
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
                { value: "unknown", label: "Je ne sais pas", hint: "La date est sur le passeport" },
              ],
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
          </Question>
        </>
      );
    if (q.q === "sn")
      body = (
        <>
          {who}
          <Question
            title={me ? "Êtes-vous en règle avec le service national ?" : "Est-il en règle avec le service national ?"}
            hint="Recensé au consulat, ou dispensé : la preuve part dans la pochette. Sinon, c'est une démarche à faire avant le départ."
          >
            {choice("Service national", t.sn ?? "unknown", (sn) => update({ sn }), [
              { value: "ok", label: "Oui, recensé", hint: "Attestation ou carte de service national" },
              { value: "exempt", label: "Oui, dispensé", hint: "Attestation de dispense" },
              { value: "todo", label: "Non, pas encore" },
              { value: "unknown", label: "Je ne sais pas" },
            ])}
          </Question>
        </>
      );
    if (q.q === "man")
      body = (
        <>
          {who}
          <Question
            title={me ? "Vous êtes…" : "C'est…"}
            hint="Les hommes algériens ont des obligations de service national : un papier peut être demandé."
          >
            {choice("Homme ou femme", t.man ? "yes" : "no", (v) => update({ man: v === "yes" }), [
              { value: "yes", label: "Un homme" },
              { value: "no", label: "Une femme" },
            ])}
          </Question>
        </>
      );
  } else if (q.kind === "family") {
    if (q.q === "couple")
      body = (
        <Question
          title="Deux des adultes forment-ils un couple ?"
          hint="Le mariage peut changer les papiers."
        >
          {choice("Couple", answers.couple, (couple) => set({ couple }), [
            { value: "married", label: "Oui, mariés" },
            { value: "unmarried", label: "Oui, pas mariés" },
            { value: "none", label: "Non" },
          ])}
        </Question>
      );
    if (q.q === "transcribed")
      body = (
        <Question
          title="Le mariage est-il transcrit à l'état civil algérien ?"
          hint="Le visa du conjoint étranger en dépend."
        >
          {choice("Mariage transcrit", answers.transcribed, (transcribed) => set({ transcribed }), [
            { value: "yes", label: "Oui" },
            { value: "no", label: "Non" },
            { value: "unknown", label: "Je ne sais pas" },
          ])}
        </Question>
      );
    if (q.q === "kidsWith")
      body = (
        <Question
          title="Avec qui voyagent les enfants ?"
          hint="L'adulte qui les accompagne change les papiers."
        >
          {choice("Les enfants voyagent avec", answers.kidsWith, (kidsWith) => set({ kidsWith }), [
            { value: "both", label: "Leurs deux parents" },
            { value: "father", label: "Leur père" },
            { value: "mother", label: "Leur mère, sans le père" },
            { value: "other", label: "Un autre adulte", hint: "Grands-parents, oncle, tante…" },
            { value: "alone", label: "Seuls" },
          ])}
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
