import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  Pencil,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { articles } from "@/content/articles";
import { takeQuestionDraft } from "@/lib/ferry/chat";
import { prepItems } from "@/lib/ferry/preparation";
import { companiesQuery, portsQuery, routesQuery } from "@/lib/ferry/queries";
import type { Company } from "@/lib/ferry/types";
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
import { tr } from "@/lib/i18n";

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

/**
 * Assistants IA ouverts avec la question (quand ils l'acceptent dans l'adresse) ; elle est aussi
 * copiée, pour la coller sinon. Logos : @lobehub/icons-static-svg (MIT), dans public/logos/ia.
 */
const ASSISTANTS = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    logo: "/logos/ia/openai.svg",
    url: (q: string) => `https://chatgpt.com/?q=${q}`,
  },
  {
    id: "claude",
    name: "Claude",
    logo: "/logos/ia/claude-color.svg",
    url: (q: string) => `https://claude.ai/new?q=${q}`,
  },
  {
    id: "gemini",
    name: "Gemini",
    logo: "/logos/ia/gemini-color.svg",
    url: () => "https://gemini.google.com/app",
  },
  {
    id: "lechat",
    name: "Le Chat",
    logo: "/logos/ia/mistral-color.svg",
    url: (q: string) => `https://chat.mistral.ai/chat?q=${q}`,
  },
  {
    id: "perplexity",
    name: "Perplexity",
    logo: "/logos/ia/perplexity-color.svg",
    url: (q: string) => `https://www.perplexity.ai/search?q=${q}`,
  },
  {
    id: "copilot",
    name: "Copilot",
    logo: "/logos/ia/copilot-color.svg",
    url: (q: string) => `https://copilot.microsoft.com/?q=${q}`,
  },
] as const;
type Assistant = (typeof ASSISTANTS)[number];
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
  const [aiOpen, setAiOpen] = useState(false);
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
  const hits = useMemo(
    () => (searching ? searchHelp(corpus, query) : []),
    [corpus, query, searching],
  );
  // Sans recherche : les questions de la ligne, puis les plus utiles en général.
  const featured = useMemo(() => {
    const line = corpus.filter((item) => item.source === "ligne").slice(0, 2);
    const wanted = [/arriver au port/i, /TPD/, /retard ou annul/i, /co[uû]te.*voiture/i];
    const general = wanted
      .map((pattern) => corpus.find((item) => item.source === "faq" && pattern.test(item.q)))
      .filter((item): item is HelpAnswer => Boolean(item));
    return [...line, ...general].slice(0, 5);
  }, [corpus]);
  const none = searching && hits.length === 0;
  // Sans réponse : la question reprise et les sorties, dans l'ordre, à la place de la colonne.
  const noAnswer = none && query.trim().length >= 3;

  // Une recherche sans réponse est notée (anonymement) : elle dit quelle question ajouter.
  useEffect(() => {
    if (!none || query.trim().length < 3) return;
    const timer = window.setTimeout(() => track("question-sans-reponse", query.trim()), 1500);
    return () => window.clearTimeout(timer);
  }, [none, query]);
  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const choose = (topic: string) => {
    setQuery(topic);
    input.current?.focus({ preventScroll: true });
  };
  const askTravellers = onAskTravellers
    ? () => {
        track("question-sortie", "salon");
        onAskTravellers();
      }
    : undefined;

  // Dans l'ordre : les voyageurs, la compagnie, BledWay, puis l'assistant IA.
  const exits = (ai: ReactNode) => (
    <div className="bw-help__exits">
      {askTravellers ? (
        <button type="button" className="bw-help__exit" onClick={askTravellers}>
          <span aria-hidden>
            <Users size={18} />
          </span>
          <strong>{travellersLabel}</strong>
          <small>{travellersHint}</small>
        </button>
      ) : null}
      <CompanyExit operators={operators} />
      <Link
        to="/contact"
        className="bw-help__exit"
        onClick={() => track("question-sortie", "bledway")}
      >
        <span aria-hidden>
          <Mail size={18} />
        </span>
        <strong>{tr("ui.questionHelp.ecrireABledway")}</strong>
        <small>{tr("ui.questionHelp.unSouciSurLeSite")}</small>
      </Link>
      {ai}
    </div>
  );
  const aiTile = (
    <button
      type="button"
      className="bw-help__exit bw-help__exit--ai"
      onClick={() => setAiOpen(true)}
    >
      <span aria-hidden>
        <Sparkles size={18} />
      </span>
      <strong>{tr("ui.questionHelp.monAssistantIa")}</strong>
      <small>{tr("ui.questionHelp.ecrivezVotreQuestionOnVous")}</small>
      <span className="bw-help__logos" aria-hidden>
        {ASSISTANTS.map((assistant) => (
          <img key={assistant.id} src={assistant.logo} alt="" width={18} height={18} />
        ))}
      </span>
    </button>
  );

  return (
    <section
      className={`bw-help bw-room--questions${bare ? " bw-help--bare" : ""}`}
      aria-label={tr("ui.questionHelp.uneQuestion")}
    >
      <div className="bw-help__layout" data-none={noAnswer || undefined}>
        <div className="bw-help__main">
          <header className="bw-help__head">
            <span className="bw-help__icon" aria-hidden>
              <CircleHelp size={20} />
            </span>
            <div>
              <h3>{tr("ui.questionHelp.uneQuestion")}</h3>
              <p>
                {lineLabel
                  ? `Les réponses de BledWay pour ${lineLabel}, puis les bons contacts.`
                  : tr("ui.questionHelp.lesReponsesDeBledwayPuis")}
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
              placeholder={tr("ui.questionHelp.tpdChienEspecesCabine")}
              aria-label={tr("ui.questionHelp.rechercherUneReponse")}
            />
            {query ? (
              <button type="button" onClick={() => choose("")} aria-label={tr("ui.questionHelp.effacerLaRecherche")}>
                <X size={16} aria-hidden />
              </button>
            ) : null}
          </form>

          {searching ? null : (
            <div className="bw-help__topics" role="group" aria-label={tr("ui.questionHelp.sujetsFrequents")}>
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
                : tr("ui.questionHelp.pasDeReponseToutePrete")
              : tr("ui.questionHelp.lesPlusDemandees")}
          </p>
          <AnswerList
            key={query}
            items={searching ? hits : featured}
            query={searching ? query : ""}
          />
          {noAnswer ? (
            <div className="bw-help__noanswer">
              <p className="bw-help__noanswer-lead">{tr("ui.questionHelp.votreQuestion")}</p>
              <p className="bw-help__noanswer-q">« {query.trim()} »</p>
              <p className="bw-help__noanswer-lead">{tr("ui.questionHelp.posezLaAuBonEndroit")}</p>
              {exits(
                <div className="bw-help__exit bw-help__exit--ai" data-static data-open>
                  <span aria-hidden>
                    <Sparkles size={18} />
                  </span>
                  <strong>{tr("ui.questionHelp.monAssistantIa")}</strong>
                  <small>{tr("ui.questionHelp.choisissezLeLaQuestionPart")}</small>
                  <div className="bw-help__ai-pick">
                    <AssistantPicker question={query.trim()} line={lineLabel} />
                  </div>
                </div>,
              )}
            </div>
          ) : null}
        </div>

        {noAnswer ? null : (
          <aside className="bw-help__elsewhere" data-strong={none || undefined}>
            <h4>{none ? tr("ui.questionHelp.demandezAilleursAuBonEndroit") : tr("ui.questionHelp.pasTrouveVotreReponse")}</h4>
            {exits(aiTile)}
          </aside>
        )}
      </div>

      <AssistantDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        initial={query}
        corpus={corpus}
        line={lineLabel}
        operators={operators}
        onAskTravellers={
          askTravellers
            ? () => {
                setAiOpen(false);
                askTravellers();
              }
            : undefined
        }
      />
    </section>
  );
}

/** Les réponses, dépliables une à une ; les premières, puis « voir plus ». */
function AnswerList({
  items,
  query,
  limit = PAGE,
}: {
  items: HelpAnswer[];
  query: string;
  limit?: number;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const visible = more ? items : items.slice(0, limit);
  if (!items.length) return null;
  return (
    <>
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
                    <Marked text={item.q} query={query} />
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
                    <Marked text={item.a} query={query} />
                  </p>
                  {item.from ? <small>{tr("ui.questionHelp.extraitDe")}{item.from} »</small> : null}
                  {item.href ? (
                    <a href={item.href} className="bw-help__more-link">
                      {item.hrefLabel ?? tr("ui.questionHelp.enSavoirPlus")} <ArrowRight size={14} aria-hidden />
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
      {items.length > limit && !more ? (
        <button type="button" className="bw-help__show-more" onClick={() => setMore(true)}>
          {tr("ui.questionHelp.voir")}{items.length - limit}{tr("ui.questionHelp.autre")}{items.length - limit > 1 ? "s" : ""}{tr("ui.questionHelp.reponse")}
          {items.length - limit > 1 ? "s" : ""}
        </button>
      ) : null}
    </>
  );
}

/** La compagnie : ses contacts si on les connaît, sinon la liste des compagnies. */
function CompanyExit({ operators, compact = false }: { operators: Company[]; compact?: boolean }) {
  if (!operators.length)
    return (
      <Link
        to="/compagnies"
        className={compact ? "bw-ai__other" : "bw-help__exit"}
        onClick={() => track("question-sortie", "compagnie")}
      >
        <span aria-hidden>
          <Building2 size={compact ? 15 : 18} />
        </span>
        <strong>{compact ? tr("ui.questionHelp.uneCompagnie") : tr("ui.questionHelp.uneCompagnie")}</strong>
        {compact ? null : <small>{tr("ui.questionHelp.billetModificationBagagesLeursContacts")}</small>}
      </Link>
    );
  const links = operators.map((company) => {
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
  });
  if (compact)
    return (
      <span className="bw-ai__other" data-static>
        <span aria-hidden>
          <Building2 size={15} />
        </span>
        <strong>{tr("ui.questionHelp.laCompagnie")}</strong>
        <span className="bw-help__companies">{links}</span>
      </span>
    );
  return (
    <div className="bw-help__exit" data-static>
      <span aria-hidden>
        <Building2 size={18} />
      </span>
      <strong>{tr("ui.questionHelp.laCompagnie2")}</strong>
      <small>{tr("ui.questionHelp.billetModificationBagagesRemboursement")}</small>
      <span className="bw-help__companies">{links}</span>
    </div>
  );
}

/**
 * « Mon assistant IA » : on écrit sa question tout de suite ; à la validation, BledWay montre
 * d'abord ce qu'il sait déjà, puis l'assistant au choix (avec un avertissement) et les autres contacts.
 */
function AssistantDialog({
  open,
  onOpenChange,
  initial,
  corpus,
  line,
  operators,
  onAskTravellers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: string;
  corpus: HelpAnswer[];
  line: string | null;
  operators: Company[];
  onAskTravellers?: (() => void) | undefined;
}) {
  const [text, setText] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  // À chaque ouverture : la recherche en cours reprise, et l'écriture d'abord.
  useEffect(() => {
    if (!open) return;
    setText(initial.trim());
    setAsked(null);
  }, [open, initial]);
  const hits = useMemo(() => (asked ? searchHelp(corpus, asked, 3) : []), [asked, corpus]);
  const submit = () => {
    const value = text.trim();
    if (value.length < 3) return;
    setAsked(value);
  };
  const edit = () => {
    setAsked(null);
    window.setTimeout(() => area.current?.focus(), 30);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bw-ai max-w-none"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          area.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="bw-ai__title">
            <Sparkles size={18} aria-hidden />{tr("ui.questionHelp.demanderAMonAssistantIa")}
          </DialogTitle>
          <p className="bw-ai__intro">
            {asked
              ? tr("ui.questionHelp.voiciDAbordCeQue")
              : tr("ui.questionHelp.ecrivezVotreQuestionBledwayVerifie")}
          </p>
        </DialogHeader>

        {asked ? (
          <div className="bw-ai__body">
            <div className="bw-ai__asked">
              <p>
                <small>{tr("ui.questionHelp.votreQuestion")}</small>
                {asked}
              </p>
              <button type="button" onClick={edit}>
                <Pencil size={14} aria-hidden />{tr("ui.questionHelp.modifier")}
              </button>
            </div>

            <section className="bw-ai__section">
              <h4>
                <CircleHelp size={16} aria-hidden />{tr("ui.questionHelp.ceQueBledwaySaitDeja")}
              </h4>
              {hits.length ? (
                <AnswerList items={hits} query={asked} limit={3} />
              ) : (
                <p className="bw-ai__none">
                  {tr("ui.questionHelp.pasDeReponseToutePrete2")}
                </p>
              )}
            </section>

            <section className="bw-ai__section">
              <h4>
                <Sparkles size={16} aria-hidden />
                {hits.length ? tr("ui.questionHelp.toujoursUneQuestionVotreAssistant") : tr("ui.questionHelp.votreAssistantIa")}
              </h4>
              <AssistantPicker question={asked} line={line} />
            </section>

            <section className="bw-ai__section">
              <h4>{tr("ui.questionHelp.ouBien")}</h4>
              <div className="bw-ai__others">
                {onAskTravellers ? (
                  <button type="button" className="bw-ai__other" onClick={onAskTravellers}>
                    <span aria-hidden>
                      <Users size={15} />
                    </span>
                    <strong>{tr("ui.questionHelp.demanderAuxVoyageurs")}</strong>
                  </button>
                ) : null}
                <CompanyExit operators={operators} compact />
                <Link
                  to="/contact"
                  className="bw-ai__other"
                  onClick={() => track("question-sortie", "bledway")}
                >
                  <span aria-hidden>
                    <Mail size={15} />
                  </span>
                  <strong>{tr("ui.questionHelp.ecrireABledway")}</strong>
                </Link>
              </div>
            </section>
          </div>
        ) : (
          <form
            className="bw-ai__form"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <textarea
              ref={area}
              value={text}
              rows={3}
              maxLength={400}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder={tr("ui.questionHelp.exPeutOnEmbarquerUne")}
              aria-label={tr("ui.questionHelp.votreQuestion")}
            />
            <div className="bw-ai__form-foot">
              <span className="bw-help__logos" aria-hidden>
                {ASSISTANTS.map((assistant) => (
                  <img key={assistant.id} src={assistant.logo} alt="" width={20} height={20} />
                ))}
              </span>
              <button type="submit" disabled={text.trim().length < 3}>
                {tr("ui.questionHelp.validerMaQuestion")}<ArrowRight size={16} aria-hidden />
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Les assistants IA, le préféré d'abord : un toucher ouvre l'assistant avec la question (et le
 * trajet), copiée aussi pour la coller si l'assistant ne la reprend pas.
 */
function AssistantPicker({ question, line }: { question: string; line: string | null }) {
  const [preferred, setPreferred] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => setPreferred(readPreferred()), []);
  useEffect(() => setCopied(null), [question]);
  const ordered = [...ASSISTANTS].sort(
    (a, b) => Number(b.id === preferred) - Number(a.id === preferred),
  );
  const ask = (assistant: Assistant) => {
    const prompt = assistantPrompt(question, line);
    try {
      window.localStorage.setItem(PREFERRED_KEY, assistant.id);
    } catch {
      /* préférence facultative */
    }
    setPreferred(assistant.id);
    void navigator.clipboard?.writeText(prompt).then(
      () => setCopied(assistant.name),
      () => undefined,
    );
    track("question-sortie", `ia:${assistant.id}`);
    window.open(assistant.url(encodeURIComponent(prompt)), "_blank", "noopener,noreferrer");
  };
  return (
    <>
      <div className="bw-ai__grid">
        {ordered.map((assistant) => (
          <button
            key={assistant.id}
            type="button"
            className="bw-ai__assistant"
            data-preferred={assistant.id === preferred || undefined}
            onClick={() => ask(assistant)}
          >
            <img src={assistant.logo} alt="" width={28} height={28} />
            <strong>{assistant.name}</strong>
            {assistant.id === preferred ? <small>{tr("ui.questionHelp.votreAssistant")}</small> : null}
            <ExternalLink size={13} aria-hidden />
          </button>
        ))}
      </div>
      {copied ? (
        <p className="bw-ai__copied" role="status">
          <Copy size={13} aria-hidden />{tr("ui.questionHelp.questionCopieeAvecVotreTrajet")}{copied}{tr("ui.questionHelp.neLAffichePasCollez")}
        </p>
      ) : null}
      <p className="bw-ai__warning">
        {tr("ui.questionHelp.reponseNonVerifieeParBledway")}
      </p>
    </>
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
