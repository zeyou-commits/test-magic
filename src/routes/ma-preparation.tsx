import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  Car,
  ClipboardList,
  Download,
  FileText,
  Luggage,
  MapPin,
  Share2,
  Ship,
  Users,
} from "lucide-react";
import {
  FORMALITES_CHECKED,
  tasksFor,
  travellerLabel,
  whenLabels,
  type Task,
  type When,
} from "@/content/formalites";
import { consulatForDepartment } from "@/content/consulats";
import { portsQuery } from "@/lib/ferry/queries";
import { papersDeadlines } from "@/lib/ferry/retroPlan";
import { VEHICLES } from "@/components/panel/TripProfile";
import {
  concerns,
  isCheckable,
  planCategory,
  planCategoryLabels,
  planCategoryOrder,
  type PlanCategory,
} from "@/lib/papers/planCategories";
import {
  answersOf,
  currentPreparation,
  decodePreparation,
  shareUrl,
  type SharedPreparation,
} from "@/lib/prepare/share";

export const Route = createFileRoute("/ma-preparation")({
  head: () => ({
    meta: [
      { title: "Préparation du voyage au bled | BledWay" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "La préparation d'un voyage en Algérie : démarches, documents, à emporter, points d'attention.",
      },
    ],
  }),
  component: SharedPreparationPage,
});

const icons: Record<PlanCategory, typeof ClipboardList> = {
  steps: ClipboardList,
  documents: FileText,
  pack: Luggage,
  attention: AlertTriangle,
};

const dayLabel = (key: string | null) =>
  key
    ? new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" }).format(
        new Date(`${key}T12:00:00`),
      )
    : null;

function SharedPreparationPage() {
  // Lien reçu : la préparation est dans l'adresse ; sinon, celle de cet appareil.
  const [prep, setPrep] = useState<SharedPreparation | null>(null);
  const [mine, setMine] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const shared = decodePreparation(window.location.hash);
    if (shared) setPrep(shared);
    else {
      setPrep(currentPreparation());
      setMine(true);
    }
    setReady(true);
  }, []);

  if (!ready) return <div className="bw-onepage-wrap" />;
  if (!prep)
    return (
      <div className="bw-onepage-wrap">
        <div className="bw-onepage bw-onepage--empty">
          <img src="/bledway-brand-entete.webp" alt="BledWay" className="h-9 w-auto" />
          <h1>Aucune préparation à afficher</h1>
          <p>Ce lien est incomplet, ou la préparation n'a pas encore commencé sur cet appareil.</p>
          <Link to="/preparer-mon-voyage" className="bw-onepage__cta">
            Préparer mon voyage
          </Link>
        </div>
      </div>
    );
  return <OnePage prep={prep} mine={mine} />;
}

function OnePage({ prep, mine }: { prep: SharedPreparation; mine: boolean }) {
  const answers = useMemo(() => answersOf(prep), [prep]);
  const tasks = useMemo(() => tasksFor(answers), [answers]);
  const names = answers.travellers.map((t) => travellerLabel(t, answers.travellers));
  const named = answers.travellers.filter((t) => t.name?.trim()).map((t) => t.name!.trim());
  const { data: ports = [] } = useQuery(portsQuery);
  const port = (id: string | null) => ports.find((p) => p.id === id)?.name ?? null;
  const trip = prep.trip;
  const day = trip?.date ?? (trip?.month ? `${trip.month}-01` : null);
  const deadlines = useMemo(
    () => (day ? papersDeadlines(day, answers.travellers.some((t) => t.nat === "etr")) : {}),
    [day, answers.travellers],
  );
  const consulat = prep.answers.department ? consulatForDepartment(prep.answers.department) : null;
  const atConsulate = tasks.some((t) => t.consulate);
  const [who, setWho] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const groups = planCategoryOrder.map((category) => ({
    category,
    items: tasks.filter((t) => planCategory(t) === category && concerns(t, who)),
  }));
  const checkable = tasks.filter((t) => isCheckable(planCategory(t)));
  const doneCount = checkable.filter((t) => prep.done.includes(t.id)).length;

  const share = async () => {
    const url = shareUrl(prep);
    const title = named.length ? `Préparation du voyage de ${named.join(", ")}` : "Notre voyage au bled";
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title, text: `${title} — préparé avec BledWay`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* partage annulé */
    }
  };

  const due = (when: When) =>
    when === "first" ? "Dès maintenant" : (deadlines[when]?.label ?? whenLabels[when].title);

  return (
    <div className="bw-onepage-wrap">
      <div className="bw-onepage__bar" role="toolbar" aria-label="Actions">
        <Link to="/preparer-mon-voyage" className="bw-onepage__back">
          {mine ? "← Revenir à ma préparation" : "Préparer mon propre voyage"}
        </Link>
        <span className="flex gap-2">
          <button type="button" onClick={share} className="bw-onepage__btn">
            <Share2 size={16} aria-hidden /> {copied ? "Lien copié" : "Partager le lien"}
          </button>
          <button type="button" onClick={() => window.print()} className="bw-onepage__btn bw-onepage__btn--main">
            <Download size={16} aria-hidden /> PDF
          </button>
        </span>
      </div>

      <article className="bw-onepage">
        <header className="bw-onepage__head">
          <img src="/bledway-brand-entete.webp" alt="BledWay" className="bw-onepage__logo" />
          <div className="min-w-0">
            <p className="bw-onepage__kicker">Préparation du voyage au bled</p>
            <h1>{named.length ? `Le voyage de ${joinNames(named)}` : "Notre voyage en Algérie"}</h1>
          </div>
          <div className="bw-onepage__score" aria-label={`${doneCount} sur ${checkable.length} prêts`}>
            <b>
              {doneCount}/{checkable.length}
            </b>
            <small>prêts</small>
          </div>
        </header>

        <dl className="bw-onepage__trip">
          {trip?.date || trip?.month ? (
            <div>
              <dt>
                <CalendarDays size={14} aria-hidden /> Aller
              </dt>
              <dd>
                {trip.date
                  ? dayLabel(trip.date)
                  : new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
                      new Date(`${trip.month}-15T12:00:00`),
                    )}
              </dd>
            </div>
          ) : null}
          {trip?.returnDate ? (
            <div>
              <dt>
                <CalendarDays size={14} aria-hidden /> Retour
              </dt>
              <dd>{dayLabel(trip.returnDate)}</dd>
            </div>
          ) : null}
          {port(trip?.fromPortId ?? null) || port(trip?.toPortId ?? null) ? (
            <div>
              <dt>
                <Ship size={14} aria-hidden /> Traversée
              </dt>
              <dd>
                {port(trip?.fromPortId ?? null) ?? "?"} → {port(trip?.toPortId ?? null) ?? "?"}
              </dd>
            </div>
          ) : null}
          {trip?.vehicle ? (
            <div>
              <dt>
                <Car size={14} aria-hidden /> Véhicule
              </dt>
              <dd>{VEHICLES.find((v) => v.id === trip.vehicle)?.label ?? "—"}</dd>
            </div>
          ) : null}
          <div>
            <dt>
              <Users size={14} aria-hidden /> Voyageurs
            </dt>
            <dd>{names.join(", ")}</dd>
          </div>
          {trip?.destination ? (
            <div>
              <dt>
                <MapPin size={14} aria-hidden /> Destination
              </dt>
              <dd>{trip.destination}</dd>
            </div>
          ) : null}
        </dl>

        {names.length > 1 ? (
          <div className="bw-onepage__who" role="radiogroup" aria-label="Voir ce qui concerne">
            {[null, ...names].map((name) => (
              <button
                key={name ?? "all"}
                type="button"
                role="radio"
                aria-checked={who === name}
                onClick={() => setWho(name)}
              >
                {name ?? "Tout le monde"}
              </button>
            ))}
          </div>
        ) : null}

        <div className="bw-onepage__grid">
          {groups.map(({ category, items }) => {
            const Icon = icons[category];
            return (
              <section key={category} className="bw-onepage__block" data-cat={category}>
                <h2>
                  <Icon size={16} aria-hidden /> {planCategoryLabels[category].title}
                  <span>{items.length}</span>
                </h2>
                {items.length ? (
                  <ul>
                    {items.map((task) => (
                      <Row
                        key={task.id}
                        task={task}
                        checkable={isCheckable(category)}
                        done={prep.done.includes(task.id)}
                        due={isCheckable(category) && category !== "pack" ? due(task.when) : null}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="bw-onepage__none">{planCategoryLabels[category].empty}</p>
                )}
              </section>
            );
          })}
        </div>

        {consulat && atConsulate ? (
          <p className="bw-onepage__consulat">
            <MapPin size={14} aria-hidden /> <b>{consulat.name}</b> · {consulat.address} · {consulat.phone}
          </p>
        ) : null}

        <footer className="bw-onepage__foot">
          <span>
            Préparé avec <b>BledWay</b> · bledway.com/preparer-mon-voyage
          </span>
          <span>
            Partagé le {dayLabel(prep.at)} · Règles lues le {dayLabel(FORMALITES_CHECKED)} : le consulat et la police
            aux frontières restent la référence.
          </span>
        </footer>
      </article>
    </div>
  );
}

function Row({
  task,
  checkable,
  done,
  due,
}: {
  task: Task;
  checkable: boolean;
  done: boolean;
  due: string | null;
}) {
  return (
    <li data-done={done || undefined}>
      {checkable ? <span className="bw-onepage__box" aria-label={done ? "Fait" : "À faire"}>{done ? "✓" : ""}</span> : <span className="bw-onepage__dot" aria-hidden />}
      <span className="min-w-0">
        <b>{task.title}</b>
        <small>
          {[due, task.who.length ? task.who.join(", ") : null, !checkable ? firstSentence(task.detail) : null]
            .filter(Boolean)
            .join(" · ")}
        </small>
      </span>
    </li>
  );
}

const firstSentence = (text: string) => {
  const line = text.split("\n")[0] ?? "";
  const cut = line.search(/[.:](\s|$)/);
  return cut > 20 && cut < 160 ? line.slice(0, cut + 1) : line.length > 160 ? `${line.slice(0, 157)}…` : line;
};

const joinNames = (list: string[]) =>
  list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} et ${list.at(-1)}`;
