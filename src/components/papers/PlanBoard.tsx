import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  FileText,
  Luggage,
  MapPin,
  Users,
} from "lucide-react";
import { whenLabels, whenOrder, type Task, type When } from "@/content/formalites";
import {
  concerns,
  groupWho,
  isCheckable,
  planCategory,
  planCategoryLabels,
  planCategoryOrder,
  type PlanCategory,
} from "@/lib/papers/planCategories";
import { SourceLinks, TaskRow } from "@/components/papers/PapersFlow";

const COUPLE = "\u0000couple";
const KIDS = "\u0000enfants";

const icons: Record<PlanCategory, ReactNode> = {
  steps: <ClipboardList size={20} aria-hidden />,
  documents: <FileText size={20} aria-hidden />,
  pack: <Luggage size={20} aria-hidden />,
  attention: <AlertTriangle size={20} aria-hidden />,
};

/** L'échéance d'une tâche, en mots : « Dès maintenant », « Avant le 12 décembre », « Sur place »… */
function dueLabel(when: When, deadlines: Partial<Record<When, { label: string }>>) {
  if (when === "first") return "Dès maintenant";
  return deadlines[when]?.label ?? whenLabels[when].title;
}
const isUrgent = (label: string) => /maintenant|aujourd|cette semaine/i.test(label);

/**
 * Le bilan de « Mes papiers » en quatre rubriques cliquables. Chaque tuile dit combien il reste
 * et montre le premier point ; un toucher ouvre la rubrique juste dessous. Un filtre par voyageur
 * (prénoms) montre ce qui concerne Sarah, Hamid ou Malika.
 */
export function PlanBoard({
  tasks,
  done,
  onToggle,
  deadlines,
  travellers,
  consulateLine,
  taskExtra,
  childNames = [],
  coupleNames = [],
}: {
  tasks: Task[];
  done: string[];
  onToggle: (id: string) => void;
  deadlines: Partial<Record<When, { label: string; why: string }>>;
  /** Noms affichés des voyageurs (prénoms ou « Vous », « Adulte 2 »…). */
  travellers: string[];
  consulateLine: string | null;
  /** Ce qui s'ajoute à une démarche (le consulat où la faire). */
  taskExtra?: (task: Task) => ReactNode;
  /** Pour regrouper « Les 3 enfants » et proposer le filtre « Les enfants ». */
  childNames?: string[];
  /** Les deux adultes du couple : filtre « Le couple ». */
  coupleNames?: string[];
}) {
  const [who, setWho] = useState<string | null>(null);
  const [open, setOpen] = useState<PlanCategory | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const byCategory = useMemo(() => {
    const map = new Map<PlanCategory, Task[]>(planCategoryOrder.map((c) => [c, []]));
    // Filtres de groupe : « Le couple », « Les enfants » ; sinon un voyageur, ou tout le monde.
    const inGroup = (task: Task, names: string[]) =>
      task.who.length === 0 || task.who.some((name) => names.includes(name));
    tasks
      .filter((task) =>
        who === COUPLE
          ? inGroup(task, coupleNames)
          : who === KIDS
            ? inGroup(task, childNames)
            : concerns(task, who),
      )
      .sort((a, b) => whenOrder.indexOf(a.when) - whenOrder.indexOf(b.when))
      .forEach((task) => map.get(planCategory(task))!.push(task));
    return map;
  }, [tasks, who, coupleNames, childNames]);
  const filters: { value: string | null; label: string }[] = [
    { value: null, label: "Tout le monde" },
    ...(coupleNames.length === 2 ? [{ value: COUPLE, label: "Le couple" }] : []),
    ...(childNames.length > 1 ? [{ value: KIDS, label: "Les enfants" }] : []),
    ...travellers.map((name) => ({ value: name, label: name })),
  ];
  const shown = (task: Task) => ({ ...task, who: groupWho(task.who, childNames) });

  const choose = (category: PlanCategory) => {
    const next = open === category ? null : category;
    setOpen(next);
    if (next)
      window.setTimeout(
        () => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
        60,
      );
  };

  return (
    <div className="bw-plan mt-4">
      {travellers.length > 1 ? (
        <div className="bw-plan__who" role="radiogroup" aria-label="Voir ce qui concerne">
          <Users size={15} className="shrink-0 text-muted-foreground" aria-hidden />
          {filters.map((filter) => (
            <button
              key={filter.value ?? "all"}
              type="button"
              role="radio"
              aria-checked={who === filter.value}
              onClick={() => setWho(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="bw-plan__grid">
        {planCategoryOrder.map((category) => {
          const list = byCategory.get(category)!;
          const checkable = isCheckable(category);
          const left = checkable ? list.filter((t) => !done.includes(t.id)) : list;
          const label = planCategoryLabels[category];
          const first = left[0];
          const ready = checkable && list.length > 0 && left.length === 0;
          return (
            <button
              key={category}
              type="button"
              className="bw-plan__tile"
              data-cat={category}
              data-open={open === category || undefined}
              data-empty={list.length === 0 || undefined}
              aria-expanded={open === category}
              aria-controls="bw-plan-panel"
              disabled={list.length === 0}
              onClick={() => choose(category)}
            >
              <span className="bw-plan__icon">{icons[category]}</span>
              <span className="bw-plan__count">
                {ready ? <Check size={22} strokeWidth={3} aria-hidden /> : left.length}
              </span>
              <span className="bw-plan__label">{label.title}</span>
              <span className="bw-plan__peek">
                {list.length === 0
                  ? label.empty
                  : ready
                    ? "Tout est prêt"
                    : first
                      ? `${checkable && category !== "pack" ? `${dueLabel(first.when, deadlines)} · ` : ""}${first.title}`
                      : ""}
              </span>
              <span className="bw-plan__more">
                {list.length ? (open === category ? "Fermer" : "Voir le détail") : ""}
                {list.length ? (
                  <ChevronDown size={14} className={open === category ? "rotate-180" : ""} aria-hidden />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {open ? (
        <div id="bw-plan-panel" ref={panelRef} className="bw-plan__panel" data-cat={open}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold">
                {planCategoryLabels[open].title}
                {who ? <span className="text-muted-foreground"> · {who}</span> : null}
              </h3>
              <p className="text-sm text-muted-foreground">{planCategoryLabels[open].hint}</p>
            </div>
          </div>
          {isCheckable(open) ? (
            <ul className="mt-3 grid gap-2">
              {byCategory.get(open)!.map((task) => (
                <TaskRow
                  key={task.id}
                  task={shown(task)}
                  done={done.includes(task.id)}
                  onToggle={() => onToggle(task.id)}
                  extra={taskExtra?.(task)}
                  due={open === "pack" ? undefined : <DueTag label={dueLabel(task.when, deadlines)} />}
                />
              ))}
            </ul>
          ) : (
            <ul className="mt-3 grid gap-2">
              {byCategory.get(open)!.map((task) => (
                <AttentionRow key={task.id} task={shown(task)} />
              ))}
            </ul>
          )}
          {open === "steps" && consulateLine ? (
            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <MapPin size={13} className="mt-0.5 shrink-0" aria-hidden /> {consulateLine}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DueTag({ label }: { label: string }) {
  return (
    <span className="bw-plan__due" data-urgent={isUrgent(label) || undefined}>
      <CalendarDays size={12} aria-hidden /> {label}
    </span>
  );
}

/** Un point d'attention : la règle en une ligne, le détail et les sources au toucher. */
function AttentionRow({ task }: { task: Task }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border bg-background">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        <AlertTriangle size={17} className="mt-0.5 shrink-0 text-[#b7791f]" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-snug">{task.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold">
              {task.who.length ? task.who.join(", ") : "Tout le monde"}
            </span>
            <span className="text-muted-foreground">{whenLabels[task.when].title}</span>
            {task.toConfirm ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
                À faire confirmer
              </span>
            ) : null}
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`mt-1 shrink-0 text-primary ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="space-y-2 px-3 pb-3 pl-10 text-sm leading-relaxed text-muted-foreground">
          {task.detail.split("\n").map((p) => (
            <p key={p}>{p}</p>
          ))}
          {task.sources.length ? <SourceLinks ids={task.sources} /> : null}
        </div>
      ) : null}
    </li>
  );
}
