import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Euro,
  ExternalLink,
  FileText,
  Info,
  Lightbulb,
  Luggage,
  MapPin,
  PartyPopper,
  Share2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { whenLabels, whenOrder, type Consulat, type Task, type When } from "@/content/formalites";
import {
  concerns,
  groupWho,
  isCheckable,
  planCategory,
  planCategoryLabels,
  planCategoryOrder,
  type PlanCategory,
} from "@/lib/papers/planCategories";
import { SourceLinks } from "@/components/papers/PapersFlow";
import { TaskLink } from "@/components/papers/TaskLink";
import { tr, lazyDateFormat } from "@/lib/i18n";

const icons: Record<PlanCategory, LucideIcon> = {
  steps: ClipboardList,
  documents: FileText,
  pack: Luggage,
  attention: AlertTriangle,
};

const COUPLE = "\u0000couple";
const KIDS = "\u0000enfants";

/** Une ligne du récap : une tâche, ou les visas de plusieurs voyageurs regroupés en une seule. */
interface Item {
  key: string;
  category: PlanCategory;
  tasks: Task[];
  title: string;
  who: string[];
  when: When;
  cost: { label: string; eur: number } | null;
}

type Deadlines = Partial<Record<When, { label: string; why?: string }>>;

function dueLabel(when: When, deadlines: Deadlines) {
  if (when === "first") return "Dès maintenant";
  return deadlines[when]?.label ?? whenLabels[when].title;
}
const isUrgent = (when: When, label: string) =>
  when === "first" || /maintenant|aujourd|cette semaine|dépassé|retard/i.test(label);

/**
 * Les chiffres du récap, en tête : l'urgent d'abord, puis une tuile par rubrique. Chaque tuile
 * mène à son détail.
 */
export function PaperKpis({
  tasks,
  done,
  deadlines,
  onPick,
}: {
  tasks: Task[];
  done: string[];
  deadlines: Deadlines;
  onPick: (category: PlanCategory | "urgent") => void;
}) {
  const left = (category: PlanCategory) =>
    tasks.filter(
      (t) => planCategory(t) === category && (!isCheckable(category) || !done.includes(t.id)),
    );
  const urgent = tasks.filter(
    (t) =>
      (planCategory(t) === "steps" || planCategory(t) === "documents") &&
      !done.includes(t.id) &&
      isUrgent(t.when, dueLabel(t.when, deadlines)),
  ).length;
  const tiles: { key: PlanCategory | "urgent"; n: number; label: string; icon: LucideIcon }[] = [
    ...(urgent
      ? [{ key: "urgent" as const, n: urgent, label: urgent > 1 ? "urgentes : à faire dès maintenant" : "urgente : à faire dès maintenant", icon: AlertTriangle }]
      : []),
    { key: "steps", n: left("steps").length, label: "démarches", icon: ClipboardList },
    { key: "documents", n: left("documents").length, label: "documents à préparer", icon: FileText },
    { key: "pack", n: left("pack").length, label: "à emporter le jour J", icon: Luggage },
    { key: "attention", n: left("attention").length, label: "points d'attention", icon: Info },
  ];
  return (
    <div className="bw-kpis" role="list" aria-label={tr("ui.recapSheet.leRecapEnChiffres")}>
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <button
            key={tile.key}
            type="button"
            role="listitem"
            data-kpi={tile.key}
            data-zero={tile.n === 0 || undefined}
            onClick={() => onPick(tile.key)}
          >
            <Icon size={14} aria-hidden />
            <b>{tile.n}</b>
            <span>{tile.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const shortConsulat = (name: string) =>
  name.replace(/^Consulat (général )?d'Algérie à /, "Consulat de ");

/**
 * Le récap de fin des papiers, sur le modèle de la page à imprimer (bandeau, voyage en un coup
 * d'œil, quatre rubriques de couleur), mais vivant : on coche, l'avancement suit, et un toucher sur
 * une ligne ouvre son détail (pourquoi, comment, coût, rendez-vous, sources) dans un volet.
 */
export function RecapSheet({
  tasks,
  notes,
  done,
  onToggle,
  onSetMany,
  deadlines,
  travellers,
  childNames,
  coupleNames,
  title,
  adults,
  kids,
  departure,
  consulat,
  consulateSlot,
  editSlot,
  namesSlot,
  checkedOn,
}: {
  /** Toutes les tâches, conseils compris (ils vont dans « Points d'attention »). */
  tasks: Task[];
  notes: string[];
  done: string[];
  onToggle: (id: string) => void;
  onSetMany: (ids: string[], value: boolean) => void;
  deadlines: Deadlines;
  travellers: string[];
  childNames: string[];
  coupleNames: string[];
  title: string;
  adults: number;
  kids: number;
  departure: string | null;
  consulat: Consulat | null;
  /** Dans le volet d'une démarche au consulat : la fiche du consulat, ou de quoi le trouver. */
  consulateSlot: ReactNode;
  editSlot: ReactNode;
  /** Les prénoms des voyageurs, en compact, entre les chiffres et le filtre par personne. */
  namesSlot?: ReactNode;
  checkedOn: string;
}) {
  const [who, setWho] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const isDone = (item: Item) => item.tasks.every((t) => done.includes(t.id));

  // Les lignes de chaque rubrique : filtrées par voyageur, visas regroupés, dans l'ordre des dates.
  const blocks = useMemo(() => {
    const inGroup = (task: Task, names: string[]) =>
      task.who.length === 0 || task.who.some((name) => names.includes(name));
    const visible = tasks.filter((task) =>
      who === COUPLE
        ? inGroup(task, coupleNames)
        : who === KIDS
          ? inGroup(task, childNames)
          : concerns(task, who),
    );
    return planCategoryOrder.map((category) => {
      const list = visible
        .filter((t) => planCategory(t) === category)
        .sort((a, b) => whenOrder.indexOf(a.when) - whenOrder.indexOf(b.when));
      const visas = list.filter((t) => t.id.startsWith("visa-"));
      const items: Item[] = [];
      for (const task of list) {
        if (visas.length > 1 && task.id.startsWith("visa-")) {
          if (task !== visas[0]) continue;
          const eur = visas.reduce((sum, v) => sum + (v.cost?.eur ?? 0), 0);
          items.push({
            key: "visas",
            category,
            tasks: visas,
            title: "Demander les visas",
            who: groupWho([...new Set(visas.flatMap((v) => v.who))], childNames),
            when: task.when,
            cost: eur ? { label: `${eur} € en tout`, eur } : null,
          });
          continue;
        }
        items.push({
          key: task.id,
          category,
          tasks: [task],
          title: task.title,
          who: groupWho(task.who, childNames),
          when: task.when,
          cost: task.cost ?? null,
        });
      }
      return { category, items };
    });
  }, [tasks, who, coupleNames, childNames]);

  const checkableTasks = tasks.filter((t) => isCheckable(planCategory(t)));
  const doneCount = checkableTasks.filter((t) => done.includes(t.id)).length;
  const total = checkableTasks.length;
  const allDone = total > 0 && doneCount === total;
  const fees = tasks.reduce((sum, t) => sum + (t.cost?.eur ?? 0), 0);
  const atConsulate = tasks.some((t) => t.consulate);
  const openItem = blocks.flatMap((b) => b.items).find((item) => item.key === openKey) ?? null;
  const firstConsulateKey =
    blocks.flatMap((b) => b.items).find((item) => item.tasks.some((t) => t.consulate))?.key ?? null;

  const filters: { value: string | null; label: string }[] = [
    { value: null, label: "Tout le monde" },
    ...(coupleNames.length === 2 ? [{ value: COUPLE, label: "Le couple" }] : []),
    ...(childNames.length > 1 ? [{ value: KIDS, label: "Les enfants" }] : []),
    ...travellers.map((name) => ({ value: name, label: name })),
  ];

  return (
    <div className="bw-recap bw-recap--papers">
      <header className="bw-recap__head">
        <div className="min-w-0 flex-1">
          <p className="bw-recap__kicker">{tr("ui.recapSheet.vosPapiersPourLeVoyage")}</p>
          <h2 className="bw-recap__title">{title}</h2>
        </div>
        <div
          className="bw-recap__ring"
          role="img"
          aria-label={allDone ? tr("ui.recapSheet.toutEstPret") : `${doneCount} sur ${total} faites`}
          style={{ "--p": total ? doneCount / total : 0 } as CSSProperties}
        >
          <svg viewBox="0 0 44 44" aria-hidden>
            <circle cx="22" cy="22" r="19" />
            <circle cx="22" cy="22" r="19" pathLength="1" />
          </svg>
          <span>
            {allDone ? (
              <Check size={20} strokeWidth={3} aria-hidden />
            ) : (
              <>
                <b>{doneCount}</b>/{total}
              </>
            )}
          </span>
        </div>
        <div className="bw-recap__actions">
          {editSlot}
          <Link to="/ma-preparation" search={{ retour: "papiers" } as never} className="bw-recap__hbtn">
            <Share2 size={14} aria-hidden />{tr("ui.recapSheet.partagerPdf")}
          </Link>
        </div>
      </header>

      <dl className="bw-recap__trip">
        {departure ? (
          <div>
            <dt>
              <CalendarDays size={13} aria-hidden />{tr("ui.recapSheet.depart")}
            </dt>
            <dd>
              {lazyDateFormat({
                weekday: "short",
                day: "numeric",
                month: "long",
              }).format(new Date(`${departure}T12:00:00`))}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>
            <Users size={13} aria-hidden />{tr("ui.recapSheet.voyageurs")}
          </dt>
          <dd>
            {adults}{tr("ui.recapSheet.adulte")}{adults > 1 ? "s" : ""}
            {kids ? ` · ${kids} enfant${kids > 1 ? "s" : ""}` : ""}
          </dd>
        </div>
        {fees ? (
          <div>
            <dt>
              <Euro size={13} aria-hidden />{tr("ui.recapSheet.fraisConnus")}
            </dt>
            <dd>{fees} €</dd>
          </div>
        ) : null}
        {atConsulate ? (
          <div className="bw-recap__consulat">
            <dt>
              <MapPin size={13} aria-hidden />{tr("ui.recapSheet.consulat")}
            </dt>
            {consulat ? (
              <dd>
                <span className="truncate">{shortConsulat(consulat.name)}</span>
                <a
                  href={consulat.rdv ?? consulat.site}
                  target="_blank"
                  rel="noreferrer"
                  className="bw-recap__rdv"
                >
                  {consulat.rdv ? tr("ui.recapSheet.rendezVous") : tr("ui.recapSheet.site")} <ExternalLink size={11} aria-hidden />
                </a>
              </dd>
            ) : (
              <dd>
                <button
                  type="button"
                  className="bw-recap__rdv"
                  onClick={() => firstConsulateKey && setOpenKey(firstConsulateKey)}
                >
                  {tr("ui.recapSheet.aTrouver")}<ChevronRight size={12} aria-hidden />
                </button>
              </dd>
            )}
          </div>
        ) : null}
      </dl>

      <PaperKpis
        tasks={tasks}
        done={done}
        deadlines={deadlines}
        onPick={(key) => {
          const block = document.getElementById(`recap-${key === "urgent" ? "steps" : key}`);
          if (!block) return;
          block.scrollIntoView({ behavior: "smooth", block: "start" });
          block.classList.remove("is-flash");
          void block.offsetWidth;
          block.classList.add("is-flash");
        }}
      />

      {namesSlot}

      {travellers.length > 2 ? (
        <div className="bw-recap__who" role="radiogroup" aria-label={tr("ui.recapSheet.voirCeQuiConcerne")}>
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

      {allDone ? (
        <p className="bw-recap__ready" role="status">
          <PartyPopper size={18} aria-hidden />{tr("ui.recapSheet.toutEstPretVosPapiers")}
        </p>
      ) : null}

      <div className="bw-recap__grid">
        {blocks.map(({ category, items }) => {
          const Icon = icons[category];
          const checkable = isCheckable(category);
          const left = checkable ? items.filter((item) => !isDone(item)).length : items.length;
          const ordered = checkable
            ? [...items.filter((i) => !isDone(i)), ...items.filter((i) => isDone(i))]
            : items;
          return (
            <section
              key={category}
              id={`recap-${category}`}
              className="bw-recap__block"
              data-cat={category}
            >
              <h3>
                <Icon size={16} aria-hidden /> {planCategoryLabels[category].title}
                <span
                  className="bw-recap__badge"
                  data-zero={checkable && items.length && !left ? "" : undefined}
                >
                  {checkable && items.length && !left ? (
                    <Check size={12} strokeWidth={3} aria-label={tr("ui.recapSheet.toutFait")} />
                  ) : (
                    left
                  )}
                </span>
              </h3>
              {items.length ? (
                <ul>
                  {ordered.map((item) => (
                    <Row
                      key={item.key}
                      item={item}
                      checkable={checkable}
                      done={done}
                      due={checkable && category !== "pack" ? dueLabel(item.when, deadlines) : null}
                      onCheck={() =>
                        item.tasks.length === 1
                          ? onToggle(item.tasks[0]!.id)
                          : onSetMany(
                              item.tasks.map((t) => t.id),
                              !isDone(item),
                            )
                      }
                      onOpen={() => setOpenKey(item.key)}
                    />
                  ))}
                </ul>
              ) : (
                <p className="bw-recap__none">{planCategoryLabels[category].empty}</p>
              )}
            </section>
          );
        })}
      </div>

      {notes.length ? (
        <ul className="bw-recap__notes">
          {notes.map((note) => (
            <li key={note}>
              <Info size={15} aria-hidden /> {note}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="bw-recap__foot">
        {tr("ui.recapSheet.sourcesLuesLe")}{checkedOn}{tr("ui.recapSheet.lesReglesPeuventChangerLe")}
      </p>

      {openItem ? (
        <DetailSheet
          item={openItem}
          all={tasks}
          done={done}
          due={dueLabel(openItem.when, deadlines)}
          why={deadlines[openItem.when]?.why ?? null}
          onToggle={onToggle}
          onSetMany={onSetMany}
          consulateSlot={consulateSlot}
          onClose={() => setOpenKey(null)}
        />
      ) : null}
    </div>
  );
}

function Row({
  item,
  checkable,
  done,
  due,
  onCheck,
  onOpen,
}: {
  item: Item;
  checkable: boolean;
  done: string[];
  due: string | null;
  onCheck: () => void;
  onOpen: () => void;
}) {
  const doneHere = item.tasks.filter((t) => done.includes(t.id)).length;
  const full = doneHere === item.tasks.length;
  const partial = doneHere > 0 && !full;
  const advice = item.tasks.some(
    (t) => t.advice || t.id === "chambres-separees" || t.id === "majorite-19",
  );
  const toConfirm = item.tasks.some((t) => t.toConfirm);
  return (
    <li data-done={(checkable && full) || undefined}>
      {checkable ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={full ? true : partial ? "mixed" : false}
          aria-label={`${item.title} : ${full ? "fait" : "à faire"}`}
          onClick={onCheck}
          className="bw-recap__check"
        >
          <span>
            {full ? (
              <Check size={14} strokeWidth={3} aria-hidden />
            ) : partial ? (
              <i aria-hidden />
            ) : null}
          </span>
        </button>
      ) : (
        <span className="bw-recap__dot" aria-hidden>
          {advice ? <Lightbulb size={13} /> : null}
        </span>
      )}
      <button type="button" className="bw-recap__line" onClick={onOpen} aria-haspopup="dialog">
        <span className="min-w-0 flex-1">
          <b>{item.title}</b>
          <span className="bw-recap__meta">
            {due ? (
              <span className="bw-recap__due" data-urgent={isUrgent(item.when, due) || undefined}>
                {due}
              </span>
            ) : null}
            {item.who.length ? <span>{item.who.join(", ")}</span> : null}
            {item.cost ? <span className="bw-recap__cost">{item.cost.label}</span> : null}
            {partial ? (
              <span>
                {doneHere}/{item.tasks.length}{tr("ui.recapSheet.faits")}
              </span>
            ) : null}
            {toConfirm ? <span className="bw-recap__warn">{tr("ui.recapSheet.aFaireConfirmer")}</span> : null}
          </span>
        </span>
        <ChevronRight size={16} className="bw-recap__chev" aria-hidden />
      </button>
    </li>
  );
}

/** Le détail d'une ligne : volet qui monte sur téléphone, fenêtre au centre sur PC. */
function DetailSheet({
  item,
  all,
  done,
  due,
  why,
  onToggle,
  onSetMany,
  consulateSlot,
  onClose,
}: {
  item: Item;
  all: Task[];
  done: string[];
  due: string;
  why: string | null;
  onToggle: (id: string) => void;
  onSetMany: (ids: string[], value: boolean) => void;
  consulateSlot: ReactNode;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const close = () => {
    setLeaving(true);
    window.setTimeout(onClose, 180);
  };
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkable = isCheckable(item.category);
  const task = item.tasks[0]!;
  const group = item.tasks.length > 1;
  const full = item.tasks.every((t) => done.includes(t.id));
  const first = [...new Set(item.tasks.flatMap((t) => t.needs ?? []))]
    .map((id) => all.find((t) => t.id === id))
    .filter((t): t is Task => !!t && !done.includes(t.id));
  const Icon = icons[item.category];

  return createPortal(
    <div className="bw-recap-sheet" data-leaving={leaving || undefined}>
      <button
        type="button"
        className="bw-recap-sheet__scrim"
        aria-label={tr("ui.recapSheet.fermer")}
        tabIndex={-1}
        onClick={close}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="bw-recap-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bw-recap-sheet-title"
        data-cat={item.category}
      >
        <span className="bw-recap-sheet__handle" aria-hidden />
        <div className="bw-recap-sheet__top">
          <p className="bw-recap-sheet__kicker">
            <Icon size={14} aria-hidden /> {planCategoryLabels[item.category].short}
          </p>
          <button
                        type="button"
            onClick={close}
            className="bw-recap-sheet__close"
            aria-label={tr("ui.recapSheet.fermer")}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <h2 id="bw-recap-sheet-title">{item.title}</h2>
        <p className="bw-recap-sheet__chips">
          {checkable && item.category !== "pack" ? (
            <span data-urgent={isUrgent(item.when, due) || undefined}>
              <CalendarDays size={13} aria-hidden /> {due}
            </span>
          ) : null}
          {item.who.length ? (
            <span>
              <Users size={13} aria-hidden /> {item.who.join(", ")}
            </span>
          ) : null}
          {item.cost ? (
            <span className="bw-recap__cost">
              <Euro size={13} aria-hidden /> {item.cost.label}
            </span>
          ) : null}
        </p>

        <div className="bw-recap-sheet__body">
          {why && checkable && item.category !== "pack" ? (
            <p className="bw-recap-sheet__why">{why}</p>
          ) : null}
          {first.length ? (
            <p className="bw-recap-sheet__first">
              <AlertTriangle size={15} aria-hidden />{tr("ui.recapSheet.dAbord")}{" "}
              {first.map((t) => t.title.charAt(0).toLowerCase() + t.title.slice(1)).join(", ")}
            </p>
          ) : null}

          {group ? (
            <ul className="bw-recap-sheet__people">
              {item.tasks.map((t) => {
                const ok = done.includes(t.id);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={ok}
                      onClick={() => onToggle(t.id)}
                      className="bw-recap__check"
                    >
                      <span>{ok ? <Check size={14} strokeWidth={3} aria-hidden /> : null}</span>
                    </button>
                    <span className="min-w-0 flex-1">
                      <b data-done={ok || undefined}>{t.who.join(", ")}</b>
                      {t.cost ? <small>{t.cost.label}</small> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {task.consulate ? <div className="bw-recap-sheet__where">{consulateSlot}</div> : null}

          <div className="bw-recap-sheet__text">
            {task.detail.split("\n").map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          {task.link ? <TaskLink link={task.link} /> : null}
          {task.sources.length ? (
            <SourceLinks ids={[...new Set(item.tasks.flatMap((t) => t.sources))]} />
          ) : (
            <p className="text-xs font-semibold text-muted-foreground">
              {tr("ui.recapSheet.aucuneSourceOfficielleTrouveeSur")}
            </p>
          )}
        </div>

        {checkable ? (
          <div className="bw-recap-sheet__foot">
            <button
              type="button"
              data-done={full || undefined}
              className="bw-recap-sheet__cta"
              onClick={() => {
                if (group)
                  onSetMany(
                    item.tasks.map((t) => t.id),
                    !full,
                  );
                else onToggle(task.id);
                if (!full) close();
              }}
            >
              {full ? (
                <>{tr("ui.recapSheet.remettreAFaire")}</>
              ) : (
                <>
                  <Check size={17} strokeWidth={3} aria-hidden />
                  {group ? tr("ui.recapSheet.toutMarquerCommeFait") : tr("ui.recapSheet.marquerCommeFait")}
                </>
              )}
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
