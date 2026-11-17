import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  CalendarDays,
  Euro,
  ClipboardList,
  FileText,
  Lightbulb,
  ArrowRight,
  Baby,
  Check,
  ChevronDown,
  ExternalLink,
  Info,
  LocateFixed,
  MapPin,
  Minus,
  Pencil,
  Phone,
  Plus,
  User,
  Users,
} from "lucide-react";
import { textLink } from "@/components/editorial/Editorial";
import { SearchBox } from "@/components/SearchBox";
import { Bw504Note, BwKnow } from "@/components/companion/Bw504Note";
import { WizardNav, useInWizard } from "@/components/prepare/WizardFrame";
import {
  FORMALITES_CHECKED,
  consulatForDepartment,
  consulateTasks,
  defaultAnswers,
  delais,
  departmentFromPostcode,
  formaliteSources,
  isPaperToDo,
  paperKind,
  loadPapers,
  taskSummaries,
  newTraveller,
  reassurances,
  savePapers,
  tasksFor,
  totalCost,
  travellerLabel,
  travelsWithDzPassport,
  ageBandOf,
  ageBands,
  dzHasOf,
  dzHasOptions,
  fromDzHas,
  whenLabels,
  whenOrder,
  type Answers,
  type Consulat,
  type FormaliteSourceId,
  type Task,
  type Traveller,
  type When,
} from "@/content/formalites";
import { displayDate } from "@/lib/seo/site";
import { RecapSheet } from "@/components/papers/RecapSheet";
import { TaskLink } from "@/components/papers/TaskLink";
import { SharePreparation } from "@/components/prepare/SharePreparation";

/**
 * Le parcours « Mes papiers » : questions, liste à cocher, consulat. Seul sur la page des
 * papiers, et intégré comme étape du compagnon « Préparer mon voyage ».
 */

/** Intégré dans le compagnon : titres plus petits, au bon niveau. */
export const EmbeddedPapers = createContext(false);

export type PapersStep = "home" | "group" | "people" | "family" | "stay";

/**
 * Les questions à poser. Le compagnon connaît déjà le groupe : il part de « people » et ne cherche
 * le consulat qu'à la fin, et seulement si une démarche s'y fait.
 */
export function papersSteps(
  a: Answers,
  from: "home" | "people" | "companion" = "home",
): PapersStep[] {
  const adults = a.travellers.filter((t) => t.kind === "adult").length;
  const kids = a.travellers.some((t) => t.kind === "child");
  const all: PapersStep[] =
    adults > 1 || kids
      ? ["home", "group", "people", "family", "stay"]
      : ["home", "group", "people", "stay"];
  if (from === "companion") {
    const asked = all.filter((s) => s !== "home" && s !== "group");
    // Le consulat ne s'interroge plus à part : il s'affiche dans chaque démarche qui le demande.
    return asked;
  }
  return from === "people" ? all.filter((s) => s !== "home" && s !== "group") : all;
}

/** Réponses et cases cochées : enregistrées sur l'appareil, partagées avec le compagnon. */
export function usePapersState() {
  const [answers, setAnswers] = useState<Answers>(defaultAnswers);
  const [done, setDone] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const saved = loadPapers();
    if (saved) {
      setAnswers(saved.answers);
      setDone(saved.done);
      setFinished(saved.finished);
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) savePapers({ answers, done, finished });
  }, [answers, done, finished, loaded]);
  const patch = (p: Partial<Answers>) => setAnswers((a) => ({ ...a, ...p }));
  return { answers, setAnswers, patch, done, setDone, finished, setFinished, loaded };
}
export type PapersState = ReturnType<typeof usePapersState>;

/** Les questions, une par écran, avec Retour / Continuer. */
export function PapersWizard({
  state,
  steps,
  step,
  setStep,
  onFinish,
  onBackFirst,
  label = "Mes papiers",
  homeSlot,
}: {
  state: PapersState;
  steps: PapersStep[];
  step: PapersStep;
  setStep: (step: PapersStep) => void;
  onFinish: () => void;
  /** Retour depuis la première question (le compagnon revient à l'étape d'avant). */
  onBackFirst?: () => void;
  label?: string;
  /** Le compagnon pose sa propre question de résidence (pays d'Europe, ville). */
  homeSlot?: ReactNode;
}) {
  const index = Math.max(0, steps.indexOf(step));
  const current = steps[index]!;
  const { answers, patch } = state;
  // Dans le guide plein écran, le fil du haut dit déjà où l'on en est.
  const inWizard = useInWizard();
  return (
    <div>
      {inWizard ? null : (
        <>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            {label} · question {index + 1} sur {steps.length}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${((index + 1) / (steps.length + 1)) * 100}%` }}
            />
          </div>
        </>
      )}
      {current === "home" ? (homeSlot ?? <HomeStep answers={answers} patch={patch} />) : null}
      {current === "group" ? <GroupStep answers={answers} patch={patch} /> : null}
      {current === "people" ? <PeopleStep answers={answers} patch={patch} /> : null}
      {current === "family" ? <FamilyStep answers={answers} patch={patch} /> : null}
      {current === "stay" ? <StayStep answers={answers} patch={patch} /> : null}
      <WizardNav
        back={index > 0 ? () => setStep(steps[index - 1]!) : onBackFirst}
        next={{
          label: index + 1 < steps.length ? "Continuer" : "Voir mon plan d'action",
          onClick: () => (index + 1 < steps.length ? setStep(steps[index + 1]!) : onFinish()),
        }}
      />
    </div>
  );
}

/** Les délais, démarche par démarche (repliés). */
export function PapersDelais() {
  return (
    <section aria-labelledby="delais" className="mt-12">
      <details className="group rounded-xl border">
        <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 md:p-5">
          <h2 id="delais" className="font-display text-xl font-bold">
            Les délais, démarche par démarche
          </h2>
          <ChevronDown
            size={18}
            className="transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="divide-y border-t">
          {delais.map((d) => (
            <div
              key={d.demarche}
              className="grid gap-1 p-4 md:grid-cols-[1.2fr_1fr_0.8fr_1.6fr] md:gap-4"
            >
              <p className="font-semibold">{d.demarche}</p>
              <p className="text-sm text-muted-foreground">{d.ou}</p>
              <p className="text-sm font-semibold">{d.delai}</p>
              <div className="text-sm text-muted-foreground">
                {d.conseil}
                <SourceLinks ids={d.sources} />
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

/* ------------------------------------------------------------------ Les questions */

export function Question({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const embedded = useContext(EmbeddedPapers);
  const Heading = embedded ? "h3" : "h1";
  return (
    <div className={embedded ? "mt-4" : "mt-6"}>
      <Heading
        id={embedded ? undefined : "question"}
        className={`font-display font-bold leading-tight ${embedded ? "text-xl md:text-2xl" : "text-2xl md:text-4xl"}`}
      >
        {title}
      </Heading>
      {hint ? <p className="mt-2 text-muted-foreground">{hint}</p> : null}
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function Options<T extends string>({
  label,
  value,
  onChange,
  options,
  small = false,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
  small?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`grid gap-2 ${small ? "sm:grid-cols-2" : ""}`}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
              on
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "bg-background hover:border-primary/40"
            }`}
          >
            <span
              className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}
              aria-hidden
            >
              {on ? <Check size={12} strokeWidth={3} /> : null}
            </span>
            <span>
              <span className="block font-semibold">{o.label}</span>
              {o.hint ? (
                <span className="mt-0.5 block text-sm text-muted-foreground">{o.hint}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export type StepProps = { answers: Answers; patch: (p: Partial<Answers>) => void };

/**
 * Les papiers algériens d'un binational : on coche tout ce qu'il a (on en a souvent plusieurs),
 * puis, s'il a un passeport valide, avec lequel il part. Le document qui compte en est déduit.
 */
export function DzDocsField({
  t,
  me,
  name,
  onChange,
  compact = false,
}: {
  t: Traveller;
  me: boolean;
  name: string;
  onChange: (p: Partial<Traveller>) => void;
  compact?: boolean;
}) {
  const has = dzHasOf(t);
  const travel = t.dzTravel ?? "dz";
  const none = t.dzHas ? has.length === 0 : t.dzDoc === "aucun";
  const toggle = (value: (typeof has)[number]) => {
    const next = has.includes(value) ? has.filter((v) => v !== value) : [...has, value];
    onChange(fromDzHas(next, travel));
  };
  const box = (on: boolean) => (
    <span
      className={`grid size-5 shrink-0 place-items-center rounded-md border-2 ${on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}
      aria-hidden
    >
      {on ? <Check size={12} strokeWidth={3} /> : null}
    </span>
  );
  const row = (on: boolean) =>
    `flex ${compact ? "min-h-11 py-2" : "min-h-12 py-3"} items-center gap-3 rounded-xl border px-4 text-left transition-colors ${
      on ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-background hover:border-primary/40"
    }`;
  return (
    <div className="grid gap-4">
      <div role="group" aria-label={`Papiers algériens : ${name}`} className="grid gap-2">
        {dzHasOptions.map((option) => {
          const on = has.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(option.value)}
              className={row(on)}
            >
              {box(on)}
              <span>
                <span className="block font-semibold">{option.label}</span>
                {option.hint ? (
                  <span className="mt-0.5 block text-sm text-muted-foreground">{option.hint}</span>
                ) : null}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          role="checkbox"
          aria-checked={none}
          onClick={() => onChange(fromDzHas([], "dz"))}
          className={row(none)}
        >
          {box(none)}
          <span className="block font-semibold">Aucun papier algérien</span>
        </button>
      </div>
      {has.includes("passeport") ? (
        <div>
          <p className="font-semibold">
            {me ? "Pour ce voyage, vous partez avec :" : "Pour ce voyage, départ avec :"}
          </p>
          <div className="mt-2">
            <Options
              label={`Passeport du voyage : ${name}`}
              value={travel}
              onChange={(dzTravel) => onChange(fromDzHas(has, dzTravel))}
              small={compact}
              options={[
                { value: "dz", label: "Le passeport algérien", hint: "Et l'autre passeport aussi" },
                {
                  value: "foreign",
                  label: "Le passeport français (ou autre) seulement",
                  hint: "Le passeport algérien reste à la maison",
                },
              ]}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Les prénoms, facultatifs : on les ajoute quand on veut, depuis le récap ou avant le PDF, pour
 * lire « pour Sarah » plutôt que « Adulte 2 ». Ils restent sur l'appareil.
 */
export function NamesEditor({
  travellers,
  onChange,
}: {
  travellers: Traveller[];
  onChange: (travellers: Traveller[]) => void;
}) {
  return (
    <div className="bw-names">
      {travellers.map((x, i) => {
        const fallback = travellerLabel({ ...x, name: "" }, travellers);
        const Icon = x.kind === "child" ? Baby : User;
        return (
          <label key={x.id} className="bw-names__row">
            <span className="bw-names__icon">
              <Icon size={15} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <small>
                {fallback}
                {x.kind === "adult" && i === 0 ? " (vous)" : ""}
              </small>
              <input
                type="text"
                value={x.name ?? ""}
                onChange={(e) =>
                  onChange(
                    travellers.map((y) =>
                      y.id === x.id ? { ...y, name: e.target.value.slice(0, 24) } : y,
                    ),
                  )
                }
                placeholder={i === 0 ? "Votre prénom" : "Prénom"}
                autoComplete={i === 0 ? "given-name" : "off"}
                enterKeyHint="next"
              />
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function HomeStep({
  answers,
  patch,
  title = "Où habitez-vous ?",
  hint = "Toutes les démarches se font au consulat d'Algérie de votre lieu de résidence : ce n'est pas toujours le plus proche.",
}: StepProps & { title?: string; hint?: string }) {
  return (
    <Question title={title} hint={hint}>
      <HomeFields answers={answers} patch={patch} />
    </Question>
  );
}

/** Ville en France, « Me localiser » et consulat ; le compagnon y ajoute le choix du pays. */
export function HomeFields({
  answers,
  patch,
  abroadToggle = true,
  showConsulat = true,
}: StepProps & { abroadToggle?: boolean; showConsulat?: boolean }) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consulat = consulatOf(answers);

  function locate() {
    if (!navigator.geolocation)
      return setError("Géolocalisation indisponible : saisissez votre code postal.");
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          // Service public API Géo : la commune sous ce point arrondi, rien d'autre n'est envoyé.
          const res = await fetch(
            `https://geo.api.gouv.fr/communes?lat=${coords.latitude.toFixed(3)}&lon=${coords.longitude.toFixed(3)}&fields=codesPostaux&format=json`,
          );
          const [commune] = (await res.json()) as { codesPostaux?: string[] }[];
          const code = commune?.codesPostaux?.[0];
          if (!code) throw new Error("hors de France");
          patch({ postcode: code, abroad: false });
        } catch {
          setError(
            "Position hors de France ou introuvable. Saisissez votre code postal, ou choisissez « J'habite hors de France ».",
          );
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setError("Position refusée ou indisponible : saisissez votre code postal.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  return (
    <>
      {!answers.abroad ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <CityField
            postcode={answers.postcode}
            onPick={(postcode) => patch({ postcode, abroad: false })}
          />
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="inline-flex min-h-12 items-center justify-center gap-2 self-end rounded-xl border px-4 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
          >
            <LocateFixed size={16} aria-hidden /> {locating ? "Recherche…" : "Me localiser"}
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      {showConsulat ? (
        <div aria-live="polite" className="mt-4">
          {consulat ? <ConsulatCard consulat={consulat} compact /> : null}
          {answers.abroad ? <AbroadCard /> : null}
        </div>
      ) : null}
      {abroadToggle ? (
        <button
          type="button"
          onClick={() => patch({ abroad: !answers.abroad })}
          className="mt-4 text-sm font-semibold text-primary underline underline-offset-4"
        >
          {answers.abroad
            ? "J'habite en France"
            : "J'habite hors de France (Belgique, Espagne, Allemagne…)"}
        </button>
      ) : null}
      {!answers.abroad ? (
        <p className="mt-3 text-xs text-muted-foreground">
          La ville tapée ou « Me localiser » (position arrondie) ne sont envoyés qu'au service
          public API Géo, seulement pour trouver votre commune.
        </p>
      ) : null}
    </>
  );
}

/** La ville ou le code postal, en France : la commune choisie donne le code postal (consulat, ports). */
export function CityField({
  postcode,
  onPick,
  label = "Votre ville ou code postal",
}: {
  postcode: string;
  onPick: (postcode: string, commune?: { name: string }) => void;
  label?: string;
}) {
  const [query, setQuery] = useState(postcode);
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<{ name: string; code: string; dep: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  // Code postal venu d'ailleurs (« Me localiser », réponse enregistrée) : on l'affiche.
  useEffect(() => {
    if (postcode && !query.includes(postcode)) setQuery(postcode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postcode]);
  useEffect(() => {
    const q = query.trim();
    if (/^\d{5}$/.test(q)) {
      if (q !== postcode) onPick(q);
      setResults([]);
      return;
    }
    setSearched(false);
    if (q.length < 2 || /^\d+$/.test(q) || q === picked) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setBusy(true);
      // Service public API Géo : seul le nom tapé est envoyé.
      fetch(
        `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=nom,codesPostaux,codeDepartement&boost=population&limit=6&format=json`,
      )
        .then((res) => (res.ok ? res.json() : []))
        .then((list: { nom: string; codesPostaux?: string[]; codeDepartement?: string }[]) => {
          if (cancelled) return;
          setResults(
            list
              .filter((c) => c.codesPostaux?.length)
              .map((c) => ({
                name: c.nom,
                code: c.codesPostaux![0]!,
                dep: c.codeDepartement ?? "",
              })),
          );
        })
        .catch(() => undefined)
        .finally(() => {
          if (cancelled) return;
          setBusy(false);
          setSearched(true);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  const q = query.trim();
  return (
    <SearchBox
      id="ville-france"
      label={label}
      value={query}
      onChange={setQuery}
      placeholder="Par exemple Marseille ou 13008"
      autoComplete="address-level2"
      large
      busy={busy}
      picked={q === picked || (/^\d{5}$/.test(q) && q === postcode)}
      searched={searched}
      hits={results.map((c) => ({
        key: `${c.name}-${c.code}`,
        title: c.name,
        sub: `${c.code}${c.dep ? ` · département ${c.dep}` : ""}`,
        onPick: () => {
          const text = `${c.name} (${c.code})`;
          setPicked(text);
          setQuery(text);
          setResults([]);
          onPick(c.code, { name: c.name });
        },
      }))}
    />
  );
}

export function Counter({
  label,
  icon,
  value,
  min,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  value: number;
  min: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
      <span className="flex items-center gap-3 font-semibold">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Retirer : ${label}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="grid size-11 place-items-center rounded-full border disabled:opacity-30"
        >
          <Minus size={16} aria-hidden />
        </button>
        <span className="w-6 text-center text-lg font-bold" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          aria-label={`Ajouter : ${label}`}
          disabled={value >= 9}
          onClick={() => onChange(value + 1)}
          className="grid size-11 place-items-center rounded-full border disabled:opacity-30"
        >
          <Plus size={16} aria-hidden />
        </button>
      </span>
    </div>
  );
}

export function GroupStep({ answers, patch }: StepProps) {
  const adults = answers.travellers.filter((t) => t.kind === "adult");
  const kids = answers.travellers.filter((t) => t.kind === "child");
  const resize = (kind: Traveller["kind"], n: number) => {
    const same = kind === "adult" ? adults : kids;
    const others = answers.travellers.filter((t) => t.kind !== kind);
    const list =
      n > same.length
        ? [...same, ...Array.from({ length: n - same.length }, () => newTraveller(kind))]
        : same.slice(0, n);
    const travellers = kind === "adult" ? [...list, ...others] : [...others, ...list];
    patch({ travellers, ...(kind === "adult" && n === 1 ? { couple: "none" as const } : {}) });
  };
  return (
    <Question
      title="Qui part ?"
      hint="Vous compris. Chacun peut avoir des papiers différents : on les verra un par un."
    >
      <div className="grid gap-3">
        <Counter
          label="Adultes"
          icon={<User size={20} aria-hidden />}
          value={adults.length}
          min={1}
          onChange={(n) => resize("adult", n)}
        />
        <Counter
          label="Mineurs (moins de 19 ans)"
          icon={<Baby size={20} aria-hidden />}
          value={kids.length}
          min={0}
          onChange={(n) => resize("child", n)}
        />
      </div>
      <BwKnow
        className="mt-4"
        source={<SourceLinks ids={["justice-algerie", "be-pratique"]} />}
      >
        En Algérie, on est mineur jusqu'à 19 ans : compte un jeune de 18 ans parmi les enfants.
      </BwKnow>
    </Question>
  );
}

export function PeopleStep({ answers, patch }: StepProps) {
  const update = (id: string, p: Partial<Traveller>) =>
    patch({ travellers: answers.travellers.map((t) => (t.id === id ? { ...t, ...p } : t)) });
  return (
    <Question
      title={answers.travellers.length > 1 ? "Les papiers de chacun" : "Vos papiers"}
      hint="La nationalité décide presque tout : visa ou non, et quels documents algériens."
    >
      <div className="grid gap-4">
        {answers.travellers.map((t) => (
          <TravellerCard
            key={t.id}
            t={t}
            name={travellerLabel(t, answers.travellers)}
            update={(p) => update(t.id, p)}
          />
        ))}
      </div>
    </Question>
  );
}

function TravellerCard({
  t,
  name,
  update,
}: {
  t: Traveller;
  name: string;
  update: (p: Partial<Traveller>) => void;
}) {
  const child = t.kind === "child";
  return (
    <fieldset className="rounded-2xl border bg-secondary/20 p-4 md:p-5">
      <legend className="sr-only">{name}</legend>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-display text-lg font-bold">
          {child ? <Baby size={18} aria-hidden /> : <User size={18} aria-hidden />} {name}
        </p>
        {child ? (
          <label className="flex items-center gap-2 text-sm font-semibold">
            Âge
            <select
              value={ageBandOf(t.age).age}
              onChange={(e) => update({ age: Number(e.target.value) })}
              className="min-h-11 rounded-xl border bg-background px-3"
            >
              {ageBands.map((band) => (
                <option key={band.age} value={band.age}>
                  {band.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <span className="font-semibold text-muted-foreground">Prénom (facultatif)</span>
        <input
          type="text"
          value={t.name ?? ""}
          onChange={(e) => {
            update({ name: e.target.value.slice(0, 24) });
          }}
          placeholder="Sarah, Hamid…"
          className="min-h-10 min-w-0 flex-1 rounded-xl border bg-background px-3"
        />
      </label>
      <div className="mt-3">
        <Options
          label={`Nationalité : ${name}`}
          value={t.nat}
          onChange={(nat) => update({ nat })}
          small
          options={[
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
          ]}
        />
      </div>
      {t.nat === "bi" ? (
        <div className="mt-4">
          <p className="text-sm font-semibold">
            {child ? "Ses papiers algériens" : "Vos papiers algériens"} (cochez tout ce qui existe)
          </p>
          <div className="mt-2">
            <DzDocsField t={t} me={!child} name={name} onChange={update} compact />
          </div>
        </div>
      ) : null}
      {travelsWithDzPassport(t) ? (
        <div className="mt-4">
          <p className="text-sm font-semibold">
            {child ? "Son" : "Votre"} passeport algérien sera-t-il encore valable au retour ?
          </p>
          <div className="mt-2">
            <Options
              label={`Passeport algérien valable au retour : ${name}`}
              value={t.dzValid ?? "unknown"}
              onChange={(dzValid) => update({ dzValid })}
              small
              options={[
                { value: "yes", label: "Oui, avec de la marge" },
                {
                  value: "tight",
                  label: "Oui, mais il expire peu après le retour",
                  hint: "Quelques jours ou semaines après",
                },
                { value: "no", label: "Non, il expire avant" },
                { value: "unknown", label: "Je ne sais pas", hint: "La date est sur le passeport" },
              ]}
            />
          </div>
        </div>
      ) : null}
      {!child && t.nat === "dz" ? (
        <div className="mt-4">
          <p className="text-sm font-semibold">
            Votre titre de séjour sera-t-il encore valable au retour ?
          </p>
          <div className="mt-2">
            <Options
              label={`Titre de séjour : ${name}`}
              value={t.residence}
              onChange={(residence) => update({ residence })}
              small
              options={[
                { value: "titre", label: "Oui" },
                { value: "fragile", label: "Non, ou j'ai un récépissé" },
              ]}
            />
          </div>
        </div>
      ) : null}
      {!child && t.nat !== "etr" ? (
        <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={t.man}
            onChange={(e) => update({ man: e.target.checked })}
            className="size-5 accent-[var(--primary)]"
          />
          Un homme (service national)
        </label>
      ) : null}
    </fieldset>
  );
}

export function FamilyStep({ answers, patch }: StepProps) {
  const adults = answers.travellers.filter((t) => t.kind === "adult");
  const kids = answers.travellers.filter((t) => t.kind === "child");
  const mixed = adults.some((t) => t.nat === "etr") && adults.some((t) => t.nat !== "etr");
  return (
    <Question
      title="Votre famille"
      hint="Le mariage et l'adulte qui accompagne les enfants changent les papiers."
    >
      <div className="grid gap-6">
        {adults.length > 1 ? (
          <div>
            <p className="font-semibold">Deux des adultes forment-ils un couple ?</p>
            <div className="mt-2">
              <Options
                label="Couple"
                value={answers.couple}
                onChange={(couple) => patch({ couple })}
                small
                options={[
                  { value: "married", label: "Oui, mariés" },
                  { value: "unmarried", label: "Oui, pas mariés" },
                  { value: "none", label: "Non" },
                ]}
              />
            </div>
          </div>
        ) : null}
        {answers.couple === "married" && mixed ? (
          <div>
            <p className="font-semibold">Le mariage est-il transcrit à l'état civil algérien ?</p>
            <p className="text-sm text-muted-foreground">Le visa du conjoint étranger en dépend.</p>
            <div className="mt-2">
              <Options
                label="Mariage transcrit"
                value={answers.transcribed}
                onChange={(transcribed) => patch({ transcribed })}
                small
                options={[
                  { value: "yes", label: "Oui" },
                  { value: "no", label: "Non" },
                  { value: "unknown", label: "Je ne sais pas" },
                ]}
              />
            </div>
          </div>
        ) : null}
        {kids.length ? (
          <>
            <div>
              <p className="font-semibold">Avec qui voyagent les enfants ?</p>
              <div className="mt-2">
                <Options
                  label="Les enfants voyagent avec"
                  value={answers.kidsWith}
                  onChange={(kidsWith) => patch({ kidsWith })}
                  small
                  options={[
                    { value: "both", label: "Leurs deux parents" },
                    { value: "father", label: "Leur père" },
                    { value: "mother", label: "Leur mère, sans le père" },
                    {
                      value: "other",
                      label: "Un autre adulte",
                      hint: "Grands-parents, oncle, tante…",
                    },
                    { value: "alone", label: "Seuls" },
                  ]}
                />
              </div>
            </div>
            <div>
              <p className="font-semibold">Les parents sont-ils séparés ou divorcés ?</p>
              <div className="mt-2">
                <Options
                  label="Parents séparés"
                  value={answers.separated ? "yes" : "no"}
                  onChange={(v) =>
                    patch({
                      separated: v === "yes",
                      ...(v === "no" ? { motherCustody: false } : {}),
                    })
                  }
                  small
                  options={[
                    { value: "no", label: "Non" },
                    { value: "yes", label: "Oui" },
                  ]}
                />
              </div>
            </div>
            {answers.separated ? (
              <div>
                <p className="font-semibold">La garde des enfants est-elle confiée à la mère ?</p>
                <div className="mt-2">
                  <Options
                    label="Garde à la mère"
                    value={answers.motherCustody ? "yes" : "no"}
                    onChange={(v) => patch({ motherCustody: v === "yes" })}
                    small
                    options={[
                      { value: "yes", label: "Oui, par jugement" },
                      { value: "no", label: "Non, ou pas de jugement" },
                    ]}
                  />
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Question>
  );
}

export function StayStep({ answers, patch }: StepProps) {
  return (
    <Question title="Où logez-vous en Algérie ?">
      <Options
        label="Hébergement"
        value={answers.stay}
        onChange={(stay) => patch({ stay })}
        options={[
          { value: "family", label: "En famille, chez des proches" },
          { value: "hotel", label: "À l'hôtel" },
          {
            value: "both",
            label: "Les deux",
            hint: "Quelques nuits d'hôtel en plus de la famille",
          },
        ]}
      />
      <div className="mt-4 grid gap-3">
        <Bw504Note title="Pourquoi le logement ?">
          Selon ta réponse, je mets dans ta liste le bon justificatif pour le visa, et le livret
          de famille si vous êtes un couple marié.
        </Bw504Note>
        <BwKnow
          source={
            <SourceLinks
              ids={["amb-visa", "cons-visa-familial", "justice-algerie", "be-legislation"]}
            />
          }
        >
          Pour un visa, on prouve où l'on dort : le certificat d'hébergement de la famille, ou la
          réservation d'hôtel. Certains hôtels ne mettent un couple dans la même chambre que sur
          preuve du mariage.
        </BwKnow>
      </div>
    </Question>
  );
}

/* ------------------------------------------------------------------ Le résultat */

export function consulatOf(a: Answers): Consulat | null {
  if (a.abroad) return null;
  const dep = departmentFromPostcode(a.postcode);
  return dep ? consulatForDepartment(dep) : null;
}

export function PapersResult({
  answers,
  done,
  setDone,
  onEdit,
  embedded = false,
  abroadSlot,
  deadlines = {},
  patch,
  departure,
  onEditAt,
}: {
  answers: Answers;
  /** Jour de départ souhaité (AAAA-MM-JJ), rappelé en tête du bilan. */
  departure?: string | null;
  /** « Modifier » : reprendre à la bonne question plutôt qu'au début. */
  onEditAt?: (target: EditTarget) => void;
  /** Pour trouver le consulat depuis la liste (ville), sans revenir aux questions. */
  patch?: (p: Partial<Answers>) => void;
  done: string[];
  setDone: (fn: (d: string[]) => string[]) => void;
  onEdit: () => void;
  /** Dans le compagnon : pas de grand titre, la fiche du consulat avant la liste. */
  embedded?: boolean;
  /** Hors de France : les postes du pays de résidence, quand le compagnon le connaît. */
  abroadSlot?: ReactNode;
  /** Dans le compagnon : la date de chaque groupe, tirée de la date de départ, et pourquoi. */
  deadlines?: Partial<Record<When, { label: string; why: string }>>;
}) {
  const all = useMemo(() => tasksFor(answers), [answers]);
  // Les conseils ont leur encart « Bon à savoir » : la liste à cocher garde les vraies tâches.
  const tasks = useMemo(() => all.filter((t) => paperKind(t) !== "tip"), [all]);
  const notes = reassurances(answers);
  const consulat = consulatOf(answers);
  const count = tasks.filter((t) => done.includes(t.id)).length;
  const adults = answers.travellers.filter((t) => t.kind === "adult").length;
  const kids = answers.travellers.length - adults;
  const names = answers.travellers.map((t) => travellerLabel(t, answers.travellers));
  const childNames = answers.travellers
    .filter((t) => t.kind === "child")
    .map((t) => travellerLabel(t, answers.travellers));
  // « Pour Anne, Marc et les 3 enfants » quand les prénoms sont donnés.
  const adultNames = answers.travellers
    .filter((t) => t.kind === "adult" && t.name?.trim())
    .map((t) => t.name!.trim());
  const namedKids = answers.travellers.filter((t) => t.kind === "child" && t.name?.trim());
  const people = [
    ...adultNames,
    ...(kids === 1 && namedKids.length ? [namedKids[0]!.name!.trim()] : kids ? [`les ${kids} enfants`] : []),
  ];
  const recapTitle = adultNames.length
    ? `Pour ${people.length > 1 ? `${people.slice(0, -1).join(", ")} et ${people.at(-1)}` : people[0]}`
    : "Votre liste, voyageur par voyageur";
  const toggle = (id: string) =>
    setDone((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  // Les prénoms se donnent ici, quand on veut : ils ne prennent plus un écran du parcours.
  const [naming, setNaming] = useState(false);
  const named = answers.travellers.some((t) => t.name?.trim());
  const pickEdit = (target: EditTarget) =>
    target.kind === "names" && patch ? setNaming(true) : onEditAt?.(target);
  const toDo = tasks.filter(isPaperToDo);
  const toTake = tasks.filter((t) => !isPaperToDo(t));
  const atConsulate = tasks.filter((t) => t.consulate);
  const fees = totalCost(tasks);
  const consulateVisas = atConsulate.filter((t) => t.id.startsWith("visa-")).length;
  const consulateCount = atConsulate.length - Math.max(0, consulateVisas - 1);
  // La première date limite : celle du premier groupe à faire qui a une date.
  const firstDeadline = (["weeks", "months3"] as const).find(
    (when) => deadlines[when] && toDo.some((t) => t.when === when && !done.includes(t.id)),
  );

  return (
    <section
      className={embedded ? "" : "py-6 md:py-10"}
      aria-labelledby={embedded ? undefined : "resultat"}
    >
      {embedded ? null : (
        <>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Mes papiers</p>
          <h1
            id="resultat"
            className="mt-2 font-display text-3xl font-bold leading-tight md:text-5xl"
          >
            Votre liste de papiers
          </h1>
        </>
      )}
      <RecapSheet
        tasks={all}
        notes={notes}
        done={done}
        onToggle={toggle}
        onSetMany={(ids, value) =>
          setDone((d) => (value ? [...new Set([...d, ...ids])] : d.filter((x) => !ids.includes(x))))
        }
        deadlines={deadlines}
        travellers={names}
        childNames={childNames}
        coupleNames={
          answers.couple !== "none"
            ? answers.travellers
                .filter((t) => t.kind === "adult")
                .slice(0, 2)
                .map((t) => travellerLabel(t, answers.travellers))
            : []
        }
        title={recapTitle}
        adults={adults}
        kids={kids}
        departure={departure ?? null}
        consulat={consulat}
        consulateSlot={
          <ConsulateWhere consulat={consulat} answers={answers} patch={patch} abroadSlot={abroadSlot} />
        }
        editSlot={
          onEditAt ? (
            <EditMenu answers={answers} onPick={pickEdit} triggerClassName="bw-recap__hbtn" />
          ) : (
            <button type="button" onClick={onEdit} className="bw-recap__hbtn">
              <Pencil size={14} aria-hidden /> Modifier
            </button>
          )
        }
        namesSlot={
          patch && naming ? (
            <div className="bw-names-card">
              <p className="bw-names-card__title">Les prénoms sur votre récap</p>
              <NamesEditor
                travellers={answers.travellers}
                onChange={(travellers) => patch({ travellers })}
              />
              <button type="button" onClick={() => setNaming(false)} className="bw-names-card__ok">
                <Check size={14} aria-hidden /> C'est bon
              </button>
            </div>
          ) : patch && !named && answers.travellers.length > 1 ? (
            <button type="button" onClick={() => setNaming(true)} className="bw-names-hint">
              <Pencil size={14} aria-hidden />
              <span>
                <b>Ajouter les prénoms</b> « pour Sarah » plutôt que « Adulte 2 »
              </span>
            </button>
          ) : null
        }
        checkedOn={displayDate(FORMALITES_CHECKED)}
      />
    </section>
  );
}

/** « S'inscrire sur Ariane » → « s'inscrire sur Ariane » ; les sigles et noms propres restent. */
const lowerFirst = (text: string) =>
  /^[A-ZÀ-Ý][a-zà-ÿ']/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;

export function TaskRow({
  task,
  done,
  onToggle,
  first = [],
  due,
  extra,
}: {
  task: Task;
  done: boolean;
  onToggle: () => void;
  /** Sous le titre : où faire la démarche (le consulat détecté, ou de quoi le trouver). */
  extra?: ReactNode;
  /** Échéance affichée en étiquette devant les voyageurs (bilan en rubriques). */
  due?: ReactNode;
  /** Ce qu'il faut avoir fait avant (titres), encore à faire. */
  first?: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <li
      className={`rounded-xl border transition-colors ${done ? "bg-secondary/40" : "bg-background"}`}
    >
      <div className="flex items-start gap-3 p-3 md:p-4">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={`Fait : ${task.title}`}
          onClick={onToggle}
          className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border-2 ${done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary"}`}
        >
          {done ? <Check size={16} strokeWidth={3} aria-hidden /> : null}
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="w-full text-left"
          >
            <span
              className={`block font-semibold leading-snug ${done ? "text-muted-foreground line-through" : ""}`}
            >
              {task.title}
            </span>
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {due}
              {first.length && !done ? (
                <span className="basis-full text-xs font-semibold text-amber-800 dark:text-amber-200">
                  D'abord : {first.map(lowerFirst).join(", ")}
                </span>
              ) : null}
              {task.who.map((w) => (
                <span
                  key={w}
                  className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold"
                >
                  {w}
                </span>
              ))}
              {task.cost ? (
                <span className="bw-cost-chip">
                  <Euro size={12} aria-hidden /> {task.cost.label}
                </span>
              ) : null}
              {task.advice ? (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900 dark:bg-sky-900/40 dark:text-sky-100">
                  Conseil BledWay, pas une règle
                </span>
              ) : null}
              {task.toConfirm ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                  <AlertTriangle size={12} aria-hidden /> À faire confirmer
                </span>
              ) : null}
              <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-primary">
                {open ? "Masquer" : "Pourquoi, comment"}
                <ChevronDown size={14} className={open ? "rotate-180" : ""} aria-hidden />
              </span>
            </span>
          </button>
          {extra && !done ? <div className="mt-3">{extra}</div> : null}
          {open ? (
            <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
              {task.detail.split("\n").map((p) => (
                <p key={p}>{p}</p>
              ))}
              {task.link ? <TaskLink link={task.link} /> : null}
              {task.sources.length ? (
                <SourceLinks ids={task.sources} />
              ) : (
                <p className="text-xs font-semibold">
                  Aucune source officielle trouvée sur ce point.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function SourceLinks({ ids }: { ids: FormaliteSourceId[] }) {
  const unique = ids.filter((id, i) => ids.indexOf(id) === i);
  return (
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
      <span className="text-muted-foreground">Source :</span>
      {unique.map((id) => (
        <a
          key={id}
          href={formaliteSources[id].url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          title={formaliteSources[id].name}
        >
          {formaliteSources[id].short}
          <ExternalLink size={11} aria-hidden />
          <span className="sr-only">(nouvel onglet)</span>
        </a>
      ))}
    </p>
  );
}

export type EditTarget =
  | { kind: "names" }
  | { kind: "traveller"; id: string }
  | { kind: "family" }
  | { kind: "stay" };

/** « Modifier » : on choisit quoi (les prénoms, un voyageur, la famille, le séjour). */
function EditMenu({
  answers,
  onPick,
  triggerClassName,
}: {
  answers: Answers;
  onPick: (target: EditTarget) => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const items: { label: string; target: EditTarget }[] = [
    { label: "Les prénoms", target: { kind: "names" } },
    ...answers.travellers.map((t) => ({
      label: travellerLabel(t, answers.travellers),
      target: { kind: "traveller", id: t.id } as EditTarget,
    })),
    ...(answers.travellers.length > 1 ? [{ label: "Couple et enfants", target: { kind: "family" } as EditTarget }] : []),
    { label: "Le séjour", target: { kind: "stay" } },
  ];
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={
          triggerClassName ??
          "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 font-semibold hover:bg-secondary"
        }
      >
        <Pencil size={14} aria-hidden /> Modifier
        <ChevronDown size={14} className={open ? "rotate-180" : ""} aria-hidden />
      </button>
      {open ? (
        <ul className="bw-plan__editmenu" role="menu">
          {items.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onPick(item.target);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Dans la démarche elle-même (le visa d'Anne, le recensement de Youssef) : où la faire. Le consulat
 * détecté avec son adresse et le rendez-vous ; sinon, la ville à indiquer sur place.
 */
export function ConsulateWhere({
  consulat,
  answers,
  patch,
  abroadSlot,
}: {
  consulat: Consulat | null;
  answers: Answers;
  patch?: ((p: Partial<Answers>) => void) | undefined;
  abroadSlot?: ReactNode;
}) {
  if (consulat) return <ConsulatCard consulat={consulat} compact />;
  if (answers.abroad) return abroadSlot ? <>{abroadSlot}</> : null;
  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
      <p className="flex items-center gap-1.5 text-sm font-bold">
        <MapPin size={15} className="text-primary" aria-hidden /> Où faire cette démarche ?
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Au consulat d'Algérie dont dépend votre domicile. Indiquez votre ville : son adresse et le lien
        de rendez-vous s'affichent ici.
      </p>
      {patch ? (
        <div className="mt-2">
          <HomeFields answers={answers} patch={patch} showConsulat={false} />
        </div>
      ) : null}
    </div>
  );
}

export function ConsulatCard({
  consulat,
  compact = false,
}: {
  consulat: Consulat;
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-primary">Votre consulat</p>
      <p className="mt-1 font-display text-lg font-bold">{consulat.name}</p>
      {!compact ? (
        <>
          <p className="mt-2 flex items-start gap-2 text-sm">
            <MapPin size={16} className="mt-0.5 shrink-0" aria-hidden />
            {consulat.address}
          </p>
          <p className="mt-1 flex items-center gap-2 text-sm">
            <Phone size={16} className="shrink-0" aria-hidden />
            <a
              href={`tel:+33${consulat.phone.replace(/\s/g, "").slice(1)}`}
              className="hover:underline"
            >
              {consulat.phone}
            </a>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={consulat.rdv ?? consulat.site}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <CalendarDays size={15} aria-hidden />
              {consulat.rdv ? "Prendre rendez-vous" : "Site et rendez-vous"}{" "}
              <ExternalLink size={14} aria-hidden />
            </a>
            {consulat.rdv ? (
              <a
                href={consulat.site}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-semibold hover:bg-secondary"
              >
                Site du consulat <ExternalLink size={14} aria-hidden />
              </a>
            ) : null}
            <a
              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(consulat.address)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-semibold hover:bg-secondary"
            >
              Itinéraire <ExternalLink size={14} aria-hidden />
            </a>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Ouvert du mardi au samedi ; passeports, cartes d'identité et visas sur rendez-vous.{" "}
            <a
              href={formaliteSources["amb-consulats"].url}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Source : ambassade d'Algérie
            </a>
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">{consulat.address}</p>
          <a
            href={consulat.rdv ?? consulat.site}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <CalendarDays size={15} aria-hidden />
            {consulat.rdv ? "Prendre rendez-vous" : "Site du consulat (rendez-vous)"}
            <ExternalLink size={13} aria-hidden />
          </a>
        </>
      )}
    </div>
  );
}

export function AbroadCard() {
  return (
    <div className="rounded-xl border p-4 text-sm">
      <p className="font-semibold">Hors de France : le consulat d'Algérie de votre pays</p>
      <p className="mt-1 text-muted-foreground">
        Les démarches se font auprès de l'ambassade ou du consulat d'Algérie de votre pays de
        résidence. La liste officielle est tenue par le ministère algérien des Affaires étrangères.
      </p>
      <a
        href={formaliteSources["mfa-representations"].url}
        target="_blank"
        rel="noreferrer"
        className={`${textLink} mt-2 inline-flex items-center gap-1`}
      >
        Trouver la représentation de mon pays <ExternalLink size={13} aria-hidden />
      </a>
    </div>
  );
}

export function Sources() {
  return (
    <section id="sources" className="mt-10 border-t pt-6">
      <h2 className="font-display text-xl font-bold">Sources officielles</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Pages consultées le{" "}
        <time dateTime={FORMALITES_CHECKED}>{displayDate(FORMALITES_CHECKED)}</time>.
      </p>
      <ul className="mt-4 space-y-2">
        {(Object.keys(formaliteSources) as FormaliteSourceId[]).map((id) => {
          const s = formaliteSources[id];
          return (
            <li key={id} className="text-sm">
              <a href={s.url} target="_blank" rel="noreferrer" className={textLink}>
                {s.name}
              </a>
              {"updated" in s ? (
                <span className="text-muted-foreground"> · {s.updated}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-5 text-sm">
        <a href="/vehicules-moins-3-ans" className={textLink}>
          Les papiers de la voiture
        </a>{" "}
        ·{" "}
        <a href="/voyage-algerie" className={textLink}>
          Le guide du voyage
        </a>{" "}
        ·{" "}
        <a href="/contact" className={textLink}>
          Signaler une règle qui a changé
        </a>
      </p>
    </section>
  );
}
