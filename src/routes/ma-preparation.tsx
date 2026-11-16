import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  Car,
  ClipboardList,
  Download,
  FileText,
  Lock,
  Luggage,
  Mail,
  MapPin,
  Share2,
  Ship,
  Users,
} from "lucide-react";
import {
  FORMALITES_CHECKED,
  tasksFor,
  totalCost,
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
  groupWho,
  isCheckable,
  planCategory,
  planCategoryLabels,
  planCategoryOrder,
  type PlanCategory,
} from "@/lib/papers/planCategories";
import {
  answersOf,
  createShare,
  currentPreparation,
  loadShare,
  type SharedPreparation,
} from "@/lib/prepare/share";
import { useAuth } from "@/hooks/useAuth";

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
  // Lien reçu (?s=…) : la préparation partagée, lisible seulement par l'adresse invitée.
  // Sinon : celle de cet appareil, avec de quoi la partager.
  const [shareId, setShareId] = useState<string | null>(null);
  const [own, setOwn] = useState<SharedPreparation | null>(null);
  const [ready, setReady] = useState(false);
  const { user, loading } = useAuth();
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("s");
    if (id && /^[a-z0-9]{6,32}$/i.test(id)) setShareId(id);
    else setOwn(currentPreparation());
    setReady(true);
  }, []);
  const shared = useQuery({
    queryKey: ["prep-share", shareId, user?.id],
    queryFn: () => loadShare(shareId!),
    enabled: Boolean(shareId && user),
  });

  if (!ready || (shareId && (loading || (user && shared.isLoading))))
    return <div className="bw-onepage-wrap" />;
  if (shareId && !user)
    return (
      <Empty
        title="Une préparation de voyage a été partagée avec vous"
        text="Pour la protéger, seule l'adresse e-mail invitée peut l'ouvrir. Connectez-vous (ou créez un compte gratuit) avec cette adresse."
        cta={{
          href: `/auth?next=${encodeURIComponent(`/ma-preparation?s=${shareId}`)}`,
          label: "Me connecter pour la voir",
        }}
        locked
      />
    );
  if (shareId && !shared.data)
    return (
      <Empty
        title="Cette préparation ne vous est pas ouverte"
        text={`Elle est réservée aux adresses invitées, et vous êtes connecté avec ${user?.email ?? "un autre compte"}. Demandez à la personne qui l'a partagée d'ajouter cette adresse, ou connectez-vous avec la bonne. Un partage expire aussi au bout de 4 mois.`}
        cta={{ href: "/preparer-mon-voyage", label: "Préparer mon propre voyage" }}
        locked
      />
    );
  const prep = shareId ? shared.data! : own;
  if (!prep)
    return (
      <Empty
        title="Aucune préparation à afficher"
        text="La préparation n'a pas encore commencé sur cet appareil."
        cta={{ href: "/preparer-mon-voyage", label: "Préparer mon voyage" }}
      />
    );
  return <OnePage prep={prep} mine={!shareId} />;
}

function Empty({
  title,
  text,
  cta,
  locked = false,
}: {
  title: string;
  text: string;
  cta: { href: string; label: string };
  locked?: boolean;
}) {
  return (
    <div className="bw-onepage-wrap">
      <div className="bw-onepage bw-onepage--empty">
        <img src="/bledway-brand-entete.webp" alt="BledWay" className="h-9 w-auto" />
        {locked ? <Lock size={22} className="text-primary" aria-hidden /> : null}
        <h1>{title}</h1>
        <p>{text}</p>
        <a href={cta.href} className="bw-onepage__cta">
          {cta.label}
        </a>
      </div>
    </div>
  );
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Partager avec une ou plusieurs adresses : seules elles pourront ouvrir le lien. */
function SharePanel({ prep, title }: { prep: SharedPreparation; title: string }) {
  const { user } = useAuth();
  const [emails, setEmails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (!user)
    return (
      <div className="bw-onepage__sharebox">
        <p>
          <Lock size={15} className="shrink-0" aria-hidden />
          <span>
            Pour partager,{" "}
            <a href={`/auth?next=${encodeURIComponent("/ma-preparation")}`}>connectez-vous</a> : le
            lien ne s'ouvrira que pour les adresses que vous invitez.
          </span>
        </p>
      </div>
    );
  const list = emails
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter((e) => EMAIL.test(e));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!list.length) return;
    setState("sending");
    try {
      setUrl(await createShare(prep, list));
      setState("idle");
    } catch {
      setState("error");
    }
  };
  const send = async () => {
    if (!url) return;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title, text: `${title} : préparé avec BledWay`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* partage annulé */
    }
  };
  if (url)
    return (
      <div className="bw-onepage__sharebox">
        <p>
          <Lock size={15} aria-hidden /> Lien prêt, réservé à <b>{list.join(", ")}</b>.
        </p>
        <code>{url}</code>
        <span className="flex flex-wrap gap-2">
          <button type="button" onClick={send} className="bw-onepage__btn bw-onepage__btn--main">
            <Share2 size={16} aria-hidden /> {copied ? "Lien copié" : "Envoyer le lien"}
          </button>
          <a
            className="bw-onepage__btn"
            href={`mailto:${list.join(",")}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`Je t'ai préparé le voyage sur BledWay. Connecte-toi avec cette adresse pour le voir : ${url}`)}`}
          >
            <Mail size={16} aria-hidden /> Par e-mail
          </a>
        </span>
      </div>
    );
  return (
    <form className="bw-onepage__sharebox" onSubmit={submit}>
      <label htmlFor="share-emails">
        <Lock size={15} aria-hidden /> Partager avec (seules ces adresses pourront l'ouvrir)
      </label>
      <span className="flex gap-2">
        <input
          id="share-emails"
          type="text"
          inputMode="email"
          autoComplete="email"
          placeholder="adresse@exemple.fr"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
        />
        <button
          type="submit"
          disabled={!list.length || state === "sending"}
          className="bw-onepage__btn bw-onepage__btn--main"
        >
          <Share2 size={16} aria-hidden /> Partager
        </button>
      </span>
      {state === "error" ? <small>Le partage n'a pas pu être créé. Réessayez.</small> : null}
    </form>
  );
}

function OnePage({ prep, mine }: { prep: SharedPreparation; mine: boolean }) {
  // Venu du récap des papiers : le retour y ramène directement.
  const [fromRecap, setFromRecap] = useState(false);
  useEffect(() => {
    setFromRecap(new URLSearchParams(window.location.search).get("retour") === "papiers");
  }, []);
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
  const childNames = answers.travellers
    .filter((t) => t.kind === "child")
    .map((t) => travellerLabel(t, answers.travellers));

  const groups = planCategoryOrder.map((category) => ({
    category,
    items: tasks.filter((t) => planCategory(t) === category),
  }));
  const toDo = tasks.filter((t) => ["steps", "documents"].includes(planCategory(t))).length;
  const toTake = tasks.filter((t) => planCategory(t) === "pack").length;
  const fees = totalCost(tasks);

  const due = (when: When) =>
    when === "first" ? "Dès maintenant" : (deadlines[when]?.label ?? whenLabels[when].title);

  return (
    <div className="bw-onepage-wrap">
      <div className="bw-onepage__bar" role="toolbar" aria-label="Actions">
        <a href={mine && fromRecap ? "/preparer-mon-voyage?etape=papers" : "/preparer-mon-voyage"} className="bw-onepage__back">
          {mine ? (fromRecap ? "← Revenir au récap des papiers" : "← Revenir à ma préparation") : "Préparer mon propre voyage"}
        </a>
        <button type="button" onClick={() => window.print()} className="bw-onepage__btn bw-onepage__btn--main">
          <Download size={16} aria-hidden /> PDF
        </button>
      </div>
      {mine ? (
        <SharePanel
          prep={prep}
          title={named.length ? `Le voyage de ${joinNames(named)}` : "Notre voyage au bled"}
        />
      ) : null}

      <article className="bw-onepage">
        <header className="bw-onepage__head">
          <img src="/bledway-brand-entete.webp" alt="BledWay" className="bw-onepage__logo" />
          <div className="min-w-0">
            <p className="bw-onepage__kicker">Préparation du voyage au bled</p>
            <h1>{named.length ? `Le voyage de ${joinNames(named)}` : "Notre voyage en Algérie"}</h1>
          </div>
          <div className="bw-onepage__score">
            <b>{toDo}</b>
            <small>démarche{toDo > 1 ? "s" : ""}</small>
            {toTake ? <small>{toTake} à emporter</small> : null}
            {fees ? <small>{fees} € de frais</small> : null}
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
                        who={groupWho(task.who, childNames)}
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
            {" · "}
            <a href={consulat.rdv ?? consulat.site} target="_blank" rel="noreferrer">
              {consulat.rdv ? "Prendre rendez-vous" : "Site du consulat"}
            </a>
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
  who,
}: {
  task: Task;
  checkable: boolean;
  done: boolean;
  due: string | null;
  who: string[];
}) {
  return (
    <li data-done={done || undefined}>
      {checkable ? <span className="bw-onepage__box" aria-label={done ? "Fait" : "À faire"}>{done ? "✓" : ""}</span> : <span className="bw-onepage__dot" aria-hidden />}
      <span className="min-w-0">
        <b>{task.title}</b>
        <small>
          {[due, who.length ? who.join(", ") : null, task.cost?.label ?? null, !checkable ? firstSentence(task.detail) : null]
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
