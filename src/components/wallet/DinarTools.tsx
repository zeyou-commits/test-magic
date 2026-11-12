import { useEffect, useRef, useState } from "react";
import { Calculator, Car, Mic, Minus, Plus, Scale, Store, X } from "lucide-react";
import { SPOKEN_EXAMPLES, parseSpoken, saidAs } from "@/lib/wallet/jargon";
import {
  PLAN_STYLES,
  POCKET_VALUES,
  defaultPlan,
  perDayLeft,
  planBudget,
  pocketTotal,
  roundUpTo,
  sanitizePlan,
  type StayPlan,
} from "@/lib/wallet/plan";
import type { Currency, Rate } from "@/lib/wallet/wallet";
import { tr } from "@/lib/i18n";

const PLAN_KEY = "bledway:dinars-plan:v1";
const POCKET_KEY = "bledway:dinars-poche:v1";

const da = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} DA`;
const cur = (value: number, currency: Currency) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const day = (date: string | null | undefined) =>
  date ? new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "date inconnue";

function readJson(key: string) {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "null") as unknown;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage facultatif */
  }
}

/** Ce que rapportent 100 € (ou la devise choisie) à chaque taux, avec la date de chaque relevé. */
export function RateCompare({ rate, currency }: { rate: Rate | undefined; currency: Currency }) {
  if (!rate?.official || !rate.parallel) return null;
  const official = rate.official * 100;
  const parallel = rate.parallel * 100;
  return (
    <section className="bw-dz-compare" aria-label={`Ce que rapportent 100 ${currency}`}>
      <h2>
        <Scale size={16} aria-hidden />{tr("ui.dinarTools.pour100")}{currency}
      </h2>
      <div>
        <p>
          <small>{tr("ui.dinarTools.tauxOfficiel")}</small>
          <b>{da(official)}</b>
          <span>{tr("ui.dinarTools.releveDu")}{day(rate.officialDate)}</span>
        </p>
        <p data-best>
          <small>{tr("ui.dinarTools.marcheParallele")}</small>
          <b>{da(parallel)}</b>
          <span>{tr("ui.dinarTools.repereDu")}{day(rate.parallelDate)}</span>
        </p>
      </div>
      <strong>
        {tr("ui.dinarTools.ecart")}{da(parallel - official)} (× {(parallel / official).toLocaleString("fr-FR", { maximumFractionDigits: 2 })})
      </strong>
      <em>{tr("ui.dinarTools.repereIndicatifBledwayNEncourage")}</em>
    </section>
  );
}

/** « Combien je change ? » : durée, voyageurs, voiture et style donnent un montant à changer. */
export function StayPlanner({ rate, currency }: { rate: Rate | undefined; currency: Currency }) {
  const [plan, setPlan] = useState<StayPlan>(defaultPlan);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Lien « Prévoir mes dinars » du simulateur de route : la route depuis le port est déjà connue.
    const params = new URLSearchParams(window.location.search);
    const stored = sanitizePlan(readJson(PLAN_KEY) ?? {});
    if (params.get("plan") === "1") {
      setPlan(
        sanitizePlan({
          ...stored,
          km: params.get("km") ?? stored.km,
          adults: params.get("adults") ?? stored.adults,
          children: params.get("children") ?? stored.children,
          car: true,
        }),
      );
    } else setPlan(stored);
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) writeJson(PLAN_KEY, plan);
  }, [plan, ready]);
  const set = (patch: Partial<StayPlan>) => setPlan((current) => sanitizePlan({ ...current, ...patch }));
  const { lines, total } = planBudget(plan);
  const number = (key: "days" | "adults" | "children" | "km" | "gifts" | "fuelPrice", label: string, step = 1) => (
    <label>
      {label}
      <input
        inputMode="numeric"
        type="number"
        min={0}
        step={step}
        value={plan[key]}
        onChange={(event) => set({ [key]: event.target.value } as Partial<StayPlan>)}
      />
    </label>
  );
  return (
    <section className="bw-dz-plan" aria-labelledby="dz-plan-title">
      <h2 id="dz-plan-title">
        <Calculator size={18} aria-hidden />{tr("ui.dinarTools.combienJeChange")}
      </h2>
      <p className="bw-dz-plan__intro">{tr("ui.dinarTools.votreSejourEnQuelquesReglages")}</p>
      <div className="bw-dz-plan__grid">
        {number("days", "Jours sur place")}
        {number("adults", "Adultes")}
        {number("children", "Enfants")}
      </div>
      <div className="bw-dz-plan__styles" role="group" aria-label={tr("ui.dinarTools.trainDeVie")}>
        {PLAN_STYLES.map((style) => (
          <button key={style.id} type="button" aria-pressed={plan.style === style.id} onClick={() => set({ style: style.id })}>
            {style.label}
          </button>
        ))}
      </div>
      <div className="bw-dz-plan__grid">
        <label className="bw-dz-plan__toggle">
          <input type="checkbox" checked={plan.car} onChange={(event) => set({ car: event.target.checked })} />
          <Car size={15} aria-hidden />{tr("ui.dinarTools.enVoiture")}
        </label>
        {plan.car ? number("km", "Km port → maison", 10) : null}
        {number("gifts", "Cadeaux (DA)", 1000)}
      </div>
      <div className="bw-dz-plan__result" aria-live="polite">
        <small>{tr("ui.dinarTools.ilVousFautEnviron")}</small>
        <strong>{da(total)}</strong>
        {rate?.parallel ? (
          <span>
            {tr("ui.dinarTools.soit")}<b>{cur(roundUpTo(total / rate.parallel), currency)}</b>{tr("ui.dinarTools.aChangerAuTauxParallele")}
            {rate.official ? <> ({cur(roundUpTo(total / rate.official), currency)}{tr("ui.dinarTools.auTauxOfficiel")}</> : null}
          </span>
        ) : rate?.official ? (
          <span>
            {tr("ui.dinarTools.soit")}<b>{cur(roundUpTo(total / rate.official), currency)}</b>{tr("ui.dinarTools.auTauxOfficiel2")}
          </span>
        ) : null}
      </div>
      <ul className="bw-dz-plan__lines">
        {lines.map((line) => (
          <li key={line.id}>
            <span>{line.label}</span>
            <b>{da(line.dinars)}</b>
          </li>
        ))}
      </ul>
      <details className="bw-dz-plan__more">
        <summary>{tr("ui.dinarTools.ajusterLesReperes")}</summary>
        <div className="bw-dz-plan__grid">{number("fuelPrice", "Essence (DA le litre)")}</div>
        <p>
          {tr("ui.dinarTools.reperesBledwayParAdulteEt")}
        </p>
      </details>
    </section>
  );
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
const recognitionClass = () =>
  typeof window === "undefined"
    ? null
    : ((window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition ??
      null);

/** Un prix entendu (« khamsa alaf », « 3 melyoun ») ou des chiffres → dinars. */
export function heardToDinars(text: string) {
  const digits = text.replace(/\s/g, "");
  if (/^\d+([.,]\d+)?$/.test(digits)) return Math.round(Number(digits.replace(",", ".")));
  return parseSpoken(text);
}

/** Mode « au souk » : un énorme chiffre lisible d'un coup d'œil, le prix dicté ou tapé. */
export function SoukMode({
  rate,
  currency,
  basis,
  onClose,
}: {
  rate: number | null;
  currency: Currency;
  basis: string;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const Speech = recognitionClass();
  const dinars = heardToDinars(text);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", close);
      document.body.style.overflow = "";
      recognition.current?.stop();
    };
  }, []);
  const listen = () => {
    if (!Speech) return;
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const engine = new Speech();
    engine.lang = "fr-FR";
    engine.interimResults = false;
    engine.maxAlternatives = 3;
    engine.onresult = (event) => {
      const options = Array.from(event.results[0] ?? []).map((alternative) => alternative.transcript);
      setText(options.find((option) => heardToDinars(option)) ?? options[0] ?? "");
    };
    engine.onend = () => setListening(false);
    engine.onerror = () => setListening(false);
    recognition.current = engine;
    setListening(true);
    engine.start();
  };
  return (
    <div className="bw-souk" role="dialog" aria-modal="true" aria-label={tr("ui.dinarTools.modeAuSouk")}>
      <button type="button" className="bw-souk__close" aria-label={tr("ui.dinarTools.fermerLeModeAuSouk")} onClick={onClose}>
        <X size={26} aria-hidden />
      </button>
      <p className="bw-souk__hint">
        <Store size={16} aria-hidden />{tr("ui.dinarTools.onVousAnnonceUnPrix")}
      </p>
      <div className="bw-souk__big" aria-live="polite">
        {dinars ? (
          <>
            <strong>{da(dinars)}</strong>
            {rate ? <span>≈ {cur(dinars / rate, currency)}</span> : null}
            {saidAs(dinars) ? <em>« {saidAs(dinars)} »</em> : null}
          </>
        ) : (
          <span className="bw-souk__empty">{text ? tr("ui.dinarTools.pasComprisEssayez3Melyoun") : "—"}</span>
        )}
      </div>
      <div className="bw-souk__entry">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={tr("ui.dinarTools.khamsaAlaf3Melyoun2500")}
          aria-label={tr("ui.dinarTools.lePrixEntendu")}
          autoComplete="off"
        />
        {Speech ? (
          <button type="button" aria-pressed={listening} aria-label={listening ? tr("ui.dinarTools.arreterLEcoute") : tr("ui.dinarTools.dicterLePrix")} onClick={listen}>
            <Mic size={24} aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="bw-souk__chips" role="group" aria-label={tr("ui.dinarTools.prixCourants")}>
        {SPOKEN_EXAMPLES.slice(1).map((item) => (
          <button key={item.said} type="button" onClick={() => setText(item.said)}>
            {item.said}
          </button>
        ))}
      </div>
      <small className="bw-souk__basis">{tr("ui.dinarTools.conversion")}{basis}{tr("ui.dinarTools.laDicteeComprendMieuxLes")}</small>
    </div>
  );
}

/** Les billets en poche : combien j'ai vraiment, et combien par jour jusqu'au retour. */
export function PocketCount({ left, started }: { left: number; started: boolean }) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [daysLeft, setDaysLeft] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const raw = readJson(POCKET_KEY) as { counts?: Record<number, number>; daysLeft?: string } | null;
    if (raw?.counts && typeof raw.counts === "object") setCounts(raw.counts);
    if (typeof raw?.daysLeft === "string") setDaysLeft(raw.daysLeft);
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) writeJson(POCKET_KEY, { counts, daysLeft });
  }, [counts, daysLeft, ready]);
  const total = pocketTotal(counts);
  const step = (value: number, delta: number) =>
    setCounts((current) => ({ ...current, [value]: Math.min(999, Math.max(0, (current[value] ?? 0) + delta)) }));
  const perDay = perDayLeft(total, Number(daysLeft));
  const gap = started ? total - left : null;
  return (
    <section className="bw-dz-pocket" aria-labelledby="dz-pocket-title">
      <h2 id="dz-pocket-title">{tr("ui.dinarTools.compterMesBillets")}</h2>
      <ul>
        {POCKET_VALUES.map((value) => (
          <li key={value}>
            <span>{value.toLocaleString("fr-FR")}{tr("ui.dinarTools.da")}</span>
            <div className="bw-dz-pocket__qty">
              <button type="button" aria-label={`Retirer un billet de ${value} DA`} disabled={!counts[value]} onClick={() => step(value, -1)}>
                <Minus size={16} aria-hidden />
              </button>
              <output aria-label={`Nombre de ${value} DA`}>{counts[value] ?? 0}</output>
              <button type="button" aria-label={`Ajouter un billet de ${value} DA`} onClick={() => step(value, 1)}>
                <Plus size={16} aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="bw-dz-pocket__total">
        <small>{tr("ui.dinarTools.enPoche")}</small>
        <strong>{da(total)}</strong>
      </p>
      {gap !== null && total > 0 ? (
        <p className="bw-dz-pocket__gap" data-negative={gap < 0 || undefined}>
          {gap === 0
            ? tr("ui.dinarTools.leCompteEstBonC")
            : gap > 0
              ? `${da(gap)} de plus que votre budget : un change ou des dinars pas encore notés ?`
              : `${da(-gap)} de moins que votre budget : une dépense pas encore notée ?`}
        </p>
      ) : null}
      <label className="bw-dz-pocket__days">
        {tr("ui.dinarTools.joursAvantLeRetour")}
        <input inputMode="numeric" type="number" min={1} value={daysLeft} onChange={(event) => setDaysLeft(event.target.value)} placeholder="7" />
      </label>
      {perDay !== null && total > 0 ? (
        <p className="bw-dz-pocket__perday">
          {tr("ui.dinarTools.pourTenirJusquAuRetour")}<b>{da(perDay)}{tr("ui.dinarTools.parJour")}</b>
        </p>
      ) : null}
      {total > 0 ? (
        <button type="button" className="bw-dz-pocket__reset" onClick={() => setCounts({})}>
          {tr("ui.dinarTools.remettreAZero")}
        </button>
      ) : null}
    </section>
  );
}
