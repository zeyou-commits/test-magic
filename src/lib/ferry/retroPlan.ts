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

/** Pourquoi cette date limite, en clair : délai publié, attente du rendez-vous, saison. */
export function papersWhy(when: When, day: string, visa: boolean): string {
  const { weeks, highSeason } = papersMargin(day);
  if (when === "first")
    return "Aucun délai n'est publié pour ces démarches (un passeport algérien est fabriqué en Algérie) : plus tôt c'est lancé, plus tôt vous pouvez réserver.";
  if (when === "months3")
    return "Ce papier ne vaut que 3 mois : fait trop tôt, il ne serait plus valable au retour.";
  if (when !== "weeks") return "";
  const season = highSeason
    ? ` Vous partez en haute saison : BledWay compte ${weeks} semaines au lieu de 4, car beaucoup de voyageurs font leurs démarches en même temps. C'est un conseil de prudence, pas un délai officiel.`
    : "";
  return visa
    ? `L'ambassade annonce 1 à 14 jours après le dépôt du dossier, sans compter l'attente d'un rendez-vous au consulat. BledWay compte donc ${highSeason ? weeks : 4} semaines avant le départ.${season}`
    : `Aucun délai n'est publié : BledWay compte ${highSeason ? weeks : 4} semaines avant le départ pour avoir le temps d'un rendez-vous et d'un éventuel complément de dossier.${season}`;
}

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
      detail: papersWhy("first", day, visa),
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
      detail: papersWhy("weeks", day, visa),
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
      detail: papersWhy("months3", day, visa),
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
