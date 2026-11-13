import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Breadcrumbs, FaqSection, textLink } from "@/components/editorial/Editorial";
import {
  FORMALITES_CHECKED,
  consulatForDepartment,
  defaultAnswers,
  delais,
  departmentFromPostcode,
  formaliteSources,
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
} from "@/content/formalites";
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

type Step = "home" | "group" | "people" | "family" | "stay";

function stepsFor(a: Answers): Step[] {
  const adults = a.travellers.filter((t) => t.kind === "adult").length;
  const kids = a.travellers.some((t) => t.kind === "child");
  return adults > 1 || kids ? ["home", "group", "people", "family", "stay"] : ["home", "group", "people", "stay"];
}

function PapersPage() {
  const [answers, setAnswers] = useState<Answers>(defaultAnswers);
  const [done, setDone] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const [step, setStep] = useState<Step>("home");
  const [loaded, setLoaded] = useState(false);
  const top = useRef<HTMLDivElement>(null);

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

  const steps = stepsFor(answers);
  const index = Math.max(0, steps.indexOf(step));
  const go = (next: Step | "result") => {
    if (next === "result") setFinished(true);
    else {
      setFinished(false);
      setStep(next);
    }
    requestAnimationFrame(() => top.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };
  const next = () => (index + 1 < steps.length ? go(steps[index + 1]!) : go("result"));
  const back = () => index > 0 && go(steps[index - 1]!);
  const patch = (p: Partial<Answers>) => setAnswers((a) => ({ ...a, ...p }));

  return (
    <SiteLayout>
      <Breadcrumbs items={[{ name: "Mes papiers", path: PATH }]} />
      <div ref={top} className="scroll-mt-24" />
      {finished ? (
        <Result
          answers={answers}
          done={done}
          setDone={setDone}
          onEdit={() => go("home")}
        />
      ) : (
        <section className="mx-auto max-w-2xl py-6 md:py-10" aria-labelledby="question">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Mes papiers · étape {index + 1} sur {steps.length}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${((index + 1) / (steps.length + 1)) * 100}%` }}
            />
          </div>
          {step === "home" ? <HomeStep answers={answers} patch={patch} /> : null}
          {step === "group" ? <GroupStep answers={answers} patch={patch} /> : null}
          {step === "people" ? <PeopleStep answers={answers} patch={patch} /> : null}
          {step === "family" ? <FamilyStep answers={answers} patch={patch} /> : null}
          {step === "stay" ? <StayStep answers={answers} patch={patch} /> : null}
          <div className="mt-8 flex items-center justify-between gap-3">
            {index > 0 ? (
              <button
                type="button"
                onClick={back}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl px-4 text-sm font-semibold hover:bg-secondary"
              >
                <ArrowLeft size={16} aria-hidden /> Retour
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={next}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90"
            >
              {index + 1 < steps.length ? "Continuer" : "Voir mes papiers"} <ArrowRight size={16} aria-hidden />
            </button>
          </div>
          {index === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Quatre ou cinq questions, une minute. Vos réponses restent sur cet appareil. Chaque
              règle cite sa source officielle, lue le {displayDate(FORMALITES_CHECKED)}.
            </p>
          ) : null}
        </section>
      )}

      <>
          <section aria-labelledby="delais" className="mt-12">
            <details className="group rounded-xl border">
              <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 md:p-5">
                <h2 id="delais" className="font-display text-xl font-bold">
                  Les délais, démarche par démarche
                </h2>
                <ChevronDown size={18} className="transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="divide-y border-t">
                {delais.map((d) => (
                  <div key={d.demarche} className="grid gap-1 p-4 md:grid-cols-[1.2fr_1fr_0.8fr_1.6fr] md:gap-4">
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
          <FaqSection faq={faq} path={PATH} />
          <Sources />
      </>
    </SiteLayout>
  );
}

/* ------------------------------------------------------------------ Les questions */

function Question({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mt-6">
      <h1 id="question" className="font-display text-2xl font-bold leading-tight md:text-4xl">
        {title}
      </h1>
      {hint ? <p className="mt-2 text-muted-foreground">{hint}</p> : null}
      <div className="mt-6">{children}</div>
    </div>
  );
}

function Options<T extends string>({
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
    <div role="radiogroup" aria-label={label} className={`grid gap-2 ${small ? "sm:grid-cols-2" : ""}`}>
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
              on ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-background hover:border-primary/40"
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
              {o.hint ? <span className="mt-0.5 block text-sm text-muted-foreground">{o.hint}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

type StepProps = { answers: Answers; patch: (p: Partial<Answers>) => void };

function HomeStep({ answers, patch }: StepProps) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consulat = consulatOf(answers);

  function locate() {
    if (!navigator.geolocation) return setError("Géolocalisation indisponible : saisissez votre code postal.");
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
          setError("Position hors de France ou introuvable. Saisissez votre code postal, ou choisissez « J'habite hors de France ».");
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
    <Question
      title="Où habitez-vous ?"
      hint="Toutes les démarches se font au consulat d'Algérie de votre lieu de résidence : ce n'est pas toujours le plus proche."
    >
      {!answers.abroad ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label>
            <span className="text-sm font-semibold">Code postal</span>
            <input
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              value={answers.postcode}
              onChange={(e) => patch({ postcode: e.target.value })}
              placeholder="Par exemple 13008"
              className="mt-1 block min-h-12 w-full rounded-xl border bg-background px-4 text-lg"
            />
          </label>
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
      <div aria-live="polite" className="mt-4">
        {consulat ? <ConsulatCard consulat={consulat} compact /> : null}
        {answers.abroad ? <AbroadCard /> : null}
      </div>
      <button
        type="button"
        onClick={() => patch({ abroad: !answers.abroad })}
        className="mt-4 text-sm font-semibold text-primary underline underline-offset-4"
      >
        {answers.abroad ? "J'habite en France" : "J'habite hors de France (Belgique, Espagne, Allemagne…)"}
      </button>
      {!answers.abroad ? (
        <p className="mt-3 text-xs text-muted-foreground">
          « Me localiser » envoie une position arrondie au service public API Géo, seulement pour
          trouver votre code postal.
        </p>
      ) : null}
    </Question>
  );
}

function Counter({ label, icon, value, min, onChange }: { label: string; icon: ReactNode; value: number; min: number; onChange: (n: number) => void }) {
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

function GroupStep({ answers, patch }: StepProps) {
  const adults = answers.travellers.filter((t) => t.kind === "adult");
  const kids = answers.travellers.filter((t) => t.kind === "child");
  const resize = (kind: Traveller["kind"], n: number) => {
    const same = kind === "adult" ? adults : kids;
    const others = answers.travellers.filter((t) => t.kind !== kind);
    const list = n > same.length ? [...same, ...Array.from({ length: n - same.length }, () => newTraveller(kind))] : same.slice(0, n);
    const travellers = kind === "adult" ? [...list, ...others] : [...others, ...list];
    patch({ travellers, ...(kind === "adult" && n === 1 ? { couple: "none" as const } : {}) });
  };
  return (
    <Question title="Qui part ?" hint="Vous compris. Chacun peut avoir des papiers différents : on les verra un par un.">
      <div className="grid gap-3">
        <Counter label="Adultes" icon={<User size={20} aria-hidden />} value={adults.length} min={1} onChange={(n) => resize("adult", n)} />
        <Counter label="Enfants (moins de 19 ans)" icon={<Baby size={20} aria-hidden />} value={kids.length} min={0} onChange={(n) => resize("child", n)} />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        En Algérie, on est mineur jusqu'à 19 ans : comptez un jeune de 18 ans parmi les enfants.
      </p>
    </Question>
  );
}

function PeopleStep({ answers, patch }: StepProps) {
  const update = (id: string, p: Partial<Traveller>) =>
    patch({ travellers: answers.travellers.map((t) => (t.id === id ? { ...t, ...p } : t)) });
  return (
    <Question
      title={answers.travellers.length > 1 ? "Les papiers de chacun" : "Vos papiers"}
      hint="La nationalité décide presque tout : visa ou non, et quels documents algériens."
    >
      <div className="grid gap-4">
        {answers.travellers.map((t) => (
          <TravellerCard key={t.id} t={t} name={travellerLabel(t, answers.travellers)} update={(p) => update(t.id, p)} />
        ))}
      </div>
    </Question>
  );
}

function TravellerCard({ t, name, update }: { t: Traveller; name: string; update: (p: Partial<Traveller>) => void }) {
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
            { value: "dz", label: "Algérien seulement", hint: child ? "Vit en Europe" : "Vit en Europe avec un titre de séjour" },
            { value: "etr", label: "Pas algérien", hint: "Français, belge… sans nationalité algérienne" },
          ]}
        />
      </div>
      {t.nat === "bi" ? (
        <div className="mt-4">
          <p className="text-sm font-semibold">Quel document algérien {child ? "a-t-il" : "avez-vous"} ?</p>
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
      {!child && t.nat === "dz" ? (
        <div className="mt-4">
          <p className="text-sm font-semibold">Votre titre de séjour sera-t-il encore valable au retour ?</p>
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
          <input type="checkbox" checked={t.man} onChange={(e) => update({ man: e.target.checked })} className="size-5 accent-[var(--primary)]" />
          Homme de 19 ans ou plus (service national)
        </label>
      ) : null}
    </fieldset>
  );
}

function FamilyStep({ answers, patch }: StepProps) {
  const adults = answers.travellers.filter((t) => t.kind === "adult");
  const kids = answers.travellers.filter((t) => t.kind === "child");
  const mixed = adults.some((t) => t.nat === "etr") && adults.some((t) => t.nat !== "etr");
  return (
    <Question title="Votre famille" hint="Le mariage et l'adulte qui accompagne les enfants changent les papiers.">
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
                    { value: "other", label: "Un autre adulte", hint: "Grands-parents, oncle, tante…" },
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
                  onChange={(v) => patch({ separated: v === "yes", ...(v === "no" ? { motherCustody: false } : {}) })}
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

function StayStep({ answers, patch }: StepProps) {
  return (
    <Question title="Où logez-vous en Algérie ?">
      <Options
        label="Hébergement"
        value={answers.stay}
        onChange={(stay) => patch({ stay })}
        options={[
          { value: "family", label: "En famille, chez des proches" },
          { value: "hotel", label: "À l'hôtel" },
          { value: "both", label: "Les deux", hint: "Quelques nuits d'hôtel en plus de la famille" },
        ]}
      />
    </Question>
  );
}

/* ------------------------------------------------------------------ Le résultat */

function consulatOf(a: Answers): Consulat | null {
  if (a.abroad) return null;
  const dep = departmentFromPostcode(a.postcode);
  return dep ? consulatForDepartment(dep) : null;
}

function Result({
  answers,
  done,
  setDone,
  onEdit,
}: {
  answers: Answers;
  done: string[];
  setDone: (fn: (d: string[]) => string[]) => void;
  onEdit: () => void;
}) {
  const tasks = useMemo(() => tasksFor(answers), [answers]);
  const notes = reassurances(answers);
  const consulat = consulatOf(answers);
  const count = tasks.filter((t) => done.includes(t.id)).length;
  const adults = answers.travellers.filter((t) => t.kind === "adult").length;
  const kids = answers.travellers.length - adults;
  const toggle = (id: string) => setDone((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  return (
    <section className="py-6 md:py-10" aria-labelledby="resultat">
      <p className="text-xs font-bold uppercase tracking-widest text-primary">Mes papiers</p>
      <h1 id="resultat" className="mt-2 font-display text-3xl font-bold leading-tight md:text-5xl">
        Votre liste de papiers
      </h1>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-secondary px-3 py-1 font-semibold">
          {adults} adulte{adults > 1 ? "s" : ""}
          {kids ? ` · ${kids} enfant${kids > 1 ? "s" : ""}` : ""}
        </span>
        {consulat ? <span className="rounded-full bg-secondary px-3 py-1 font-semibold">{consulat.name.replace(/^Consulat (général )?d'Algérie à /, "Consulat de ")}</span> : null}
        <button type="button" onClick={onEdit} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 font-semibold hover:bg-secondary">
          <Pencil size={14} aria-hidden /> Modifier mes réponses
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div>
          <div className="rounded-xl border p-4" aria-live="polite">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>
                {count} sur {tasks.length} fait{count > 1 ? "s" : ""}
              </span>
              {count === tasks.length ? <span className="text-primary">Tout est prêt</span> : null}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(count / Math.max(1, tasks.length)) * 100}%` }} />
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
                <h2 className="font-display text-xl font-bold">{whenLabels[when].title}</h2>
                <p className="text-sm text-muted-foreground">{whenLabels[when].hint}</p>
                <ul className="mt-3 grid gap-2">
                  {group.map((t) => (
                    <TaskRow key={t.id} task={t} done={done.includes(t.id)} onToggle={() => toggle(t.id)} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <aside className="grid gap-4 lg:sticky lg:top-24">
          {consulat ? <ConsulatCard consulat={consulat} /> : answers.abroad ? <AbroadCard /> : null}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Sources lues le {displayDate(FORMALITES_CHECKED)}. Les règles peuvent changer : le
            consulat d'Algérie et la police aux frontières restent la référence au moment du voyage.
          </p>
        </aside>
      </div>
    </section>
  );
}

function TaskRow({ task, done, onToggle }: { task: Task; done: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`rounded-xl border transition-colors ${done ? "bg-secondary/40" : "bg-background"}`}>
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
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full text-left">
            <span className={`block font-semibold leading-snug ${done ? "text-muted-foreground line-through" : ""}`}>{task.title}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {task.who.map((w) => (
                <span key={w} className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                  {w}
                </span>
              ))}
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
                <p className="text-xs font-semibold">Aucune source officielle trouvée sur ce point.</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function SourceLinks({ ids }: { ids: FormaliteSourceId[] }) {
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

function ConsulatCard({ consulat, compact = false }: { consulat: Consulat; compact?: boolean }) {
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
            <a href={`tel:+33${consulat.phone.replace(/\s/g, "").slice(1)}`} className="hover:underline">
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
            <a href={formaliteSources["amb-consulats"].url} target="_blank" rel="noreferrer" className="underline">
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

function AbroadCard() {
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

function Sources() {
  return (
    <section id="sources" className="mt-10 border-t pt-6">
      <h2 className="font-display text-xl font-bold">Sources officielles</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Pages consultées le <time dateTime={FORMALITES_CHECKED}>{displayDate(FORMALITES_CHECKED)}</time>.
      </p>
      <ul className="mt-4 space-y-2">
        {(Object.keys(formaliteSources) as FormaliteSourceId[]).map((id) => {
          const s = formaliteSources[id];
          return (
            <li key={id} className="text-sm">
              <a href={s.url} target="_blank" rel="noreferrer" className={textLink}>
                {s.name}
              </a>
              {"updated" in s ? <span className="text-muted-foreground"> · {s.updated}</span> : null}
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
