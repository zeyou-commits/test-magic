import {
  BINATIONAL_MEASURE_END,
  tasksFor,
  paperKind,
  type Answers,
  type FormaliteSourceId,
  type When,
} from "@/content/formalites";
import { earliestDay, type CompanionPlan } from "./companion";
import { tr } from "@/lib/i18n/translate";
import { lazyDateFormat } from "@/lib/i18n";

/**
 * Le calendrier à rebours du voyage : à partir du jour de départ le plus tôt, ce qu'il faut lancer
 * et avant quand. Les dates limites ne reprennent que les délais publiés (sources des papiers) ;
 * le reste est un repère de bon sens, présenté comme tel.
 */

export type Milestone = {
  id: string;
  /** AAAA-MM-JJ */
  date: string;
  /** « Dès maintenant », « Avant le… », « À partir du… », « Le… », « Ensuite » (sans date). */
  lead: "now" | "before" | "from" | "on" | "after";
  title: string;
  /** Pourquoi cette date, en une ligne. */
  detail: string;
  /** Le détail, à ouvrir (« Pourquoi cette date ? »). */
  more?: string;
  /** Les papiers de ce moment, regroupés (les visas en une ligne), avec qui est concerné. */
  tasks: MilestoneTask[];
  /** Le délai officiel ne tient plus : à faire aujourd'hui. */
  late?: boolean;
  /** La marge conseillée par BledWay est passée, le délai officiel tient encore. */
  tight?: boolean;
  done?: boolean;
  tone?: "warning";
  sources?: FormaliteSourceId[];
};

export type MilestoneTask = {
  /** Clé d'affichage. */
  id: string;
  /** Les lignes de « Mes papiers » regroupées ici : faite quand toutes le sont. */
  ids: string[];
  title: string;
  who: string[];
};

const addDays = (day: string, n: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
};
const later = (a: string, b: string) => (a > b ? a : b);

/**
 * La marge des démarches longues. Le seul délai publié est celui du visa (1 à 14 jours après le
 * dépôt, ambassade) ; s'y ajoute l'attente d'un rendez-vous, qui n'est publiée nulle part.
 * Repère BledWay : 4 semaines, 6 pour un départ en été (juin à août) ou aux fêtes de fin d'année,
 * quand beaucoup de voyageurs font leurs démarches en même temps.
 */
export function papersMargin(day: string) {
  const month = Number(day.slice(5, 7));
  const highSeason = (month >= 6 && month <= 8) || month === 12;
  return { days: highSeason ? 42 : 28, weeks: highSeason ? 6 : 4, highSeason };
}

/** Pourquoi cette date, en une ligne (short) et en détail (more). */
export function papersWhy(when: When, day: string, visa: boolean): { short: string; more: string } {
  const { weeks, highSeason } = papersMargin(day);
  const margin = highSeason
    ? tr("ui.libFerryRetroPlan.bledwayConseilleSemainesDeMarge", { weeks })
    : tr("ui.libFerryRetroPlan.bledwayConseilleSemainesDeMarge2", { weeks });
  if (when === "first")
    return {
      short: tr("ui.libFerryRetroPlan.aucunDelaiNEstPublie"),
      more: tr("ui.libFerryRetroPlan.unPasseportAlgerienEstFabrique"),
    };
  if (when === "months3")
    return {
      short: tr("ui.libFerryRetroPlan.cePapierNeVautQue"),
      more: tr("ui.libFerryRetroPlan.faitPlusTotIlNe"),
    };
  if (when === "lastweek")
    return {
      short: tr("ui.libFerryRetroPlan.quelquesMinutesEnLigneUne"),
      more: "",
    };
  if (when !== "weeks") return { short: "", more: "" };
  return visa
    ? {
        short: tr("ui.libFerryRetroPlan.unVisaPrendJusquA"),
        more: tr("ui.libFerryRetroPlan.delaiAnnonceParLAmbassade", { margin }),
      }
    : {
        short: tr("ui.libFerryRetroPlan.aucunDelaiNEstPublie2"),
        more: tr("ui.libFerryRetroPlan.cEstUnConseilDe", { margin }),
      };
}

/** En dessous, même le délai publié d'un visa (14 jours) et un rendez-vous ne tiennent plus. */
export const PAPERS_LAST_DAYS = 21;

const deadlineDate = (key: string) =>
  lazyDateFormat({ weekday: "long", day: "numeric", month: "long" })
    .format(new Date(`${key}T12:00:00`))
    .replace(/ 1 /, " 1er ");

/**
 * Les échéances de « Mes papiers », tirées du premier jour de départ possible, avec leur raison.
 * Partagées par le guide et la page de préparation partagée.
 */
export function papersDeadlines(
  day: string,
  visa: boolean,
  today = new Date().toISOString().slice(0, 10),
): Partial<Record<When, { label: string; why: string }>> {
  const minus = (n: number) =>
    new Date(Date.parse(`${day}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const weeks = minus(papersMargin(day).days);
  const months3 = minus(90);
  const lastweek = minus(7);
  return {
    first: { label: tr("ui.libFerryRetroPlan.desMaintenant"), why: papersWhy("first", day, visa).short },
    weeks: {
      label:
        minus(PAPERS_LAST_DAYS) < today
          ? tr("ui.libFerryRetroPlan.aujourdHuiDelaiTresCourt")
          : weeks < today
            ? tr("ui.libFerryRetroPlan.cetteSemaineMargeReduite")
            : tr("ui.libFerryRetroPlan.avantLe", { deadlineDate: deadlineDate(weeks) }),
      why: papersWhy("weeks", day, visa).short,
    },
    months3: {
      label: months3 <= today ? tr("ui.libFerryRetroPlan.desMaintenant") : tr("ui.libFerryRetroPlan.aPartirDu", { deadlineDate: deadlineDate(months3) }),
      why: papersWhy("months3", day, visa).short,
    },
    lastweek: {
      label: lastweek <= today ? tr("ui.libFerryRetroPlan.desMaintenant") : tr("ui.libFerryRetroPlan.aPartirDu", { deadlineDate: deadlineDate(lastweek) }),
      why: papersWhy("lastweek", day, visa).short,
    },
  };
}


/** Fin de la mesure pour les binationaux, au format AAAA-MM-JJ. */
export const BINATIONAL_MEASURE_END_DAY = "2026-12-31";

export function retroPlan(
  plan: Pick<CompanionPlan, "month" | "date" | "window" | "vehicle" | "done" | "ticket">,
  papers: { answers: Answers; finished: boolean; done: string[] },
  today = new Date().toISOString().slice(0, 10),
): Milestone[] {
  const day = earliestDay(plan);
  // Les conseils restent dans « Bon à savoir » de Mes papiers : ici, seulement ce qui se fait.
  const tasks = papers.finished
    ? tasksFor(papers.answers).filter((t) => paperKind(t) !== "tip")
    : [];
  // Les visas de plusieurs voyageurs tiennent sur une ligne : « Demander les visas · Adulte 2, Enfant 1 ».
  const of = (when: When): MilestoneTask[] => {
    const group = tasks.filter((t) => t.when === when);
    const visas = group.filter((t) => t.id.startsWith("visa-"));
    const rows: MilestoneTask[] = [];
    for (const t of group) {
      if (t.id.startsWith("visa-")) {
        if (t !== visas[0]) continue;
        rows.push({
          id: "visas",
          ids: visas.map((v) => v.id),
          title: visas.length > 1 ? tr("ui.libFerryRetroPlan.demanderLesVisas") : tr("ui.libFerryRetroPlan.demanderLeVisa"),
          who: [...new Set(visas.flatMap((v) => v.who))],
        });
      } else rows.push({ id: t.id, ids: [t.id], title: t.title, who: t.who });
    }
    return rows;
  };
  const allDone = (list: MilestoneTask[]) =>
    list.length > 0 && list.every((t) => t.ids.every((id) => papers.done.includes(id)));
  const visa = papers.finished && papers.answers.travellers.some((t) => t.nat === "etr");
  const list: Milestone[] = [];

  if (!papers.finished)
    list.push({
      id: "papers",
      date: today,
      lead: "now",
      title: tr("ui.libFerryRetroPlan.faireLaListeDesPapiers"),
      detail:
        tr("ui.libFerryRetroPlan.ditesQuiPartAvecQuelle"),
      tasks: [],
    });
  const first = of("first");
  if (first.length)
    list.push({
      id: "first",
      date: today,
      lead: "now",
      // « Regarder la date d'expiration » se vérifie, il ne se lance pas : le titre suit le contenu.
      title: (() => {
        const checks = first.filter((t) => /^(Regarder|Vérifier|Avoir)/.test(t.title)).length;
        return checks === first.length
          ? tr("ui.libFerryRetroPlan.lesPapiersAVerifier")
          : checks
            ? tr("ui.libFerryRetroPlan.lesPapiersAVerifierOu")
            : tr("ui.libFerryRetroPlan.lesPapiersALancer");
      })(),
      detail: papersWhy("first", day, visa).short,
      more: papersWhy("first", day, visa).more,
      tasks: first,
      done: allDone(first),
    });

  // « Plusieurs semaines avant » : 4 semaines (6 en haute saison), le visa pouvant prendre 14 jours.
  const weeks = of("weeks");
  const deadline = addDays(day, -papersMargin(day).days);
  if (weeks.length)
    list.push({
      id: "weeks",
      date: deadline,
      lead: "before",
      title: tr("ui.libFerryRetroPlan.lesDemarchesLongues"),
      detail: papersWhy("weeks", day, visa).short,
      more: papersWhy("weeks", day, visa).more,
      tasks: weeks,
      late: addDays(day, -PAPERS_LAST_DAYS) < today,
      tight: deadline < today && addDays(day, -PAPERS_LAST_DAYS) >= today,
      done: allDone(weeks),
      ...(visa ? { sources: ["amb-visa"] as FormaliteSourceId[] } : {}),
    });

  // Après les démarches longues dans le calendrier, mais sans attendre leur date limite.
  list.push({
    id: "book",
    date: weeks.length ? deadline : today,
    lead: weeks.length ? "after" : "from",
    title: tr("ui.libFerryRetroPlan.reserverLaTraversee"),
    detail: !papers.finished
      ? tr("ui.libFerryRetroPlan.apresLaListeDesPapiers")
      : weeks.length
        ? visa
          ? tr("ui.libFerryRetroPlan.desQueLesDemarchesLongues")
          : tr("ui.libFerryRetroPlan.desQueLesDemarchesLongues2")
        : tr("ui.libFerryRetroPlan.vosPapiersNeDemandentPas"),
    tasks: [],
    done: Boolean(plan.ticket),
  });

  const months3 = of("months3");
  if (months3.length)
    list.push({
      id: "months3",
      date: later(today, addDays(day, -90)),
      lead: "from",
      title: tr("ui.libFerryRetroPlan.lesPapiersDeCourteDuree"),
      detail: papersWhy("months3", day, visa).short,
      more: papersWhy("months3", day, visa).more,
      tasks: months3,
      done: allDone(months3),
    });

  list.push({
    id: "bags",
    date: later(today, addDays(day, -7)),
    lead: "from",
    title: tr("ui.libFerryRetroPlan.budgetValisesEtPochette"),
    detail: tr("ui.libFerryRetroPlan.dinarsEtDevisesSacDe", { v: plan.vehicle !== "none" ? ", révision de la voiture" : "" }),
    tasks: [...of("lastweek"), ...of("pack")],
  });
  list.push({
    id: "eve",
    date: later(today, addDays(day, -2)),
    lead: "from",
    title: tr("ui.libFerryRetroPlan.t48HAvant"),
    detail:
      tr("ui.libFerryRetroPlan.enregistrementSiLaCompagnieLe"),
    tasks: [],
  });
  list.push({
    id: "day",
    date: day,
    lead: "on",
    title: tr("ui.libFerryRetroPlan.leDepart"),
    detail: tr("ui.libFerryRetroPlan.carteDEmbarquementControlesPuis"),
    tasks: [],
  });

  const binational = papers.finished && papers.answers.travellers.some((t) => t.nat === "bi");
  if (binational && day > BINATIONAL_MEASURE_END_DAY)
    list.push({
      id: "binationaux",
      date: BINATIONAL_MEASURE_END_DAY,
      lead: "on",
      title: tr("ui.libFerryRetroPlan.finDeLaMesurePour"),
      detail: tr("ui.libFerryRetroPlan.laMesureQuiPermetD", { BINATIONALMEASUREEND: BINATIONAL_MEASURE_END }),
      tasks: [],
      tone: "warning",
      sources: ["cons-binationaux"],
    });

  // Ordre du calendrier ; à date égale, l'ordre ci-dessus (papiers avant réservation).
  return list
    .map((m, index) => ({ m, index }))
    .sort((a, b) => a.m.date.localeCompare(b.m.date) || a.index - b.index)
    .map(({ m }) => m);
}

/** La prochaine échéance à montrer en résumé : la première qui n'est pas faite. */
export const nextMilestone = (list: Milestone[]) => list.find((m) => !m.done) ?? null;
