import { Bw504Button, Bw504Note } from "@/components/companion/Bw504Note";
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
  Globe2,
  MapPin,
  PartyPopper,
  Pencil,
  RotateCcw,
  Loader2,
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
import { ChoiceMenu } from "@/components/ChoiceMenu";
import { RouteTop3 } from "@/components/prepare/RouteTop3";
import { TripCalendar, type CalendarField } from "@/components/panel/TripCalendar";
import { buildSailings, daysWithSailings, legSailings } from "@/lib/ferry/trips";
import { WizardFrame, WizardNav, useWizardScreen } from "@/components/prepare/WizardFrame";
import {
  PapersQuestions,
  paperQuestions,
  questionIndexFor,
} from "@/components/papers/PapersQuestions";
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
  Question,
  papersSteps,
  usePapersState,
  type EditTarget,
  type PapersState,
  type PapersStep,
} from "@/components/papers/PapersFlow";
import { VEHICLES, defaultTripProfile } from "@/components/panel/TripProfile";
import {
  consulateReasons,
  defaultAnswers,
  formaliteSources,
  tasksFor,
  travellerLabel,
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
  planHasWhen,
  planWhenLabel,
  RESIDENCE_COUNTRIES,
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
  papersDeadlines,
  papersMargin,
  papersWhy,
  retroPlan,
  type Milestone,
} from "@/lib/ferry/retroPlan";
import { useReferenceData } from "@/lib/reference/useReferenceData";
import { priceSeason } from "@/lib/ferry/pricing";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import {
  readTravelProfile,
  saveItineraryChoice,
  saveTravelProfile,
} from "@/lib/ferry/travelProfile";
import type { Port } from "@/lib/ferry/types";
import { seoHead } from "@/lib/seo/site";
import { TICKETING } from "@/lib/seo/pitch";
import { SearchBox, splitPlace } from "@/components/SearchBox";
import {
  SailingsOutlook,
  TripBudget,
  budgetSummary,
  tripBudget,
} from "@/components/prepare/TripOutlook";
import { SharePreparation } from "@/components/prepare/SharePreparation";
import { PrepareIntro } from "@/components/prepare/PrepareIntro";
import { ConfirmChange } from "@/components/prepare/ConfirmChange";
import { ChapterBreak } from "@/components/prepare/ChapterBreak";
import { RecapPreview, type PreviewRow } from "@/components/prepare/RecapPreview";
import { isCheckable, planCategory } from "@/lib/papers/planCategories";
import { PaperKpis } from "@/components/papers/RecapSheet";
import { TripLink, useLinkedTrip, openMyVoyage } from "@/components/prepare/TripLink";
import { TripGlance, type GlanceTile } from "@/components/prepare/TripGlance";
import type { PapersFees } from "@/components/prepare/TripOutlook";
import { openRoutesDuBled } from "@/lib/routesDuBled/lien";

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
    benefit:
      "Carte grise, assurance, TPD (le titre de passage en douane de la voiture) : rien d'oublié pour la douane.",
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
    short: "Billet",
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
  hasRecap,
}: {
  steps: CompanionStep[];
  open: CompanionStep | null;
  done: CompanionStep[];
  locked: (step: CompanionStep) => boolean;
  onOpen: (step: CompanionStep) => void;
  /** Étape faite qui a un récap : petit badge « document » sur son rond. */
  hasRecap: (step: CompanionStep) => boolean;
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
                aria-label={`${stepTitles[step]} · ${sub}${isDone && hasRecap(step) ? " · voir le récap" : ""}`}
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
                  ) : isDone && !current && hasRecap(step) ? (
                    <span className="bw-recap-badge bw-recap-badge--lg" aria-hidden>
                      <FileText size={10} strokeWidth={2.5} />
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
  /** Le titre de l'écran qui annonce ce chapitre, entre deux chapitres. */
  headline: string;
  icon: LucideIcon;
  steps: CompanionStep[];
}[] = [
  {
    title: "Vous et votre départ",
    hint: "Quand vous partez, qui part, avec quelle voiture.",
    headline: "On fait connaissance",
    icon: Users,
    steps: ["profile"],
  },
  {
    title: "Vos papiers et votre voiture",
    hint: "La liste de chacun, avec les dates à tenir.",
    headline: "Maintenant, les papiers de chacun",
    icon: FileText,
    steps: ["papers"],
  },
  {
    title: "Votre route, votre budget, votre billet",
    hint: "Les ports les plus adaptés, le coût, la réservation.",
    headline: "Dernière étape : la traversée",
    icon: RouteIcon,
    steps: ["route", "budget", "book"],
  },
];
const chapterOf = (step: CompanionStep) =>
  Math.max(
    0,
    chapters.findIndex((chapter) => chapter.steps.includes(step)),
  );

/**
 * L'accueil : la 504 qui propose de charger la voiture — c'est elle le bouton, visible sans faire
 * défiler — et « Commencer » ouvre directement la première question. Les diapos (PrepareIntro :
 * pourquoi ces questions, les trois chapitres) restent à la demande, derrière « Comment ça marche ? ».
 */
function Welcome({ onStart }: { onStart: () => void }) {
  const [intro, setIntro] = useState(false);
  if (intro) return <PrepareIntro onBack={() => setIntro(false)} onGo={onStart} />;
  return (
    <div>
      {/* L'action d'abord (la 504 et « Commencer »), les photos d'Algérie ensuite. */}
      <button type="button" onClick={onStart} className="bw-prep-start">
        <Bw504Note title="Salut tonton ! On charge la 504 ?">
          Je t'aide à tout préparer, avec des rappels pour ne rien oublier.
          <span className="bw-prep-start__cta">
            Commencer <ArrowRight size={16} aria-hidden />
          </span>
        </Bw504Note>
      </button>
      <p className="mt-2 text-center md:text-left">
        <button
          type="button"
          onClick={() => {
            setIntro(true);
            requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
          }}
          className="text-sm font-semibold text-primary underline underline-offset-4"
        >
          Comment ça marche ?
        </button>
      </p>
      <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm md:justify-start">
        <span className="text-muted-foreground">Bientôt :</span>
        <span className="rounded-full border px-3 py-1 text-muted-foreground">Tunisie</span>
        <span className="rounded-full border px-3 py-1 text-muted-foreground">Maroc</span>
      </p>
      <div className="mt-5">
        <AlgeriaCarousel />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {TICKETING.short}
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
  // Une étape déjà validée s'ouvre en lecture ; elle ne repasse en questions qu'après « Modifier ».
  const [editing, setEditing] = useState<CompanionStep[]>([]);
  // Fin d'un chapitre (première fois) : le fil du parcours revient avant la suite.
  const [pause, setPause] = useState<{ finished: number; next: CompanionStep | null } | null>(null);
  const navigate = useNavigate();
  // Aperçu sans compte : la première étape (départ, groupe, voiture) et le calendrier ; la suite
  // (papiers, consulat, route, budget, réservation) demande un compte gratuit.
  const { user, loading: authLoading } = useAuth();
  const locked = !user;
  const isLocked = (step: CompanionStep | null) => locked && step !== null && step !== "profile";

  // L'étape demandée dans l'adresse (?etape=papers, retour de connexion ou de la page à partager),
  // lue une seule fois : l'adresse est nettoyée juste après, et l'effet peut repasser.
  const askedStep = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const saved = loadPlan();
    const travel = readTravelProfile();
    const start = saved ?? { ...defaultPlan(), ...(travel ? { vehicle: travel.vehicle } : {}) };
    setPlan(start);
    // Retour depuis la page à partager : on revient sur l'étape d'où l'on venait (son récap).
    if (askedStep.current === undefined)
      askedStep.current = new URLSearchParams(window.location.search).get("etape");
    const asked = askedStep.current;
    const wanted = companionSteps(start).find((step) => step === asked);
    setOpen(
      wanted ??
        (start.done.length
          ? null
          : (companionSteps(start).find((step) => !start.done.includes(step)) ?? null)),
    );
    if (wanted) window.history.replaceState(window.history.state, "", window.location.pathname);
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
  // Une route parcourue sans ports reste « à compléter » : on le dit, on ne bloque rien.
  // « Fait » = le voyageur l'a validée ET elle contient quelque chose.
  const isEmpty = (step: CompanionStep) => step === "route" && !(fromChoice && toPort);
  const isDone = (step: CompanionStep) => plan.done.includes(step) && !isEmpty(step);
  const doneSteps = steps.filter(isDone);
  const doneCount = doneSteps.length;
  const completeAll = doneCount === steps.length;
  // Toutes les étapes parcourues : place au récap global (les vides y restent signalées).
  const allDone = steps.every((step) => plan.done.includes(step));
  const ready = allDone && !locked;

  const openStep = (step: CompanionStep | null) => {
    if (isLocked(step)) {
      setOpen(null);
      requestAnimationFrame(() =>
        document.getElementById("compte")?.scrollIntoView({ block: "center", behavior: "smooth" }),
      );
      return;
    }
    setOpen(step);
    setEditing([]);
    if (step)
      requestAnimationFrame(() =>
        document
          .getElementById(`etape-${step}`)
          ?.scrollIntoView({ block: "start", behavior: "smooth" }),
      );
  };
  const complete = (step: CompanionStep) => {
    setEditing((list) => list.filter((s) => s !== step));
    const done = plan.done.includes(step) ? plan.done : [...plan.done, step];
    patch({ done });
    const order = companionSteps(plan);
    const finished = chapterOf(step);
    const firstTime = !plan.done.includes(step);
    // Première fois : la prochaine étape encore à faire. Étape revue : celle qui suit, comme le
    // dit le bouton (« Continuer : ma route »), même si elle a déjà été traversée.
    const after = firstTime
      ? order.slice(order.indexOf(step) + 1).find((s) => !done.includes(s))
      : order[order.indexOf(step) + 1];
    const next = after ?? (firstTime ? order.find((s) => !done.includes(s)) : undefined) ?? null;
    const chapterOver = !next || chapterOf(next) !== finished;
    if (firstTime && chapterOver && !isLocked(next)) {
      setPause({ finished, next });
      return;
    }
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

  // Les frais connus de la liste de papiers (visa, dossier) entrent dans le budget.
  const papersFees = useMemo<PapersFees | null>(() => {
    if (!papers.finished) return null;
    const items = tasksFor(papers.answers)
      .filter((task) => (task.cost?.eur ?? 0) > 0)
      .map((task) => ({ label: task.title, eur: task.cost!.eur }));
    return items.length ? { eur: items.reduce((sum, item) => sum + item.eur, 0), items } : null;
  }, [papers.answers, papers.finished]);
  // La traversée déjà déclarée « Ma traversée » (Mon voyage) : le billet est pris.
  const linkedTrip = useLinkedTrip();
  const summaries = useSummaries(plan, papers, fromChoice, toPort, papersFees, linkedTrip);
  useDeadlineSync(user?.id ?? null, plan, papers, loaded && papers.loaded);

  const nextStep = steps.find((step) => !isDone(step) && !isLocked(step)) ?? null;
  const wizSteps = steps.filter((step) => !isLocked(step));
  const inWizard = open !== null && wizSteps.includes(open);
  const stepAfter = (step: CompanionStep) => steps[steps.indexOf(step) + 1] ?? null;
  const hasRecap = (step: CompanionStep) =>
    step === "profile" || (step === "papers" && papers.finished);
  const stepBody = (step: CompanionStep) => (
    <>
      {step === "profile" && plan.done.includes("profile") && !editing.includes("profile") ? (
        <ProfileReview
          plan={plan}
          answers={papers.answers}
          onEdit={() => setEditing(["profile"])}
          onNext={() => openStep(stepAfter("profile"))}
        />
      ) : step === "profile" ? (
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
          next="ma route"
        />
      ) : null}
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
            // La route se suit sur Routes du bled, départ et arrivée déjà remplis.
            openRoutesDuBled({
              from: plan.home
                ? {
                    label: plan.home.postcode
                      ? `${plan.home.name} (${plan.home.postcode})`
                      : plan.home.name,
                    point: plan.home.point,
                  }
                : null,
              to: plan.destination
                ? { label: plan.destination.label, point: plan.destination.point }
                : null,
            });
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
          papersFees={papersFees}
          onExtras={(extras) => patch({ extras })}
          onDone={() => complete("budget")}
          onOpenRoute={() => openStep("route")}
        />
      ) : null}
      {step === "book" ? (
        <BookStep
          plan={plan}
          answers={papers.answers}
          fromChoice={fromChoice}
          toPort={toPort}
          onSee={goBooking}
          onBudget={() => openStep("budget")}
          onTicket={(ticket) => patch({ ticket })}
          onFinish={() => {
            if (!plan.done.includes("book")) patch({ done: [...plan.done, "book"] });
            setOpen(null);
            requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
          }}
        />
      ) : null}
    </>
  );

  const rowStep: Record<string, CompanionStep> = {
    Départ: "profile",
    Papiers: "papers",
    Voiture: "papers",
    Route: "route",
    Budget: "budget",
    Billet: "book",
  };
  // Vers « Réserver », seulement si le voyageur le demande : ports, jour et voyageurs dans
  // l'adresse, la carte ouvre directement les résultats.
  const goBooking = () => {
    syncTravelProfile();
    if (plan.fromPortId && plan.toPortId)
      saveItineraryChoice({
        period: plan.month,
        departurePortId: plan.fromPortId,
        arrivalPortId: plan.toPortId,
      });
    window.scrollTo({ top: 0, behavior: "instant" });
    void navigate({ href: bookingSearch(plan) });
  };
  const resetAll = () => {
    papers.setAnswers(defaultAnswers);
    papers.setDone([]);
    papers.setFinished(false);
    setPlan(defaultPlan());
    setOpen("profile");
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };
  const previewRows: PreviewRow[] = [
    { icon: CalendarDays, label: "Départ", value: summaries.profile, chapter: 0 },
    { icon: FileText, label: "Papiers", value: summaries.papers, chapter: 1 },
    ...(steps.includes("car")
      ? [{ icon: Car, label: "Voiture", value: summaries.car, chapter: 1 }]
      : []),
    { icon: RouteIcon, label: "Route", value: summaries.route, chapter: 2 },
    { icon: Wallet, label: "Budget", value: summaries.budget, chapter: 2 },
    { icon: Ticket, label: "Billet", value: summaries.book, chapter: 2 },
  ];
  return (
    <SiteLayout>
      {pause ? (
        <ChapterBreak
          finished={pause.finished}
          chapters={chapters}
          rows={previewRows}
          title="Votre voyage"
          subtitle="Il se complète à chaque chapitre"
          minutes={pause.finished === 0 ? 3 : 2}
          onBack={() => {
            setPause(null);
            openStep(null);
          }}
          onGo={() => {
            const target = pause.next;
            setPause(null);
            openStep(target);
            if (!target)
              requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
          }}
        />
      ) : null}
      {/* Sur téléphone, la première question doit se voir tout de suite : fil d'Ariane masqué
          (gardé pour les moteurs), titre et avancement sur une seule ligne. */}
      <div className="hidden md:block">
        <Breadcrumbs items={[{ name: "Préparer mon voyage", path: PATH }]} />
      </div>
      <EmbeddedPapers.Provider value>
        <div
          className={`mx-auto max-w-3xl pb-6 pt-3 md:py-10 ${allDone && !locked && (!inWizard || open === null) ? "lg:max-w-6xl" : ""}`}
        >
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
                  className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${completeAll ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                >
                  {completeAll ? "Récap prêt" : `${doneCount}/${steps.length}`}
                  <span className="sr-only"> étapes faites</span>
                </span>
              </div>
              {/* La vue d'ensemble : toutes les étapes, reliées. Une fois prêt, le récap la remplace. */}
              {ready ? null : (
                <StepFrieze
                  steps={steps}
                  open={open}
                  done={doneSteps}
                  locked={isLocked}
                  onOpen={openStep}
                  hasRecap={hasRecap}
                />
              )}

              {!inWizard || open === null ? (
                <>
                  <PrepTools
                    canShare={!ready && plan.done.includes("profile")}
                    onReset={resetAll}
                  />
                  {!allDone && !locked && nextStep ? (
                    <button
                      type="button"
                      onClick={() => openStep(nextStep)}
                      className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-primary px-3.5 py-3 text-left text-primary-foreground shadow-md"
                    >
                      <StepArt step={nextStep} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-bold uppercase tracking-wider opacity-80">
                          Reprendre ma préparation
                        </span>
                        <span className="block font-display text-base font-bold leading-tight">
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
                      papersFees={papersFees}
                      onExtras={(extras) => patch({ extras })}
                      ticket={Boolean(plan.ticket || linkedTrip)}
                      rows={previewRows.map((row) => ({
                        ...row,
                        onClick: () => openStep(rowStep[row.label] ?? "profile"),
                      }))}
                      fromChoice={fromChoice}
                      toPort={toPort}
                      onOpenStep={openStep}
                      onBook={goBooking}
                      onShare={() => void navigate({ to: "/ma-preparation" })}
                      todo={<PlanTodo plan={plan} papers={papers} onOpenStep={openStep} />}
                    />
                  ) : plan.done.includes("profile") ? (
                    <PlanTodo plan={plan} papers={papers} onOpenStep={openStep} />
                  ) : null}
                  {ready ? null : (
                    <>
                      <h2 className="mt-6 font-display text-lg font-bold">Mes étapes</h2>
                      <ol className="mt-2 grid grid-cols-1 gap-2">
                        {steps.map((step, index) =>
                          isLocked(step) ? null : (
                            <StepCard
                              key={step}
                              id={step}
                              index={index + 1}
                              title={stepTitles[step]}
                              summary={
                                isEmpty(step) && plan.done.includes(step)
                                  ? "À compléter : choisissez vos ports"
                                  : summaries[step]
                              }
                              done={isDone(step)}
                              open={false}
                              onToggle={() => openStep(step)}
                            >
                              {null}
                            </StepCard>
                          ),
                        )}
                      </ol>
                    </>
                  )}
                </>
              ) : (
                <WizardFrame
                  steps={wizSteps.map((step) => ({
                    key: step,
                    short: stepArt[step].short,
                    title: stepTitles[step],
                    icon: stepArt[step].icon,
                    done: isDone(step),
                    recap: hasRecap(step),
                  }))}
                  current={Math.max(0, wizSteps.indexOf(open))}
                  chapter={`Chapitre ${chapterOf(open) + 1} · ${chapters[chapterOf(open)]!.title}`}
                  onOpen={(index) => openStep(wizSteps[index]!)}
                  {...(plan.done.includes(open)
                    ? {}
                    : {
                        onSkip: () => {
                          const after = wizSteps[wizSteps.indexOf(open) + 1];
                          if (after) openStep(after);
                          else {
                            setOpen(null);
                            requestAnimationFrame(() =>
                              window.scrollTo({ top: 0, behavior: "instant" }),
                            );
                          }
                        },
                      })}
                  onClose={() => {
                    setOpen(null);
                    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
                  }}
                  aside={
                    <>
                      <p className="bw-wiz-aside__title">Votre récap se remplit</p>
                      <RecapPreview
                        title="Votre voyage"
                        subtitle="Il se complète à chaque étape"
                        // Une ligne remplie dès que son étape est faite ; les autres restent grises.
                        rows={previewRows.map((row) => ({
                          ...row,
                          chapter: isDone(rowStep[row.label] ?? "profile") ? -1 : 3,
                        }))}
                        filled={0}
                        fresh={null}
                      />
                    </>
                  }
                >
                  {stepBody(open)}
                </WizardFrame>
              )}

              {locked && !authLoading ? (
                <SignupGate
                  steps={steps.filter((step) => step !== "profile")}
                  profileDone={plan.done.includes("profile")}
                />
              ) : null}

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
  papersFees: PapersFees | null = null,
  linkedTrip: { label: string; at: string } | null = null,
): Record<CompanionStep, string | null> {
  const { adults, children } = people(papers.answers);
  const vehicle = VEHICLES.find((v) => v.id === plan.vehicle);
  // Même décompte que « Votre liste » (RecapSheet) : seulement ce qui se coche, sans les points
  // d'attention, pour que le récap et la liste disent le même chiffre.
  const tasks = useMemo(
    () => tasksFor(papers.answers).filter((t) => isCheckable(planCategory(t))),
    [papers.answers],
  );
  const ready = tasks.filter((t) => papers.done.includes(t.id)).length;
  const carReady = carItems.filter((item) => plan.carDone.includes(item.id)).length;
  const line = fromChoice && toPort ? `${fromChoice.port.name} → ${toPort.name}` : null;
  const duration =
    fromChoice?.lines.find((l) => l.to.id === toPort?.id)?.route.typical_duration_minutes ?? null;
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
    // Les papiers de la voiture comptent avec ceux des voyageurs.
    papers: papers.finished
      ? plan.vehicle === "none"
        ? `${ready} sur ${tasks.length} papiers prêts`
        : `${ready + carReady} sur ${tasks.length + carItems.length} papiers prêts, voiture comprise`
      : "Votre liste, voyageur par voyageur",
    car: `${carReady} sur ${carItems.length} faits${plan.importCar ? " · import" : ""}`,
    route: line ? `${line}${duration ? ` · ${formatDuration(duration)} de traversée` : ""}` : null,
    // Le même chiffre que le bloc « Votre budget » : bateau et route, arrondi.
    budget:
      fromChoice && toPort
        ? budgetSummary(tripBudget(plan, fromChoice, toPort, { adults, children }, papersFees))
        : null,
    book: linkedTrip
      ? `${linkedTrip.label} · billet pris, suivi dans Mon voyage`
      : line
        ? `${line} · ${planWhenLabel(plan)} · ${plan.ticket ? "billet pris" : "billet à prendre"}`
        : null,
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
              {done ? "Revoir" : "Ouvrir"}
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

/** Le bouton d'action de l'écran : dans la barre du bas du guide, toujours visible. */
function NextButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <WizardNav next={{ label, onClick }} />;
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

type ProfileQuestion = "when" | "holidays" | "group" | "vehicle";

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
  const profileQuestions: ProfileQuestion[] = [
    "when",
    ...(plan.schoolHolidays ? (["holidays"] as const) : []),
    "group",
    "vehicle",
  ];
  const index = Math.max(0, profileQuestions.indexOf(question));
  useWizardScreen(index, profileQuestions.length);
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
      {question === "when" ? (
        <WhenQuestion plan={plan} patch={patch} onHolidays={() => go("holidays")} />
      ) : null}
      {question === "holidays" ? (
        <HolidaysQuestion plan={plan} patch={patch} onPicked={() => window.setTimeout(next, 240)} />
      ) : null}
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
      <WizardNav
        back={index > 0 ? () => go(profileQuestions[index - 1]!) : undefined}
        next={{
          label: index + 1 < profileQuestions.length ? "Continuer" : "Continuer : mes papiers",
          onClick: next,
          // Pas de départ sans date : c'est elle qui fait le compte à rebours.
          disabled: question === "when" && !plan.date && !plan.window,
        }}
      />
    </div>
  );
}

/**
 * Le départ déjà validé : ce qui a été dit, en lecture. « Modifier » demande confirmation, car la
 * date et les voyageurs font les échéances et la liste de papiers.
 */
function ProfileReview({
  plan,
  answers,
  onEdit,
  onNext,
}: {
  plan: CompanionPlan;
  answers: Answers;
  onEdit: () => void;
  onNext: () => void;
}) {
  const [asking, setAsking] = useState(false);
  useWizardScreen(0, 1);
  const { adults, children } = people(answers);
  const named = answers.travellers.filter((t) => t.name?.trim());
  const vehicle = VEHICLES.find((v) => v.id === plan.vehicle);
  const rows: { icon: LucideIcon; label: string; value: string }[] = [
    { icon: CalendarDays, label: "Départ", value: capitalize(planWhenLabel(plan)) },
    {
      icon: Users,
      label: "Voyageurs",
      value: named.length
        ? answers.travellers.map((t) => travellerLabel(t, answers.travellers)).join(", ")
        : [plural(adults, "adulte"), children ? plural(children, "enfant") : null]
            .filter(Boolean)
            .join(", "),
    },
    {
      icon: Car,
      label: "Véhicule",
      value: plan.vehicle === "none" ? "Sans voiture" : (vehicle?.label ?? "—"),
    },
  ];
  return (
    <div className="pt-4">
      <Bw504Note tone="win" title="C'est noté, cette étape est faite">
        Voici ce que tu m'as dit. Tout reste modifiable, mais je te demanderai confirmation : la
        date et les voyageurs servent à calculer tes échéances et ta liste de papiers.
      </Bw504Note>
      <dl className="bw-review mt-4">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label}>
            <dt>
              <Icon size={15} aria-hidden /> {label}
            </dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-secondary"
      >
        <Pencil size={15} aria-hidden /> Modifier le départ
      </button>
      {asking ? (
        <ConfirmChange
          title="On modifie le départ ?"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            onEdit();
          }}
        >
          Changer la date ou les voyageurs change tes échéances et ta liste de papiers : je les
          recalcule. Ce que tu as déjà coché reste coché.
        </ConfirmChange>
      ) : null}
      <WizardNav next={{ label: "Continuer : mes papiers", onClick: onNext }} />
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
  const deadlines = useMemo(
    () =>
      papersDeadlines(
        earliestDay(plan),
        papers.answers.travellers.some((t) => t.nat === "etr"),
        todayKey(),
      ),
    [plan, papers.answers.travellers],
  );
  // Où reprendre les questions : la partie choisie dans « Modifier ».
  const [resume, setResume] = useState<"last" | number>(0);
  // Une modification qui change la liste (voyageurs, papiers, famille, séjour) se confirme.
  const [asking, setAsking] = useState<EditTarget | "all" | null>(null);
  const editAt = (target: EditTarget | "all") => {
    setResume(
      target === "all" ? 0 : questionIndexFor(paperQuestions(papers.answers, steps), target),
    );
    papers.setFinished(false);
    toTop();
  };
  const questions = paperQuestions(papers.answers, steps).length;
  useWizardScreen(questions, questions + 1, undefined, papers.finished);
  // Tout ce que la liste demande est coché par le voyageur, voiture comprise s'il en a une.
  const paperTasks = useMemo(() => tasksFor(papers.answers), [papers.answers]);
  const allPapersTicked =
    paperTasks.length > 0 &&
    paperTasks.every((task) => papers.done.includes(task.id)) &&
    (plan.vehicle === "none" || carItems.every((item) => plan.carDone.includes(item.id)));
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
            patch={papers.patch}
            departure={plan.date || plan.window?.from || null}
            onEditAt={(target) => setAsking(target)}
            done={papers.done}
            setDone={papers.setDone}
            onEdit={() => setAsking("all")}
          />
          {asking ? (
            <ConfirmChange
              title="On modifie tes papiers ?"
              onCancel={() => setAsking(null)}
              onConfirm={() => {
                const target = asking;
                setAsking(null);
                editAt(target);
              }}
            >
              Changer un voyageur, ses papiers, la famille ou le séjour peut changer la liste : je
              la recalcule à la fin des questions. Ce que tu as déjà coché reste coché si la
              démarche existe toujours.
            </ConfirmChange>
          ) : null}
          {plan.vehicle !== "none" ? <CarPapers plan={plan} patch={patch} /> : null}
          {allPapersTicked ? (
            <Bw504Note tone="win" className="mt-6" title="Tout est coché, bravo !">
              Range tes papiers dans la pochette du voyage. Ta liste t'attend ici, si tu en as
              besoin.
            </Bw504Note>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">
              Pas besoin de tout cocher maintenant : la liste vous attend ici.
            </p>
          )}
          <div className="mt-4">
            <WizardNav next={{ label: `Continuer : ${next}`, onClick: onDone }} />
          </div>
        </>
      ) : (
        <PapersQuestions
          start={resume}
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
          onFinish={() => {
            papers.setFinished(true);
            toTop();
          }}
        />
      )}
      {/* Pendant les questions, chaque règle est repliée sous sa question : les liens généraux
          attendent la liste. */}
      {papers.finished ? (
        <MoreLinks
          links={[
            { href: "/papiers-voyage-algerie", label: "Les règles et leurs sources" },
            { href: "/guide/arrivee-algerie-port-formalites", label: "Les formalités à l'arrivée" },
          ]}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ 3. La voiture */

/**
 * Les papiers de la voiture, à la suite de ceux des voyageurs dans « Mes papiers » : même liste,
 * cochée au même endroit, et reprise dans « Mon voyage ».
 */
/** Slugs des ports d'où Baleària recommande le DUA d'exportation (centre d'aide Baleària, lu le 23/11/2026). */
const DUA_PORTS = new Set(["valence", "barcelone"]);

/** Avis de Baleària : voiture chargée au départ de Valence ou de Barcelone. Information seule, rien à cocher. */
function DuaNotice() {
  const source = formaliteSources["balearia-dua"];
  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
      <Info size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">Voiture très chargée : pensez au DUA</p>
        <p className="mt-1">
          Au départ de Valence ou de Barcelone avec Baleària, si vous transportez plus de 3 colis
          par passager, ou de la marchandise dans le véhicule, la compagnie recommande fortement
          de présenter un DUA d'exportation (la déclaration en douane). Tout ce qui n'est pas
          strictement un effet personnel est considéré comme marchandise commerciale.
        </p>
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className={`${textLink} mt-1 inline-flex items-center gap-1`}
        >
          Source : {source.short}, {source.updated}
          <ExternalLink size={12} aria-hidden />
        </a>
      </div>
    </div>
  );
}

function CarPapers({
  plan,
  patch,
}: {
  plan: CompanionPlan;
  patch: (p: Partial<CompanionPlan>) => void;
}) {
  const toggle = (id: string) =>
    patch({
      carDone: plan.carDone.includes(id)
        ? plan.carDone.filter((x) => x !== id)
        : [...plan.carDone, id],
    });
  const ready = carItems.filter((item) => plan.carDone.includes(item.id)).length;
  // Le port de départ est rangé par identifiant : on lit son slug dans la liste des ports.
  const { data: ports = [] } = useQuery(portsQuery);
  const departureSlug = ports.find((port) => port.id === plan.fromPortId)?.slug ?? null;
  return (
    <section aria-labelledby="papiers-voiture" className="bw-carpapers mt-6">
      <div className="flex items-center justify-between gap-3">
        <h3 id="papiers-voiture" className="flex items-center gap-2 font-display text-xl font-bold">
          <Car size={19} className="text-primary" aria-hidden /> La voiture
        </h3>
        <span className="text-sm font-semibold text-muted-foreground">
          {ready} sur {carItems.length}
        </span>
      </div>
      <div className="mt-3">
        <p className="mb-2 text-sm font-semibold">Elle reste en Algérie ?</p>
        <Options
          label="La voiture reste-t-elle en Algérie ?"
          value={plan.importCar ? "import" : "vacances"}
          onChange={(v) => patch({ importCar: v === "import" })}
          small
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
      </div>
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
      {departureSlug && DUA_PORTS.has(departureSlug) ? <DuaNotice /> : null}
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
      <MoreLinks
        links={[
          { href: "/guide/voyage-algerie-voiture-checklist", label: "La checklist voiture" },
          { href: "/guide/voiture-vacances-admission-temporaire", label: "L'admission temporaire" },
        ]}
      />
    </section>
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
  const [searched, setSearched] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || q === value?.label) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearched(false);
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
          if (cancelled) return;
          setBusy(false);
          setSearched(true);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, value?.label]);
  return (
    <SearchBox
      id="ville-bled"
      label={"Où allez-vous en Algérie ? (facultatif)"}
      value={query}
      onChange={(text) => {
        setQuery(text);
        if (!text.trim()) onPick(null);
      }}
      placeholder={"Ville ou quartier, par exemple Tizi Ouzou"}
      autoComplete={"off"}
      busy={busy}
      picked={Boolean(query.trim()) && query === value?.label}
      searched={searched}
      hits={results.map((place) => ({
        key: `${place.label}-${place.point.join(",")}`,
        ...splitPlace(place.label, "Algérie"),
        onPick: () => {
          setQuery(place.label);
          setResults([]);
          onPick(place);
        },
      }))}
    />
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
  // Le départ et l'arrivée tiennent sur une bande ; on ne rouvre leur champ que pour les changer.
  const [edit, setEdit] = useState<"home" | "dest" | null>(null);
  const shown = all ? choices : choices.slice(0, 3);
  const selectedHidden = fromChoice && !shown.includes(fromChoice);
  const destinationField = (
    <DestinationField
      value={plan.destination}
      onPick={(destination) => {
        const arrival =
          fromChoice && !plan.portsChosen
            ? closestArrival(fromChoice, destination?.point ?? null)
            : null;
        patch({ destination, ...(arrival ? { toPortId: arrival.id } : {}) });
        if (destination) setEdit(null);
      }}
    />
  );
  const arrivalName = choices
    .flatMap((choice) => choice.lines.map((line) => line.to))
    .find((port) => port.id === toPortId)?.name;
  return (
    <div className="bw-route pt-3">
      {!plan.home ? (
        <>
          <div className="mb-4">
            <ResidenceQuestion
              papers={papers}
              plan={plan}
              patch={patch}
              title="D'où partez-vous ?"
              hint="Pour calculer vos trajets porte à porte. La ville suffit."
              showConsulate={false}
            />
            {/^\d{5}$/.test(papers.answers.postcode.trim()) ? (
              <p
                className="mt-3 flex items-center gap-2 text-sm font-semibold text-primary"
                role="status"
              >
                <Loader2 size={15} className="animate-spin" aria-hidden /> Je place votre ville sur
                la carte…
              </p>
            ) : null}
          </div>
          {destinationField}
        </>
      ) : (
        <>
          <div className="bw-trip">
            <button
              type="button"
              className="bw-trip__end"
              aria-expanded={edit === "home"}
              onClick={() => setEdit(edit === "home" ? null : "home")}
            >
              <small>Départ</small>
              <b>{plan.home.name}</b>
              <Pencil size={13} aria-hidden />
            </button>
            <span className="bw-trip__sea" aria-hidden>
              <Ship size={16} />
            </span>
            <button
              type="button"
              className="bw-trip__end"
              data-empty={!plan.destination || undefined}
              aria-expanded={edit === "dest"}
              onClick={() => setEdit(edit === "dest" ? null : "dest")}
            >
              <small>Au bled</small>
              <b>{plan.destination?.label ?? arrivalName ?? "Ajouter ma ville"}</b>
              <Pencil size={13} aria-hidden />
            </button>
          </div>
          {edit === "home" ? (
            <div className="bw-trip__edit">
              <ResidenceQuestion
                papers={papers}
                plan={plan}
                patch={patch}
                title="D'où partez-vous ?"
                hint="La ville suffit."
                showConsulate={false}
              />
              <button type="button" onClick={() => setEdit(null)} className="bw-trip__ok">
                <Check size={15} aria-hidden /> C'est bon
              </button>
            </div>
          ) : null}
          {edit === "dest" ? <div className="bw-trip__edit">{destinationField}</div> : null}
          <Bw504Note title="Pourquoi pas juste le port le plus proche ?" className="mt-3">
            Il n'est pas toujours le plus rapide : je compte la route, l'attente au port et la mer,
            jusqu'{plan.destination ? `à ${plan.destination.label}` : "à l'arrivée"}.
          </Bw504Note>
        </>
      )}

      <RouteTop3
        plan={plan}
        adults={people(papers.answers).adults}
        children={people(papers.answers).children}
        onPickPorts={(fromPortId, toPortId) => patch({ fromPortId, toPortId, portsChosen: true })}
        onRecommend={(fromPortId, toPortId) => patch({ fromPortId, toPortId })}
      />

      <div className="bw-route__acts">
        <button type="button" onClick={onItinerary}>
          <MapIcon size={18} aria-hidden />
          <b>Étape par étape</b>
          <small>Pauses, prière, nuits</small>
        </button>
        <button type="button" onClick={() => setManual(!manual)} aria-expanded={manual}>
          <Ship size={18} aria-hidden />
          <b>Autres ports</b>
          <small>{manual ? "Masquer la liste" : "Choisir à la main"}</small>
        </button>
        <a href="/covoiturage">
          <Users size={18} aria-hidden />
          <b>Covoiturage</b>
          <small>Jusqu'au port</small>
        </a>
      </div>

      {manual ? (
        <div className="bw-route__manual">
          <h3 className="font-display text-base font-bold">
            {plan.home ? "Tous les ports, du plus proche au plus loin" : "Votre port de départ"}
          </h3>
          {!choices.length ? (
            <p className="mt-2 text-sm text-muted-foreground">Chargement des lignes…</p>
          ) : null}
          <div role="radiogroup" aria-label="Port de départ" className="mt-2 grid gap-1.5">
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
                  className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                    on
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "bg-background hover:border-primary/40"
                  }`}
                >
                  <Ship
                    size={16}
                    className={on ? "text-primary" : "text-muted-foreground"}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {choice.port.name}
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {choice.port.country_name}
                      </span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Vers {[...new Set(choice.lines.map((l) => l.to.name))].join(", ")}
                    </span>
                  </span>
                  {choice.km !== null ? (
                    <span className="shrink-0 text-right text-xs font-semibold tabular-nums">
                      ~{choice.km.toLocaleString("fr-FR")} km
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
              <h3 className="mt-4 font-display text-base font-bold">Votre port d'arrivée</h3>
              <div
                role="radiogroup"
                aria-label="Port d'arrivée"
                className="mt-2 flex flex-wrap gap-2"
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
        </div>
      ) : null}
      {/* Rien de bloqué (Préparer reste déclaratif), mais le bouton dit ce qui se passe : sans ports,
          ni budget ni traversées à montrer ensuite. */}
      <WizardNav
        next={{
          label: "Continuer : mon budget",
          onClick: onDone,
          disabled: !fromChoice || !toPortId,
        }}
        skip={
          fromChoice && toPortId ? undefined : { label: "Passer sans mes ports", onClick: onDone }
        }
      />
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
  papersFees,
  onExtras,
  onDone,
  onOpenRoute,
}: {
  plan: CompanionPlan;
  answers: Answers;
  fromChoice: PortChoice | null;
  toPort: Port | null;
  papersFees: PapersFees | null;
  onExtras: (extras: NonNullable<CompanionPlan["extras"]>) => void;
  onDone: () => void;
  onOpenRoute: () => void;
}) {
  const group = people(answers);
  // Sans ports, pas de prix à estimer : on le dit avec la 504, et on laisse choisir les ports tout
  // de suite ou passer le budget sans que l'étape reste « à faire ».
  if (!fromChoice || !toPort)
    return (
      <div className="pt-4">
        <Bw504Note
          tone="stuck"
          title="Il me manque tes ports pour chiffrer"
        >
          Le prix dépend du port de départ et d'arrivée. Choisis-les en un geste, ou passe le
          budget : c'est toi qui décides.
        </Bw504Note>
        <WizardNav
          next={{ label: "Choisir mes ports", onClick: onOpenRoute }}
          skip={{ label: "Passer le budget", onClick: onDone }}
        />
      </div>
    );
  const fare = planFare(plan, fromChoice.port, toPort, group);
  const vehicle = VEHICLES.find((v) => v.id === plan.vehicle);
  const hot = fare.season === "pointe" || fare.season === "forte";
  return (
    <div className="pt-4">
      <TripBudget
        plan={plan}
        fromChoice={fromChoice}
        toPort={toPort}
        people={group}
        papers={papersFees}
        onExtras={onExtras}
        onDetail={() =>
          document.getElementById("budget-aller")?.scrollIntoView({ block: "start", behavior: "smooth" })
        }
      />
      {/* D'où viennent les chiffres : en mots simples, avec la source quand elle existe. */}
      <div id="budget-aller" className="mt-3 scroll-mt-4 rounded-2xl border p-4 text-sm md:p-5">
        <p className="font-display text-base font-bold">D'où viennent ces chiffres ?</p>
        <ul className="mt-2 grid gap-2 leading-relaxed text-muted-foreground">
          <li>
            <b className="text-foreground">Le bateau :</b>{" "}
            {fare.benchmarked ? (
              <>
                les prix moyens publiés par{" "}
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
                pour {fromChoice.port.name} → {toPort.name} (relevés en septembre et octobre 2026),
              </>
            ) : (
              <>
                aucun prix moyen n'est publié pour {fromChoice.port.name} → {toPort.name} : on part
                d'un prix type de traversée,
              </>
            )}{" "}
            puis on ajuste selon la saison ({seasonLabels[fare.season].toLowerCase()}{" "}
            {planWhenLabel(plan)}), le nombre de voyageurs et{" "}
            {plan.vehicle === "none" ? "l'absence de voiture" : `la ${vehicle?.label.toLowerCase()}`}.
          </li>
          {plan.vehicle !== "none" ? (
            <li>
              <b className="text-foreground">La route :</b> la distance jusqu'au port, la
              consommation d'une voiture moyenne et, en France, les péages.
            </li>
          ) : null}
          <li>
            <b className="text-foreground">Ce n'est pas un devis :</b> le vrai prix s'affiche
            quand vous réservez chez la compagnie.
          </li>
        </ul>
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
        <NextButton label="Continuer : mon billet" onClick={onDone} />
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
  onSee,
  onBudget,
  onTicket,
  onFinish,
}: {
  plan: CompanionPlan;
  answers: Answers;
  fromChoice: PortChoice | null;
  toPort: Port | null;
  onSee: () => void;
  onBudget: () => void;
  onTicket: (ticket: boolean) => void;
  onFinish: () => void;
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
          : "Date à choisir",
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
      <div className="mt-4 grid gap-3">
        <TripLink fromPortId={fromChoice?.port.id ?? null} toPortId={toPort?.id ?? null} />
        {/* Le budget vient d'être vu à l'étape d'avant et revient dans le récap : ici, un lien suffit. */}
        <button
          type="button"
          onClick={onBudget}
          className="flex min-h-11 items-center gap-2 text-left text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          <Wallet size={16} aria-hidden /> Revoir mon budget estimé
        </button>
        <SailingsOutlook
          plan={plan}
          fromName={fromChoice?.port.name ?? null}
          toName={toPort?.name ?? null}
          onSee={onSee}
        />
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-5 accent-[var(--primary)]"
            checked={Boolean(plan.ticket)}
            onChange={(event) => onTicket(event.target.checked)}
          />
          <span>
            J'ai mon billet
            <span className="block text-xs font-normal text-muted-foreground">
              À cocher quand vous l'avez : la ligne « Billet » de votre récap passe alors à fait.
            </span>
          </span>
        </label>
        {plan.ticket ? (
          <Bw504Note
            tone="win"
            title="Billet en poche !"
            actions={
              <Bw504Button primary onClick={() => window.location.assign("/compte")}>
                Ajouter mon billet
              </Bw504Button>
            }
          >
            Ajoute-le à ton compte : je garde un œil sur ton navire et, avec les notifications, je
            te préviens d'un retard signalé.
          </Bw504Note>
        ) : null}
      </div>
      <WizardNav next={{ label: "Voir mon récap", onClick: onFinish, icon: ListChecks }} />
      <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
        <Landmark size={14} className="mt-0.5 shrink-0" aria-hidden />
        {TICKETING.shortPayment}
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

function SeasonTag({ day }: { day: string }) {
  if (!day) return null;
  const season = priceSeason(day);
  const tone =
    season === "pointe" || season === "forte"
      ? "bg-[#c95038]/10 text-[#b0412b]"
      : season === "intermediaire"
        ? "bg-[#e0a43a]/15 text-[#8a5d0c]"
        : "bg-primary/10 text-primary";
  return (
    <span className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>
      {seasonLabels[season]}
    </span>
  );
}

function WhenQuestion({
  plan,
  patch,
  onHolidays,
}: {
  plan: CompanionPlan;
  patch: (p: Partial<CompanionPlan>) => void;
  onHolidays: () => void;
}) {
  const today = todayKey();
  // Le même calendrier que « Réserver » : jours avec départs, aller et retour, zones de vacances.
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: departures = [] } = useQuery(upcomingDeparturesQuery());
  const all = useMemo(
    () => buildSailings(departures, routes, ports, companies, vessels),
    [departures, routes, ports, companies, vessels],
  );
  const from = plan.fromPortId ? [plan.fromPortId] : [];
  const to = plan.toPortId ? [plan.toPortId] : [];
  const outDays = useMemo(
    () =>
      new Map(
        daysWithSailings(legSailings(all, from, to), today, 1000).map((d) => [d.day, d.count]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, plan.fromPortId, plan.toPortId, today],
  );
  const backDays = useMemo(
    () =>
      new Map(
        daysWithSailings(
          legSailings(all, to, from, null, null, "dz-eu"),
          plan.date || today,
          1000,
        ).map((d) => [d.day, d.count]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, plan.fromPortId, plan.toPortId, plan.date, today],
  );
  const pairLabel =
    plan.fromPortId && plan.toPortId
      ? `${ports.find((x) => x.id === plan.fromPortId)?.name ?? ""} → ${ports.find((x) => x.id === plan.toPortId)?.name ?? ""}`
      : null;
  const [field, setField] = useState<CalendarField>("out");
  const [holidaysOn, setHolidaysOn] = useState(false);
  const flex = plan.flexDays ?? 0;
  const windowOf = (day: string, days: number) =>
    days
      ? {
          from: addDaysKey(day, -days) < today ? today : addDaysKey(day, -days),
          to: addDaysKey(day, days),
        }
      : null;
  const countdown = Math.round(
    (Date.parse(`${earliestDay(plan)}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000,
  );

  return (
    <Question title="Quand souhaitez-vous partir ?">
      {/* Sur ordinateur, le calendrier garde la taille de celui de « Réserver ». */}
      <div className="md:max-w-[420px]">
        <TripCalendar
          inline
          open
          onOpenChange={() => {}}
          holidaysOn={holidaysOn}
          onHolidaysChange={setHolidaysOn}
          field={field}
          onFieldChange={setField}
          roundTrip
          date={plan.date || null}
          returnDate={plan.returnDate ?? null}
          flexDays={flex}
          outDays={outDays}
          backDays={backDays}
          pairLabel={pairLabel}
          today={today}
          // Rien de choisi : le mois en cours (un mois imposé passerait pour un choix déjà fait).
          // Sinon, la date ou la période annoncée sous le calendrier.
          initialDay={plan.date || plan.window ? earliestDay(plan) : today}
          onChange={(change) => {
            const date = change.date === undefined ? plan.date : (change.date ?? "");
            const days = change.flexDays ?? flex;
            patch({
              date,
              ...(date
                ? { month: date.slice(0, 7), window: windowOf(date, days) }
                : { window: null }),
              ...(change.returnDate !== undefined ? { returnDate: change.returnDate } : {}),
              ...(change.flexDays !== undefined ? { flexDays: change.flexDays } : {}),
              schoolHolidays: false,
            });
          }}
        />
      </div>
      <button
        type="button"
        onClick={() => {
          patch({ schoolHolidays: true });
          window.setTimeout(onHolidays, 120);
        }}
        className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary"
      >
        <School size={15} aria-hidden /> Vacances scolaires hors de France (Belgique, Espagne…)
      </button>
      <p
        className="mt-3 flex items-start gap-2 rounded-xl bg-primary/5 p-3 text-sm"
        aria-live="polite"
      >
        <CalendarDays size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        {!plan.date && !plan.window ? (
          <span>
            Touchez votre jour de départ dans le calendrier, ou passez par vos vacances scolaires :
            le compte à rebours de vos démarches part de cette date.
          </span>
        ) : (
          <span>
            Départ {planWhenLabel(plan)}
            {countdown > 0
              ? countdown > 60
                ? `, dans ${Math.round(countdown / 7)} semaines : le temps de tout préparer sans stress.`
                : countdown > 28
                  ? `, dans ${Math.round(countdown / 7)} semaines : les papiers longs sont à lancer maintenant.`
                  : `, dans ${countdown} jour${countdown > 1 ? "s" : ""} : l'essentiel est à faire tout de suite.`
              : "."}
            {plan.date ? (
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <SeasonTag day={plan.date} />
                {plan.returnDate ? <SeasonTag day={plan.returnDate} /> : null}
              </span>
            ) : null}
          </span>
        )}
      </p>
      <div className="mt-4">
        <Bw504Note title="Pourquoi la date d'abord ?">
          Tout part de là : je compte à rebours tes démarches (un visa demande plusieurs semaines),
          je te montre les départs publiés pour ces jours-là et je te signale la haute saison, quand
          les places et les rendez-vous partent vite.
        </Bw504Note>
      </div>
    </Question>
  );
}

/** Les vacances scolaires : le pays de l'école, la zone, puis les vacances (qui remplissent les dates). */
function HolidaysQuestion({
  plan,
  patch,
  onPicked,
}: {
  plan: CompanionPlan;
  patch: (p: Partial<CompanionPlan>) => void;
  onPicked: () => void;
}) {
  const today = todayKey();
  const horizon = addDaysKey(today, 365);
  const spans = useMemo(
    () => holidaysBetween(plan.holidays, today, horizon),
    [plan.holidays, today, horizon],
  );
  const { calendar, area } = parseHolidayChoice(plan.holidays);
  const countries = useMemo(() => holidayChoiceGroups(), []);
  const setWindow = (from: string, to: string) =>
    patch({
      window: { from, to: to < from ? from : to },
      month: from.slice(0, 7),
      date: "",
    });
  const chip = (on: boolean) =>
    `min-h-10 rounded-full border px-3 text-sm font-semibold transition-colors sm:min-h-11 sm:px-4 ${
      on
        ? "border-primary bg-primary text-primary-foreground"
        : "bg-background hover:border-primary/40"
    }`;
  return (
    <Question
      title="Vos vacances scolaires"
      hint="Le pays de l'école, la zone, puis vos vacances : les dates se remplissent toutes seules."
    >
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
            <ChoiceMenu
              variant="field"
              className="mt-2 sm:max-w-xs"
              label={calendar.areaLabel ?? "Zone"}
              icon={<MapPin size={16} aria-hidden />}
              value={area ?? null}
              all="Je ne sais pas"
              onChange={(zone) =>
                patch({ holidays: zone ? `${calendar.id}:${zone}` : calendar.id })
              }
              options={calendar.areas.map((zone) => ({ value: zone.id, label: zone.name }))}
            />
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
                    onClick={() => {
                      setWindow(from, to);
                      onPicked();
                    }}
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
          Les vacances des autres pays ne sont pas publiées en données ouvertes : revenez à l'écran
          d'avant et indiquez vos dates.
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
      <p className="text-sm font-semibold">Pays</p>
      <ChoiceMenu
        variant="field"
        className="mt-1 sm:max-w-xs"
        label="Pays"
        icon={<Globe2 size={16} aria-hidden />}
        value={plan.country}
        onChange={(code) => (code ? setCountry(code) : undefined)}
        options={RESIDENCE_COUNTRIES.map((country) => ({
          value: country.code,
          label: country.name,
        }))}
      />
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
  const [searched, setSearched] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || q === value?.name) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearched(false);
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
          if (cancelled) return;
          setBusy(false);
          setSearched(true);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, country, value?.name]);
  return (
    <SearchBox
      id="ville-europe"
      label={"Votre ville"}
      value={query}
      onChange={(text) => {
        setQuery(text);
        if (!text.trim()) onPick(null);
      }}
      placeholder={"Par exemple Bruxelles, Alicante, Milan"}
      autoComplete={"address-level2"}
      busy={busy}
      picked={Boolean(query.trim()) && query === value?.name}
      searched={searched}
      hits={results.map((place) => ({
        key: `${place.label}-${place.point.join(",")}`,
        ...splitPlace(place.label, undefined),
        onPick: () => {
          setQuery(place.label);
          setResults([]);
          onPick(place);
        },
      }))}
    />
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

/** Le degré d'urgence d'une action : en retard, bientôt (sous 15 jours ou à lancer), plus tard. */
type Urgency = "late" | "soon" | "later";
function urgencyOf(m: Milestone): Urgency {
  if (m.late) return "late";
  if (m.lead === "after") return "later";
  const soon = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  if (m.tight || m.lead === "now" || m.date <= soon) return "soon";
  return "later";
}

/** La famille d'un moment du calendrier, affichée en étiquette. */
const nodeGroup = (m: Milestone): string =>
  m.id === "book"
    ? "Traversée"
    : m.id === "bags"
      ? "Avant de partir"
      : m.id === "eve" || m.id === "day"
        ? "Le voyage"
        : "Papiers";

/**
 * « À faire » en une seule frise, dans l'ordre des dates : chaque moment porte sa couleur
 * d'urgence, son étiquette (Papiers, Traversée…) et ses actions à cocher sur place.
 */
function PlanTodo({
  plan,
  papers,
  onOpenStep,
}: {
  plan: CompanionPlan;
  papers: PapersState;
  onOpenStep: (step: CompanionStep) => void;
}) {
  const [showDone, setShowDone] = useState(false);
  const { list, todo, done, know } = usePlanTodo(plan, papers);
  const rows = [...todo, ...done];
  const rowsOf = (m: Milestone) => rows.filter((row) => row.m.id === m.id);
  const nodes = list.filter((m) => m.tone !== "warning");
  const nodeDone = (m: Milestone) => {
    const mine = rowsOf(m);
    return mine.length ? mine.every((row) => row.done) : Boolean(m.done);
  };
  const finished = nodes.filter(nodeDone);
  const shown = showDone ? nodes : nodes.filter((m) => !nodeDone(m));
  const toggle = (row: TodoRow) =>
    papers.setDone((current) =>
      row.done
        ? current.filter((id) => !row.ids.includes(id))
        : [...new Set([...current, ...row.ids])],
    );
  return (
    <section aria-labelledby="a-faire" className="mt-4 rounded-2xl border bg-card p-3.5 md:p-5">
      <h2 id="a-faire" className="flex items-center gap-2 font-display text-lg font-bold">
        <ListChecks size={19} className="text-primary" aria-hidden /> À faire
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{todoSummary(todo, plan)}</p>
      <p className="bw-todo-legend" aria-hidden>
        <span data-urgency="late">Urgent</span>
        <span data-urgency="soon">Bientôt</span>
        <span data-urgency="later">Plus tard</span>
      </p>
      <ol className="bw-todo-line">
        {shown.map((m) => {
          const mine = rowsOf(m);
          const isDone = nodeDone(m);
          const urgency = isDone ? "done" : urgencyOf(m);
          return (
            <li key={m.id} data-urgency={urgency}>
              <span className="bw-todo-line__dot" aria-hidden>
                {isDone ? <Check size={11} strokeWidth={3} /> : null}
              </span>
              <p className="bw-todo-line__lead">
                {milestoneLead(m, plan)}
                {isDone ? " · fait" : ""}
                <span className="bw-todo-line__tag">{nodeGroup(m)}</span>
              </p>
              <p className="bw-todo-line__title">{m.title}</p>
              {mine.length === 1 && mine[0]!.step ? (
                <>
                  <p className="mt-0.5 text-sm text-muted-foreground">{m.detail}</p>
                  {mine[0]!.done ? null : (
                    <button
                      type="button"
                      onClick={() => onOpenStep(mine[0]!.step!)}
                      className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
                    >
                      {mine[0]!.step === "papers"
                        ? "Faire ma liste de papiers"
                        : "Réserver ma traversée"}
                      <ArrowRight size={15} aria-hidden />
                    </button>
                  )}
                </>
              ) : mine.length ? (
                <ul className="bw-todo-rows">
                  {mine.map((row) => (
                    <TodoItem
                      key={row.key}
                      row={row}
                      plan={plan}
                      onToggle={toggle}
                      onOpenStep={onOpenStep}
                      inLine
                    />
                  ))}
                </ul>
              ) : (
                <p className="mt-0.5 text-sm text-muted-foreground">{m.detail}</p>
              )}
            </li>
          );
        })}
      </ol>
      {finished.length ? (
        <button
          type="button"
          onClick={() => setShowDone(!showDone)}
          aria-expanded={showDone}
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground"
        >
          {showDone ? "Masquer ce qui est fait" : `Voir ce qui est fait (${finished.length})`}
          <ChevronDown
            size={15}
            aria-hidden
            className={`transition-transform ${showDone ? "rotate-180" : ""}`}
          />
        </button>
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
  inLine = false,
}: {
  row: TodoRow;
  plan: CompanionPlan;
  onToggle: (row: TodoRow) => void;
  onOpenStep: (step: CompanionStep) => void;
  /** Dans la frise : la date est déjà dite par le moment, on ne la répète pas. */
  inLine?: boolean;
}) {
  const [why, setWhy] = useState(false);
  const { m } = row;
  const urgency = urgencyOf(m);
  const tone = row.done
    ? "text-muted-foreground"
    : urgency === "late"
      ? "text-[#c95038]"
      : urgency === "soon"
        ? "text-[#b7791f]"
        : "text-primary";
  return (
    <li
      className={
        inLine ? "bw-todo-row" : "bw-todo-item rounded-xl border bg-background px-2.5 py-2"
      }
      data-urgency={row.done ? undefined : urgency}
    >
      <div className="flex items-start gap-2.5">
        {row.step ? (
          <span
            className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
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
            className={`mt-px grid size-5 shrink-0 place-items-center rounded-[5px] border-2 transition-colors ${
              row.done
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/50 bg-background"
            }`}
          >
            {row.done ? <Check size={12} aria-hidden /> : null}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{row.title}</p>
          {row.who.length ? (
            <p className="text-xs text-muted-foreground">{row.who.join(", ")}</p>
          ) : null}
          {inLine && !row.done ? null : (
            <p className={`text-xs font-bold ${tone}`}>
              {row.done ? "Fait" : milestoneLead(m, plan)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setWhy(!why)}
          aria-expanded={why}
          aria-label="Pourquoi cette date ?"
          className="-my-1 -mr-1 grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Info size={15} aria-hidden />
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

/**
 * La fin du parcours : le récap global, celui promis au démarrage (même présentation), rempli.
 * Chaque ligne rouvre son étape ; les chiffres des papiers mènent au détail ; puis les rappels.
 */
function ReadyDashboard({
  plan,
  papers,
  papersFees,
  onExtras,
  ticket,
  rows,
  fromChoice,
  toPort,
  onOpenStep,
  onBook,
  onShare,
  todo: todoBlock,
}: {
  plan: CompanionPlan;
  papers: PapersState;
  papersFees: PapersFees | null;
  onExtras: (extras: NonNullable<CompanionPlan["extras"]>) => void;
  /** Billet coché, ou traversée déjà suivie dans « Mon voyage ». */
  ticket: boolean;
  rows: PreviewRow[];
  fromChoice: PortChoice | null;
  toPort: Port | null;
  onOpenStep: (step: CompanionStep) => void;
  onBook: () => void;
  onShare: () => void;
  /** « À faire » : juste sous le récap sur téléphone, en colonne à droite sur grand écran. */
  todo: ReactNode;
}) {
  const tasks = useMemo(() => tasksFor(papers.answers), [papers.answers]);
  // Ce que le récap ne peut pas encore dire (route sans ports, donc ni budget ni billet).
  const missing = rows.filter(
    (row): row is PreviewRow & { onClick: () => void } => row.value === null && !!row.onClick,
  );
  const deadlines = useMemo(
    () =>
      papersDeadlines(
        earliestDay(plan),
        papers.answers.travellers.some((t) => t.nat === "etr"),
        todayKey(),
      ),
    [plan, papers.answers.travellers],
  );
  // Les papiers : seulement ce qui se coche (même décompte que la liste), voiture comprise.
  const checkable = tasks.filter((t) => isCheckable(planCategory(t)));
  const withCar = plan.vehicle !== "none";
  const papersTotal = checkable.length + (withCar ? carItems.length : 0);
  const papersReady =
    checkable.filter((t) => papers.done.includes(t.id)).length +
    (withCar ? carItems.filter((item) => plan.carDone.includes(item.id)).length : 0);
  const group = people(papers.answers);
  const vehicle = VEHICLES.find((v) => v.id === plan.vehicle);
  const duration =
    fromChoice?.lines.find((l) => l.to.id === toPort?.id)?.route.typical_duration_minutes ?? null;
  const budget =
    fromChoice && toPort ? tripBudget(plan, fromChoice, toPort, group, papersFees) : null;
  const daysLeft = planHasWhen(plan)
    ? Math.round(
        (Date.parse(`${earliestDay(plan)}T12:00:00`) - Date.parse(`${todayKey()}T12:00:00`)) /
          86_400_000,
      )
    : null;
  const glance: GlanceTile[] = [
    {
      key: "profile",
      label: "Départ",
      icon: CalendarDays,
      value: planHasWhen(plan) ? shortDate(planDay(plan)) : "Date à choisir",
      detail: [
        [plural(group.adults, "adulte"), group.children ? plural(group.children, "enfant") : null]
          .filter(Boolean)
          .join(", "),
        plan.vehicle === "none" ? "sans voiture" : vehicle?.label.toLowerCase(),
      ]
        .filter(Boolean)
        .join(" · "),
      status: planHasWhen(plan) ? "ok" : "todo",
      onClick: () => onOpenStep("profile"),
    },
    {
      key: "papers",
      label: "Papiers",
      icon: FileText,
      value: papersTotal ? `${papersReady}/${papersTotal}` : "Rien à prévoir",
      detail: papersTotal
        ? `papiers prêts${withCar ? ", voiture comprise" : ""}`
        : "aucun papier à cocher",
      status: !papers.finished ? "missing" : papersReady >= papersTotal ? "ok" : "todo",
      ...(papersTotal ? { progress: papersReady / papersTotal } : {}),
      onClick: () => onOpenStep("papers"),
    },
    {
      key: "route",
      label: "Route",
      icon: RouteIcon,
      value: fromChoice && toPort ? `${fromChoice.port.name} → ${toPort.name}` : "Ports à choisir",
      detail: duration ? `${formatDuration(duration)} de traversée` : "le trajet de porte à porte",
      status: fromChoice && toPort ? "ok" : "missing",
      onClick: () => onOpenStep("route"),
    },
    {
      key: "budget",
      label: "Budget",
      icon: Wallet,
      value: budget
        ? `≈ ${(Math.round(budget.total / 100) * 100).toLocaleString("fr-FR")} €`
        : "À calculer",
      detail: budget
        ? budget.back
          ? "aller et retour, tout compris"
          : "l'aller, tout compris"
        : "il faut vos ports",
      status: budget ? "ok" : "missing",
      onClick: () => onOpenStep("budget"),
    },
    {
      key: "book",
      label: "Billet",
      icon: Ticket,
      value: ticket ? "Pris" : "À prendre",
      detail: ticket ? "suivi dans Mon voyage" : "réservez dès que possible",
      status: ticket ? "ok" : "todo",
      onClick: ticket && !plan.ticket ? openMyVoyage : () => onOpenStep("book"),
    },
  ];
  const named = papers.answers.travellers.filter((t) => t.name?.trim()).map((t) => t.name!.trim());
  const title = named.length
    ? `Le voyage de ${named.length > 1 ? `${named.slice(0, -1).join(", ")} et ${named.at(-1)}` : named[0]}`
    : "Votre voyage au bled";
  return (
    <section id="pret" aria-labelledby="pret-titre" className="bw-ready bw-readygrid mt-4">
      <h2 id="pret-titre" className="sr-only">
        Votre récap est prêt
      </h2>
      <div className="bw-readygrid__main">
      {/* Le récap en un coup d'œil : chaque tuile dit son état et rouvre son étape. */}
      <TripGlance
        title={title}
        when={capitalize(planWhenLabel(plan))}
        daysLeft={daysLeft}
        line={fromChoice && toPort ? `${fromChoice.port.name} → ${toPort.name}` : null}
        tiles={glance}
      />
      <TripLink
        className="mt-3"
        fromPortId={fromChoice?.port.id ?? null}
        toPortId={toPort?.id ?? null}
      />
      {missing.length ? (
        <Bw504Note
          tone="stuck"
          className="mt-3"
          title={`Il manque encore : ${missing.map((row) => row.label.toLowerCase()).join(", ")}`}
          actions={
            <>
              <Bw504Button primary onClick={missing[0]!.onClick}>
                Compléter : {missing[0]!.label.toLowerCase()}
              </Bw504Button>
              <Bw504Button onClick={onShare}>Partager quand même</Bw504Button>
            </>
          }
        >
          Ton récap est presque prêt. Choisis tes ports et je calcule la route, le budget et les
          traversées de ta période.
        </Bw504Note>
      ) : (
        <Bw504Note
          tone="win"
          className="mt-3"
          title="Ton récap est prêt"
          actions={
            <Bw504Button primary onClick={onShare}>
              Partager · PDF
            </Bw504Button>
          }
        >
          Envoie-le à la famille ou imprime-le. Touche une ligne du récap pour la revoir.
        </Bw504Note>
      )}
      </div>
      <div className="bw-readygrid__todo">{todoBlock}</div>
      <div className="bw-readygrid__more">
      <div className="mt-3">
        <TripBudget
          plan={plan}
          fromChoice={fromChoice}
          toPort={toPort}
          people={people(papers.answers)}
          papers={papersFees}
          onExtras={onExtras}
          onDetail={() => onOpenStep("budget")}
        />
      </div>
      <div className="mt-3">
        <SailingsOutlook
          plan={plan}
          fromName={fromChoice?.port.name ?? null}
          toName={toPort?.name ?? null}
          onSee={onBook}
        />
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
        Mon voyage », étape par étape.
      </p>
      <a
        href="/"
        className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
      >
        <MapIcon size={16} aria-hidden /> Suivre en direct
      </a>
      </div>
    </section>
  );
}

/**
 * Les outils de la préparation, en haut, toujours au même endroit : partager (lien ou PDF) et
 * tout recommencer. Effacer demande une confirmation sur place ; le compte et les billets restent.
 */
function PrepTools({ canShare, onReset }: { canShare: boolean; onReset: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <div className="bw-prep-tools">
        {canShare ? <SharePreparation compact /> : null}
        <button
          type="button"
          onClick={() => setAsking(!asking)}
          aria-expanded={asking}
          className="bw-prep-tools__reset"
        >
          <RotateCcw size={14} aria-hidden /> Recommencer
        </button>
      </div>
      {asking ? (
        <div role="alertdialog" aria-labelledby="reset-titre" className="bw-prep-reset">
          <p id="reset-titre" className="font-bold">
            Tout recommencer ?
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Les dates, les voyageurs, les papiers, les ports et ce qui est coché seront effacés de
            cet appareil. Votre compte et vos billets ne changent pas.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setAsking(false);
                onReset();
              }}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-destructive px-4 text-sm font-bold text-destructive-foreground hover:bg-destructive/90"
            >
              <RotateCcw size={15} aria-hidden /> Oui, tout effacer
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="inline-flex min-h-10 items-center rounded-xl bg-secondary px-4 text-sm font-bold hover:bg-secondary/80"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Sans compte : on voit ce qui attend (les étapes suivantes), et on crée un compte gratuit pour
 * continuer. Ce qui a déjà été répondu reste sur le téléphone et se retrouve au retour.
 */
function SignupGate({ steps, profileDone }: { steps: CompanionStep[]; profileDone: boolean }) {
  // Après la connexion : droit sur l'étape suivante, pas sur le tableau.
  const next = encodeURIComponent(profileDone ? `${PATH}?etape=papers` : PATH);
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
      {profileDone ? (
        <Bw504Note className="mt-2" title="Ton départ est noté, on continue ?">
          Avec un compte gratuit : tes papiers, ta route, ton budget, et mes rappels. Tes réponses
          restent sur ce téléphone.
        </Bw504Note>
      ) : null}
      {profileDone ? null : (
        <p className="mt-1 text-sm text-muted-foreground">
          Commencez par la première étape sans compte. Pour la suite, il faut un compte gratuit ;
          vos réponses restent sur cet appareil.
        </p>
      )}
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
