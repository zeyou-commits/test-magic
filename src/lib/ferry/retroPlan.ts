import {
  BINATIONAL_MEASURE_END,
  tasksFor,
  type Answers,
  type FormaliteSourceId,
  type When,
} from "@/content/formalites";
import { earliestDay, type CompanionPlan } from "./companion";

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
    ? `BledWay conseille ${weeks} semaines de marge, car vous partez en haute saison, quand beaucoup de voyageurs font leurs démarches en même temps.`
    : `BledWay conseille ${weeks} semaines de marge.`;
  if (when === "first")
    return {
      short: "Aucun délai n'est publié : plus tôt c'est lancé, plus tôt vous réservez.",
      more: "Un passeport algérien est fabriqué en Algérie et le consulat ne publie aucun délai. Lancez ces démarches avant d'acheter un billet non remboursable.",
    };
  if (when === "months3")
    return {
      short: "Ce papier ne vaut que 3 mois : pas avant cette date.",
      more: "Fait plus tôt, il ne serait plus valable au moment du retour.",
    };
  if (when === "lastweek")
    return {
      short: "Quelques minutes en ligne, une fois vos dates connues.",
      more: "",
    };
  if (when !== "weeks") return { short: "", more: "" };
  return visa
    ? {
        short: "Un visa prend jusqu'à 14 jours après le dépôt, plus l'attente du rendez-vous.",
        more: `Délai annoncé par l'ambassade d'Algérie : 1 à 14 jours après le dépôt du dossier. L'attente d'un rendez-vous au consulat n'est publiée nulle part. ${margin} C'est un conseil de prudence, pas un délai officiel.`,
      }
    : {
        short: "Aucun délai n'est publié : gardez le temps d'un rendez-vous.",
        more: `${margin} C'est un conseil de prudence, pas un délai officiel.`,
      };
}

/** En dessous, même le délai publié d'un visa (14 jours) et un rendez-vous ne tiennent plus. */
export const PAPERS_LAST_DAYS = 21;

/** Fin de la mesure pour les binationaux, au format AAAA-MM-JJ. */
export const BINATIONAL_MEASURE_END_DAY = "2026-12-31";

export function retroPlan(
  plan: Pick<CompanionPlan, "month" | "date" | "window" | "vehicle" | "done">,
  papers: { answers: Answers; finished: boolean; done: string[] },
  today = new Date().toISOString().slice(0, 10),
): Milestone[] {
  const day = earliestDay(plan);
  const tasks = papers.finished ? tasksFor(papers.answers) : [];
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
          title: visas.length > 1 ? "Demander les visas" : "Demander le visa",
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
      title: "Faire la liste des papiers",
      detail:
        "Dites qui part, avec quelle nationalité : les papiers de chacun s'ajoutent à ce calendrier, avec leurs dates.",
      tasks: [],
    });
  const first = of("first");
  if (first.length)
    list.push({
      id: "first",
      date: today,
      lead: "now",
      title: "Les papiers à lancer",
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
      title: "Les démarches longues",
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
    title: "Réserver la traversée",
    detail: !papers.finished
      ? "Après la liste des papiers : un visa refusé ne rembourse pas un billet non remboursable."
      : weeks.length
        ? visa
          ? "Dès que les démarches longues sont lancées : un visa refusé ne rembourse pas un billet non remboursable."
          : "Dès que les démarches longues sont lancées : un papier qui manque ne rembourse pas un billet non remboursable."
        : "Vos papiers ne demandent pas de délai particulier : vous pouvez réserver dès que la période est fixée.",
    tasks: [],
    done: plan.done.includes("book"),
  });

  const months3 = of("months3");
  if (months3.length)
    list.push({
      id: "months3",
      date: later(today, addDays(day, -90)),
      lead: "from",
      title: "Les papiers de courte durée",
      detail: papersWhy("months3", day, visa).short,
      more: papersWhy("months3", day, visa).more,
      tasks: months3,
      done: allDone(months3),
    });

  list.push({
    id: "bags",
    date: later(today, addDays(day, -7)),
    lead: "from",
    title: "Budget, valises et pochette",
    detail: `Dinars et devises, sac de traversée${plan.vehicle !== "none" ? ", révision de la voiture" : ""} ; tous les papiers à présenter au port dans une pochette.`,
    tasks: [...of("lastweek"), ...of("pack")],
  });
  list.push({
    id: "eve",
    date: later(today, addDays(day, -2)),
    lead: "from",
    title: "48 h avant",
    detail:
      "Enregistrement si la compagnie le propose, billet et documents téléchargés : le réseau manque souvent au port.",
    tasks: [],
  });
  list.push({
    id: "day",
    date: day,
    lead: "on",
    title: "Le départ",
    detail: "Carte d'embarquement, contrôles, puis votre navire en direct sur la carte.",
    tasks: [],
  });

  const binational = papers.finished && papers.answers.travellers.some((t) => t.nat === "bi");
  if (binational && day > BINATIONAL_MEASURE_END_DAY)
    list.push({
      id: "binationaux",
      date: BINATIONAL_MEASURE_END_DAY,
      lead: "on",
      title: "Fin de la mesure pour les binationaux",
      detail: `La mesure qui permet d'entrer avec un passeport étranger s'arrête le ${BINATIONAL_MEASURE_END}, avant votre départ : revérifiez les règles auprès du consulat avant d'acheter le billet.`,
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
