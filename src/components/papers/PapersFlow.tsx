import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
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
} from "lucide-react";
import { textLink } from "@/components/editorial/Editorial";
import {
  FORMALITES_CHECKED,
  consulatForDepartment,
  consulateTasks,
  defaultAnswers,
  delais,
  departmentFromPostcode,
  formaliteSources,
  isPaperToDo,
  loadPapers,
  newTraveller,
  reassurances,
  savePapers,
  tasksFor,
  travellerLabel,
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
    return consulateTasks(a).length ? [...asked, "home"] : asked;
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
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-primary">
        {label} · question {index + 1} sur {steps.length}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${((index + 1) / (steps.length + 1)) * 100}%` }}
        />
      </div>
      {current === "home" ? (homeSlot ?? <HomeStep answers={answers} patch={patch} />) : null}
      {current === "group" ? <GroupStep answers={answers} patch={patch} /> : null}
      {current === "people" ? <PeopleStep answers={answers} patch={patch} /> : null}
      {current === "family" ? <FamilyStep answers={answers} patch={patch} /> : null}
      {current === "stay" ? <StayStep answers={answers} patch={patch} /> : null}
      <div className="mt-8 flex items-center justify-between gap-3">
        {index > 0 || onBackFirst ? (
          <button
            type="button"
            onClick={() => (index > 0 ? setStep(steps[index - 1]!) : onBackFirst?.())}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl px-4 text-sm font-semibold hover:bg-secondary"
          >
            <ArrowLeft size={16} aria-hidden /> Retour
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => (index + 1 < steps.length ? setStep(steps[index + 1]!) : onFinish())}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90"
        >
          {index + 1 < steps.length ? "Continuer" : "Voir mon plan d'action"}{" "}
          <ArrowRight size={16} aria-hidden />
        </button>
      </div>
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
    if (q.length < 2 || /^\d+$/.test(q) || q === picked) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
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
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  return (
    <div className="relative">
      <label className="block">
        <span className="text-sm font-semibold">{label}</span>
        <input
          autoComplete="address-level2"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Par exemple Marseille ou 13008"
          aria-autocomplete="list"
          className="mt-1 block min-h-12 w-full rounded-xl border bg-background px-4 text-lg"
        />
      </label>
      {results.length ? (
        <ul
          role="listbox"
          className="mt-1 grid overflow-hidden rounded-xl border bg-popover shadow-md"
        >
          {results.map((c) => (
            <li key={`${c.name}-${c.code}`} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => {
                  const text = `${c.name} (${c.code})`;
                  setPicked(text);
                  setQuery(text);
                  setResults([]);
                  onPick(c.code, { name: c.name });
                }}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                <MapPin size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                {c.name}
                <span className="text-muted-foreground">
                  {c.code} · {c.dep}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
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
          label="Enfants (moins de 19 ans)"
          icon={<Baby size={20} aria-hidden />}
          value={kids.length}
          min={0}
          onChange={(n) => resize("child", n)}
        />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        En Algérie, on est mineur jusqu'à 19 ans : comptez un jeune de 18 ans parmi les enfants.
      </p>
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
              value={t.age}
              onChange={(e) => update({ age: Number(e.target.value) })}
              className="min-h-11 rounded-xl border bg-background px-3"
            >
              {Array.from({ length: 19 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? "moins d'1 an" : `${i} ans`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
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
            Quel document algérien {child ? "a-t-il" : "avez-vous"} ?
          </p>
          <div className="mt-2">
            <Options
              label={`Document algérien : ${name}`}
              value={t.dzDoc}
              onChange={(dzDoc) => update({ dzDoc })}
              small
              options={[
                { value: "passeport", label: "Un passeport algérien valide" },
                { value: "cnibe", label: "Une carte d'identité algérienne", hint: "Même expirée" },
                { value: "passeportExpire", label: "Un passeport algérien expiré" },
                { value: "aucun", label: "Aucun document algérien" },
              ]}
            />
          </div>
        </div>
      ) : null}
      {t.nat === "dz" || (t.nat === "bi" && t.dzDoc === "passeport") ? (
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
          Homme de 19 ans ou plus (service national)
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
}: {
  answers: Answers;
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
  const tasks = useMemo(() => tasksFor(answers), [answers]);
  const notes = reassurances(answers);
  const consulat = consulatOf(answers);
  const count = tasks.filter((t) => done.includes(t.id)).length;
  const adults = answers.travellers.filter((t) => t.kind === "adult").length;
  const kids = answers.travellers.length - adults;
  const toggle = (id: string) =>
    setDone((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  const toDo = tasks.filter(isPaperToDo);
  const toTake = tasks.filter((t) => !isPaperToDo(t));
  const atConsulate = tasks.filter((t) => t.consulate);
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
      <div className={`${embedded ? "" : "mt-4 "}flex flex-wrap items-center gap-2 text-sm`}>
        <span className="rounded-full bg-secondary px-3 py-1 font-semibold">
          {adults} adulte{adults > 1 ? "s" : ""}
          {kids ? ` · ${kids} enfant${kids > 1 ? "s" : ""}` : ""}
        </span>
        {consulat && atConsulate.length ? (
          <span className="rounded-full bg-secondary px-3 py-1 font-semibold">
            {consulat.name.replace(/^Consulat (général )?d'Algérie à /, "Consulat de ")}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 font-semibold hover:bg-secondary"
        >
          <Pencil size={14} aria-hidden /> Modifier mes réponses
        </button>
      </div>

      {/* Le bilan d'abord : combien de choses à faire, à emporter, et pour quand. */}
      <div className="mt-4 rounded-2xl bg-primary/5 p-4 md:p-5">
        <p className="font-display text-xl font-bold leading-snug">
          {toDo.length
            ? `${toDo.length} démarche${toDo.length > 1 ? "s" : ""} à faire`
            : "Aucune démarche à faire"}
          {" · "}
          {toTake.length} document{toTake.length > 1 ? "s" : ""} à emporter
        </p>
        <ul className="mt-2 grid gap-1 text-sm">
          {toDo.some((t) => t.when === "first" && !done.includes(t.id)) ? (
            <li>
              <span className="font-semibold">Dès maintenant :</span>{" "}
              {toDo
                .filter((t) => t.when === "first" && !done.includes(t.id))
                .map((t) => lowerFirst(t.title))
                .join(" ; ")}
              .
            </li>
          ) : null}
          {firstDeadline ? (
            <li>
              <span className="font-semibold">{deadlines[firstDeadline]!.label} :</span>{" "}
              {toDo
                .filter((t) => t.when === firstDeadline && !done.includes(t.id))
                .map((t) => lowerFirst(t.title))
                .join(" ; ")}
              .
            </li>
          ) : null}
          {atConsulate.length ? (
            <li className="text-muted-foreground">
              {atConsulate.length > 1
                ? `${atConsulate.length} de ces démarches se font au consulat`
                : "Une de ces démarches se fait au consulat"}
              {consulat || (answers.abroad && abroadSlot)
                ? " : son adresse et le lien pour prendre rendez-vous sont juste en dessous."
                : " : indiquez votre ville (Modifier mes réponses) pour le trouver."}
            </li>
          ) : toDo.length === 0 ? (
            <li className="text-muted-foreground">Rien à faire au consulat avant de partir.</li>
          ) : null}
        </ul>
      </div>

      <div
        className={`mt-6 grid gap-6 ${embedded ? "" : "lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start"}`}
      >
        <div className={embedded ? "order-2" : undefined}>
          <div className="rounded-xl border p-4" aria-live="polite">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>
                {count} sur {tasks.length} fait{count > 1 ? "s" : ""}
              </span>
              {count === tasks.length ? <span className="text-primary">Tout est prêt</span> : null}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${(count / Math.max(1, tasks.length)) * 100}%` }}
              />
            </div>
          </div>

          {notes.length ? (
            <ul className="mt-4 grid gap-2">
              {notes.map((n) => (
                <li key={n} className="flex items-start gap-2 rounded-xl bg-primary/5 p-3 text-sm">
                  <Info size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                  {n}
                </li>
              ))}
            </ul>
          ) : null}

          {whenOrder.map((when) => {
            const group = tasks.filter((t) => t.when === when);
            if (!group.length) return null;
            return (
              <div key={when} className="mt-8">
                {embedded ? (
                  <h4 className="font-display text-lg font-bold">{whenLabels[when].title}</h4>
                ) : (
                  <h2 className="font-display text-xl font-bold">{whenLabels[when].title}</h2>
                )}
                <p className="text-sm text-muted-foreground">
                  {deadlines[when] ? (
                    <>
                      <span className="font-semibold text-foreground">
                        {deadlines[when]!.label}.{" "}
                      </span>
                      {deadlines[when]!.why || whenLabels[when].hint}
                    </>
                  ) : (
                    whenLabels[when].hint
                  )}
                </p>
                <ul className="mt-3 grid gap-2">
                  {group.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      done={done.includes(t.id)}
                      onToggle={() => toggle(t.id)}
                      first={(t.needs ?? [])
                        .map((id) => tasks.find((x) => x.id === id))
                        .filter((x): x is Task => !!x && !done.includes(x.id))
                        .map((x) => x.title)}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <aside className={`grid gap-4 ${embedded ? "order-1" : "lg:sticky lg:top-24"}`}>
          {/* Le consulat seulement s'il y a quelque chose à y faire. */}
          {!atConsulate.length ? null : consulat ? (
            <ConsulatCard consulat={consulat} />
          ) : answers.abroad ? (
            (abroadSlot ?? <AbroadCard />)
          ) : null}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Sources lues le {displayDate(FORMALITES_CHECKED)}. Les règles peuvent changer : le
            consulat d'Algérie et la police aux frontières restent la référence au moment du voyage.
          </p>
        </aside>
      </div>
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
}: {
  task: Task;
  done: boolean;
  onToggle: () => void;
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
          {open ? (
            <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
              {task.detail.split("\n").map((p) => (
                <p key={p}>{p}</p>
              ))}
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
              href={consulat.site}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Site et rendez-vous <ExternalLink size={14} aria-hidden />
            </a>
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
        <p className="mt-1 text-sm text-muted-foreground">{consulat.address}</p>
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
