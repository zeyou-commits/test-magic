import {
  BINATIONAL_MEASURE_END,
  tasksFor,
  whenLabels,
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
  detail: string;
  /** Les papiers de ce moment (ids et titres de « Mes papiers »). */
  tasks: { id: string; title: string }[];
  /** La date limite est déjà passée : à faire tout de suite. */
  late?: boolean;
  done?: boolean;
  tone?: "warning";
  sources?: FormaliteSourceId[];
};

const addDays = (day: string, n: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
};
const later = (a: string, b: string) => (a > b ? a : b);

/** Fin de la mesure pour les binationaux, au format AAAA-MM-JJ. */
export const BINATIONAL_MEASURE_END_DAY = "2026-12-31";

export function retroPlan(
  plan: Pick<CompanionPlan, "month" | "date" | "window" | "vehicle" | "done">,
  papers: { answers: Answers; finished: boolean; done: string[] },
  today = new Date().toISOString().slice(0, 10),
): Milestone[] {
  const day = earliestDay(plan);
  const tasks = papers.finished ? tasksFor(papers.answers) : [];
  const of = (when: When) =>
    tasks.filter((t) => t.when === when).map((t) => ({ id: t.id, title: t.title }));
  const allDone = (list: { id: string }[]) =>
    list.length > 0 && list.every((t) => papers.done.includes(t.id));
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
      detail: whenLabels.first.hint,
      tasks: first,
      done: allDone(first),
    });

  // « Plusieurs semaines avant » : BledWay compte 4 semaines, le visa pouvant prendre 14 jours.
  const weeks = of("weeks");
  const deadline = addDays(day, -28);
  if (weeks.length)
    list.push({
      id: "weeks",
      date: deadline,
      lead: "before",
      title: "Les démarches longues",
      detail: visa
        ? "Repère BledWay : 4 semaines avant le départ. Le délai publié pour un visa va jusqu'à 14 jours après le dépôt, sans compter le rendez-vous."
        : `${whenLabels.weeks.hint} Repère BledWay : 4 semaines avant le départ.`,
      tasks: weeks,
      late: deadline < today,
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
      detail: whenLabels.months3.hint,
      tasks: months3,
      done: allDone(months3),
    });

  list.push({
    id: "bags",
    date: later(today, addDays(day, -7)),
    lead: "from",
    title: "Budget, valises et pochette",
    detail: `Dinars et devises, sac de traversée${plan.vehicle !== "none" ? ", révision de la voiture" : ""} ; tous les papiers à présenter au port dans une pochette.`,
    tasks: of("pack"),
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
