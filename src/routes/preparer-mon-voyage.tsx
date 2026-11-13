import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Calculator,
  CalendarCheck,
  Check,
  ChevronDown,
  ExternalLink,
  Info,
  Landmark,
  Map as MapIcon,
  MapPin,
  Navigation,
  PartyPopper,
  Search,
  Ship,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Breadcrumbs, textLink } from "@/components/editorial/Editorial";
import {
  EmbeddedPapers,
  GroupStep,
  HomeStep,
  Options,
  PapersResult,
  PapersWizard,
  Question,
  papersSteps,
  usePapersState,
  type PapersState,
  type PapersStep,
} from "@/components/papers/PapersFlow";
import { VEHICLES, defaultTripProfile } from "@/components/panel/TripProfile";
import { tasksFor, type Answers } from "@/content/formalites";
import {
  bookingSearch,
  closestArrival,
  communeOfPostcode,
  companionSteps,
  defaultPlan,
  departurePorts,
  formatDuration,
  loadPlan,
  nextMonths,
  planDay,
  planFare,
  saveItinerarySeed,
  savePlan,
  seasonLabels,
  type CompanionPlan,
  type CompanionStep,
  type PortChoice,
} from "@/lib/ferry/companion";
import { searchItineraryAddress } from "@/lib/ferry/itinerary.functions";
import { prepItems } from "@/lib/ferry/preparation";
import { formatFareRange } from "@/lib/ferry/pricing";
import { portsQuery, routesQuery } from "@/lib/ferry/queries";
import { readTravelProfile, saveItineraryChoice, saveTravelProfile } from "@/lib/ferry/travelProfile";
import type { Port } from "@/lib/ferry/types";
import { seoHead } from "@/lib/seo/site";

const PATH = "/preparer-mon-voyage";

export const Route = createFileRoute("/preparer-mon-voyage")({
  head: () =>
    seoHead(
      "Préparer son voyage en Algérie pas à pas | BledWay",
      "Papiers de chacun, voiture, route jusqu'au port, budget de la traversée et réservation : tout le voyage en Algérie préparé sur une seule page, avec les sources officielles.",
      PATH,
    ),
  component: CompanionPage,
});

const stepTitles: Record<CompanionStep, string> = {
  profile: "Mon voyage en 4 questions",
  papers: "Mes papiers",
  car: "Ma voiture",
  route: "Ma route jusqu'au port",
  budget: "Mon budget",
  book: "Réserver ma traversée",
};

/** Les démarches voiture d'avant le départ, reprises de la préparation de « Mon voyage ». */
const carItems = prepItems.filter(
  (item) =>
    item.only === "vehicle" &&
    !item.itinerary &&
    item.direction !== "return" &&
    (item.phase === "papers" || item.phase === "bags"),
);

const monthName = (key: string) =>
  new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(`${key}-15T12:00:00`));
const dayName = (key: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(`${key}T12:00:00`),
  );
const shortSeason = { calme: "Basse", intermediaire: "Moyenne", forte: "Haute", pointe: "Pic" } as const;
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

function people(a: Answers) {
  const adults = a.travellers.filter((t) => t.kind === "adult").length;
  return { adults, children: a.travellers.length - adults };
}

function CompanionPage() {
  const papers = usePapersState();
  const [plan, setPlan] = useState<CompanionPlan>(defaultPlan);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<CompanionStep | null>("profile");
  const navigate = useNavigate();

  useEffect(() => {
    const saved = loadPlan();
    const travel = readTravelProfile();
    const start = saved ?? { ...defaultPlan(), ...(travel ? { vehicle: travel.vehicle } : {}) };
    setPlan(start);
    setOpen(companionSteps(start).find((step) => !start.done.includes(step)) ?? null);
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) savePlan(plan);
  }, [plan, loaded]);
  const patch = (p: Partial<CompanionPlan>) => setPlan((current) => ({ ...current, ...p }));

  // Le domicile de « Mes papiers » donne le point de départ de la route.
  const { postcode, abroad } = papers.answers;
  useEffect(() => {
    if (!papers.loaded) return;
    if (abroad) {
      if (plan.home) patch({ home: null });
      return;
    }
    const code = postcode.trim();
    if (!/^\d{5}$/.test(code) || plan.home?.postcode === code) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      communeOfPostcode(code)
        .then((home) => {
          if (!cancelled) patch({ home, ...(plan.portsChosen ? {} : { fromPortId: null, toPortId: null }) });
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postcode, abroad, papers.loaded, plan.home?.postcode]);

  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const choices = useMemo(
    () => departurePorts(ports, routes, plan.home?.point ?? null),
    [ports, routes, plan.home?.point],
  );
  const fromChoice = choices.find((choice) => choice.port.id === plan.fromPortId) ?? null;
  const toPort = fromChoice?.lines.find((line) => line.to.id === plan.toPortId)?.to ?? null;

  // Tant que rien n'est choisi à la main : le port le plus proche, puis l'arrivée la plus proche du bled.
  useEffect(() => {
    if (!loaded || !choices.length) return;
    if (fromChoice && toPort) return;
    const choice = fromChoice ?? choices[0]!;
    const arrival = closestArrival(choice, plan.destination?.point ?? null);
    patch({ fromPortId: choice.port.id, toPortId: arrival?.id ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, choices, fromChoice, toPort]);

  const steps = companionSteps(plan);
  const doneCount = steps.filter((step) => plan.done.includes(step)).length;
  const allDone = doneCount === steps.length;

  const openStep = (step: CompanionStep | null) => {
    setOpen(step);
    if (step)
      requestAnimationFrame(() =>
        document.getElementById(`etape-${step}`)?.scrollIntoView({ block: "start", behavior: "smooth" }),
      );
  };
  const complete = (step: CompanionStep) => {
    const done = plan.done.includes(step) ? plan.done : [...plan.done, step];
    patch({ done });
    const order = companionSteps(plan);
    const after = order.slice(order.indexOf(step) + 1).find((s) => !done.includes(s));
    const next = after ?? order.find((s) => !done.includes(s)) ?? null;
    openStep(next);
    if (!next)
      requestAnimationFrame(() =>
        document.getElementById("pret")?.scrollIntoView({ block: "center", behavior: "smooth" }),
      );
  };

  // Le profil de voyage sert aussi à la recherche et à l'itinéraire de la carte.
  const syncTravelProfile = () => {
    const stored = readTravelProfile() ?? defaultTripProfile;
    const { adults, children } = people(papers.answers);
    saveTravelProfile({
      ...stored,
      vehicle: plan.vehicle,
      passengers: { ...stored.passengers, adults, children },
    });
  };

  const summaries = useSummaries(plan, papers, fromChoice, toPort);

  return (
    <SiteLayout>
      {/* Sur téléphone, la première question doit se voir tout de suite : fil d'Ariane masqué
          (gardé pour les moteurs), titre et avancement sur une seule ligne. */}
      <div className="hidden md:block">
        <Breadcrumbs items={[{ name: "Préparer mon voyage", path: PATH }]} />
      </div>
      <EmbeddedPapers.Provider value>
        <div className="mx-auto max-w-3xl pb-6 pt-3 md:py-10">
          <p className="hidden text-xs font-bold uppercase tracking-widest text-primary md:block">Pas à pas</p>
          <div className="flex items-center justify-between gap-3 md:mt-2" aria-live="polite">
            <h1 className="font-display text-2xl font-bold leading-tight md:text-5xl">Préparer mon voyage</h1>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${allDone ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
            >
              {allDone ? "Prêt" : `${doneCount}/${steps.length}`}
              <span className="sr-only"> étapes faites</span>
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${(doneCount / steps.length) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-muted-foreground md:mt-4 md:text-lg">
            <span className="hidden md:inline">
              Les papiers de chacun, la voiture, la route jusqu'au port, le budget, puis la réservation :
              tout se suit sur cette page.{" "}
            </span>
            Vos réponses restent sur cet appareil.
          </p>

          <ol className="mt-4 grid grid-cols-1 gap-3 md:mt-6">
            {steps.map((step, index) => (
              <StepCard
                key={step}
                id={step}
                index={index + 1}
                title={stepTitles[step]}
                summary={summaries[step]}
                done={plan.done.includes(step)}
                open={open === step}
                onToggle={() => openStep(open === step ? null : step)}
              >
                {step === "profile" ? (
                  <ProfileStep
                    papers={papers}
                    plan={plan}
                    patch={patch}
                    onDone={() => {
                      syncTravelProfile();
                      complete("profile");
                    }}
                  />
                ) : null}
                {step === "papers" ? (
                  <PapersStepBody
                    papers={papers}
                    onDone={() => complete("papers")}
                    next={plan.vehicle === "none" ? "ma route" : "ma voiture"}
                  />
                ) : null}
                {step === "car" ? <CarStep plan={plan} patch={patch} onDone={() => complete("car")} /> : null}
                {step === "route" ? (
                  <RouteStep
                    plan={plan}
                    patch={patch}
                    choices={choices}
                    fromChoice={fromChoice}
                    toPortId={toPort?.id ?? null}
                    onItinerary={() => {
                      syncTravelProfile();
                      saveItinerarySeed({
                        origin: plan.home ? `${plan.home.name} (${plan.home.postcode})` : "",
                        originPoint: plan.home?.point ?? null,
                        destination: plan.destination?.label ?? "",
                        destinationPoint: plan.destination?.point ?? null,
                        period: plan.month,
                      });
                      window.sessionStorage.setItem("bledway:open-home-action", "itinerary");
                      // La carte d'accueil s'ouvre en haut, pas à la hauteur où l'on était ici.
                      window.scrollTo({ top: 0, behavior: "instant" });
                      void navigate({ to: "/" });
                    }}
                    onDone={() => complete("route")}
                  />
                ) : null}
                {step === "budget" ? (
                  <BudgetStep
                    plan={plan}
                    answers={papers.answers}
                    fromChoice={fromChoice}
                    toPort={toPort}
                    onDone={() => complete("budget")}
                  />
                ) : null}
                {step === "book" ? (
                  <BookStep
                    plan={plan}
                    answers={papers.answers}
                    fromChoice={fromChoice}
                    toPort={toPort}
                    onBook={() => {
                      syncTravelProfile();
                      if (plan.fromPortId && plan.toPortId)
                        saveItineraryChoice({
                          period: plan.month,
                          departurePortId: plan.fromPortId,
                          arrivalPortId: plan.toPortId,
                        });
                      const done = plan.done.includes("book") ? plan.done : [...plan.done, "book" as const];
                      savePlan({ ...plan, done });
                      // Ports, jour et voyageurs dans l'adresse : la carte ouvre directement les résultats.
                      window.scrollTo({ top: 0, behavior: "instant" });
                      void navigate({ href: bookingSearch(plan) });
                    }}
                  />
                ) : null}
              </StepCard>
            ))}
          </ol>

          {allDone ? (
            <div id="pret" className="mt-6 rounded-2xl bg-primary/5 p-5 md:p-6">
              <p className="flex items-center gap-2 font-display text-xl font-bold">
                <PartyPopper size={22} className="text-primary" aria-hidden /> Votre voyage est prêt
              </p>
              <p className="mt-2 text-muted-foreground">
                Gardez cette page : votre liste de papiers et vos choix y restent. Le jour J, suivez votre
                navire en direct et les signalements des voyageurs.
              </p>
              <a
                href="/"
                className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
              >
                <MapIcon size={16} aria-hidden /> Suivre en direct
              </a>
            </div>
          ) : null}
        </div>
      </EmbeddedPapers.Provider>
    </SiteLayout>
  );
}

/** La ligne de résumé de chaque étape, quand elle est repliée. */
function useSummaries(
  plan: CompanionPlan,
  papers: PapersState,
  fromChoice: PortChoice | null,
  toPort: Port | null,
): Record<CompanionStep, string | null> {
  const { adults, children } = people(papers.answers);
  const vehicle = VEHICLES.find((v) => v.id === plan.vehicle);
  const tasks = useMemo(() => tasksFor(papers.answers), [papers.answers]);
  const ready = tasks.filter((t) => papers.done.includes(t.id)).length;
  const carReady = carItems.filter((item) => plan.carDone.includes(item.id)).length;
  const line = fromChoice && toPort ? `${fromChoice.port.name} → ${toPort.name}` : null;
  const duration = fromChoice?.lines.find((l) => l.to.id === toPort?.id)?.route.typical_duration_minutes ?? null;
  const fare = fromChoice && toPort ? planFare(plan, fromChoice.port, toPort, { adults, children }) : null;
  return {
    profile: [
      papers.answers.abroad ? "Hors de France" : plan.home?.name ?? (papers.answers.postcode || null),
      [plural(adults, "adulte"), children ? plural(children, "enfant") : null].filter(Boolean).join(", "),
      plan.vehicle === "none" ? "sans voiture" : vehicle?.label.toLowerCase(),
      plan.date ? dayName(plan.date) : monthName(plan.month),
    ]
      .filter(Boolean)
      .join(" · "),
    papers: papers.finished ? `${ready} sur ${tasks.length} papiers prêts` : "Votre liste, voyageur par voyageur",
    car: `${carReady} sur ${carItems.length} faits${plan.importCar ? " · import" : ""}`,
    route: line ? `${line}${duration ? ` · ${formatDuration(duration)} de traversée` : ""}` : null,
    budget: fare ? `${formatFareRange(fare)} l'aller · ${seasonLabels[fare.season].toLowerCase()}` : null,
    book: line ? `${line} · ${plan.date ? dayName(plan.date) : `autour du 15 ${monthName(plan.month)}`}` : null,
  };
}

function StepCard({
  id,
  index,
  title,
  summary,
  done,
  open,
  onToggle,
  children,
}: {
  id: CompanionStep;
  index: number;
  title: string;
  summary: string | null;
  done: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <li
      id={`etape-${id}`}
      className={`min-w-0 scroll-mt-24 rounded-2xl border bg-card transition-shadow ${open ? "shadow-md ring-1 ring-primary/30" : ""}`}
    >
      <h2 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`contenu-${id}`}
          onClick={onToggle}
          className="flex min-h-16 w-full items-center gap-3 rounded-2xl p-4 text-left md:p-5"
        >
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${
              done
                ? "bg-primary text-primary-foreground"
                : open
                  ? "bg-primary/10 text-primary ring-1 ring-primary"
                  : "bg-secondary text-muted-foreground"
            }`}
            aria-hidden
          >
            {done ? <Check size={16} strokeWidth={3} /> : index}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-bold leading-tight md:text-xl">{title}</span>
            {!open && summary ? (
              <span className="mt-0.5 block truncate text-sm text-muted-foreground">{summary}</span>
            ) : null}
          </span>
          {done ? <span className="sr-only">(fait)</span> : null}
          {open ? (
            <ChevronDown size={18} className="shrink-0 rotate-180 text-muted-foreground" aria-hidden />
          ) : (
            <span className="shrink-0 text-sm font-semibold text-primary">{done ? "Modifier" : "Ouvrir"}</span>
          )}
        </button>
      </h2>
      {open ? (
        <div id={`contenu-${id}`} className="border-t px-4 pb-5 md:px-6">
          {children}
        </div>
      ) : null}
    </li>
  );
}

function NextButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90"
    >
      {label} <ArrowRight size={16} aria-hidden />
    </button>
  );
}

function MoreLinks({ links }: { links: { href: string; label: string }[] }) {
  return (
    <p className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm">
      <span className="text-muted-foreground">En savoir plus :</span>
      {links.map((link) => (
        <a key={link.href} href={link.href} className={textLink}>
          {link.label}
        </a>
      ))}
    </p>
  );
}

/* ------------------------------------------------------------ 1. Les quatre questions */

type ProfileQuestion = "home" | "group" | "vehicle" | "when";
const profileQuestions: ProfileQuestion[] = ["home", "group", "vehicle", "when"];

function ProfileStep({
  papers,
  plan,
  patch,
  onDone,
}: {
  papers: PapersState;
  plan: CompanionPlan;
  patch: (p: Partial<CompanionPlan>) => void;
  onDone: () => void;
}) {
  const [question, setQuestion] = useState<ProfileQuestion>("home");
  const index = profileQuestions.indexOf(question);
  const months = useMemo(() => nextMonths(12), []);
  const box = useRef<HTMLDivElement>(null);
  const go = (next: ProfileQuestion) => {
    setQuestion(next);
    requestAnimationFrame(() => box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };
  const next = () => (index + 1 < profileQuestions.length ? go(profileQuestions[index + 1]!) : onDone());

  // Changer le groupe après avoir fait la liste : on revoit les papiers des nouveaux voyageurs.
  const papersPatch = (p: Partial<Answers>) => {
    if (p.travellers && p.travellers.length !== papers.answers.travellers.length && papers.finished)
      papers.setFinished(false);
    papers.patch(p);
  };

  const today = new Date().toISOString().slice(0, 10);
  const [year, month] = plan.month.split("-").map(Number) as [number, number];
  const lastDay = `${plan.month}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  const firstDay = `${plan.month}-01` < today ? today : `${plan.month}-01`;

  return (
    <div ref={box} className="scroll-mt-24 pt-4">
      <p className="text-xs font-bold uppercase tracking-widest text-primary">
        Question {index + 1} sur {profileQuestions.length}
      </p>
      {question === "home" ? (
        <>
          <HomeStep answers={papers.answers} patch={papersPatch} />
          {plan.home && !papers.answers.abroad ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin size={14} aria-hidden /> Départ de {plan.home.name}
            </p>
          ) : null}
        </>
      ) : null}
      {question === "group" ? <GroupStep answers={papers.answers} patch={papersPatch} /> : null}
      {question === "vehicle" ? (
        <Question title="Vous partez avec votre voiture ?" hint="Pour le prix de la traversée et les papiers du véhicule.">
          <div role="radiogroup" aria-label="Véhicule" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {VEHICLES.map(({ id, Icon, label, hint }) => {
              const on = plan.vehicle === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    patch({ vehicle: id, done: id === "none" ? plan.done.filter((s) => s !== "car") : plan.done });
                    window.setTimeout(next, 180);
                  }}
                  className={`flex min-h-20 flex-col items-start justify-center gap-1 rounded-xl border p-3 text-left transition-colors ${
                    on ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-background hover:border-primary/40"
                  }`}
                >
                  <Icon size={20} className={on ? "text-primary" : "text-muted-foreground"} aria-hidden />
                  <span className="font-semibold">{id === "none" ? "Sans voiture" : label}</span>
                  <span className="text-xs text-muted-foreground">{id === "none" ? "À pied à bord" : hint}</span>
                </button>
              );
            })}
          </div>
        </Question>
      ) : null}
      {question === "when" ? (
        <Question title="Quand partez-vous ?" hint="Le mois suffit. Les prix changent beaucoup selon la saison.">
          <div role="radiogroup" aria-label="Mois de départ" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {months.map((m) => {
              const on = plan.month === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => patch({ month: m.key, date: plan.date.startsWith(m.key) ? plan.date : "" })}
                  className={`flex min-h-14 flex-col items-center justify-center rounded-xl border px-2 py-2 text-sm transition-colors ${
                    on ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-background hover:border-primary/40"
                  }`}
                >
                  <span className="font-semibold capitalize">
                    {m.label} {String(m.year).slice(2)}
                  </span>
                  <span className={`mt-0.5 text-[11px] ${m.season === "pointe" || m.season === "forte" ? "text-[#c95038]" : "text-muted-foreground"}`}>
                    {shortSeason[m.season]}
                  </span>
                </button>
              );
            })}
          </div>
          <label className="mt-4 block max-w-xs">
            <span className="text-sm font-semibold">Jour précis (facultatif)</span>
            <input
              type="date"
              value={plan.date}
              min={firstDay}
              max={lastDay}
              onChange={(event) => patch({ date: event.target.value })}
              className="mt-1 block min-h-12 w-full rounded-xl border bg-background px-4"
            />
          </label>
        </Question>
      ) : null}
      <div className="mt-8 flex items-center justify-between gap-3">
        {index > 0 ? (
          <button
            type="button"
            onClick={() => go(profileQuestions[index - 1]!)}
            className="inline-flex min-h-12 items-center rounded-xl px-4 text-sm font-semibold hover:bg-secondary"
          >
            Retour
          </button>
        ) : (
          <span />
        )}
        <NextButton label={index + 1 < profileQuestions.length ? "Continuer" : "Continuer : mes papiers"} onClick={next} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 2. Les papiers */

function PapersStepBody({ papers, onDone, next }: { papers: PapersState; onDone: () => void; next: string }) {
  const steps = papersSteps(papers.answers, "people");
  const [step, setStep] = useState<PapersStep>(steps[0]!);
  const box = useRef<HTMLDivElement>(null);
  const toTop = () => requestAnimationFrame(() => box.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  return (
    <div ref={box} className="scroll-mt-24 pt-4">
      {papers.finished ? (
        <>
          <PapersResult
            embedded
            answers={papers.answers}
            done={papers.done}
            setDone={papers.setDone}
            onEdit={() => {
              papers.setFinished(false);
              setStep(steps[0]!);
              toTop();
            }}
          />
          <p className="mt-6 text-sm text-muted-foreground">
            Pas besoin de tout cocher maintenant : la liste reste ici et dans « Mon voyage ».
          </p>
          <div className="mt-4">
            <NextButton label={`Continuer : ${next}`} onClick={onDone} />
          </div>
        </>
      ) : (
        <PapersWizard
          state={papers}
          steps={steps}
          step={steps.includes(step) ? step : steps[0]!}
          setStep={(s) => {
            setStep(s);
            toTop();
          }}
          onFinish={() => {
            papers.setFinished(true);
            toTop();
          }}
        />
      )}
      <MoreLinks
        links={[
          { href: "/papiers-voyage-algerie", label: "Les règles et leurs sources" },
          { href: "/guide/arrivee-algerie-port-formalites", label: "Les formalités à l'arrivée" },
        ]}
      />
    </div>
  );
}

/* ------------------------------------------------------------ 3. La voiture */

function CarStep({
  plan,
  patch,
  onDone,
}: {
  plan: CompanionPlan;
  patch: (p: Partial<CompanionPlan>) => void;
  onDone: () => void;
}) {
  const toggle = (id: string) =>
    patch({ carDone: plan.carDone.includes(id) ? plan.carDone.filter((x) => x !== id) : [...plan.carDone, id] });
  return (
    <div className="pt-4">
      <Question title="La voiture reste-t-elle en Algérie ?">
        <Options
          label="Séjour de la voiture"
          value={plan.importCar ? "import" : "vacances"}
          onChange={(v) => patch({ importCar: v === "import" })}
          options={[
            { value: "vacances", label: "Non, elle revient avec moi", hint: "Admission temporaire, le temps des vacances" },
            { value: "import", label: "Oui, je l'importe", hint: "Véhicule de moins de 3 ans : une autre démarche" },
          ]}
        />
      </Question>
      {plan.importCar ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-primary/5 p-3 text-sm">
          <Info size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <span>
            L'importation suit ses propres conditions, différentes de l'admission temporaire.{" "}
            <a href="/vehicules-moins-3-ans" className={textLink}>
              Les conditions pour importer une voiture
            </a>
          </span>
        </p>
      ) : null}
      <h3 className="mt-6 font-display text-lg font-bold">Avant de partir</h3>
      <ul className="mt-3 grid gap-2">
        {carItems.map((item) => {
          const done = plan.carDone.includes(item.id);
          return (
            <li key={item.id} className={`rounded-xl border ${done ? "bg-secondary/40" : "bg-background"}`}>
              <div className="flex items-start gap-3 p-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done}
                  aria-label={item.label}
                  onClick={() => toggle(item.id)}
                  className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border-2 ${
                    done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                  }`}
                >
                  {done ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
                </button>
                <div className="min-w-0">
                  <p className={`font-semibold ${done ? "text-muted-foreground line-through" : ""}`}>{item.label}</p>
                  {item.tip ? <p className="mt-0.5 text-sm text-muted-foreground">{item.tip}</p> : null}
                  {item.href ? (
                    <a
                      href={item.href}
                      {...(item.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                      className={`${textLink} mt-1 inline-flex items-center gap-1 text-sm`}
                    >
                      {item.linkLabel ?? "En savoir plus"}
                      {item.href.startsWith("http") ? <ExternalLink size={12} aria-hidden /> : null}
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-6">
        <NextButton label="Continuer : ma route" onClick={onDone} />
      </div>
      <MoreLinks
        links={[
          { href: "/guide/voyage-algerie-voiture-checklist", label: "La checklist voiture" },
          { href: "/guide/voiture-vacances-admission-temporaire", label: "L'admission temporaire" },
        ]}
      />
    </div>
  );
}

/* ------------------------------------------------------------ 4. La route */

function DestinationField({
  value,
  onPick,
}: {
  value: CompanionPlan["destination"];
  onPick: (place: CompanionPlan["destination"]) => void;
}) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [results, setResults] = useState<{ label: string; point: [number, number] }[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || q === value?.label) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setBusy(true);
      searchItineraryAddress({ data: { query: q, countryCode: "DZ" } })
        .then((list) => {
          if (!cancelled) setResults(list.slice(0, 6));
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, value?.label]);
  return (
    <div className="relative">
      <label className="block">
        <span className="text-sm font-semibold">Où allez-vous en Algérie ? (facultatif)</span>
        <span className="relative mt-1 block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ville ou quartier, par exemple Tizi Ouzou"
            autoComplete="off"
            aria-autocomplete="list"
            aria-controls="destinations"
            className="block min-h-12 w-full rounded-xl border bg-background pl-9 pr-4"
          />
        </span>
      </label>
      {busy ? <p className="mt-1 text-xs text-muted-foreground">Recherche…</p> : null}
      {results.length ? (
        <ul id="destinations" role="listbox" className="mt-1 grid overflow-hidden rounded-xl border bg-popover shadow-md">
          {results.map((place) => (
            <li key={`${place.label}-${place.point.join(",")}`} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => {
                  setQuery(place.label);
                  setResults([]);
                  onPick(place);
                }}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                <MapPin size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RouteStep({
  plan,
  patch,
  choices,
  fromChoice,
  toPortId,
  onItinerary,
  onDone,
}: {
  plan: CompanionPlan;
  patch: (p: Partial<CompanionPlan>) => void;
  choices: PortChoice[];
  fromChoice: PortChoice | null;
  toPortId: string | null;
  onItinerary: () => void;
  onDone: () => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? choices : choices.slice(0, 3);
  const selectedHidden = fromChoice && !shown.includes(fromChoice);
  return (
    <div className="pt-4">
      <DestinationField
        value={plan.destination}
        onPick={(destination) => {
          const arrival = fromChoice && !plan.portsChosen ? closestArrival(fromChoice, destination?.point ?? null) : null;
          patch({ destination, ...(arrival ? { toPortId: arrival.id } : {}) });
        }}
      />

      <h3 className="mt-6 font-display text-lg font-bold">
        {plan.home ? "Les ports les plus proches de chez vous" : "Votre port de départ"}
      </h3>
      {!choices.length ? <p className="mt-2 text-sm text-muted-foreground">Chargement des lignes…</p> : null}
      <div role="radiogroup" aria-label="Port de départ" className="mt-3 grid gap-2">
        {[...shown, ...(selectedHidden && fromChoice ? [fromChoice] : [])].map((choice) => {
          const on = choice.port.id === fromChoice?.port.id;
          return (
            <button
              key={choice.port.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                const arrival = closestArrival(choice, plan.destination?.point ?? null);
                patch({ fromPortId: choice.port.id, toPortId: arrival?.id ?? null, portsChosen: true });
              }}
              className={`flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                on ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-background hover:border-primary/40"
              }`}
            >
              <Ship size={18} className={on ? "text-primary" : "text-muted-foreground"} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {choice.port.name}
                  <span className="font-normal text-muted-foreground"> · {choice.port.country_name}</span>
                </span>
                <span className="block truncate text-sm text-muted-foreground">
                  Vers {[...new Set(choice.lines.map((l) => l.to.name))].join(", ")}
                </span>
              </span>
              {choice.km !== null ? (
                <span className="shrink-0 text-right text-sm font-semibold">
                  ~{choice.km.toLocaleString("fr-FR")} km
                  <span className="block text-[11px] font-normal text-muted-foreground">à vol d'oiseau</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {choices.length > 3 ? (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="mt-2 text-sm font-semibold text-primary underline underline-offset-4"
        >
          {all ? "Moins de ports" : `Voir les ${choices.length} ports de départ`}
        </button>
      ) : null}

      {fromChoice ? (
        <>
          <h3 className="mt-6 font-display text-lg font-bold">Votre port d'arrivée</h3>
          <div role="radiogroup" aria-label="Port d'arrivée" className="mt-3 flex flex-wrap gap-2">
            {fromChoice.lines.map(({ route, to }) => {
              const on = to.id === toPortId;
              return (
                <button
                  key={route.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => patch({ toPortId: to.id, portsChosen: true })}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors ${
                    on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/40"
                  }`}
                >
                  <span className="font-semibold">{to.name}</span>
                  {route.typical_duration_minutes ? (
                    <span className={on ? "text-primary-foreground/80" : "text-muted-foreground"}>
                      {formatDuration(route.typical_duration_minutes)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onItinerary}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-primary px-4 text-sm font-bold text-primary hover:bg-primary/5"
        >
          <Navigation size={16} aria-hidden /> Calculer ma route porte à porte
        </button>
        <a
          href="/covoiturage"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-secondary"
        >
          <Users size={16} aria-hidden /> Covoiturage jusqu'au port
        </a>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        La route porte à porte s'ouvre sur la carte avec votre départ
        {plan.destination ? ", votre arrivée" : ""} et votre mois déjà remplis : temps de route, péages et
        traversées comparés.
      </p>
      <div className="mt-6">
        <NextButton label="Continuer : mon budget" onClick={onDone} />
      </div>
      <MoreLinks links={[{ href: "/voyage-algerie", label: "Cabine, enfants, animaux : la traversée" }]} />
    </div>
  );
}

/* ------------------------------------------------------------ 5. Le budget */

function BudgetStep({
  plan,
  answers,
  fromChoice,
  toPort,
  onDone,
}: {
  plan: CompanionPlan;
  answers: Answers;
  fromChoice: PortChoice | null;
  toPort: Port | null;
  onDone: () => void;
}) {
  const group = people(answers);
  if (!fromChoice || !toPort)
    return (
      <div className="pt-4">
        <p className="text-muted-foreground">Choisissez d'abord vos ports à l'étape « Ma route ».</p>
      </div>
    );
  const fare = planFare(plan, fromChoice.port, toPort, group);
  const vehicle = VEHICLES.find((v) => v.id === plan.vehicle);
  const hot = fare.season === "pointe" || fare.season === "forte";
  return (
    <div className="pt-4">
      <div className="rounded-2xl border p-4 md:p-5">
        <p className="text-sm text-muted-foreground">
          {fromChoice.port.name} → {toPort.name} · aller simple · {plan.date ? dayName(plan.date) : monthName(plan.month)}
        </p>
        <p className="mt-1 font-display text-3xl font-bold md:text-4xl">{formatFareRange(fare)}</p>
        <p className="mt-1 text-sm">
          {[plural(group.adults, "adulte"), group.children ? plural(group.children, "enfant") : null]
            .filter(Boolean)
            .join(", ")}
          {plan.vehicle === "none" ? ", sans voiture" : `, ${vehicle?.label.toLowerCase()}`}
        </p>
        <span
          className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${hot ? "bg-[#c95038]/10 text-[#c95038]" : "bg-secondary"}`}
        >
          {seasonLabels[fare.season]}
        </span>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {fare.benchmarked ? (
            <>
              Estimation à partir des prix moyens publiés par{" "}
              {fare.source ? (
                <a href={fare.source} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  Direct Ferries
                </a>
              ) : (
                "Direct Ferries"
              )}{" "}
              (septembre–octobre 2026), ajustée à la saison, aux voyageurs et au véhicule. Ce n'est pas un devis.
            </>
          ) : (
            "Ordre de grandeur : aucun prix moyen publié pour cette ligne. Ce n'est pas un devis."
          )}
        </p>
      </div>
      {hot ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-primary/5 p-3 text-sm">
          <Info size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          En été, les places avec voiture partent vite : comparez les mois et réservez tôt.
        </p>
      ) : null}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <a href="/barometre-prix" className="flex min-h-12 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-secondary">
          <TrendingUp size={16} className="text-primary" aria-hidden /> Comparer les mois
        </a>
        <a href="/simulateurs" className="flex min-h-12 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-secondary">
          <Calculator size={16} className="text-primary" aria-hidden /> Essence, péages, tout le budget
        </a>
        <a href="/mes-dinars" className="flex min-h-12 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-secondary">
          <Wallet size={16} className="text-primary" aria-hidden /> Mes dinars, le change
        </a>
      </div>
      <div className="mt-6">
        <NextButton label="Continuer : réserver" onClick={onDone} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 6. Réserver */

function BookStep({
  plan,
  answers,
  fromChoice,
  toPort,
  onBook,
}: {
  plan: CompanionPlan;
  answers: Answers;
  fromChoice: PortChoice | null;
  toPort: Port | null;
  onBook: () => void;
}) {
  const group = people(answers);
  const vehicle = VEHICLES.find((v) => v.id === plan.vehicle);
  const rows: [string, string][] = [
    ["Traversée", fromChoice && toPort ? `${fromChoice.port.name} → ${toPort.name}` : "À choisir à l'étape « Ma route »"],
    ["Départ", plan.date ? `${dayName(plan.date)}, ± 3 jours` : `Autour du ${dayName(planDay(plan))}, ± 3 jours`],
    [
      "Voyageurs",
      [plural(group.adults, "adulte"), group.children ? plural(group.children, "enfant") : null].filter(Boolean).join(", "),
    ],
    ["Véhicule", plan.vehicle === "none" ? "Sans voiture" : (vehicle?.label ?? "")],
  ];
  return (
    <div className="pt-4">
      <dl className="grid gap-2 rounded-2xl border p-4 text-sm md:p-5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        onClick={onBook}
        disabled={!fromChoice || !toPort}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
      >
        <CalendarCheck size={16} aria-hidden /> Voir les traversées et réserver
      </button>
      <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
        <Landmark size={14} className="mt-0.5 shrink-0" aria-hidden />
        BledWay ne vend pas de billets : la réservation et le paiement se font auprès de la compagnie ou
        du distributeur indiqué.
      </p>
    </div>
  );
}
