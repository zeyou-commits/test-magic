import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRightLeft, ChevronDown, Delete, Fuel, Plus, Receipt, Store, Trash2, Volume2, Wallet } from "lucide-react";
import { PocketCount, RateCompare, SoukMode, StayPlanner } from "@/components/wallet/DinarTools";
import { SiteFooter, SiteHeader } from "@/components/layout/SiteLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { seoHead } from "@/lib/seo/site";
import { CURRENCIES, DENOMINATIONS, EXPENSE_CATEGORIES, LAST_KNOWN_RATES, addExpense, dinarTotal, emptyWallet, recordExchange, remainingDinars, removeExchange, sanitizeWallet, type Currency, type RatesResponse, type WalletState } from "@/lib/wallet/wallet";
import { walletMediaUrl, type WalletMediaRow } from "@/lib/wallet/media";
import { useQuery } from "@tanstack/react-query";
import { SPOKEN_EXAMPLES, parseSpoken, saidAs } from "@/lib/wallet/jargon";
import { dinarVoicesQuery, playVoice } from "@/lib/wallet/voices";
import "@/wallet.css";
import { tr } from "@/lib/i18n";

const supabase = typedSupabase as unknown as import("@supabase/supabase-js").SupabaseClient;
const LOCAL_KEY = "bledway:bezass:v1";
const money = (value: number, currency: Currency | "DZD", digits = 0) => currency === "DZD" ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(value)} DA` : new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: digits }).format(value);
const parseAmount = (value: string) => Number(value.replace(/\s/g, "").replace(",", "."));
const sourceDay = (date: string | null | undefined, today: string) => !date ? "Date inconnue" : date.slice(0, 10) === today ? "Aujourd’hui" : new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

function NoteVisual({ image, fallback, variant, value, kind, empty }: { image: string | null; fallback?: string | null; variant?: string | null; value: number; kind: string; empty: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const [variantFailed, setVariantFailed] = useState(false);
  useEffect(() => { setAttempt(0); setVariantFailed(false); }, [image, fallback, variant]);
  const sources = [image, fallback].filter((source, index, list): source is string => !!source && list.indexOf(source) === index);
  const portrait = value === 2000 && sources[attempt]?.includes("2000_01_12.png");
  return <div data-value={value} className={`bw-wallet-note ${kind === "coin" ? "bw-wallet-note--coin" : ""} ${empty ? "bw-wallet-note--empty" : ""} ${portrait ? "bw-wallet-note--portrait" : ""}`} aria-label={`${kind === "note" ? "Billet" : "Pièce"} de ${value} dinars`}>
    {sources[attempt] ? <img src={sources[attempt]} alt="" loading="eager" onError={() => setAttempt((current) => current + 1)} /> : <span className="bw-wallet-note__fallback">{tr("ui.pageMesDinars.photoIndisponible")}</span>}
    {variant && !variantFailed ? <img className="bw-wallet-note__variant" src={variant} alt="" loading="eager" onError={() => setVariantFailed(true)} /> : null}
    <span>{value.toLocaleString("fr-FR")}</span>
  </div>;
}

export const Route = createFileRoute("/mes-dinars")({
  head: () => seoHead("Convertir euros et dinars algériens : Mes dinars | BledWay", "Convertissez un prix entre dinars algériens et euros, et suivez ce qu'il vous reste pendant votre voyage en Algérie.", "/mes-dinars"),
  component: WalletPage,
});

function readLocal() {
  try { return sanitizeWallet(JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}")); }
  catch { return emptyWallet(); }
}

function WalletPage() {
  const { user, loading } = useAuth();
  const [wallet, setWallet] = useState<WalletState>(emptyWallet);
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [rates, setRates] = useState<RatesResponse>(LAST_KNOWN_RATES);
  const [mode, setMode] = useState<"official" | "parallel" | "personal">("official");
  const [mediaRows, setMediaRows] = useState<WalletMediaRow[]>([]);
  const [dinars, setDinars] = useState("");
  const [foreign, setForeign] = useState("");
  const [action, setAction] = useState<"exchange" | "expense" | "cash" | null>(null);
  const [spent, setSpent] = useState("");
  const [received, setReceived] = useState("");
  const [expense, setExpense] = useState("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [cash, setCash] = useState("");
  const [heard, setHeard] = useState("");
  const [tab, setTab] = useState<"convert" | "plan" | "budget">("convert");
  const [souk, setSouk] = useState(false);
  // Arrivée depuis le simulateur de route : on ouvre directement « Préparer ».
  useEffect(() => { if (new URLSearchParams(window.location.search).get("plan") === "1") setTab("plan"); }, []);
  const [entry, setEntry] = useState<"dinars" | "foreign" | "heard">("dinars");
  const voices = useQuery(dinarVoicesQuery).data;

  useEffect(() => {
    fetch("/api/wallet-rates").then((res) => res.json()).then((data: RatesResponse) => {
      if (Object.keys(data.rates || {}).length) setRates((current) => {
        const merged = { ...current.rates };
        for (const code of CURRENCIES) {
          const next = data.rates[code];
          const old = current.rates[code];
          if (!next || !old) { if (next) merged[code] = next; continue; }
          merged[code] = {
            official: next.official ?? old.official,
            parallel: next.parallel ?? old.parallel,
            officialDate: next.official ? next.officialDate : old.officialDate,
            parallelDate: next.parallel ? next.parallelDate : old.parallelDate,
          };
        }
        return { checkedAt: data.checkedAt, rates: merged };
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    supabase.from("bw_wallet_media").select("value,slot,storage_path,credit_label,credit_url,updated_at").then(({ data }) => {
      if (data) setMediaRows(data as WalletMediaRow[]);
    });
  }, []);

  useEffect(() => {
    if (loading) return;
    let active = true;
    setReady(false);
    const local = readLocal();
    if (!user) { setWallet(local); setReady(true); return; }
    supabase.from("bw_wallets").select("data").eq("user_id", user.id).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      setSyncError(!!error);
      const next = data?.data ? sanitizeWallet(data.data) : local;
      setWallet(next);
      setReady(true);
    });
    return () => { active = false; };
  }, [user?.id, loading]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(wallet));
    if (!user || syncError) return;
    const timer = window.setTimeout(() => {
      supabase.from("bw_wallets").upsert({ user_id: user.id, data: wallet, updated_at: new Date().toISOString() }).then(({ error }) => { if (error) setSyncError(true); });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [wallet, ready, user?.id, syncError]);

  const currency = wallet.currency;
  const personalRate = wallet.personalRates[currency];
  // Le taux réellement obtenu devient la référence dès qu'il existe.
  useEffect(() => { if (personalRate) setMode("personal"); }, [personalRate?.rate, personalRate?.day]);
  const published = rates.rates[currency];
  const rate = mode === "personal" && personalRate ? personalRate.rate : mode === "parallel" ? published?.parallel ?? null : published?.official ?? null;
  const basis = mode === "personal" && personalRate ? "à votre taux" : mode === "parallel" ? "au taux parallèle indicatif" : "au taux officiel";

  const update = (next: WalletState | null) => {
    if (next) setWallet({ ...next, updatedAt: new Date().toISOString() });
    return Boolean(next);
  };
  const fromDinars = (value: string) => {
    setDinars(value);
    const amount = parseAmount(value);
    setForeign(value && rate && Number.isFinite(amount) ? String(Math.round((amount / rate) * 100) / 100) : "");
  };
  const fromForeign = (value: string) => {
    setForeign(value);
    const amount = parseAmount(value);
    setDinars(value && rate && Number.isFinite(amount) ? String(Math.round(amount * rate)) : "");
  };
  // Le taux change : le montant en dinars saisi reste, l'équivalent suit.
  useEffect(() => { if (dinars) fromDinars(dinars); }, [rate]);
  const addNote = (value: number) => fromDinars(String((parseAmount(dinars) || 0) + value));

  const spoken = saidAs(parseAmount(dinars));
  const spokenVoice = spoken ? voices?.find((row) => row.said === spoken) : undefined;
  const left = remainingDinars(wallet);
  const entered = dinarTotal(wallet);
  const totalSpent = wallet.expenses.reduce((sum, item) => sum + item.amount, 0);
  const started = entered > 0 || totalSpent > 0;
  const percentLeft = entered > 0 ? Math.round((left / entered) * 100) : 0;
  const movements = [
    ...wallet.expenses.map((item) => ({ key: item.id, day: item.day, label: item.category, value: `− ${money(item.amount, "DZD")}`, remove: () => update({ ...wallet, expenses: wallet.expenses.filter((entry) => entry.id !== item.id) }) })),
    ...wallet.exchanges.map((item) => ({ key: item.id, day: item.day, label: `Change · ${money(item.spent, item.currency)}`, value: `+ ${money(item.received, "DZD")}`, remove: () => update(removeExchange(wallet, item.id)) })),
  ].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 12);

  const saveExchange = () => {
    if (update(recordExchange(wallet, currency, parseAmount(spent), parseAmount(received)))) { setSpent(""); setReceived(""); setAction(null); }
  };
  const saveExpense = () => {
    if (update(addExpense(wallet, parseAmount(expense), category))) { setExpense(""); setAction(null); }
  };
  const saveCash = () => {
    const amount = parseAmount(cash);
    if (!Number.isFinite(amount) || amount <= 0) return;
    update({ ...wallet, looseDinars: wallet.looseDinars + amount });
    setCash(""); setAction(null);
  };
  const reset = () => {
    if (window.confirm("Effacer le budget de ce voyage : changes, dépenses et dinars enregistrés ?")) update({ ...emptyWallet(), currency });
  };
  const today = new Date().toLocaleDateString("en-CA");
  const notes = DENOMINATIONS.filter((denom) => denom.value >= 100);
  const mediaCredits = [...new Map(mediaRows.map((row) => [`${row.credit_label}|${row.credit_url || ""}`, row])).values()];

  return <>
    <SiteHeader />
    <main className="bw-wallet-page" id="contenu">
      <div className="bw-wallet-shell">
        <header className="bw-dz-head">
          <h1>{tr("ui.pageMesDinars.mesDinars")}<span className="bw-wallet-spark" aria-hidden>✦</span></h1>
          <p>{tr("ui.pageMesDinars.combienCaFaitEtCombien")}</p>
        </header>

        <div className="bw-dz-tabs" role="tablist" aria-label={tr("ui.pageMesDinars.mesDinars")}>
          <button type="button" role="tab" aria-selected={tab === "convert"} onClick={() => setTab("convert")}>{tr("ui.pageMesDinars.convertir")}</button>
          <button type="button" role="tab" aria-selected={tab === "plan"} onClick={() => setTab("plan")}>{tr("ui.pageMesDinars.preparer")}</button>
          <button type="button" role="tab" aria-selected={tab === "budget"} onClick={() => setTab("budget")}>{tr("ui.pageMesDinars.monBudget")}{started ? <small>{money(left, "DZD")}</small> : null}</button>
        </div>

        {tab === "convert" ? <>
        <section className="bw-dz-convert" aria-label={tr("ui.pageMesDinars.convertirUnMontant")}>
          <div className="bw-dz-modes" role="group" aria-label={tr("ui.pageMesDinars.jeSaisis")}>
            <button type="button" aria-pressed={entry === "dinars"} onClick={() => setEntry("dinars")}>{tr("ui.pageMesDinars.enDinars")}</button>
            <button type="button" aria-pressed={entry === "foreign"} onClick={() => setEntry("foreign")}>{tr("ui.pageMesDinars.en")}{currency}</button>
            <button type="button" aria-pressed={entry === "heard"} onClick={() => setEntry("heard")}>{tr("ui.pageMesDinars.onMADit")}</button>
          </div>
          <div className="bw-dz-entry">
            {entry === "heard"
              ? <input value={heard} onChange={(event) => { setHeard(event.target.value); const found = parseSpoken(event.target.value); fromDinars(found ? String(found) : ""); }} placeholder={tr("ui.pageMesDinars.t3Melyoun")} aria-label={tr("ui.pageMesDinars.lePrixEntendu")} autoComplete="off" />
              : entry === "dinars"
                ? <input inputMode="decimal" value={dinars} onChange={(event) => fromDinars(event.target.value)} placeholder="0" aria-label={tr("ui.pageMesDinars.montantEnDinars")} />
                : <input inputMode="decimal" value={foreign} onChange={(event) => fromForeign(event.target.value)} placeholder="0" aria-label={`Montant en ${currency}`} />}
            {entry === "heard" ? null : <b>{entry === "dinars" ? "DA" : currency}</b>}
            {dinars || heard ? <button type="button" aria-label={tr("ui.pageMesDinars.effacer")} onClick={() => { setHeard(""); fromDinars(""); }}><Delete size={20} aria-hidden /></button> : null}
          </div>
          <div className="bw-dz-result" aria-live="polite">
            {dinars ? <>
              <strong>{entry === "foreign" ? money(parseAmount(dinars), "DZD") : `≈ ${money(parseAmount(foreign) || 0, currency, 2)}`}</strong>
              {entry === "heard" ? <span>{money(parseAmount(dinars), "DZD")}</span> : null}
              {spoken ? <span className="bw-dz-said">
                {tr("ui.pageMesDinars.caSeDit")}{spoken} »
                {spokenVoice ? <button type="button" aria-label={`Écouter : ${spoken}`} onClick={() => playVoice(spokenVoice.storage_path)}><Volume2 size={18} aria-hidden /></button> : null}
              </span> : null}
            </> : heard ? <span className="bw-dz-unknown">{tr("ui.pageMesDinars.essayez2MelyounOuCent")}</span> : <span>{tr("ui.pageMesDinars.touchezUnBilletOuSaisissez")}</span>}
          </div>
          <div className="bw-dz-notes" role="group" aria-label={tr("ui.pageMesDinars.ajouterUnBilletOuUne")}>
            {notes.map((denom) => {
              const front = mediaRows.find((row) => row.value === denom.value && row.slot === "front");
              return <button key={denom.value} type="button" data-kind={denom.kind} aria-label={`Ajouter ${denom.value} dinars`} onClick={() => { setEntry("dinars"); setHeard(""); addNote(denom.value); }}>
                {denom.kind === "coin" ? <span className="bw-dz-coin">{denom.value}{tr("ui.pageMesDinars.da")}</span> : <NoteVisual image={front ? walletMediaUrl(front.storage_path) : denom.image} fallback={front ? denom.image : null} variant={null} value={denom.value} kind={denom.kind} empty={false} />}
              </button>;
            })}
          </div>
          <div className="bw-dz-rateline">
            <label><span className="sr-only">{tr("ui.pageMesDinars.tauxUtilise")}</span>
              <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
                {personalRate ? <option value="personal">{tr("ui.pageMesDinars.monTaux")}{money(personalRate.rate, "DZD", 1)}</option> : null}
                <option value="official">{tr("ui.pageMesDinars.tauxOfficiel")}{published?.official ? money(published.official, "DZD", 1) : "—"}</option>
                <option value="parallel">{tr("ui.pageMesDinars.paralleleIndicatif")}{published?.parallel ? money(published.parallel, "DZD", 1) : "—"}</option>
              </select>
            </label>
            <label><span className="sr-only">{tr("ui.pageMesDinars.devise")}</span>
              <select value={currency} onChange={(event) => update({ ...wallet, currency: event.target.value as Currency })}>
                {CURRENCIES.map((code) => <option key={code}>{code}</option>)}
              </select>
            </label>
          </div>
          <button type="button" className="bw-dz-souk-open" onClick={() => setSouk(true)}><Store size={17} aria-hidden />{tr("ui.pageMesDinars.modeAuSoukGrosChiffres")}</button>
        </section>
        <RateCompare rate={published} currency={currency} />
        <details className="bw-dz-lexicon">
          <summary>{tr("ui.pageMesDinars.parlerDinarMelyounCentMille")}<ChevronDown size={16} aria-hidden /></summary>
          <p>{tr("ui.pageMesDinars.auBledOnCompteSouvent")}</p>
          <ul>
            {SPOKEN_EXAMPLES.map((item) => {
              const voice = voices?.find((row) => row.said === item.said);
              return <li key={item.said}>
                <span>{item.said}</span>
                <b>{money(item.dinars, "DZD")}</b>
                {voice ? <button type="button" aria-label={`Écouter : ${item.said}`} onClick={() => playVoice(voice.storage_path)}><Volume2 size={18} aria-hidden /></button> : <i />}
              </li>;
            })}
          </ul>
          <small>{tr("ui.pageMesDinars.lesHabitudesChangentSelonLes")}</small>
        </details>
        </> : null}

        {tab === "plan" ? <StayPlanner rate={published} currency={currency} /> : null}

        {tab === "budget" ? <>
        <section className="bw-dz-budget" aria-labelledby="dz-budget-title">
          <h2 id="dz-budget-title"><Wallet size={19} aria-hidden />{tr("ui.pageMesDinars.monBudgetDuVoyage")}</h2>
          {started ? <>
            <p className="bw-dz-left"><small>{tr("ui.pageMesDinars.ilVousReste")}</small><strong>{money(left, "DZD")}</strong><span>{rate ? `soit environ ${money(left / rate, currency)}, ${basis}` : tr("ui.pageMesDinars.conversionIndisponible")}</span></p>
            <div className="bw-dz-meter" role="img" aria-label={`${percentLeft} % restant`}><i style={{ width: `${percentLeft}%` }} /></div>
            <p className="bw-dz-sums"><span>{tr("ui.pageMesDinars.recu")}{money(entered, "DZD")}</span><span>{tr("ui.pageMesDinars.depense")}{money(totalSpent, "DZD")}</span></p>
          </> : <p className="bw-dz-empty">{tr("ui.pageMesDinars.vousAvezChangeDeL")}</p>}
          <div className="bw-dz-actions">
            <button type="button" aria-expanded={action === "exchange"} onClick={() => setAction(action === "exchange" ? null : "exchange")}><ArrowRightLeft size={16} aria-hidden />{tr("ui.pageMesDinars.jAiChange")}</button>
            <button type="button" aria-expanded={action === "expense"} onClick={() => setAction(action === "expense" ? null : "expense")}><Receipt size={16} aria-hidden />{tr("ui.pageMesDinars.jAiDepense")}</button>
            <button type="button" aria-expanded={action === "cash"} onClick={() => setAction(action === "cash" ? null : "cash")}><Plus size={16} aria-hidden />{tr("ui.pageMesDinars.jAiDejaDesDinars")}</button>
          </div>
          {action === "exchange" ? <form className="bw-dz-form" onSubmit={(event) => { event.preventDefault(); saveExchange(); }}>
            <label>{tr("ui.pageMesDinars.jAiDonne")}{currency})<input inputMode="decimal" value={spent} onChange={(event) => setSpent(event.target.value)} placeholder="500" autoFocus /></label>
            <label>{tr("ui.pageMesDinars.jAiRecuDa")}<input inputMode="decimal" value={received} onChange={(event) => setReceived(event.target.value)} placeholder="137000" /></label>
            {parseAmount(spent) > 0 && parseAmount(received) > 0 ? <p>{tr("ui.pageMesDinars.soit")}{money(parseAmount(received) / parseAmount(spent), "DZD", 1)}{tr("ui.pageMesDinars.pour1")}{currency}</p> : null}
            <button type="submit">{tr("ui.pageMesDinars.enregistrer")}</button>
          </form> : null}
          {action === "expense" ? <form className="bw-dz-form" onSubmit={(event) => { event.preventDefault(); saveExpense(); }}>
            <label>{tr("ui.pageMesDinars.montantDa")}<input inputMode="decimal" value={expense} onChange={(event) => setExpense(event.target.value)} placeholder="5000" autoFocus /></label>
            <div className="bw-dz-cats" role="group" aria-label={tr("ui.pageMesDinars.categorie")}>
              {EXPENSE_CATEGORIES.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item === "Essence" ? <Fuel size={13} aria-hidden /> : null}{item}</button>)}
            </div>
            <button type="submit">{tr("ui.pageMesDinars.enregistrer")}</button>
          </form> : null}
          {action === "cash" ? <form className="bw-dz-form" onSubmit={(event) => { event.preventDefault(); saveCash(); }}>
            <label>{tr("ui.pageMesDinars.dinarsDejaEnPoche")}<input inputMode="decimal" value={cash} onChange={(event) => setCash(event.target.value)} placeholder="20000" autoFocus /></label>
            <button type="submit">{tr("ui.pageMesDinars.ajouter")}</button>
          </form> : null}
          {movements.length ? <ul className="bw-dz-moves" aria-label={tr("ui.pageMesDinars.derniersMouvements")}>
            {movements.map((item) => <li key={item.key}>
              <span>{item.label}<small>{item.day === today ? tr("ui.pageMesDinars.aujourdHui") : new Date(`${item.day}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</small></span>
              <b>{item.value}</b>
              <button type="button" aria-label={`Supprimer : ${item.label}`} onClick={item.remove}><Trash2 size={15} aria-hidden /></button>
            </li>)}
          </ul> : null}
        </section>
        <PocketCount left={left} started={started} />
        </> : null}

        <details className="bw-dz-details">
          <summary>{tr("ui.pageMesDinars.dOuViennentLesTaux")}<ChevronDown size={16} aria-hidden /></summary>
          <p>{tr("ui.pageMesDinars.officiel")}<a href="https://www.bank-of-algeria.dz/" target="_blank" rel="noopener noreferrer">{tr("ui.pageMesDinars.banqueDAlgerie")}</a> ({sourceDay(published?.officialDate, today)}{tr("ui.pageMesDinars.paralleleRelevePublicDeSquare")}{sourceDay(published?.parallelDate, today)}{tr("ui.pageMesDinars.repereIndicatifSansGarantieBledway")}</p>
          {started ? <button type="button" onClick={reset}>{tr("ui.pageMesDinars.effacerCeBudgetEtRepartir")}</button> : null}
        </details>

        <p className="bw-wallet-privacy">{user ? syncError ? tr("ui.pageMesDinars.enregistreSurCetAppareilLa") : tr("ui.pageMesDinars.enregistreSurCetAppareilEt") : <>{tr("ui.pageMesDinars.enregistreSurCetAppareil")}<Link to="/auth">{tr("ui.pageMesDinars.connectezVous")}</Link>{tr("ui.pageMesDinars.pourLeRetrouverSurVotre")}</>}</p>
        <p className="bw-wallet-credit">{tr("ui.pageMesDinars.visuelsParDefaut")}<a href="https://www.bank-of-algeria.dz/pieces-et-billets-algeriens/" target="_blank" rel="noopener noreferrer">{tr("ui.pageMesDinars.banqueDAlgerie2")}</a>{mediaCredits.length ? <>{tr("ui.pageMesDinars.imagesAjoutees")}{mediaCredits.map((row, index) => <span key={`${row.credit_label}${index}`}>{index ? ", " : ""}{row.credit_label}</span>)}</> : null}</p>
      </div>
    </main>
    {souk ? <SoukMode rate={rate} currency={currency} basis={basis} onClose={() => setSouk(false)} /> : null}
    <SiteFooter />
  </>;
}
