import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeftRight, ArrowRightLeft, ChevronDown, Delete, Fuel, Plus, Receipt, Trash2, Wallet } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/layout/SiteLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { seoHead } from "@/lib/seo/site";
import { CURRENCIES, DENOMINATIONS, EXPENSE_CATEGORIES, LAST_KNOWN_RATES, addExpense, dinarTotal, emptyWallet, recordExchange, remainingDinars, removeExchange, sanitizeWallet, type Currency, type RatesResponse, type WalletState } from "@/lib/wallet/wallet";
import { walletMediaUrl, type WalletMediaRow } from "@/lib/wallet/media";
import "@/wallet.css";

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
    {sources[attempt] ? <img src={sources[attempt]} alt="" loading="eager" onError={() => setAttempt((current) => current + 1)} /> : <span className="bw-wallet-note__fallback">Photo indisponible</span>}
    {variant && !variantFailed ? <img className="bw-wallet-note__variant" src={variant} alt="" loading="eager" onError={() => setVariantFailed(true)} /> : null}
    <span>{value.toLocaleString("fr-FR")}</span>
  </div>;
}

export const Route = createFileRoute("/mes-dinars")({
  head: () => seoHead("Mes dinars, mon portefeuille de voyage | BledWay", "Convertissez un prix entre dinars et euros, et suivez ce qu'il vous reste pendant le voyage.", "/mes-dinars"),
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
          <h1>Mes dinars<span className="bw-wallet-spark" aria-hidden>✦</span></h1>
          <p>Combien ça fait, et combien il me reste.</p>
        </header>

        <section className="bw-dz-convert" aria-labelledby="dz-convert-title">
          <h2 id="dz-convert-title"><ArrowLeftRight size={19} aria-hidden /> Combien ça fait ?</h2>
          <div className="bw-dz-fields">
            <label>
              <span>Dinars</span>
              <span className="bw-dz-input">
                <input inputMode="decimal" placeholder="0" value={dinars} onChange={(event) => fromDinars(event.target.value)} aria-label="Montant en dinars" />
                <b>DA</b>
              </span>
            </label>
            <label>
              <span>Soit</span>
              <span className="bw-dz-input">
                <input inputMode="decimal" placeholder="0" value={foreign} onChange={(event) => fromForeign(event.target.value)} aria-label={`Montant en ${currency}`} />
                <select aria-label="Devise" value={currency} onChange={(event) => update({ ...wallet, currency: event.target.value as Currency })}>
                  {CURRENCIES.map((code) => <option key={code}>{code}</option>)}
                </select>
              </span>
            </label>
          </div>
          <div className="bw-dz-notes" role="group" aria-label="Ajouter un billet ou une pièce au calcul">
            {notes.map((denom) => {
              const front = mediaRows.find((row) => row.value === denom.value && row.slot === "front");
              return <button key={denom.value} type="button" data-kind={denom.kind} aria-label={`Ajouter ${denom.value} dinars`} onClick={() => addNote(denom.value)}>
                <NoteVisual image={front ? walletMediaUrl(front.storage_path) : denom.image} fallback={front ? denom.image : null} variant={null} value={denom.value} kind={denom.kind} empty={false} />
              </button>;
            })}
            {dinars ? <button type="button" className="bw-dz-clear" aria-label="Effacer le calcul" onClick={() => fromDinars("")}><Delete size={18} aria-hidden /></button> : null}
          </div>
          <div className="bw-dz-rates" role="group" aria-label="Taux utilisé">
            {personalRate ? <button type="button" aria-pressed={mode === "personal"} onClick={() => setMode("personal")}>Mon taux <b>{money(personalRate.rate, "DZD", 1)}</b></button> : null}
            <button type="button" aria-pressed={mode === "official"} onClick={() => setMode("official")}>Officiel <b>{published?.official ? money(published.official, "DZD", 1) : "—"}</b></button>
            <button type="button" aria-pressed={mode === "parallel"} onClick={() => setMode("parallel")}>Parallèle, indicatif <b>{published?.parallel ? money(published.parallel, "DZD", 1) : "—"}</b></button>
          </div>
        </section>

        <section className="bw-dz-budget" aria-labelledby="dz-budget-title">
          <h2 id="dz-budget-title"><Wallet size={19} aria-hidden /> Mon budget du voyage</h2>
          {started ? <>
            <p className="bw-dz-left"><small>Il vous reste</small><strong>{money(left, "DZD")}</strong><span>{rate ? `soit environ ${money(left / rate, currency)}, ${basis}` : "Conversion indisponible"}</span></p>
            <div className="bw-dz-meter" role="img" aria-label={`${percentLeft} % restant`}><i style={{ width: `${percentLeft}%` }} /></div>
            <p className="bw-dz-sums"><span>Reçu {money(entered, "DZD")}</span><span>Dépensé {money(totalSpent, "DZD")}</span></p>
          </> : <p className="bw-dz-empty">Vous avez changé de l’argent ? Notez-le ici, on calcule votre vrai taux et ce qu’il vous reste au fil du voyage.</p>}
          <div className="bw-dz-actions">
            <button type="button" aria-expanded={action === "exchange"} onClick={() => setAction(action === "exchange" ? null : "exchange")}><ArrowRightLeft size={16} aria-hidden /> J’ai changé</button>
            <button type="button" aria-expanded={action === "expense"} onClick={() => setAction(action === "expense" ? null : "expense")}><Receipt size={16} aria-hidden /> J’ai dépensé</button>
            <button type="button" aria-expanded={action === "cash"} onClick={() => setAction(action === "cash" ? null : "cash")}><Plus size={16} aria-hidden /> J’ai déjà des dinars</button>
          </div>
          {action === "exchange" ? <form className="bw-dz-form" onSubmit={(event) => { event.preventDefault(); saveExchange(); }}>
            <label>J’ai donné ({currency})<input inputMode="decimal" value={spent} onChange={(event) => setSpent(event.target.value)} placeholder="500" autoFocus /></label>
            <label>J’ai reçu (DA)<input inputMode="decimal" value={received} onChange={(event) => setReceived(event.target.value)} placeholder="137000" /></label>
            {parseAmount(spent) > 0 && parseAmount(received) > 0 ? <p>Soit {money(parseAmount(received) / parseAmount(spent), "DZD", 1)} pour 1 {currency}</p> : null}
            <button type="submit">Enregistrer</button>
          </form> : null}
          {action === "expense" ? <form className="bw-dz-form" onSubmit={(event) => { event.preventDefault(); saveExpense(); }}>
            <label>Montant (DA)<input inputMode="decimal" value={expense} onChange={(event) => setExpense(event.target.value)} placeholder="5000" autoFocus /></label>
            <div className="bw-dz-cats" role="group" aria-label="Catégorie">
              {EXPENSE_CATEGORIES.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item === "Essence" ? <Fuel size={13} aria-hidden /> : null}{item}</button>)}
            </div>
            <button type="submit">Enregistrer</button>
          </form> : null}
          {action === "cash" ? <form className="bw-dz-form" onSubmit={(event) => { event.preventDefault(); saveCash(); }}>
            <label>Dinars déjà en poche<input inputMode="decimal" value={cash} onChange={(event) => setCash(event.target.value)} placeholder="20000" autoFocus /></label>
            <button type="submit">Ajouter</button>
          </form> : null}
          {movements.length ? <ul className="bw-dz-moves" aria-label="Derniers mouvements">
            {movements.map((item) => <li key={item.key}>
              <span>{item.label}<small>{item.day === today ? "Aujourd’hui" : new Date(`${item.day}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</small></span>
              <b>{item.value}</b>
              <button type="button" aria-label={`Supprimer : ${item.label}`} onClick={item.remove}><Trash2 size={15} aria-hidden /></button>
            </li>)}
          </ul> : null}
        </section>

        <details className="bw-dz-details">
          <summary>D’où viennent les taux ? <ChevronDown size={16} aria-hidden /></summary>
          <p>Officiel : <a href="https://www.bank-of-algeria.dz/" target="_blank" rel="noopener noreferrer">Banque d’Algérie</a> ({sourceDay(published?.officialDate, today)}). Parallèle : relevé public de Square Algérie ({sourceDay(published?.parallelDate, today)}), repère indicatif sans garantie, BledWay n’encourage aucune opération de change. Renseignez-vous sur les règles en vigueur et déclarez ce qui doit l’être.</p>
          {started ? <button type="button" onClick={reset}>Effacer ce budget et repartir de zéro</button> : null}
        </details>

        <p className="bw-wallet-privacy">{user ? syncError ? "Enregistré sur cet appareil. La synchronisation du compte est indisponible." : "Enregistré sur cet appareil et dans votre compte BledWay." : <>Enregistré sur cet appareil. <Link to="/auth">Connectez-vous</Link> pour le retrouver sur votre compte.</>}</p>
        <p className="bw-wallet-credit">Visuels par défaut : <a href="https://www.bank-of-algeria.dz/pieces-et-billets-algeriens/" target="_blank" rel="noopener noreferrer">Banque d’Algérie ↗</a>{mediaCredits.length ? <> · Images ajoutées : {mediaCredits.map((row, index) => <span key={`${row.credit_label}${index}`}>{index ? ", " : ""}{row.credit_label}</span>)}</> : null}</p>
      </div>
    </main>
    <SiteFooter />
  </>;
}
