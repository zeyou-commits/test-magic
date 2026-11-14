import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Calculator,
  CalendarCheck,
  CalendarDays,
  Car,
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  Info,
  Landmark,
  ListChecks,
  Lock,
  Map as MapIcon,
  MapPin,
  PartyPopper,
  RotateCcw,
  Route as RouteIcon,
  School,
  Search,
  Ship,
  Ticket,
  TrendingUp,
  Users,
  Wallet,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { AlgeriaCarousel } from "@/components/prepare/AlgeriaCarousel";
import { RouteTop3 } from "@/components/prepare/RouteTop3";
import { PushStatusLine } from "@/components/panel/PushStatusLine";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { useAuth } from "@/hooks/useAuth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Breadcrumbs, textLink } from "@/components/editorial/Editorial";
import {
  AbroadCard,
  EmbeddedPapers,
  GroupStep,
  HomeFields,
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
import {
  consulateReasons,
  defaultAnswers,
  formaliteSources,
  tasksFor,
  type Answers,
  type When,
} from "@/content/formalites";
import {
  consulatsChecked,
  MFA_REPRESENTATIONS_URL,
  europeConsulates,
} from "@/content/consulatsEurope";
import {
  vacancesChecked,
  defaultHolidayChoice,
  holidayChoiceGroups,
  holidaySources,
  holidaysBetween,
  monthHasHolidays,
  parseHolidayChoice,
} from "@/content/vacancesScolaires";
import {
  bookingSearch,
  closestArrival,
  communeOfPostcode,
  companionStepTitles,
  companionSteps,
  defaultPlan,
  departurePorts,
  earliestDay,
  formatDuration,
  loadPlan,
  nextMonths,
  planDay,
  planFare,
  planWhenLabel,
  RESIDENCE_COUNTRIES,
  saveItinerarySeed,
  savePlan,
  seasonLabels,
  type CompanionPlan,
  type CompanionStep,
  type PortChoice,
} from "@/lib/ferry/companion";
import { searchItineraryAddress } from "@/lib/ferry/itinerary.functions";
import { carPrepItems as carItems } from "@/lib/ferry/dossier";
import {
  PAPERS_LAST_DAYS,
  papersMargin,
  papersWhy,
  retroPlan,
  type Milestone,
} from "@/lib/ferry/retroPlan";
import { useReferenceData } from "@/lib/reference/useReferenceData";
import { formatFareRange } from "@/lib/ferry/pricing";
import { portsQuery, routesQuery } from "@/lib/ferry/queries";
import {
  readTravelProfile,
  saveItineraryChoice,
  saveTravelProfile,
} from "@/lib/ferry/travelProfile";
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

/** Les étapes : une icône au trait, comme la frise de « Mon voyage », et la scène illustrée. */
const stepArt: Record<
  CompanionStep,
  {
    icon: LucideIcon;
    short: string;
    benefit: string;
    /** La scène illustrée (série « Retour au bled ») en tête de l'étape. */
    scene: string;
    sceneAlt: string;
  }
> = {
  profile: {
    icon: CalendarDays,
    short: "Départ",
    benefit: "Qui part, avec quelle voiture, et quand.",
    scene: "/illustrations/voyage/depart-a-laube.webp",
    sceneAlt: "La famille charge la voiture au petit matin",
  },
  papers: {
    icon: FileText,
    short: "Papiers",
    benefit:
      "Visa, passeports, enfants : la liste de chacun, et votre consulat, en France ou ailleurs en Europe.",
    scene: "/illustrations/voyage/billets-au-port.webp",
    sceneAlt: "Au guichet du port, la famille présente ses papiers",
  },
  car: {
    icon: Car,
    short: "Voiture",
    benefit: "Carte grise, assurance, TPD : rien d'oublié pour la douane.",
    scene: "/illustrations/voyage/dernier-sac.webp",
    sceneAlt: "Le dernier sac entre dans le coffre de la 504",
  },
  route: {
    icon: RouteIcon,
    short: "Route",
    benefit: "Le port le plus proche, et le trajet de porte à porte.",
    scene: "/illustrations/voyage/route-du-soleil.webp",
    sceneAlt: "Pique-nique sur une aire de l'A7, direction Marseille",
  },
  budget: {
    icon: Wallet,
    short: "Budget",
    benefit: "Le prix de la traversée selon la saison, avant de réserver.",
    scene: "/illustrations/voyage/station-essence.webp",
    sceneAlt: "Le plein avant la route du port",
  },
  book: {
    icon: Ticket,
    short: "Réserver",
    benefit: "Les traversées de votre date, prêtes à comparer.",
    scene: "/illustrations/voyage/cote-en-vue.webp",
    sceneAlt: "Sur le pont du ferry, la côte algérienne en vue",
  },
};

/** La pastille d'une étape : son icône, ou une coche une fois faite. */
function StepArt({
  step,
  size = "md",
  done = false,
}: {
  step: CompanionStep;
  size?: "sm" | "md";
  done?: boolean;
}) {
  const Icon = done ? Check : stepArt[step].icon;
  return (
    <span
      className="bw-prep-badge"
      data-done={done || undefined}
      style={{ width: size === "sm" ? 36 : 44, height: size === "sm" ? 36 : 44 }}
      aria-hidden
    >
      <Icon size={size === "sm" ? 16 : 20} strokeWidth={done ? 3 : 2} />
    </span>
  );
}

/** La frise des étapes : points reliés, l'étape ouverte en avant, comme dans « Mon voyage ». */
function StepFrieze({
  steps,
  open,
  done,
  locked,
  onOpen,
}: {
  steps: CompanionStep[];
  open: CompanionStep | null;
  done: CompanionStep[];
  locked: (step: CompanionStep) => boolean;
  onOpen: (step: CompanionStep) => void;
}) {
  return (
    <nav aria-label="Les étapes du voyage" className="bw-prep-frieze mt-3">
      <ol style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, index) => {
          const isDone = done.includes(step);
          const current = open === step;
          const isLocked = locked(step);
          const Icon = isDone && !current ? Check : stepArt[step].icon;
          const sub = isDone
            ? "Fait"
            : isLocked
              ? "Avec un compte"
              : current
                ? "En cours"
                : "À faire";
          return (
            <li
              key={step}
              data-done={(isDone && !current) || undefined}
              data-current={current || undefined}
              data-locked={(isLocked && !isDone) || undefined}
            >
              {index < steps.length - 1 ? (
                <span className="bw-prep-frieze__bar" data-done={isDone || undefined} aria-hidden />
              ) : null}
              <button
                type="button"
                onClick={() => onOpen(step)}
                aria-current={current ? "step" : undefined}
                aria-label={`${stepTitles[step]} · ${sub}`}
              >
                {current ? <b className="bw-prep-frieze__here">Ici</b> : null}
                <span className="bw-prep-frieze__dot">
                  <Icon
                    size={current ? 20 : 18}
                    strokeWidth={isDone && !current ? 3 : 2}
                    aria-hidden
                  />
                  {isLocked && !isDone ? (
                    <span className="bw-prep-frieze__lock">
                      <Lock size={10} aria-hidden />
                    </span>
                  ) : null}
                </span>
                <strong>{stepArt[step].short}</strong>
                <small>{sub}</small>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Les trois chapitres du parcours, annoncés à l'accueil et rappelés à chaque étape. */
const chapters: {
  title: string;
  hint: string;
  icon: LucideIcon;
  steps: CompanionStep[];
}[] = [
  {
    title: "Vous et votre départ",
    hint: "Quand vous partez, qui part, avec quelle voiture.",
    icon: Users,
    steps: ["profile"],
  },
  {
    title: "Vos papiers et votre voiture",
    hint: "La liste de chacun, avec les dates à tenir.",
    icon: FileText,
    steps: ["papers", "car"],
  },
  {
    title: "Votre route, votre budget, votre billet",
    hint: "Les ports les plus adaptés, le coût, la réservation.",
    icon: RouteIcon,
    steps: ["route", "budget", "book"],
  },
];
const chapterOf = (step: CompanionStep) =>
  Math.max(
    0,
    chapters.findIndex((chapter) => chapter.steps.includes(step)),
  );

/** L'accueil : pourquoi on pose des questions, les 3 chapitres, et un seul bouton. */
function Welcome({ onStart }: { onStart: () => void }) {
  const start = (
    <button
      type="button"
      onClick={onStart}
      className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-base font-bold text-primary-foreground shadow-md hover:bg-primary/90 sm:w-auto"
    >
      Commencer <ArrowRight size={18} aria-hidden />
    </button>
  );
  return (
    <div>
      {/* L'envie d'abord : l'Algérie en photos, puis comment on va vous aider. */}
      <AlgeriaCarousel />
      <h1 className="mt-5 font-display text-[1.75rem] font-bold leading-tight md:mt-7 md:text-5xl">
        Votre voyage au bled, préparé pas à pas
      </h1>
      <p className="mt-3 text-muted-foreground md:text-lg">
        Pour vous aider vraiment, BledWay a besoin d'en savoir un peu plus sur vous et sur votre
        voyage. Une question à la fois, en trois chapitres : à la fin, vous avez vos papiers, vos
        dates, votre route et votre budget.
      </p>
      <ol className="mt-5 grid gap-2 md:grid-cols-3">
        {chapters.map((chapter, index) => {
          const Icon = chapter.icon;
          return (
            <li key={chapter.title} className="flex gap-3 rounded-2xl border bg-card p-3 md:block">
              <span className="relative shrink-0 md:block">
                <img
                  src={stepArt[chapter.steps[0]!].scene}
                  alt=""
                  width={960}
                  height={640}
                  loading="lazy"
                  decoding="async"
                  className="h-20 w-24 rounded-xl object-cover md:h-28 md:w-full"
                />
                <span className="absolute -bottom-2 -right-2 grid size-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground ring-2 ring-card md:left-2 md:right-auto md:top-2 md:bottom-auto">
                  {index + 1}
                </span>
              </span>
              <span className="min-w-0 md:mt-3 md:block">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Icon size={16} className="shrink-0 text-primary" aria-hidden />
                  {chapter.title}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{chapter.hint}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-5">{start}</div>
      <p className="mt-3 text-center text-sm text-muted-foreground md:text-left">
        Environ 5 minutes · modifiable à tout moment · vos réponses restent sur votre téléphone
      </p>
      <p className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm md:justify-start">
        <span className="text-muted-foreground">Bientôt :</span>
        <span className="rounded-full border px-3 py-1 text-muted-foreground">Tunisie</span>
        <span className="rounded-full border px-3 py-1 text-muted-foreground">Maroc</span>
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        BledWay ne vend pas de billets : la réservation se fait auprès de la compagnie ou du
        distributeur indiqué.
      </p>
    </div>
  );
}

const stepTitles = companionStepTitles;

const monthName = (key: string) =>
  new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
    new Date(`${key}-15T12:00:00`),
  );
const dayName = (key: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(`${key}T12:00:00`),
  );
const shortSeason = {
  calme: "Basse",
  intermediaire: "Moyenne",
  forte: "Haute",
  pointe: "Pic",
} as const;
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

function people(a: Answers) {
  const adults = a.travellers.filter((t) => t.kind === "adult").length;
  return { adults, children: a.travellers.length - adults };
}

function CompanionPage() {
  // Vacances et consulats : la version approuvée dans l'admin remplace celle du dépôt.
  useReferenceData();
  const papers = usePapersState();
  const [plan, setPlan] = useState<CompanionPlan>(defaultPlan);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<CompanionStep | null>("profile");
  const navigate = useNavigate();
  // Aperçu sans compte : la première étape (départ, groupe, voiture) et le calendrier ; la suite
  // (papiers, consulat, route, budget, réservation) demande un compte gratuit.
  const { user, loading: authLoading } = useAuth();
  const locked = !user;
  const isLocked = (step: CompanionStep | null) => locked && step !== null && step !== "profile";

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

  // Le domicile de « Mes papiers » donne le point de départ de la route (en France, par la
  // commune ; ailleurs en Europe, la ville choisie dans le compagnon).
  const { postcode, abroad } = papers.answers;
  useEffect(() => {
    if (!papers.loaded || !loaded) return;
    if (abroad) {
      if (plan.country === "FR") patch({ country: "other" });
      if (plan.home?.postcode) patch({ home: null });
      return;
    }
    if (plan.country !== "FR") patch({ country: "FR" });
    const code = postcode.trim();
    if (!/^\d{5}$/.test(code) || plan.home?.postcode === code) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      communeOfPostcode(code)
        .then((home) => {
          if (!cancelled)
            patch({ home, ...(plan.portsChosen ? {} : { fromPortId: null, toPortId: null }) });
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postcode, abroad, papers.loaded, loaded, plan.home?.postcode]);

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
    // Sans domicile, pas de « plus proche » : on attend la ville plutôt que l'ordre alphabétique.
    if (!loaded || !choices.length || (!plan.home && !plan.portsChosen)) return;
    if (fromChoice && toPort) return;
    const choice = fromChoice ?? choices[0]!;
    const arrival = closestArrival(choice, plan.destination?.point ?? null);
    patch({ fromPortId: choice.port.id, toPortId: arrival?.id ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, choices, fromChoice, toPort, plan.home]);

  const steps = companionSteps(plan);
  const doneCount = steps.filter((step) => plan.done.includes(step)).length;
  const allDone = doneCount === steps.length;

  const openStep = (step: CompanionStep | null) => {
    if (isLocked(step)) {
      setOpen(null);
      requestAnimationFrame(() =>
        document.getElementById("compte")?.scrollIntoView({ block: "center", behavior: "smooth" }),
      );
      return;
    }
    setOpen(step);
    if (step)
      requestAnimationFrame(() =>
        document
          .getElementById(`etape-${step}`)
          ?.scrollIntoView({ block: "start", behavior: "smooth" }),
      );
  };
  const complete = (step: CompanionStep) => {
    const done = plan.done.includes(step) ? plan.done : [...plan.done, step];
    patch({ done });
    const order = companionSteps(plan);
    const after = order.slice(order.indexOf(step) + 1).find((s) => !done.includes(s));
    const next = after ?? order.find((s) => !done.includes(s)) ?? null;
    openStep(next);
    if (!next) requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
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
  // Le formulaire « Réserver » reprend au fil de l'eau qui part et avec quel véhicule (onglet
  // Réserver ouvert depuis la barre du bas, pas seulement le bouton de fin de parcours).
  const { adults: syncAdults, children: syncChildren } = people(papers.answers);
  useEffect(() => {
    if (!loaded || !plan.started) return;
    syncTravelProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, plan.started, plan.vehicle, syncAdults, syncChildren]);

  const summaries = useSummaries(plan, papers, fromChoice, toPort);
  useDeadlineSync(user?.id ?? null, plan, papers, loaded && papers.loaded);

  const nextStep = steps.find((step) => !plan.done.includes(step) && !isLocked(step)) ?? null;
  const stepBody = (step: CompanionStep) => (
    <>
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
          plan={plan}
          patch={patch}
          onDone={() => complete("papers")}
          next={plan.vehicle === "none" ? "ma route" : "ma voiture"}
        />
      ) : null}
      {step === "car" ? <CarStep plan={plan} patch={patch} onDone={() => complete("car")} /> : null}
      {step === "route" ? (
        <RouteStep
          papers={papers}
          plan={plan}
          patch={patch}
          choices={choices}
          fromChoice={fromChoice}
          toPortId={toPort?.id ?? null}
          onItinerary={() => {
            syncTravelProfile();
            saveItinerarySeed({
              origin: plan.home
                ? plan.home.postcode
                  ? `${plan.home.name} (${plan.home.postcode})`
                  : plan.home.name
                : "",
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
    </>
  );

  return (
    <SiteLayout>
      {/* Sur téléphone, la première question doit se voir tout de suite : fil d'Ariane masqué
          (gardé pour les moteurs), titre et avancement sur une seule ligne. */}
      <div className="hidden md:block">
        <Breadcrumbs items={[{ name: "Préparer mon voyage", path: PATH }]} />
      </div>
      <EmbeddedPapers.Provider value>
        <div className="mx-auto max-w-3xl pb-6 pt-3 md:py-10">
          {!plan.started ? (
            <Welcome
              onStart={() => {
                patch({ started: true });
                setOpen("profile");
                requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
              }}
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 md:mt-2" aria-live="polite">
                <h1 className="font-display text-2xl font-bold leading-tight md:text-4xl">
                  Préparer mon voyage
                </h1>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${allDone ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                >
                  {allDone ? "Prêt" : `${doneCount}/${steps.length}`}
                  <span className="sr-only"> étapes faites</span>
                </span>
              </div>
              {/* La vue d'ensemble : toutes les étapes, reliées, toujours visibles. */}
              <StepFrieze
                steps={steps}
                open={open}
                done={plan.done}
                locked={isLocked}
                onOpen={openStep}
              />

              {open === null ? (
                <>
                  {!allDone && !locked && nextStep ? (
                    <button
                      type="button"
                      onClick={() => openStep(nextStep)}
                      className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-primary p-4 text-left text-primary-foreground shadow-md"
                    >
                      <StepArt step={nextStep} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold uppercase tracking-wider opacity-80">
                          Reprendre ma préparation
                        </span>
                        <span className="block font-display text-lg font-bold leading-tight">
                          {stepTitles[nextStep]}
                        </span>
                      </span>
                      <ArrowRight size={20} aria-hidden />
                    </button>
                  ) : null}
                  {allDone && !locked ? (
                    <ReadyDashboard
                      plan={plan}
                      papers={papers}
                      summaries={summaries}
                      onOpenStep={openStep}
                    />
                  ) : null}
                  {plan.done.includes("profile") ? (
                    <PlanTodo plan={plan} papers={papers} onOpenStep={openStep} />
                  ) : null}
                  <h2 className="mt-6 font-display text-lg font-bold">Mes étapes</h2>
                  <ol className="mt-2 grid grid-cols-1 gap-2">
                    {steps.map((step, index) =>
                      isLocked(step) ? null : (
                        <StepCard
                          key={step}
                          id={step}
                          index={index + 1}
                          title={stepTitles[step]}
                          summary={summaries[step]}
                          done={plan.done.includes(step)}
                          open={false}
                          onToggle={() => openStep(step)}
                        >
                          {null}
                        </StepCard>
                      ),
                    )}
                  </ol>
                </>
              ) : (
                <StepWizard
                  step={open}
                  steps={steps.filter((step) => !isLocked(step))}
                  done={plan.done}
                  onOpen={openStep}
                  onOverview={() => {
                    setOpen(null);
                    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
                  }}
                >
                  {stepBody(open)}
                </StepWizard>
              )}

              {locked && !authLoading ? (
                <SignupGate
                  steps={steps.filter((step) => step !== "profile")}
                  profileDone={plan.done.includes("profile")}
                />
              ) : null}

              <div className="mt-8">
                <AlgeriaCarousel />
              </div>
              <ResetPreparation
                onReset={() => {
                  papers.setAnswers(defaultAnswers);
                  papers.setDone([]);
                  papers.setFinished(false);
                  setPlan(defaultPlan());
                  setOpen("profile");
                  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
                }}
              />
            </>
          )}
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
  const duration =
    fromChoice?.lines.find((l) => l.to.id === toPort?.id)?.route.typical_duration_minutes ?? null;
  const fare =
    fromChoice && toPort ? planFare(plan, fromChoice.port, toPort, { adults, children }) : null;
  return {
    profile: [
      capitalize(planWhenLabel(plan)),
      [plural(adults, "adulte"), children ? plural(children, "enfant") : null]
        .filter(Boolean)
        .join(", "),
      plan.vehicle === "none" ? "sans voiture" : vehicle?.label.toLowerCase(),
    ]
      .filter(Boolean)
      .join(" · "),
    papers: papers.finished
      ? `${ready} sur ${tasks.length} papiers prêts`
      : "Votre liste, voyageur par voyageur",
    car: `${carReady} sur ${carItems.length} faits${plan.importCar ? " · import" : ""}`,
    route: line ? `${line}${duration ? ` · ${formatDuration(duration)} de traversée` : ""}` : null,
    budget: fare
      ? `${formatFareRange(fare)} l'aller · ${seasonLabels[fare.season].toLowerCase()}`
      : null,
    book: line ? `${line} · ${planWhenLabel(plan)}` : null,
  };
}

/**
 * Une étape à la fois, qui glisse de côté : le chapitre, où l'on en est, et de quoi revenir,
 * passer ou retrouver la vue d'ensemble. Chaque étape passe seule à la suivante une fois finie.
 */
function StepWizard({
  step,
  steps,
  done,
  onOpen,
  onOverview,
  children,
}: {
  step: CompanionStep;
  steps: CompanionStep[];
  done: CompanionStep[];
  onOpen: (step: CompanionStep) => void;
  onOverview: () => void;
  children: ReactNode;
}) {
  const index = Math.max(0, steps.indexOf(step));
  const previous = useRef(index);
  const direction = index >= previous.current ? "next" : "prev";
  useEffect(() => {
    previous.current = index;
  }, [index]);
  const chapter = chapterOf(step);
  const before = steps[index - 1] ?? null;
  const after = steps[index + 1] ?? null;
  return (
    <section
      id={`etape-${step}`}
      aria-labelledby="etape-titre"
      className="mt-4 scroll-mt-24 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">
          Chapitre {chapter + 1} sur {chapters.length} · {chapters[chapter]!.title}
        </p>
        <button
          type="button"
          onClick={onOverview}
          className="shrink-0 text-sm font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Vue d'ensemble
        </button>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden>
        {steps.map((item) => (
          <span
            key={item}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              item === step ? "bg-primary" : done.includes(item) ? "bg-primary/50" : "bg-border"
            }`}
          />
        ))}
      </div>
      <div
        key={step}
        className={`bw-wiz-slide bw-wiz-slide--${direction} mt-4 rounded-2xl border bg-card px-4 pb-5 pt-4 shadow-sm md:px-6`}
      >
        <div className="flex items-center gap-3">
          <StepArt step={step} done={done.includes(step)} />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Étape {index + 1} sur {steps.length}
            </p>
            <h2 id="etape-titre" className="font-display text-xl font-bold leading-tight">
              {stepTitles[step]}
            </h2>
          </div>
        </div>
        <img
          src={stepArt[step].scene}
          alt={stepArt[step].sceneAlt}
          width={960}
          height={640}
          loading="lazy"
          decoding="async"
          className="mt-4 h-28 w-full rounded-xl object-cover md:h-44"
        />
        {children}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        {before ? (
          <button
            type="button"
            onClick={() => onOpen(before)}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 font-semibold hover:bg-secondary"
          >
            <ArrowLeft size={16} aria-hidden /> {stepArt[before].short}
          </button>
        ) : (
          <span />
        )}
        {after ? (
          <button
            type="button"
            onClick={() => onOpen(after)}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 font-semibold text-muted-foreground hover:bg-secondary"
          >
            Passer cette étape <ArrowRight size={16} aria-hidden />
          </button>
        ) : null}
      </div>
    </section>
  );
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
          <StepArt step={id} done={done} />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-primary">
              Étape {index}
            </span>
            <span className="block font-display text-lg font-bold leading-tight md:text-xl">
              {title}
            </span>
            {!open && summary ? (
              <span className="mt-0.5 block truncate text-sm text-muted-foreground">{summary}</span>
            ) : null}
          </span>
          {done ? <span className="sr-only">(fait)</span> : null}
          {open ? (
            <ChevronDown
              size={18}
              className="shrink-0 rotate-180 text-muted-foreground"
              aria-hidden
            />
          ) : (
            <span className="shrink-0 text-sm font-semibold text-primary">
              {done ? "Modifier" : "Ouvrir"}
            </span>
          )}
        </button>
      </h2>
      {open ? (
        <div id={`contenu-${id}`} className="border-t px-4 pb-5 md:px-6">
          <img
            src={stepArt[id].scene}
            alt={stepArt[id].sceneAlt}
            width={960}
            height={640}
            loading="lazy"
            decoding="async"
            className="mt-4 h-28 w-full rounded-xl object-cover md:h-44"
          />
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

type ProfileQuestion = "when" | "group" | "vehicle";
const profileQuestions: ProfileQuestion[] = ["when", "group", "vehicle"];

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
  const [question, setQuestion] = useState<ProfileQuestion>("when");
  const index = profileQuestions.indexOf(question);
  const box = useRef<HTMLDivElement>(null);
  const go = (next: ProfileQuestion) => {
    setQuestion(next);
    requestAnimationFrame(() =>
      box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  };
  const next = () =>
    index + 1 < profileQuestions.length ? go(profileQuestions[index + 1]!) : onDone();

  // Changer le groupe après avoir fait la liste : on revoit les papiers des nouveaux voyageurs.
  const papersPatch = (p: Partial<Answers>) => {
    if (p.travellers && p.travellers.length !== papers.answers.travellers.length && papers.finished)
      papers.setFinished(false);
    papers.patch(p);
  };

  return (
    <div ref={box} className="scroll-mt-24 pt-4">
      <p className="text-xs font-bold uppercase tracking-widest text-primary">
        Question {index + 1} sur {profileQuestions.length}
      </p>
      {question === "when" ? <WhenQuestion plan={plan} patch={patch} /> : null}
      {question === "group" ? <GroupStep answers={papers.answers} patch={papersPatch} /> : null}
      {question === "vehicle" ? (
        <Question
          title="Vous partez avec votre voiture ?"
          hint="Pour le prix de la traversée et les papiers du véhicule."
        >
          <div
            role="radiogroup"
            aria-label="Véhicule"
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {VEHICLES.map(({ id, Icon, label, hint }) => {
              const on = plan.vehicle === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    patch({
                      vehicle: id,
                      done: id === "none" ? plan.done.filter((s) => s !== "car") : plan.done,
                    });
                    window.setTimeout(next, 180);
                  }}
                  className={`flex min-h-20 flex-col items-start justify-center gap-1 rounded-xl border p-3 text-left transition-colors ${
                    on
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "bg-background hover:border-primary/40"
                  }`}
                >
                  <Icon
                    size={20}
                    className={on ? "text-primary" : "text-muted-foreground"}
                    aria-hidden
                  />
                  <span className="font-semibold">{id === "none" ? "Sans voiture" : label}</span>
                  <span className="text-xs text-muted-foreground">
                    {id === "none" ? "À pied à bord" : hint}
                  </span>
                </button>
              );
            })}
          </div>
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
        <NextButton
          label={index + 1 < profileQuestions.length ? "Continuer" : "Continuer : mes papiers"}
          onClick={next}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 2. Les papiers */

function PapersStepBody({
  papers,
  plan,
  patch,
  onDone,
  next,
}: {
  papers: PapersState;
  plan: CompanionPlan;
  patch: (p: Partial<CompanionPlan>) => void;
  onDone: () => void;
  next: string;
}) {
  // Qui part et avec quels papiers ; le consulat en dernier, seulement s'il y a une démarche à y faire.
  const steps = papersSteps(papers.answers, "companion");
  const reasons = consulateReasons(papers.answers);
  // Les dates de la liste, tirées du premier jour de départ possible, avec leur raison.
  const deadlines = useMemo(() => {
    const day = earliestDay(plan);
    const today = todayKey();
    const visa = papers.answers.travellers.some((t) => t.nat === "etr");
    const weeks = new Date(Date.parse(`${day}T12:00:00Z`) - papersMargin(day).days * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const minus = (n: number) =>
      new Date(Date.parse(`${day}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
    const months3 = minus(90);
    const lastweek = minus(7);
    const out: Partial<Record<When, { label: string; why: string }>> = {
      first: { label: "Dès maintenant", why: papersWhy("first", day, visa).short },
      weeks: {
        label:
          minus(PAPERS_LAST_DAYS) < today
            ? "Aujourd'hui (délai très court)"
            : weeks < today
              ? "Cette semaine (marge réduite)"
              : `Avant le ${longDate(weeks)}`,
        why: papersWhy("weeks", day, visa).short,
      },
      months3: {
        label: months3 <= today ? "Dès maintenant" : `À partir du ${longDate(months3)}`,
        why: papersWhy("months3", day, visa).short,
      },
      lastweek: {
        label: lastweek <= today ? "Dès maintenant" : `À partir du ${longDate(lastweek)}`,
        why: papersWhy("lastweek", day, visa).short,
      },
    };
    return out;
  }, [plan, papers.answers.travellers]);
  const [step, setStep] = useState<PapersStep>(steps[0]!);
  const box = useRef<HTMLDivElement>(null);
  const toTop = () =>
    requestAnimationFrame(() =>
      box.current?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
  return (
    <div ref={box} className="scroll-mt-24 pt-4">
      {papers.finished ? (
        <>
          <PapersResult
            embedded
            deadlines={deadlines}
            abroadSlot={
              <EuropeConsulateCard country={plan.country} home={plan.home?.point ?? null} />
            }
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
          homeSlot={
            <ResidenceQuestion
              papers={papers}
              plan={plan}
              patch={patch}
              title="Trouver mon consulat"
              hint={`${reasons ? `${reasons.charAt(0).toUpperCase()}${reasons.slice(1)} se ${reasons.includes(" et ") ? "font" : "fait"} au consulat d'Algérie dont dépend votre domicile, sur rendez-vous. ` : ""}Indiquez votre ville : vous aurez son adresse, son téléphone et le lien pour prendre rendez-vous.`}
            />
          }
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
    patch({
      carDone: plan.carDone.includes(id)
        ? plan.carDone.filter((x) => x !== id)
        : [...plan.carDone, id],
    });
  return (
    <div className="pt-4">
      <Question title="La voiture reste-t-elle en Algérie ?">
        <Options
          label="Séjour de la voiture"
          value={plan.importCar ? "import" : "vacances"}
          onChange={(v) => patch({ importCar: v === "import" })}
          options={[
            {
              value: "vacances",
              label: "Non, elle revient avec moi",
              hint: "Admission temporaire, le temps des vacances",
            },
            {
              value: "import",
              label: "Oui, je l'importe",
              hint: "Véhicule de moins de 3 ans : une autre démarche",
            },
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
            <li
              key={item.id}
              className={`rounded-xl border ${done ? "bg-secondary/40" : "bg-background"}`}
            >
              <div className="flex items-start gap-3 p-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done}
                  aria-label={item.label}
                  onClick={() => toggle(item.id)}
                  className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border-2 ${
                    done
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/40"
                  }`}
                >
                  {done ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
                </button>
                <div className="min-w-0">
                  <p
                    className={`font-semibold ${done ? "text-muted-foreground line-through" : ""}`}
                  >
                    {item.label}
                  </p>
                  {item.tip ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">{item.tip}</p>
                  ) : null}
                  {item.href ? (
                    <a
                      href={item.href}
                      {...(item.href.startsWith("http")
                        ? { target: "_blank", rel: "noreferrer" }
                        : {})}
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
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
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
        <ul
          id="destinations"
          role="listbox"
          className="mt-1 grid overflow-hidden rounded-xl border bg-popover shadow-md"
        >
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
  papers,
  plan,
  patch,
  choices,
  fromChoice,
  toPortId,
  onItinerary,
  onDone,
}: {
  papers: PapersState;
  plan: CompanionPlan;
  patch: (p: Partial<CompanionPlan>) => void;
  choices: PortChoice[];
  fromChoice: PortChoice | null;
  toPortId: string | null;
  onItinerary: () => void;
  onDone: () => void;
}) {
  const [all, setAll] = useState(false);
  // La sélection par atout d'abord ; la liste complète des ports reste à portée de main.
  const [manual, setManual] = useState(false);
  const shown = all ? choices : choices.slice(0, 3);
  const selectedHidden = fromChoice && !shown.includes(fromChoice);
  return (
    <div className="pt-4">
      {!plan.home ? (
        <div className="mb-6 rounded-2xl bg-secondary/40 p-4">
          <ResidenceQuestion
            papers={papers}
            plan={plan}
            patch={patch}
            title="D'où partez-vous ?"
            hint="Pour classer les ports du plus proche au plus loin. La ville suffit."
            showConsulate={false}
          />
        </div>
      ) : null}
      <DestinationField
        value={plan.destination}
        onPick={(destination) => {
          const arrival =
            fromChoice && !plan.portsChosen
              ? closestArrival(fromChoice, destination?.point ?? null)
              : null;
          patch({ destination, ...(arrival ? { toPortId: arrival.id } : {}) });
        }}
      />

      <RouteTop3
        plan={plan}
        adults={people(papers.answers).adults}
        children={people(papers.answers).children}
        onPickPorts={(fromPortId, toPortId) => patch({ fromPortId, toPortId, portsChosen: true })}
        onMore={onItinerary}
      />
      {plan.home ? (
        <button
          type="button"
          onClick={() => setManual(!manual)}
          aria-expanded={manual}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-4"
        >
          {manual ? "Masquer la liste des ports" : "Choisir mes ports à la main"}
          <ChevronDown
            size={15}
            aria-hidden
            className={`transition-transform ${manual ? "rotate-180" : ""}`}
          />
        </button>
      ) : null}
      {!plan.home || manual ? (
        <>
          <h3 className="mt-6 font-display text-lg font-bold">
            {plan.home ? "Tous les ports, du plus proche au plus loin" : "Votre port de départ"}
          </h3>
          {!choices.length ? (
            <p className="mt-2 text-sm text-muted-foreground">Chargement des lignes…</p>
          ) : null}
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
                    patch({
                      fromPortId: choice.port.id,
                      toPortId: arrival?.id ?? null,
                      portsChosen: true,
                    });
                  }}
                  className={`flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    on
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "bg-background hover:border-primary/40"
                  }`}
                >
                  <Ship
                    size={18}
                    className={on ? "text-primary" : "text-muted-foreground"}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      {choice.port.name}
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {choice.port.country_name}
                      </span>
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      Vers {[...new Set(choice.lines.map((l) => l.to.name))].join(", ")}
                    </span>
                  </span>
                  {choice.km !== null ? (
                    <span className="shrink-0 text-right text-sm font-semibold">
                      ~{choice.km.toLocaleString("fr-FR")} km
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        à vol d'oiseau
                      </span>
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
              <div
                role="radiogroup"
                aria-label="Port d'arrivée"
                className="mt-3 flex flex-wrap gap-2"
              >
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
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-background hover:border-primary/40"
                      }`}
                    >
                      <span className="font-semibold">{to.name}</span>
                      {route.typical_duration_minutes ? (
                        <span
                          className={on ? "text-primary-foreground/80" : "text-muted-foreground"}
                        >
                          {formatDuration(route.typical_duration_minutes)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </>
      ) : null}
      <a
        href="/covoiturage"
        className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-secondary"
      >
        <Users size={16} aria-hidden /> Covoiturage jusqu'au port
      </a>
      <div className="mt-6">
        <NextButton label="Continuer : mon budget" onClick={onDone} />
      </div>
      <MoreLinks
        links={[{ href: "/voyage-algerie", label: "Cabine, enfants, animaux : la traversée" }]}
      />
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
        <p className="text-muted-foreground">
          Choisissez d'abord vos ports à l'étape « Ma route ».
        </p>
      </div>
    );
  const fare = planFare(plan, fromChoice.port, toPort, group);
  const vehicle = VEHICLES.find((v) => v.id === plan.vehicle);
  const hot = fare.season === "pointe" || fare.season === "forte";
  return (
    <div className="pt-4">
      <div className="rounded-2xl border p-4 md:p-5">
        <p className="text-sm text-muted-foreground">
          {fromChoice.port.name} → {toPort.name} · aller simple · départ {planWhenLabel(plan)}
        </p>
        <p className="mt-1 font-display text-3xl font-bold md:text-4xl">{formatFareRange(fare)}</p>
        <p className="mt-1 text-sm">
          {[
            plural(group.adults, "adulte"),
            group.children ? plural(group.children, "enfant") : null,
          ]
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
                <a
                  href={fare.source}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  Direct Ferries
                </a>
              ) : (
                "Direct Ferries"
              )}{" "}
              (septembre–octobre 2026), ajustée à la saison, aux voyageurs et au véhicule. Ce n'est
              pas un devis.
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
        <a
          href="/barometre-prix"
          className="flex min-h-12 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-secondary"
        >
          <TrendingUp size={16} className="text-primary" aria-hidden /> Comparer les mois
        </a>
        <a
          href="/simulateurs"
          className="flex min-h-12 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-secondary"
        >
          <Calculator size={16} className="text-primary" aria-hidden /> Essence, péages, tout le
          budget
        </a>
        <a
          href="/mes-dinars"
          className="flex min-h-12 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-secondary"
        >
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
    [
      "Traversée",
      fromChoice && toPort
        ? `${fromChoice.port.name} → ${toPort.name}`
        : "À choisir à l'étape « Ma route »",
    ],
    [
      "Départ",
      plan.window && !plan.date
        ? `${capitalize(planWhenLabel(plan))} · recherche autour du ${dayName(planDay(plan))}`
        : plan.date
          ? `${dayName(plan.date)}, ± 3 jours`
          : `Autour du ${dayName(planDay(plan))}, ± 3 jours`,
    ],
    [
      "Voyageurs",
      [plural(group.adults, "adulte"), group.children ? plural(group.children, "enfant") : null]
        .filter(Boolean)
        .join(", "),
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
        BledWay ne vend pas de billets : la réservation et le paiement se font auprès de la
        compagnie ou du distributeur indiqué.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ Quand partir */

const todayKey = () => new Date().toISOString().slice(0, 10);
const addDaysKey = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const shortDate = (key: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" })
    .format(new Date(`${key}T12:00:00`))
    .replace(/^1 /, "1er ")
    .replace(".", "");
const longDate = (key: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    .format(new Date(`${key}T12:00:00`))
    .replace(/ 1 /, " 1er ");
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function WhenQuestion({
  plan,
  patch,
}: {
  plan: CompanionPlan;
  patch: (p: Partial<CompanionPlan>) => void;
}) {
  const months = useMemo(() => nextMonths(12), []);
  const today = todayKey();
  const horizon = `${months[months.length - 1]!.key}-31`;
  const holidaysOn = plan.schoolHolidays;
  const spans = useMemo(
    () => (holidaysOn ? holidaysBetween(plan.holidays, today, horizon) : []),
    [holidaysOn, plan.holidays, today, horizon],
  );
  const { calendar, area } = parseHolidayChoice(plan.holidays);
  const countries = useMemo(() => holidayChoiceGroups(), []);
  const [datesOpen, setDatesOpen] = useState(() => Boolean(plan.window) && !plan.schoolHolidays);
  const countdown = Math.round(
    (Date.parse(`${earliestDay(plan)}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000,
  );
  const setWindow = (from: string, to: string) =>
    patch({
      window: { from, to: to < from ? from : to },
      month: from.slice(0, 7),
      date: "",
    });
  const toggleHolidays = () => {
    if (holidaysOn) {
      patch({ schoolHolidays: false });
      return;
    }
    // Le calendrier du pays de résidence par défaut, s'il est publié.
    const start =
      plan.holidays && plan.holidays !== "none"
        ? plan.holidays
        : (defaultHolidayChoice(plan.country) ?? "FR");
    patch({ schoolHolidays: true, holidays: start });
  };
  const chip = (on: boolean) =>
    `min-h-10 rounded-full border px-3 text-sm font-semibold transition-colors sm:min-h-11 sm:px-4 ${
      on
        ? "border-primary bg-primary text-primary-foreground"
        : "bg-background hover:border-primary/40"
    }`;

  return (
    <Question
      title="Quand souhaitez-vous partir ?"
      hint="Un mois suffit : on en déduit ce qu'il faut lancer, et avant quand."
    >
      <div
        role="radiogroup"
        aria-label="Mois de départ"
        className="grid grid-cols-3 gap-2 sm:grid-cols-4"
      >
        {months.map((m) => {
          const on = !plan.window && !plan.date && plan.month === m.key;
          const holidays = holidaysOn && monthHasHolidays(plan.holidays, m.key);
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => patch({ month: m.key, window: null, date: "" })}
              className={`relative flex min-h-14 flex-col items-center justify-center rounded-xl border px-2 py-2 text-sm transition-colors ${
                on
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "bg-background hover:border-primary/40"
              }`}
            >
              <span className="font-semibold capitalize">
                {m.label} {String(m.year).slice(2)}
              </span>
              <span
                className={`mt-0.5 text-[11px] ${m.season === "pointe" || m.season === "forte" ? "text-[#c95038]" : "text-muted-foreground"}`}
              >
                {shortSeason[m.season]}
              </span>
              {holidays ? (
                <span
                  className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[#e0a43a]"
                  title="Vacances scolaires ce mois-ci"
                  aria-label="vacances scolaires"
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Sous chaque mois : la saison des prix des traversées.
      </p>

      {/* Les vacances scolaires : seulement si on le demande, pays puis zone. */}
      <div
        className={`mt-5 rounded-2xl border p-3 md:p-4 ${holidaysOn ? "border-[#e0a43a]/50 bg-[#fff8ea]" : "bg-background"}`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <School size={18} className="shrink-0 text-[#b7791f]" aria-hidden />
            <span className="min-w-0">
              <span id="vacances-label" className="block text-sm font-bold">
                Pendant les vacances scolaires
              </span>
              <span className="block text-xs text-muted-foreground">
                Pour voir les dates de vos vacances
              </span>
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={holidaysOn}
            aria-labelledby="vacances-label"
            onClick={toggleHolidays}
            className="bw-switch"
          />
        </div>

        {holidaysOn ? (
          <div className="mt-4 border-t border-[#e0a43a]/30 pt-4">
            <p className="text-sm font-semibold">Le pays de l'école</p>
            <div
              role="radiogroup"
              aria-label="Pays de l'école"
              className="mt-2 flex flex-wrap gap-1.5 sm:gap-2"
            >
              {countries.map((country) => {
                const id = country.options[0]!.value;
                const on = calendar?.id === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => patch({ holidays: id })}
                    className={chip(on)}
                  >
                    {country.label}
                  </button>
                );
              })}
              <button
                type="button"
                role="radio"
                aria-checked={!calendar}
                onClick={() => patch({ holidays: "none" })}
                className={chip(!calendar)}
              >
                Autre pays
              </button>
            </div>

            {calendar && calendar.areas.length ? (
              <div className="mt-4">
                <p className="text-sm font-semibold">
                  {calendar.areaLabel ? capitalize(calendar.areaLabel) : "Zone"}
                </p>
                {calendar.areas.length <= 6 ? (
                  <div
                    role="radiogroup"
                    aria-label={calendar.areaLabel ?? "Zone"}
                    className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3"
                  >
                    {calendar.areas.map((zone) => {
                      const on = area === zone.id;
                      return (
                        <button
                          key={zone.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => patch({ holidays: `${calendar.id}:${zone.id}` })}
                          className={`flex min-h-12 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                            on
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "bg-background hover:border-primary/40"
                          }`}
                        >
                          <span className="font-semibold">{zone.name}</span>
                          {zone.hint ? (
                            <span className="line-clamp-1 text-[11px] text-muted-foreground">
                              {zone.hint}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!area}
                      onClick={() => patch({ holidays: calendar.id })}
                      className={`flex min-h-12 items-center rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors ${
                        !area
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "bg-background hover:border-primary/40"
                      }`}
                    >
                      Je ne sais pas
                    </button>
                  </div>
                ) : (
                  <select
                    value={area ?? ""}
                    onChange={(event) =>
                      patch({
                        holidays: event.target.value
                          ? `${calendar.id}:${event.target.value}`
                          : calendar.id,
                      })
                    }
                    aria-label={calendar.areaLabel ?? "Zone"}
                    className="mt-2 block min-h-12 w-full rounded-xl border bg-background px-3 text-base sm:max-w-xs"
                  >
                    <option value="">Je ne sais pas</option>
                    {calendar.areas.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : null}

            {calendar ? (
              spans.length ? (
                <>
                  <p className="mt-4 text-sm font-semibold">Vos vacances</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {spans.map((span) => {
                      const from = span.start < today ? today : span.start;
                      const to = span.end ?? addDaysKey(span.start, 30);
                      const on = plan.window?.from === from && plan.window?.to === to;
                      return (
                        <button
                          key={`${span.kind}-${span.start}`}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setWindow(from, to)}
                          className={`flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                            on
                              ? "border-primary bg-primary text-primary-foreground"
                              : "bg-background hover:border-primary/40"
                          }`}
                        >
                          <span className="font-semibold">
                            {span.label} {span.start.slice(0, 4)}
                          </span>
                          <span
                            className={`text-xs ${on ? "text-primary-foreground/85" : "text-muted-foreground"}`}
                          >
                            {shortDate(span.start)} → {span.end ? shortDate(span.end) : "à venir"}
                            {span.varies ? " · selon la zone" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Pas de vacances publiées sur les 12 prochains mois pour ce calendrier.
                </p>
              )
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Les vacances des autres pays ne sont pas publiées en données ouvertes : choisissez
                un mois ci-dessus, ou des dates précises.
              </p>
            )}
            {calendar ? (
              <p className="mt-3 text-[11px] text-muted-foreground">
                Source :{" "}
                <a
                  href={holidaySources[calendar.source].url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  {holidaySources[calendar.source].name}
                </a>
                , relevé le {shortDate(vacancesChecked())} {vacancesChecked().slice(0, 4)}.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Les dates précises : repliées, pour qui les connaît déjà. */}
      <div className="mt-4">
        <button
          type="button"
          aria-expanded={datesOpen}
          aria-controls="dates-precises"
          onClick={() => setDatesOpen((value) => !value)}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary"
        >
          <CalendarDays size={16} aria-hidden /> J'ai des dates précises
          <ChevronDown
            size={16}
            className={`transition-transform ${datesOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        {datesOpen ? (
          <div id="dates-precises" className="mt-2 grid grid-cols-2 gap-2 sm:max-w-md">
            <label className="text-xs text-muted-foreground">
              Partir à partir du
              <input
                type="date"
                value={plan.window?.from ?? ""}
                min={today}
                onChange={(event) =>
                  event.target.value &&
                  setWindow(event.target.value, plan.window?.to ?? event.target.value)
                }
                className="mt-1 block min-h-12 w-full rounded-xl border bg-background px-3 text-base text-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              et au plus tard le
              <input
                type="date"
                value={plan.window?.to ?? ""}
                min={plan.window?.from ?? today}
                onChange={(event) =>
                  event.target.value &&
                  setWindow(plan.window?.from ?? event.target.value, event.target.value)
                }
                className="mt-1 block min-h-12 w-full rounded-xl border bg-background px-3 text-base text-foreground"
              />
            </label>
          </div>
        ) : null}
      </div>

      <p
        className="mt-5 flex items-start gap-2 rounded-xl bg-primary/5 p-3 text-sm"
        aria-live="polite"
      >
        <CalendarDays size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <span>
          Départ {planWhenLabel(plan)}
          {countdown > 0
            ? countdown > 60
              ? `, dans ${Math.round(countdown / 7)} semaines : le temps de tout préparer sans stress.`
              : countdown > 28
                ? `, dans ${Math.round(countdown / 7)} semaines : les papiers longs sont à lancer maintenant.`
                : `, dans ${countdown} jour${countdown > 1 ? "s" : ""} : votre calendrier montrera l'essentiel à faire tout de suite.`
            : "."}
        </span>
      </p>
    </Question>
  );
}

/* ------------------------------------------------------------ Où vous habitez (consulat, ports) */

function ResidenceQuestion({
  papers,
  plan,
  patch,
  title = "Où habitez-vous ?",
  hint = "Pour trouver votre consulat d'Algérie, où se font vos démarches, et les ports les plus proches. La ville suffit.",
  showConsulate = true,
}: {
  papers: PapersState;
  plan: CompanionPlan;
  patch: (p: Partial<CompanionPlan>) => void;
  title?: string;
  hint?: string;
  showConsulate?: boolean;
}) {
  const setCountry = (code: string) => {
    // Les vacances suivent le pays tant qu'aucune zone précise n'a été choisie.
    const followHolidays = !plan.holidays.includes(":") || plan.holidays === "none";
    const holidays = followHolidays ? (defaultHolidayChoice(code) ?? "none") : plan.holidays;
    patch({
      country: code,
      home: null,
      holidays,
      ...(plan.portsChosen ? {} : { fromPortId: null, toPortId: null }),
    });
    papers.patch(code === "FR" ? { abroad: false } : { abroad: true, postcode: "" });
  };
  return (
    <Question title={title} hint={hint}>
      <label className="block">
        <span className="text-sm font-semibold">Pays</span>
        <select
          value={plan.country}
          onChange={(event) => setCountry(event.target.value)}
          className="mt-1 block min-h-12 w-full rounded-xl border bg-background px-3 text-base sm:max-w-xs"
        >
          {RESIDENCE_COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-4">
        {plan.country === "FR" ? (
          <HomeFields
            answers={papers.answers}
            patch={papers.patch}
            abroadToggle={false}
            showConsulat={showConsulate}
          />
        ) : (
          <>
            <EuropeCityField
              country={plan.country}
              value={plan.home}
              onPick={(place) =>
                patch({
                  home: place ? { postcode: "", name: place.label, point: place.point } : null,
                  ...(plan.portsChosen ? {} : { fromPortId: null, toPortId: null }),
                })
              }
            />
            {showConsulate ? (
              <div className="mt-4">
                <EuropeConsulateCard country={plan.country} home={plan.home?.point ?? null} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </Question>
  );
}

const PHOTON_COUNTRIES = [
  "ES",
  "IT",
  "PT",
  "BE",
  "DE",
  "CH",
  "NL",
  "GB",
  "LU",
  "AT",
  "SE",
  "DK",
  "NO",
  "IE",
] as const;

/** Une ville d'Europe (hors France) : recherche OpenStreetMap, limitée au pays choisi. */
function EuropeCityField({
  country,
  value,
  onPick,
}: {
  country: string;
  value: CompanionPlan["home"];
  onPick: (place: { label: string; point: [number, number] } | null) => void;
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [results, setResults] = useState<{ label: string; point: [number, number] }[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || q === value?.name) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const code = (PHOTON_COUNTRIES as readonly string[]).includes(country)
      ? (country as (typeof PHOTON_COUNTRIES)[number])
      : undefined;
    const timer = window.setTimeout(() => {
      setBusy(true);
      searchItineraryAddress({ data: { query: q, ...(code ? { countryCode: code } : {}) } })
        .then((list) => {
          if (!cancelled) setResults(list.slice(0, 5));
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
  }, [query, country, value?.name]);
  return (
    <div className="relative">
      <label className="block">
        <span className="text-sm font-semibold">Votre ville</span>
        <span className="relative mt-1 block">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Par exemple Bruxelles, Alicante, Milan"
            autoComplete="address-level2"
            aria-autocomplete="list"
            className="block min-h-12 w-full rounded-xl border bg-background pl-9 pr-4 text-lg"
          />
        </span>
      </label>
      {busy ? <p className="mt-1 text-xs text-muted-foreground">Recherche…</p> : null}
      {results.length ? (
        <ul
          role="listbox"
          className="mt-1 grid overflow-hidden rounded-xl border bg-popover shadow-md"
        >
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

/** Les postes d'Algérie du pays de résidence, du plus proche au plus loin. */
function EuropeConsulateCard({
  country,
  home,
}: {
  country: string;
  home: [number, number] | null;
}) {
  const result = europeConsulates(country, home);
  if (!result || !result.posts.length) return <AbroadCard />;
  return (
    <div className="rounded-xl border p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <Landmark size={16} className="text-primary" aria-hidden />
        {result.embassyOnly
          ? `${result.country} : l'ambassade d'Algérie`
          : `${result.country} : ${result.posts.length > 1 ? "les consulats" : "le consulat"} d'Algérie`}
      </p>
      <ul className="mt-3 grid gap-3">
        {result.posts.slice(0, 3).map((post, index) => (
          <li key={post.name} className={index ? "border-t pt-3" : ""}>
            <p className="font-semibold">
              {post.name}
              {post.km !== null ? (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · ~{post.km.toLocaleString("fr-FR")} km{index === 0 ? ", le plus proche" : ""}
                </span>
              ) : null}
            </p>
            <p className="text-muted-foreground">{post.address}</p>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {post.phone ? (
                <a
                  href={`tel:${post.phone.split("/")[0]!.replace(/[^\d+]/g, "")}`}
                  className={textLink}
                >
                  {post.phone.split("/")[0]!.trim()}
                </a>
              ) : null}
              {post.site ? (
                <a
                  href={post.site}
                  target="_blank"
                  rel="noreferrer"
                  className={`${textLink} inline-flex items-center gap-1`}
                >
                  Site du poste <ExternalLink size={12} aria-hidden />
                </a>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        {result.embassyOnly
          ? "Aucun consulat n'est listé dans ce pays : renseignez-vous auprès de l'ambassade pour les démarches. "
          : "Le plus proche est probablement le vôtre, mais c'est votre adresse qui décide : vérifiez sur son site que votre ville en dépend. "}
        Liste du{" "}
        <a
          href={MFA_REPRESENTATIONS_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          ministère algérien des Affaires étrangères
        </a>
        , relevée le {shortDate(consulatsChecked())} {consulatsChecked().slice(0, 4)}.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ Le calendrier à rebours */

function milestoneLead(m: Milestone, plan: CompanionPlan) {
  const today = todayKey();
  if (m.id === "day") return capitalize(planWhenLabel(plan));
  if (m.lead === "now" || (m.lead === "from" && m.date <= today)) return "Dès maintenant";
  if (m.lead === "after") return "Ensuite";
  if (m.lead === "before")
    return m.late
      ? "Aujourd'hui (délai très court)"
      : m.tight
        ? "Cette semaine (marge réduite)"
        : `Avant le ${longDate(m.date)}`;
  if (m.lead === "from") return `À partir du ${longDate(m.date)}`;
  return `Le ${longDate(m.date)}`;
}

/** Une action de la liste « À faire » : un papier à cocher, ou une étape à ouvrir. */
type TodoRow = {
  key: string;
  title: string;
  who: string[];
  ids: string[];
  step: CompanionStep | null;
  done: boolean;
  m: Milestone;
};

/** Ce qu'il y a à faire, tiré du calendrier : les papiers datés, la liste et la réservation. */
function todoRows(list: Milestone[], doneIds: string[]) {
  const rows: TodoRow[] = [];
  const know: Milestone[] = [];
  for (const m of list) {
    if (m.tone === "warning") know.push(m);
    else if (m.tasks.length)
      for (const task of m.tasks)
        rows.push({
          key: `${m.id}:${task.id}`,
          title: task.title,
          who: task.who,
          ids: task.ids,
          step: null,
          done: task.ids.every((id) => doneIds.includes(id)),
          m,
        });
    else if (m.id === "papers" || m.id === "book")
      rows.push({
        key: m.id,
        title: m.title,
        who: [],
        ids: [],
        step: m.id,
        done: Boolean(m.done),
        m,
      });
  }
  return { todo: rows.filter((row) => !row.done), done: rows.filter((row) => row.done), know };
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function usePlanTodo(plan: CompanionPlan, papers: PapersState) {
  const list = useMemo(
    () =>
      retroPlan(plan, { answers: papers.answers, finished: papers.finished, done: papers.done }),
    [plan, papers.answers, papers.finished, papers.done],
  );
  return { list, ...todoRows(list, papers.done) };
}

/**
 * Les échéances datées (« Avant le … ») recopiées sur le compte : l'envoi quotidien rappelle,
 * par alerte et par e-mail, celles dont la case n'est pas cochée à la date. Sans compte, rien ne part.
 */
function useDeadlineSync(
  userId: string | null,
  plan: CompanionPlan,
  papers: PapersState,
  ready: boolean,
) {
  const rows = useMemo(() => {
    if (!plan.started || !papers.finished) return [];
    const list = retroPlan(plan, {
      answers: papers.answers,
      finished: papers.finished,
      done: papers.done,
    });
    const { todo, done } = todoRows(list, papers.done);
    return [...todo, ...done]
      .filter((row) => row.m.lead === "before" && row.ids.length)
      .map((row) => ({
        key: row.key,
        title: row.title,
        who: row.who.join(", "),
        due_day: row.m.date,
        done: row.done,
      }));
  }, [plan, papers.answers, papers.finished, papers.done]);
  const signature = JSON.stringify(rows);
  useEffect(() => {
    if (!userId || !ready) return;
    const timer = window.setTimeout(() => {
      const db = supabase as unknown as SupabaseClient;
      void (async () => {
        try {
          if (rows.length)
            await db.from("bw_prepare_deadlines").upsert(
              rows.map((row) => ({ user_id: userId, ...row })),
              { onConflict: "user_id,key" },
            );
          const keep = rows.map((row) => `"${row.key}"`).join(",");
          const stale = db.from("bw_prepare_deadlines").delete().eq("user_id", userId);
          await (keep ? stale.not("key", "in", `(${keep})`) : stale);
        } catch {
          /* Les rappels sont un plus : la préparation reste sur l'appareil. */
        }
      })();
    }, 1500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ready, signature]);
}

/** « 2 actions à faire · la prochaine avant le 6 novembre » */
function todoSummary(todo: TodoRow[], plan: CompanionPlan) {
  if (!todo.length) return "Rien à faire pour l'instant : tout est coché.";
  return `${todo.length} action${todo.length > 1 ? "s" : ""} à faire · la prochaine ${lowerFirst(milestoneLead(todo[0]!.m, plan))}`;
}

function PlanTodo({
  plan,
  papers,
  onOpenStep,
}: {
  plan: CompanionPlan;
  papers: PapersState;
  onOpenStep: (step: CompanionStep) => void;
}) {
  const [calendar, setCalendar] = useState(false);
  const [more, setMore] = useState(false);
  const { list, todo, done, know } = usePlanTodo(plan, papers);
  const shown = more ? todo : todo.slice(0, 4);
  const toggle = (row: TodoRow) =>
    papers.setDone((current) =>
      row.done
        ? current.filter((id) => !row.ids.includes(id))
        : [...new Set([...current, ...row.ids])],
    );
  return (
    <section aria-labelledby="a-faire" className="mt-4 rounded-2xl border bg-card p-4 md:p-5">
      <h2 id="a-faire" className="flex items-center gap-2 font-display text-lg font-bold">
        <ListChecks size={19} className="text-primary" aria-hidden /> À faire
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{todoSummary(todo, plan)}</p>
      {todo.length ? (
        <ul className="mt-3 grid gap-2">
          {shown.map((row) => (
            <TodoItem
              key={row.key}
              row={row}
              plan={plan}
              onToggle={toggle}
              onOpenStep={onOpenStep}
            />
          ))}
        </ul>
      ) : null}
      {todo.length > 4 ? (
        <button
          type="button"
          onClick={() => setMore(!more)}
          aria-expanded={more}
          className="mt-2 text-sm font-semibold text-primary underline underline-offset-4"
        >
          {more ? "Moins d'actions" : `Voir les ${todo.length - 4} autres actions`}
        </button>
      ) : null}
      {done.length ? (
        <details className="group mt-3">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
            {done.length} faite{done.length > 1 ? "s" : ""}
            <ChevronDown
              size={15}
              aria-hidden
              className="transition-transform group-open:rotate-180"
            />
          </summary>
          <ul className="mt-2 grid gap-2">
            {done.map((row) => (
              <TodoItem
                key={row.key}
                row={row}
                plan={plan}
                onToggle={toggle}
                onOpenStep={onOpenStep}
              />
            ))}
          </ul>
        </details>
      ) : null}
      {know.length ? (
        <div className="mt-4 rounded-xl border border-[#e0a43a]/50 bg-[#fdf6e7] p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#b7791f]">À savoir</p>
          {know.map((m) => (
            <div key={m.id} className="mt-1">
              <p className="text-sm font-semibold">{m.title}</p>
              <p className="text-sm text-muted-foreground">{m.detail}</p>
              <Sources ids={m.sources} />
            </div>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setCalendar(!calendar)}
        aria-expanded={calendar}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-4"
      >
        <CalendarDays size={15} aria-hidden />
        {calendar ? "Masquer le calendrier complet" : "Voir le calendrier complet"}
      </button>
      {calendar ? <FullCalendar list={list} plan={plan} doneIds={papers.done} /> : null}
    </section>
  );
}

function Sources({ ids }: { ids?: Milestone["sources"] }) {
  if (!ids?.length) return null;
  return (
    <p className="mt-1 text-xs">
      Source :{" "}
      {ids.map((id, index) => (
        <span key={id}>
          {index ? ", " : ""}
          <a
            href={formaliteSources[id].url}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {formaliteSources[id].short}
          </a>
        </span>
      ))}
    </p>
  );
}

function TodoItem({
  row,
  plan,
  onToggle,
  onOpenStep,
}: {
  row: TodoRow;
  plan: CompanionPlan;
  onToggle: (row: TodoRow) => void;
  onOpenStep: (step: CompanionStep) => void;
}) {
  const [why, setWhy] = useState(false);
  const { m } = row;
  const tone = row.done
    ? "text-muted-foreground"
    : m.late
      ? "text-[#c95038]"
      : m.tight
        ? "text-[#b7791f]"
        : "text-primary";
  return (
    <li className="rounded-xl border bg-background px-3 py-2.5">
      <div className="flex items-start gap-3">
        {row.step ? (
          <span
            className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
            aria-hidden
          >
            <ArrowRight size={14} />
          </span>
        ) : (
          <button
            type="button"
            role="checkbox"
            aria-checked={row.done}
            aria-label={`${row.title} : ${row.done ? "fait" : "à faire"}`}
            onClick={() => onToggle(row)}
            className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border-2 transition-colors ${
              row.done
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/50 bg-background"
            }`}
          >
            {row.done ? <Check size={14} aria-hidden /> : null}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">
            {row.title}
            {row.who.length ? (
              <span className="font-normal text-muted-foreground"> · {row.who.join(", ")}</span>
            ) : null}
          </p>
          <p className={`text-xs font-bold ${tone}`}>
            {row.done ? "Fait" : milestoneLead(m, plan)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setWhy(!why)}
          aria-expanded={why}
          aria-label="Pourquoi cette date ?"
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Info size={16} aria-hidden />
        </button>
      </div>
      {why ? (
        <div className="mt-2 rounded-lg bg-secondary/50 p-2.5 text-sm text-muted-foreground">
          <p>{m.detail}</p>
          {m.more ? <p className="mt-1">{m.more}</p> : null}
          <Sources ids={m.sources} />
        </div>
      ) : null}
      {row.step && !row.done ? (
        <button
          type="button"
          onClick={() => onOpenStep(row.step!)}
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground"
        >
          {row.step === "papers" ? "Faire ma liste de papiers" : "Réserver ma traversée"}
        </button>
      ) : null}
    </li>
  );
}

/** Le calendrier à rebours en entier : toutes les dates, d'aujourd'hui au départ. */
function FullCalendar({
  list,
  plan,
  doneIds,
}: {
  list: Milestone[];
  plan: CompanionPlan;
  doneIds: string[];
}) {
  return (
    <ol className="mt-3 grid gap-4 border-l-2 border-primary/20 pl-4">
      {list.map((m) => (
        <li key={m.id} className="relative">
          <span
            className={`absolute -left-[23px] top-0.5 size-3.5 rounded-full ring-4 ring-card ${
              m.done
                ? "bg-primary"
                : m.late
                  ? "bg-[#c95038]"
                  : m.tone === "warning" || m.tight
                    ? "bg-[#e0a43a]"
                    : "bg-primary/40"
            }`}
            aria-hidden
          />
          <p
            className={`text-[11px] font-bold uppercase tracking-wider ${m.late ? "text-[#c95038]" : m.tone === "warning" || m.tight ? "text-[#b7791f]" : "text-primary"}`}
          >
            {milestoneLead(m, plan)}
            {m.done ? " · fait" : ""}
          </p>
          <p className="font-semibold">{m.title}</p>
          {m.tasks.length ? (
            <ul className="mt-1 grid gap-0.5 text-sm">
              {m.tasks.map((task) => {
                const done = task.ids.every((id) => doneIds.includes(id));
                return (
                  <li key={task.id} className="flex items-start gap-1.5">
                    {done ? (
                      <Check size={14} className="mt-0.5 shrink-0 text-primary" aria-label="fait" />
                    ) : (
                      <span
                        className="mt-[7px] size-1.5 shrink-0 rounded-full bg-muted-foreground"
                        aria-hidden
                      />
                    )}
                    <span>
                      {task.title}
                      {task.who.length ? (
                        <span className="text-muted-foreground"> · {task.who.join(", ")}</span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <p className="mt-1 text-sm text-muted-foreground">{m.detail}</p>
        </li>
      ))}
    </ol>
  );
}

/** La fin du parcours : ce qu'il reste à faire, le voyage en un coup d'œil, et les rappels. */
function ReadyDashboard({
  plan,
  papers,
  summaries,
  onOpenStep,
}: {
  plan: CompanionPlan;
  papers: PapersState;
  summaries: Record<CompanionStep, string | null>;
  onOpenStep: (step: CompanionStep) => void;
}) {
  const { todo } = usePlanTodo(plan, papers);
  const tiles: { label: string; value: string | null; step: CompanionStep }[] = [
    { label: "Ma traversée", value: summaries.book, step: "book" },
    { label: "Mes papiers", value: summaries.papers, step: "papers" },
    { label: "Mon budget", value: summaries.budget, step: "budget" },
  ];
  return (
    <section
      id="pret"
      aria-labelledby="pret-titre"
      className="mt-6 rounded-2xl bg-primary/5 p-5 md:p-6"
    >
      <img
        src="/illustrations/voyage/retrouvailles.webp"
        alt="Les retrouvailles avec la famille, au bled"
        width={960}
        height={540}
        loading="lazy"
        className="mb-4 aspect-[16/9] w-full rounded-xl object-cover"
      />
      <h2 id="pret-titre" className="flex items-center gap-2 font-display text-xl font-bold">
        <PartyPopper size={22} className="text-primary" aria-hidden /> Votre voyage est prêt
      </h2>
      <button
        type="button"
        onClick={() =>
          document.getElementById("a-faire")?.scrollIntoView({ block: "start", behavior: "smooth" })
        }
        className={`mt-4 flex w-full items-center gap-3 rounded-xl border bg-background p-3 text-left ${todo.length ? "border-primary" : ""}`}
      >
        <ListChecks size={20} className="shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            {todo.length ? "Il reste des actions" : "Toutes les actions sont faites"}
          </span>
          <span className="block text-sm text-muted-foreground">{todoSummary(todo, plan)}</span>
        </span>
        {todo.length ? (
          <ArrowRight size={16} className="shrink-0 text-primary" aria-hidden />
        ) : null}
      </button>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {tiles.map((tile) =>
          tile.value ? (
            <button
              key={tile.step}
              type="button"
              onClick={() => onOpenStep(tile.step)}
              className="rounded-xl border bg-background p-3 text-left hover:border-primary/40"
            >
              <span className="block text-[11px] font-bold uppercase tracking-wider text-primary">
                {tile.label}
              </span>
              <span className="mt-0.5 block text-sm font-semibold">{tile.value}</span>
            </button>
          ) : null,
        )}
      </div>
      <div className="mt-4 rounded-xl border bg-background p-3">
        <p className="flex items-center gap-2 font-semibold">
          <Bell size={17} className="text-primary" aria-hidden /> Être prévenu avant chaque échéance
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Si une action n'est pas cochée à sa date, BledWay vous envoie un rappel : une alerte sur
          cet appareil et un e-mail. Vous les réglez dans{" "}
          <a href="/compte" className={textLink}>
            Mon compte
          </a>
          .
        </p>
        <PushStatusLine />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Une fois le billet enregistré, la suite (48 h avant, au port, à l'arrivée) continue dans «
        Mon voyage », avec ce que vous avez déjà coché ici.
      </p>
      <a
        href="/"
        className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
      >
        <MapIcon size={16} aria-hidden /> Suivre en direct
      </a>
    </section>
  );
}

/**
 * Tout effacer pour repartir de zéro : la date, les réponses aux papiers, les démarches voiture.
 * Ce qui est sur le compte (billets, Mon voyage) n'est pas touché.
 */
function ResetPreparation({ onReset }: { onReset: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <RotateCcw size={15} aria-hidden /> Recommencer ma préparation
        </button>
      </div>
    );
  return (
    <div
      role="alertdialog"
      aria-labelledby="reset-titre"
      className="mt-8 rounded-2xl border border-border bg-card p-4 md:p-5"
    >
      <p id="reset-titre" className="font-bold">
        Tout recommencer ?
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        La période de départ, les réponses sur les voyageurs et les papiers, les ports et les
        démarches cochées seront effacés de ce téléphone. Vos billets et votre compte ne changent
        pas.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setAsking(false);
            onReset();
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-destructive px-4 text-sm font-bold text-destructive-foreground hover:bg-destructive/90"
        >
          <RotateCcw size={15} aria-hidden /> Oui, tout effacer
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="inline-flex min-h-11 items-center rounded-xl bg-secondary px-4 text-sm font-bold hover:bg-secondary/80"
        >
          Garder ma préparation
        </button>
      </div>
    </div>
  );
}

/**
 * Sans compte : on voit ce qui attend (les étapes suivantes), et on crée un compte gratuit pour
 * continuer. Ce qui a déjà été répondu reste sur le téléphone et se retrouve au retour.
 */
function SignupGate({ steps, profileDone }: { steps: CompanionStep[]; profileDone: boolean }) {
  const next = encodeURIComponent(PATH);
  return (
    <section
      id="compte"
      aria-labelledby="compte-titre"
      className="mt-4 scroll-mt-24 rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 md:p-6"
    >
      <h2 id="compte-titre" className="flex items-center gap-2 font-display text-xl font-bold">
        <Lock size={20} className="text-primary" aria-hidden />
        {profileDone ? "La suite avec un compte gratuit" : "Un compte gratuit pour la suite"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {profileDone
          ? "Votre départ et votre calendrier sont prêts. Créez votre compte pour continuer : vos réponses sont gardées."
          : "Commencez par la première étape sans compte. Pour la suite, il faut un compte gratuit : vos réponses sont gardées."}
      </p>
      <ol className="mt-3 grid gap-2">
        {steps.map((step, index) => (
          <li
            key={step}
            className="flex items-center gap-3 rounded-xl bg-card/80 px-3 py-2 text-sm"
          >
            <StepArt step={step} size="sm" done={false} />
            <span className="min-w-0 flex-1">
              <span className="text-muted-foreground">{index + 2}. </span>
              <span className="font-semibold">{stepTitles[step]}</span>
            </span>
            <Lock
              size={14}
              className="shrink-0 text-muted-foreground"
              aria-label="Avec un compte"
            />
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={`/auth?mode=signup&next=${next}`}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
        >
          <UserPlus size={16} aria-hidden /> Créer mon compte gratuit
        </a>
        <a
          href={`/auth?next=${next}`}
          className="inline-flex min-h-12 items-center rounded-xl bg-secondary px-5 text-sm font-bold hover:bg-secondary/80"
        >
          J'ai déjà un compte
        </a>
      </div>
    </section>
  );
}
