import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Calculator,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  ExternalLink,
  Info,
  Landmark,
  Lock,
  Map as MapIcon,
  MapPin,
  Navigation,
  PartyPopper,
  RotateCcw,
  School,
  Search,
  Ship,
  TrendingUp,
  Users,
  Wallet,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { CabasImg } from "@/components/CabasImg";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { useAuth } from "@/hooks/useAuth";
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
import { papersMargin, papersWhy, retroPlan, type Milestone } from "@/lib/ferry/retroPlan";
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

/** Les visuels des étapes : les pictos BledWay (remplaçables dans l'admin), sinon une icône. */
const stepArt: Record<
  CompanionStep,
  {
    src?: string;
    icon?: LucideIcon;
    short: string;
    benefit: string;
    tint: string;
    /** La scène illustrée (série « Retour au bled ») en tête de l'étape. */
    scene: string;
    sceneAlt: string;
  }
> = {
  profile: {
    src: "/cabas/pictos/yallah.webp",
    short: "Départ",
    benefit: "Qui part, avec quelle voiture, et quand.",
    tint: "bg-[#fdf0d8]",
    scene: "/illustrations/voyage/depart-a-laube.webp",
    sceneAlt: "La famille charge la voiture au petit matin",
  },
  papers: {
    src: "/cabas/pictos/controle.webp",
    short: "Papiers",
    benefit:
      "Visa, passeports, enfants : la liste de chacun, et votre consulat, en France ou ailleurs en Europe.",
    tint: "bg-[#e5f2ea]",
    scene: "/illustrations/voyage/billets-au-port.webp",
    sceneAlt: "Au guichet du port, la famille présente ses papiers",
  },
  car: {
    src: "/cabas/persos/voiture_504.webp",
    short: "Voiture",
    benefit: "Carte grise, assurance, TPD : rien d'oublié pour la douane.",
    tint: "bg-[#e6eff7]",
    scene: "/illustrations/voyage/dernier-sac.webp",
    sceneAlt: "Le dernier sac entre dans le coffre de la 504",
  },
  route: {
    src: "/cabas/pictos/route_longue.webp",
    short: "Route",
    benefit: "Le port le plus proche, et le trajet de porte à porte.",
    tint: "bg-[#fde9e4]",
    scene: "/illustrations/voyage/route-du-soleil.webp",
    sceneAlt: "Pique-nique sur une aire de l'A7, direction Marseille",
  },
  budget: {
    icon: Wallet,
    short: "Budget",
    benefit: "Le prix de la traversée selon la saison, avant de réserver.",
    tint: "bg-[#fff3cf]",
    scene: "/illustrations/voyage/station-essence.webp",
    sceneAlt: "Le plein avant la route du port",
  },
  book: {
    src: "/cabas/pictos/file.webp",
    short: "Réserver",
    benefit: "Les traversées de votre date, prêtes à comparer.",
    tint: "bg-[#efe9fb]",
    scene: "/illustrations/voyage/cote-en-vue.webp",
    sceneAlt: "Sur le pont du ferry, la côte algérienne en vue",
  },
};

function StepArt({
  step,
  size = "md",
  done = false,
}: {
  step: CompanionStep;
  size?: "sm" | "md";
  done?: boolean;
}) {
  const art = stepArt[step];
  const Icon = art.icon;
  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-2xl ${size === "sm" ? "size-11 md:size-12" : "size-14"} ${art.tint}`}
      aria-hidden
    >
      {art.src ? (
        <CabasImg
          src={art.src}
          className="size-[80%] object-contain drop-shadow-sm"
          loading="lazy"
          decoding="async"
        />
      ) : Icon ? (
        <Icon className="size-1/2 text-[#b7791f]" strokeWidth={2.2} />
      ) : null}
      {done ? (
        <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
          <Check size={12} strokeWidth={3} />
        </span>
      ) : null}
    </span>
  );
}

/** L'accueil : ce que l'outil apporte, pour qui, et un seul bouton pour commencer. */
function Welcome({ onStart }: { onStart: () => void }) {
  const benefits: CompanionStep[] = ["papers", "car", "route", "budget", "book"];
  const start = (
    <button
      type="button"
      onClick={onStart}
      className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-base font-bold text-primary-foreground shadow-md hover:bg-primary/90 sm:w-auto"
    >
      Je prépare mon voyage en Algérie <ArrowRight size={18} aria-hidden />
    </button>
  );
  return (
    <div>
      <section className="overflow-hidden rounded-3xl bg-gradient-to-b from-[#e3f0f6] via-[#f1f6f2] to-[#fbf5ea]">
        <div className="grid items-center gap-2 px-5 pt-6 md:grid-cols-[1.1fr_1fr] md:gap-6 md:px-10 md:py-10">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Gratuit · aperçu sans compte
            </p>
            <h1 className="mt-2 font-display text-[1.75rem] font-bold leading-tight md:text-5xl">
              Votre voyage au bled, préparé étape par étape
            </h1>
            <p className="mt-3 text-muted-foreground md:text-lg">
              Quand partir, papiers, voiture, route, budget, traversée : BledWay vous guide de chez
              vous jusqu'au port, sans rien oublier. Depuis la France ou ailleurs en Europe.
            </p>
            <div className="mt-5 hidden md:block">{start}</div>
          </div>
          <img
            src="/illustrations/voyage/depart-a-laube.webp"
            alt="Au petit matin, la famille charge la voiture pour le voyage au bled"
            width={960}
            height={640}
            fetchPriority="high"
            className="mb-5 aspect-[3/2] w-full rounded-2xl object-cover shadow-md md:mb-0"
          />
        </div>
      </section>

      <div className="mt-4 md:hidden">{start}</div>
      <p className="mt-3 text-center text-sm text-muted-foreground md:text-left">
        Environ 5 minutes · vos réponses restent sur votre téléphone · reprenez quand vous voulez
      </p>
      <p className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm md:justify-start">
        <span className="text-muted-foreground">Bientôt :</span>
        <span className="rounded-full border px-3 py-1 text-muted-foreground">Tunisie</span>
        <span className="rounded-full border px-3 py-1 text-muted-foreground">Maroc</span>
      </p>

      <h2 className="mt-8 font-display text-xl font-bold md:text-2xl">
        Ce que vous allez préparer
      </h2>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        <li className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-2 pr-3">
          <span
            className="grid h-20 w-28 shrink-0 place-items-center rounded-xl bg-[#fff6e3]"
            aria-hidden
          >
            <CalendarDays size={34} className="text-[#b7791f]" />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">Mon calendrier</span>
            <span className="block text-sm text-muted-foreground">
              Votre période de départ, vacances scolaires comprises : ce qu'il faut lancer, et avant
              quelle date.
            </span>
          </span>
        </li>
        {benefits.map((step) => (
          <li key={step} className="flex items-center gap-3 rounded-2xl border bg-card p-2 pr-3">
            <span className="relative shrink-0">
              <img
                src={stepArt[step].scene}
                alt=""
                width={960}
                height={640}
                loading="lazy"
                decoding="async"
                className="h-20 w-28 rounded-xl object-cover"
              />
              <span className="absolute -bottom-1 -right-1 scale-75">
                <StepArt step={step} size="sm" />
              </span>
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{stepTitles[step]}</span>
              <span className="block text-sm text-muted-foreground">{stepArt[step].benefit}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-muted-foreground">
        Chaque règle cite sa source officielle. BledWay ne vend pas de billets : la réservation se
        fait auprès de la compagnie ou du distributeur indiqué.
      </p>
      <div className="mt-5">{start}</div>
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
              {/* La vue d'ensemble : toutes les étapes, illustrées, toujours visibles. */}
              <nav aria-label="Les étapes du voyage" className="mt-3">
                <ol
                  className="grid gap-1"
                  style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
                >
                  {steps.map((step) => {
                    const current = open === step;
                    return (
                      <li key={step}>
                        <button
                          type="button"
                          onClick={() => openStep(step)}
                          aria-current={current ? "step" : undefined}
                          className={`flex w-full flex-col items-center gap-1 rounded-xl px-0.5 py-1.5 transition-colors ${current ? "bg-primary/10" : "hover:bg-secondary"}`}
                        >
                          <StepArt step={step} size="sm" done={plan.done.includes(step)} />
                          <span
                            className={`w-full truncate text-center text-[11px] font-semibold md:text-xs ${current ? "text-primary" : "text-muted-foreground"}`}
                          >
                            {stepArt[step].short}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${(doneCount / steps.length) * 100}%` }}
                  />
                </div>
              </nav>

              {/* Le calendrier à rebours, dès que la période est connue. */}
              {plan.done.includes("profile") ? <TripCalendar plan={plan} papers={papers} /> : null}

              <ol className="mt-4 grid grid-cols-1 gap-3 md:mt-6">
                {steps.map((step, index) =>
                  isLocked(step) ? null : (
                    <StepCard
                      key={step}
                      id={step}
                      index={index + 1}
                      title={stepTitles[step]}
                      summary={summaries[step]}
                      done={plan.done.includes(step)}
                      open={open === step && !isLocked(step)}
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
                          plan={plan}
                          patch={patch}
                          onDone={() => complete("papers")}
                          next={plan.vehicle === "none" ? "ma route" : "ma voiture"}
                        />
                      ) : null}
                      {step === "car" ? (
                        <CarStep plan={plan} patch={patch} onDone={() => complete("car")} />
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
                            const done = plan.done.includes("book")
                              ? plan.done
                              : [...plan.done, "book" as const];
                            savePlan({ ...plan, done });
                            // Ports, jour et voyageurs dans l'adresse : la carte ouvre directement les résultats.
                            window.scrollTo({ top: 0, behavior: "instant" });
                            void navigate({ href: bookingSearch(plan) });
                          }}
                        />
                      ) : null}
                    </StepCard>
                  ),
                )}
              </ol>

              {locked && !authLoading ? (
                <SignupGate
                  steps={steps.filter((step) => step !== "profile")}
                  profileDone={plan.done.includes("profile")}
                />
              ) : null}

              {allDone && !locked ? (
                <div id="pret" className="mt-6 rounded-2xl bg-primary/5 p-5 md:p-6">
                  <img
                    src="/illustrations/voyage/retrouvailles.webp"
                    alt="Les retrouvailles avec la famille, au bled"
                    width={960}
                    height={540}
                    loading="lazy"
                    className="mb-4 aspect-[16/9] w-full rounded-xl object-cover"
                  />
                  <p className="flex items-center gap-2 font-display text-xl font-bold">
                    <PartyPopper size={22} className="text-primary" aria-hidden /> Votre voyage est
                    prêt
                  </p>
                  <p className="mt-2 text-muted-foreground">
                    Gardez cette page : votre calendrier, vos papiers et vos choix y restent. Une
                    fois le billet enregistré, la suite (48 h avant, au port, à l'arrivée) continue
                    dans « Mon voyage », avec ce que vous avez déjà coché ici.
                  </p>
                  <a
                    href="/"
                    className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                  >
                    <MapIcon size={16} aria-hidden /> Suivre en direct
                  </a>
                </div>
              ) : null}
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
    const months3 = new Date(Date.parse(`${day}T12:00:00Z`) - 90 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const out: Partial<Record<When, { label: string; why: string }>> = {
      first: { label: "Dès maintenant", why: papersWhy("first", day, visa) },
      weeks: {
        label: weeks < today ? "En retard : tout de suite" : `Avant le ${longDate(weeks)}`,
        why: papersWhy("weeks", day, visa),
      },
      months3: {
        label: months3 <= today ? "Dès maintenant" : `À partir du ${longDate(months3)}`,
        why: papersWhy("months3", day, visa),
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

      <h3 className="mt-6 font-display text-lg font-bold">
        {plan.home ? "Les ports les plus proches de chez vous" : "Votre port de départ"}
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
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:border-primary/40"
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
        {plan.destination ? ", votre arrivée" : ""} et votre mois déjà remplis : temps de route,
        péages et traversées comparés.
      </p>
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
  const spans = useMemo(
    () => holidaysBetween(plan.holidays, today, horizon),
    [plan.holidays, today, horizon],
  );
  const { calendar } = parseHolidayChoice(plan.holidays);
  const countdown = Math.round(
    (Date.parse(`${earliestDay(plan)}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000,
  );
  const setWindow = (from: string, to: string) =>
    patch({
      window: { from, to: to < from ? from : to },
      month: from.slice(0, 7),
      date: "",
    });

  return (
    <Question
      title="Quand souhaitez-vous partir ?"
      hint="Une période suffit : vacances scolaires, un mois ou des dates. On en déduit ce qu'il faut lancer, et avant quand."
    >
      {/* Les vacances scolaires : France d'abord, et les autres pays d'Europe. */}
      <div className="rounded-2xl bg-[#fff6e3] p-3 md:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-bold">
            <School size={16} className="text-[#b7791f]" aria-hidden /> Vacances scolaires
          </p>
          <select
            value={plan.holidays}
            onChange={(event) => patch({ holidays: event.target.value })}
            aria-label="Calendrier des vacances scolaires"
            className="min-h-10 w-full max-w-full rounded-lg border bg-background px-2 text-sm sm:w-auto sm:max-w-xs"
          >
            {holidayChoiceGroups().map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value="none">Autre pays : pas de calendrier</option>
          </select>
        </div>
        {spans.length ? (
          <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
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
                  className={`flex shrink-0 flex-col items-start rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
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
                    {shortDate(span.start)} → {span.end ? shortDate(span.end) : "fin à venir"}
                    {span.varies ? " · selon la zone" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {calendar
              ? "Pas de vacances publiées sur les 12 prochains mois pour ce calendrier."
              : "Espagne, Italie, Royaume-Uni et autres pays : leurs vacances scolaires ne sont pas publiées en données ouvertes. Choisissez un mois ou des dates."}
          </p>
        )}
        {calendar ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
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

      <p className="mt-5 text-sm font-semibold">Ou un mois</p>
      <div
        role="radiogroup"
        aria-label="Mois de départ"
        className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4"
      >
        {months.map((m) => {
          const on = !plan.window && !plan.date && plan.month === m.key;
          const holidays = monthHasHolidays(plan.holidays, m.key);
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
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="size-2 rounded-full bg-[#e0a43a]" aria-hidden /> vacances scolaires ·
        saison des prix des traversées
      </p>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold">Ou des dates précises</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-md">
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
      </fieldset>

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
    return m.late ? "En retard : tout de suite" : `Avant le ${longDate(m.date)}`;
  if (m.lead === "from") return `À partir du ${longDate(m.date)}`;
  return `Le ${longDate(m.date)}`;
}

function TripCalendar({ plan, papers }: { plan: CompanionPlan; papers: PapersState }) {
  const [all, setAll] = useState(false);
  const list = useMemo(
    () =>
      retroPlan(plan, { answers: papers.answers, finished: papers.finished, done: papers.done }),
    [plan, papers.answers, papers.finished, papers.done],
  );
  const next = Math.max(
    0,
    list.findIndex((m) => !m.done),
  );
  const shown = all ? list : list.slice(next, next + 2);
  return (
    <section
      aria-labelledby="mon-calendrier"
      className="mt-4 rounded-2xl border bg-card p-4 md:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="mon-calendrier" className="flex items-center gap-2 font-display text-lg font-bold">
          <CalendarDays size={18} className="text-primary" aria-hidden /> Mon calendrier
        </h2>
        <span className="text-sm text-muted-foreground">Départ {planWhenLabel(plan)}</span>
      </div>
      <ol className="mt-3 grid gap-4 border-l-2 border-primary/20 pl-4">
        {shown.map((m) => (
          <li key={m.id} className="relative">
            <span
              className={`absolute -left-[23px] top-0.5 grid size-3.5 place-items-center rounded-full ring-4 ring-card ${
                m.done
                  ? "bg-primary"
                  : m.late
                    ? "bg-[#c95038]"
                    : m.tone === "warning"
                      ? "bg-[#e0a43a]"
                      : "bg-primary/40"
              }`}
              aria-hidden
            />
            <p
              className={`text-[11px] font-bold uppercase tracking-wider ${m.late ? "text-[#c95038]" : m.tone === "warning" ? "text-[#b7791f]" : "text-primary"}`}
            >
              {milestoneLead(m, plan)}
              {m.done ? " · fait" : ""}
            </p>
            <p className={`font-semibold ${m.done ? "text-muted-foreground line-through" : ""}`}>
              {m.title}
            </p>
            {m.tasks.length ? (
              <ul className="mt-1 grid gap-0.5 text-sm">
                {m.tasks.slice(0, 4).map((task) => {
                  const done = papers.done.includes(task.id);
                  return (
                    <li key={task.id} className="flex items-start gap-1.5">
                      {done ? (
                        <Check
                          size={14}
                          className="mt-0.5 shrink-0 text-primary"
                          aria-label="fait"
                        />
                      ) : (
                        <span
                          className="mt-[7px] size-1.5 shrink-0 rounded-full bg-muted-foreground"
                          aria-hidden
                        />
                      )}
                      <span className={done ? "text-muted-foreground line-through" : ""}>
                        {task.title}
                      </span>
                    </li>
                  );
                })}
                {m.tasks.length > 4 ? (
                  <li className="text-muted-foreground">
                    et {m.tasks.length - 4} autre{m.tasks.length > 5 ? "s" : ""}
                  </li>
                ) : null}
              </ul>
            ) : null}
            <p className="mt-1 text-sm text-muted-foreground">{m.detail}</p>
            {m.sources?.length ? (
              <p className="mt-1 text-xs">
                Source :{" "}
                {m.sources.map((id, index) => (
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
            ) : null}
          </li>
        ))}
      </ol>
      {list.length > shown.length || all ? (
        <button
          type="button"
          onClick={() => setAll(!all)}
          aria-expanded={all}
          className="mt-3 text-sm font-semibold text-primary underline underline-offset-4"
        >
          {all ? "Réduire le calendrier" : `Voir tout le calendrier (${list.length} étapes)`}
        </button>
      ) : null}
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
