import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Building2,
  ChevronDown,
  CircleHelp,
  Copy,
  ExternalLink,
  Mail,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { articles } from "@/content/articles";
import { takeQuestionDraft } from "@/lib/ferry/chat";
import { prepItems } from "@/lib/ferry/preparation";
import { companiesQuery, portsQuery, routesQuery } from "@/lib/ferry/queries";
import {
  SOURCE_LABELS,
  assistantPrompt,
  buildCorpus,
  highlightParts,
  searchHelp,
  type HelpAnswer,
} from "@/lib/questions/search";
import { generalFaq, lineFaq } from "@/lib/seo/answers";
import { track } from "@/lib/usage";
import { safeExternalUrl } from "@/components/panel/shared";

/** Les sujets qu'on cherche le plus : un toucher remplit la recherche. */
const TOPICS = [
  "Papiers et TPD",
  "Heure d'arrivée au port",
  "Prix avec voiture",
  "Espèces et devises",
  "Voyager avec des enfants",
  "Animaux",
  "Cabine ou fauteuil",
  "Retard ou annulation",
];

/** Assistants IA ouverts avec la question (s'ils l'acceptent dans l'adresse), sinon question copiée. */
const ASSISTANTS = [
  { id: "chatgpt", name: "ChatGPT", url: (q: string) => `https://chatgpt.com/?q=${q}` },
  { id: "claude", name: "Claude", url: (q: string) => `https://claude.ai/new?q=${q}` },
  { id: "gemini", name: "Gemini", url: () => "https://gemini.google.com/app" },
  { id: "lechat", name: "Le Chat", url: (q: string) => `https://chat.mistral.ai/chat?q=${q}` },
  { id: "perplexity", name: "Perplexity", url: (q: string) => `https://www.perplexity.ai/search?q=${q}` },
  { id: "copilot", name: "Copilot", url: (q: string) => `https://copilot.microsoft.com/?q=${q}` },
] as const;
const PREFERRED_KEY = "bledway:assistant:v1";
const readPreferred = () => {
  try {
    return window.localStorage.getItem(PREFERRED_KEY);
  } catch {
    return null;
  }
};

const PAGE = 5;

/**
 * « Une question ? » : on cherche d'abord dans ce que BledWay sait (questions fréquentes, guide,
 * préparation), puis, sans réponse, on oriente : les voyageurs du salon, la compagnie, BledWay,
 * ou l'assistant IA du voyageur. Pas d'espace de questions à part : la communauté vit dans les salons.
 */
export function QuestionHelp({
  routeId,
  companyId,
  onAskTravellers,
  travellersLabel = "Demander aux voyageurs",
  travellersHint = "Ceux qui font la traversée répondent dans le salon.",
  autoFocus = false,
  bare = false,
}: {
  /** La ligne regardée : ses réponses passent en tête, ses compagnies sont proposées. */
  routeId?: string | undefined;
  /** La compagnie de la traversée, si on la connaît. */
  companyId?: string | null | undefined;
  /** Le salon où poser la question aux voyageurs (absent : la sortie n'est pas proposée). */
  onAskTravellers?: (() => void) | undefined;
  travellersLabel?: string;
  travellersHint?: string;
  autoFocus?: boolean;
  /** Dans une fenêtre : sans carte autour. */
  bare?: boolean;
}) {
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  // Venu du salon d'un port (« posez plutôt votre question ») : la question est déjà là.
  const [query, setQuery] = useState(() => (routeId ? takeQuestionDraft(routeId) : ""));
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [askAi, setAskAi] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const route = routes.find((item) => item.id === routeId);
  const from = ports.find((port) => port.id === route?.departure_port_id);
  const to = ports.find((port) => port.id === route?.arrival_port_id);
  const lineLabel = from && to ? `${from.name} → ${to.name}` : null;
  const operators = companies.filter((company) =>
    companyId ? company.id === companyId : Boolean(route?.company_ids.includes(company.id)),
  );

  const corpus = useMemo(
    () =>
      buildCorpus({
        line:
          route && from && to
            ? lineFaq({
                from: from.name,
                to: to.name,
                fromSlug: from.slug,
                toSlug: to.slug,
                minutes: route.typical_duration_minutes,
                operators: operators.map((company) => company.name),
                hasReverse: routes.some(
                  (item) =>
                    item.departure_port_id === route.arrival_port_id &&
                    item.arrival_port_id === route.departure_port_id,
                ),
              })
            : [],
        general: ports.length ? generalFaq(ports, routes, companies) : [],
        articles,
        prep: prepItems,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route?.id, from?.id, to?.id, ports, routes, companies, operators.length],
  );

  const searching = query.trim().length > 1;
  const hits = useMemo(() => (searching ? searchHelp(corpus, query) : []), [corpus, query, searching]);
  // Sans recherche : les questions de la ligne, puis les plus utiles en général.
  const featured = useMemo(() => {
    const line = corpus.filter((item) => item.source === "ligne").slice(0, 2);
    const wanted = [/arriver au port/i, /TPD/, /retard ou annul/i, /co[uû]te.*voiture/i];
    const general = wanted
      .map((pattern) => corpus.find((item) => item.source === "faq" && pattern.test(item.q)))
      .filter((item): item is HelpAnswer => Boolean(item));
    return [...line, ...general].slice(0, 5);
  }, [corpus]);
  const list = searching ? hits : featured;
  const visible = more ? list : list.slice(0, PAGE);
  const none = searching && hits.length === 0;

  // Une recherche sans réponse est notée (anonymement) : elle dit quelle question ajouter.
  useEffect(() => {
    if (!none || query.trim().length < 3) return;
    const timer = window.setTimeout(() => track("question-sans-reponse", query.trim()), 1500);
    return () => window.clearTimeout(timer);
  }, [none, query]);
  useEffect(() => {
    setMore(false);
    setOpen(null);
  }, [query]);
  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const choose = (topic: string) => {
    setQuery(topic);
    input.current?.focus({ preventScroll: true });
  };

  return (
    <section
      className={`bw-help bw-room--questions${bare ? " bw-help--bare" : ""}`}
      aria-label="Une question ?"
    >
      <header className="bw-help__head">
        <span className="bw-help__icon" aria-hidden>
          <CircleHelp size={20} />
        </span>
        <div>
          <h3>Une question ?</h3>
          <p>
            {lineLabel
              ? `Les réponses de BledWay pour ${lineLabel}, puis les bons contacts.`
              : "Les réponses de BledWay, puis les bons contacts si besoin."}
          </p>
        </div>
      </header>

      <form
        className="bw-help__search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          input.current?.blur();
        }}
      >
        <Search size={18} aria-hidden />
        <input
          ref={input}
          type="search"
          enterKeyHint="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="TPD, chien, espèces, cabine…"
          aria-label="Rechercher une réponse"
        />
        {query ? (
          <button type="button" onClick={() => choose("")} aria-label="Effacer la recherche">
            <X size={16} aria-hidden />
          </button>
        ) : null}
      </form>

      {searching ? null : (
        <div className="bw-help__topics" role="group" aria-label="Sujets fréquents">
          {TOPICS.map((topic) => (
            <button key={topic} type="button" onClick={() => choose(topic)}>
              {topic}
            </button>
          ))}
        </div>
      )}

      <p className="bw-help__count" aria-live="polite">
        {searching
          ? hits.length
            ? `${hits.length} réponse${hits.length > 1 ? "s" : ""}`
            : `Aucune réponse toute prête pour « ${query.trim()} »`
          : "Les plus demandées"}
      </p>

      {visible.length ? (
        <ul className="bw-help__list">
          {visible.map((item) => {
            const expanded = open === item.id;
            return (
              <li key={item.id} data-open={expanded || undefined}>
                <button
                  type="button"
                  className="bw-help__q"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : item.id)}
                >
                  <span>
                    <span className="bw-help__qt">
                      <Marked text={item.q} query={searching ? query : ""} />
                    </span>
                    <small data-source={item.source}>
                      {item.source === "guide" ? <BookOpen size={11} aria-hidden /> : null}
                      {SOURCE_LABELS[item.source]}
                    </small>
                  </span>
                  <ChevronDown size={18} aria-hidden />
                </button>
                {expanded ? (
                  <div className="bw-help__a">
                    <p>
                      <Marked text={item.a} query={searching ? query : ""} />
                    </p>
                    {item.from ? <small>Extrait de « {item.from} »</small> : null}
                    {item.href ? (
                      <a href={item.href} className="bw-help__more-link">
                        {item.hrefLabel ?? "En savoir plus"} <ArrowRight size={14} aria-hidden />
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <p className="bw-help__peek">{item.a}</p>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {list.length > PAGE && !more ? (
        <button type="button" className="bw-help__show-more" onClick={() => setMore(true)}>
          Voir {list.length - PAGE} autre{list.length - PAGE > 1 ? "s" : ""} réponse
          {list.length - PAGE > 1 ? "s" : ""}
        </button>
      ) : null}

      <div className="bw-help__elsewhere" data-strong={none || undefined}>
        <h4>{none ? "Demandez ailleurs, au bon endroit" : "Pas trouvé votre réponse ?"}</h4>
        <div className="bw-help__exits">
          {onAskTravellers ? (
            <button
              type="button"
              className="bw-help__exit"
              onClick={() => {
                track("question-sortie", "salon");
                onAskTravellers();
              }}
            >
              <span aria-hidden>
                <Users size={18} />
              </span>
              <strong>{travellersLabel}</strong>
              <small>{travellersHint}</small>
            </button>
          ) : null}
          {operators.length ? (
            <div className="bw-help__exit" data-static>
              <span aria-hidden>
                <Building2 size={18} />
              </span>
              <strong>La compagnie</strong>
              <small>Billet, modification, bagages, remboursement.</small>
              <span className="bw-help__companies">
                {operators.map((company) => {
                  const href =
                    safeExternalUrl(company.contact_url) ??
                    safeExternalUrl(company.booking_url) ??
                    safeExternalUrl(company.website_url);
                  return href ? (
                    <a
                      key={company.id}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => track("question-sortie", "compagnie")}
                    >
                      {company.name} <ExternalLink size={12} aria-hidden />
                    </a>
                  ) : (
                    <Link key={company.id} to="/compagnies">
                      {company.name}
                    </Link>
                  );
                })}
              </span>
            </div>
          ) : (
            <Link
              to="/compagnies"
              className="bw-help__exit"
              onClick={() => track("question-sortie", "compagnie")}
            >
              <span aria-hidden>
                <Building2 size={18} />
              </span>
              <strong>Une compagnie</strong>
              <small>Billet, modification, bagages : leurs contacts.</small>
            </Link>
          )}
          <Link
            to="/contact"
            className="bw-help__exit"
            onClick={() => track("question-sortie", "bledway")}
          >
            <span aria-hidden>
              <Mail size={18} />
            </span>
            <strong>Écrire à BledWay</strong>
            <small>Un souci sur le site, une info à corriger.</small>
          </Link>
          <button
            type="button"
            className="bw-help__exit"
            aria-expanded={askAi}
            onClick={() => setAskAi((value) => !value)}
          >
            <span aria-hidden>
              <Sparkles size={18} />
            </span>
            <strong>Mon assistant IA</strong>
            <small>ChatGPT, Claude, Gemini… celui que vous utilisez.</small>
          </button>
        </div>
        {askAi ? <AssistantChooser query={query} line={lineLabel} /> : null}
      </div>
    </section>
  );
}

/** Le texte, mots trouvés surlignés. */
function Marked({ text, query }: { text: string; query: string }) {
  const parts = useMemo(() => highlightParts(text, query), [text, query]);
  return (
    <>
      {parts.map((part, index) =>
        part.hit ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>,
      )}
    </>
  );
}

/** Le choix de l'assistant : il s'ouvre avec la question et le trajet, après un avertissement. */
function AssistantChooser({ query, line }: { query: string; line: string | null }) {
  const [preferred, setPreferred] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => setPreferred(readPreferred()), []);
  const question = query.trim();
  const prompt = assistantPrompt(question || "…", line);
  const ordered = [...ASSISTANTS].sort(
    (a, b) => Number(b.id === preferred) - Number(a.id === preferred),
  );
  const open = (assistant: (typeof ASSISTANTS)[number]) => {
    try {
      window.localStorage.setItem(PREFERRED_KEY, assistant.id);
    } catch {
      /* préférence facultative */
    }
    setPreferred(assistant.id);
    // Copiée aussi : si l'assistant ne la reprend pas, il suffit de la coller.
    void navigator.clipboard?.writeText(prompt).then(
      () => setCopied(assistant.name),
      () => undefined,
    );
    track("question-sortie", `ia:${assistant.id}`);
    window.open(assistant.url(encodeURIComponent(prompt)), "_blank", "noopener,noreferrer");
  };
  return (
    <div className="bw-help__ai">
      <p className="bw-help__ai-warning">
        Réponse non vérifiée par BledWay : pour la douane, les papiers ou un billet, confirmez
        auprès de la source officielle ou de la compagnie. Votre question part chez l'assistant
        choisi.
      </p>
      {question ? null : (
        <p className="bw-help__ai-empty">Écrivez d'abord votre question dans la recherche.</p>
      )}
      <div className="bw-help__ai-list">
        {ordered.map((assistant) => (
          <button
            key={assistant.id}
            type="button"
            disabled={!question}
            data-preferred={assistant.id === preferred || undefined}
            onClick={() => open(assistant)}
          >
            {assistant.name}
            {assistant.id === preferred ? <small>votre assistant</small> : null}
            <ExternalLink size={12} aria-hidden />
          </button>
        ))}
      </div>
      {copied ? (
        <p className="bw-help__ai-copied" role="status">
          <Copy size={13} aria-hidden /> Question copiée : si {copied} ne l'affiche pas, collez-la.
        </p>
      ) : null}
    </div>
  );
}
