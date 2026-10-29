import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRightLeft, Info, Minus, Plus, Wallet } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/layout/SiteLayout";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { useAuth } from "@/hooks/useAuth";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { seoHead } from "@/lib/seo/site";
import { CURRENCIES, DENOMINATIONS, LAST_KNOWN_RATES, dinarTotal, emptyWallet, exchangeCurrency, sanitizeWallet, walletTotal, type Currency, type RatesResponse, type WalletState } from "@/lib/wallet/wallet";
import "@/wallet.css";

const supabase = typedSupabase as unknown as import("@supabase/supabase-js").SupabaseClient;
const LOCAL_KEY = "bledway:bezass:v1";
const money = (value: number, currency: Currency | "DZD", digits = 0) => currency === "DZD" ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(value)} DA` : new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: digits }).format(value);

function NoteVisual({ image, variant, value, kind, empty }: { image: string | null; variant?: string | undefined; value: number; kind: string; empty: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div data-value={value} className={`bw-wallet-note ${kind === "coin" ? "bw-wallet-note--coin" : ""} ${empty ? "bw-wallet-note--empty" : ""}`} aria-label={`${kind === "note" ? "Billet" : "Pièce"} de ${value} dinars`}>
    {image && !failed ? <img src={image} alt="" loading="lazy" onError={() => setFailed(true)} /> : null}
    {variant && !failed ? <img className="bw-wallet-note__variant" src={variant} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
    <span>{value.toLocaleString("fr-FR")}</span>
  </div>;
}

export const Route = createFileRoute("/ma-bezass")({
  head: () => seoHead("Ma bezass, mon portefeuille de voyage | BledWay", "Comptez vos billets et pièces en dinars et gardez le fil de vos devises non échangées.", "/ma-bezass"),
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
  const [mode, setMode] = useState<"official" | "parallel">("parallel");
  const [cashTab, setCashTab] = useState<"note" | "coin">("note");
  const [foreignInput, setForeignInput] = useState("");
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [exchangeAmount, setExchangeAmount] = useState("");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [exchangeDate, setExchangeDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [personalRateInput, setPersonalRateInput] = useState("");
  const [personalRateDate, setPersonalRateDate] = useState(() => new Date().toLocaleDateString("en-CA"));

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
  const totalDinars = dinarTotal(wallet);
  const officialTotal = walletTotal(wallet, currency, rates, "official");
  const parallelTotal = walletTotal(wallet, currency, rates, "parallel");
  const activeTotal = mode === "official" ? officialTotal : parallelTotal;
  const personalRate = wallet.personalRates[currency];
  const parallelPublishedAt = rates.rates[currency]?.parallelDate;
  const parallelIsOld = !parallelPublishedAt || Date.now() - Date.parse(parallelPublishedAt) > 2 * 86_400_000;
  const personalTotal = personalRate ? walletTotal(wallet, currency, { ...rates, rates: { ...rates.rates, [currency]: {
    official: rates.rates[currency]?.official ?? null,
    parallel: personalRate.rate,
    officialDate: rates.rates[currency]?.officialDate ?? null,
    parallelDate: personalRate.day,
  } } }, "parallel") : null;
  const headlineTotal = personalTotal ?? activeTotal;
  const headlineBasis = personalTotal !== null ? `À votre taux du ${personalRate?.day}` : mode === "official" ? "Au taux officiel" : "Au taux du marché parallèle";
  const foreignRemaining = wallet.foreign[currency] || 0;
  const otherForeign = CURRENCIES.filter((code) => code !== currency && (wallet.foreign[code] || 0) > 0);
  const visibleDenominations = useMemo(() => DENOMINATIONS.filter((denom) => denom.kind === cashTab), [cashTab]);
  const today = new Date().toLocaleDateString("en-CA");

  function updateWallet(updater: (current: WalletState) => WalletState) {
    setWallet((current) => ({ ...updater(current), updatedAt: new Date().toISOString() }));
  }
  function updateCount(value: number, delta: number) {
    updateWallet((current) => {
      const before = current.counts[value] || 0;
      const after = Math.max(0, Math.min(100000, before + delta));
      return { ...current, counts: { ...current.counts, [value]: after }, looseDinars: after > before ? Math.max(0, current.looseDinars - Math.min(value, current.looseDinars)) : current.looseDinars };
    });
  }
  function saveForeign() {
    const amount = Number(foreignInput.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) return;
    updateWallet((current) => ({ ...current, foreign: { ...current.foreign, [currency]: Math.round(amount * 100) / 100 } }));
    setForeignInput("");
  }
  function saveExchange() {
    const amount = Number(exchangeAmount.replace(",", "."));
    const received = Number(receivedAmount.replace(",", "."));
    const next = exchangeCurrency(wallet, currency, amount, received, exchangeDate);
    if (!next) return;
    updateWallet(() => next);
    setExchangeAmount(""); setReceivedAmount(""); setExchangeOpen(false);
  }
  function savePersonalRate() {
    const rate = Number(personalRateInput.replace(",", "."));
    if (!Number.isFinite(rate) || rate <= 10 || rate >= 1000 || !/^\d{4}-\d{2}-\d{2}$/.test(personalRateDate)) return;
    updateWallet((current) => ({ ...current, personalRates: { ...current.personalRates, [currency]: { rate, day: personalRateDate } } }));
    setPersonalRateInput("");
  }
  function saveSnapshot() {
    updateWallet((current) => ({ ...current, snapshots: [...current.snapshots.filter((snapshot) => snapshot.day !== today), { day: today, dinars: dinarTotal(current), foreign: { ...current.foreign } }].slice(-31) }));
  }

  return <>
    <SiteHeader />
    <main className="bw-wallet-page" id="contenu">
      <div className="bw-wallet-shell">
        <Link to="/" className="bw-wallet-back"><ArrowLeft size={18} aria-hidden /> Retour à la carte</Link>
        <div className="bw-wallet-title"><div><span className="bw-wallet-overline">BledWay · argent sur place</span><h1>Ma bezass<span className="bw-wallet-spark" aria-hidden>✦</span></h1></div></div>

        <section className="bw-wallet-hero" aria-label="Récapitulatif de votre argent restant">
          <div className="bw-wallet-hero__art" aria-hidden>☀︎　𓆰　✦</div>
          <span>Votre argent restant · {currency}</span>
          <strong>{headlineTotal !== null ? `≈ ${money(headlineTotal, currency)}` : "Conversion indisponible"}</strong>
          <small>{headlineBasis}{personalTotal === null && mode === "parallel" && parallelIsOld ? " · taux ancien" : ""}</small>
          <div className="bw-wallet-hero__breakdown">
            <div><span>Dans le portefeuille</span><b>{money(totalDinars, "DZD")}</b></div>
            <div><span>Encore à échanger</span><b>{money(foreignRemaining, currency, 2)}</b></div>
          </div>
          {otherForeign.length ? <p className="bw-wallet-hero__other">Autres devises : {otherForeign.map((code) => money(wallet.foreign[code] || 0, code, 2)).join(" · ")}</p> : null}
        </section>

        <section className="bw-wallet-leather" aria-labelledby="wallet-cash-title">
          <h2 id="wallet-cash-title"><Wallet size={22} aria-hidden /> Billets & pièces</h2>
          <div className="bw-wallet-tabs" role="tablist" aria-label="Type d’espèces">
            <button type="button" role="tab" aria-selected={cashTab === "note"} aria-controls="wallet-cash-panel" onClick={() => setCashTab("note")}>Billets</button>
            <button type="button" role="tab" aria-selected={cashTab === "coin"} aria-controls="wallet-cash-panel" onClick={() => setCashTab("coin")}>Pièces</button>
          </div>
          <div className="bw-wallet-pockets" id="wallet-cash-panel" role="tabpanel" aria-label={cashTab === "note" ? "Billets" : "Pièces"}>
            {visibleDenominations.map((denom) => {
              const count = wallet.counts[String(denom.value)] || 0;
              return <div className="bw-wallet-pocket" data-kind={denom.kind} key={denom.value}>
                <NoteVisual image={denom.image} variant={"variant" in denom ? denom.variant : undefined} value={denom.value} kind={denom.kind} empty={!count} />
                <div className="bw-wallet-quantity" aria-label={`Nombre de ${denom.value} dinars`}>
                  <button type="button" aria-label={`Ajouter ${denom.value} dinars`} onClick={() => updateCount(denom.value, 1)}><Plus size={17} /></button>
                  <output aria-live="polite">{count}</output>
                  <button type="button" aria-label={`Retirer ${denom.value} dinars`} disabled={!count} onClick={() => updateCount(denom.value, -1)}><Minus size={17} /></button>
                </div>
                <div className="bw-wallet-equivalent" aria-label={`Équivalent d’un ${denom.kind === "note" ? "billet" : "pièce"} de ${denom.value} dinars`}>
                  <span>Officiel <strong>{rates.rates[currency]?.official ? `≈ ${money(denom.value / rates.rates[currency]!.official!, currency, 2)}` : "—"}</strong></span>
                  <span>Parallèle <strong>{rates.rates[currency]?.parallel ? `≈ ${money(denom.value / rates.rates[currency]!.parallel!, currency, 2)}` : "—"}</strong></span>
                  {personalRate ? <span>Mon taux <strong>≈ {money(denom.value / personalRate.rate, currency, 2)}</strong></span> : null}
                </div>
              </div>;
            })}
          </div>
          {wallet.looseDinars > 0 ? <div className="bw-wallet-loose"><span>Dinars reçus au change <small>À répartir en billets et pièces avec les boutons +</small></span><strong>{money(wallet.looseDinars, "DZD")}</strong></div> : null}
        </section>

        <section className="bw-wallet-foreign" aria-labelledby="wallet-foreign-title"><div className="bw-wallet-foreign__heading"><div><h2 id="wallet-foreign-title">Devises non échangées</h2><p>Encore dans votre poche, sans conversion.</p></div><select aria-label="Devise du voyageur" value={currency} onChange={(event) => updateWallet((current) => ({ ...current, currency: event.target.value as Currency }))}>{CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}</select></div><div className="bw-wallet-foreign__balance"><strong>{money(wallet.foreign[currency] || 0, currency, 2)}</strong><span>{CURRENCIES.filter((code) => code !== currency && (wallet.foreign[code] || 0) > 0).map((code) => `${money(wallet.foreign[code] || 0, code)} conservés`).join(" · ")}</span></div><div className="bw-wallet-foreign__actions"><label>Modifier le solde <input inputMode="decimal" aria-label={`Montant non échangé en ${currency}`} type="number" min="0" step="0.01" value={foreignInput} onChange={(event) => setForeignInput(event.target.value)} placeholder="Montant" /></label><button type="button" onClick={saveForeign} disabled={!foreignInput}>Enregistrer</button><button type="button" className="bw-wallet-exchange-trigger" onClick={() => setExchangeOpen(!exchangeOpen)} aria-expanded={exchangeOpen}><ArrowRightLeft size={16} aria-hidden /> J’ai changé des devises</button></div>
          {exchangeOpen ? <div className="bw-wallet-exchange"><p>Indiquez le montant remis et les dinars réellement reçus. Les deux soldes seront ajustés ensemble, au taux de ce jour-là.</p><label>Date du change<input type="date" value={exchangeDate} max={today} onChange={(event) => setExchangeDate(event.target.value)} /></label><label>{currency} remis<input type="number" min="0.01" max={wallet.foreign[currency] || 0} step="0.01" inputMode="decimal" value={exchangeAmount} onChange={(event) => setExchangeAmount(event.target.value)} /></label><label>Dinars reçus<input type="number" min="0.01" step="0.01" inputMode="decimal" value={receivedAmount} onChange={(event) => setReceivedAmount(event.target.value)} /></label><button type="button" onClick={saveExchange} disabled={!exchangeAmount || !receivedAmount || Number(exchangeAmount) <= 0 || Number(receivedAmount) <= 0 || Number(exchangeAmount) > (wallet.foreign[currency] || 0)}>Valider le change</button></div> : null}</section>

        <section className="bw-wallet-rates" aria-label="Taux de référence"><h2><ArrowRightLeft size={18} aria-hidden /> Taux de référence</h2><div className="bw-wallet-rate-options"><button type="button" aria-pressed={mode === "official"} onClick={() => setMode("official")}><span>Officiel</span><strong>{rates.rates[currency]?.official ? `1 ${currency} ≈ ${money(rates.rates[currency]!.official!, "DZD", 2)}` : "Indisponible"}</strong></button><button type="button" aria-pressed={mode === "parallel"} onClick={() => setMode("parallel")}><span>Marché parallèle</span><strong>{rates.rates[currency]?.parallel ? `1 ${currency} ≈ ${money(rates.rates[currency]!.parallel!, "DZD", 2)}` : "Indisponible"}</strong></button></div><p className="bw-wallet-source"><Info size={14} aria-hidden /> Officiel : <a href="https://www.bank-of-algeria.dz/taux-de-change-journalier/" target="_blank" rel="noopener noreferrer">Banque d’Algérie</a> ({rates.rates[currency]?.officialDate || "—"}) · Marché parallèle : <a href="https://squarealgerie.com/euro-dinar" target="_blank" rel="noopener noreferrer">Square Algérie</a> ({rates.rates[currency]?.parallelDate ? new Date(rates.rates[currency]!.parallelDate!).toLocaleDateString("fr-FR") : "—"}). Repère moyen achat/vente, sans garantie de transaction. {parallelIsOld ? "Le taux du marché parallèle est ancien : vérifiez la date avant de l'utiliser." : rates.checkedAt ? "Taux récupérés par BledWay." : "Derniers relevés connus."}</p><div className="bw-wallet-personal"><h3>Mon taux de change</h3><p>{personalRate ? `1 ${currency} = ${money(personalRate.rate, "DZD", 2)} · renseigné pour le ${new Date(`${personalRate.day}T12:00:00`).toLocaleDateString("fr-FR")}` : "Renseignez le taux réellement obtenu, même après le voyage."}</p><div><label>Taux obtenu (DA pour 1 {currency})<input type="number" inputMode="decimal" min="10" max="1000" step="0.01" value={personalRateInput} onChange={(event) => setPersonalRateInput(event.target.value)} placeholder="Ex. 275" /></label><label>Date<input type="date" value={personalRateDate} max={today} onChange={(event) => setPersonalRateDate(event.target.value)} /></label><button type="button" onClick={savePersonalRate} disabled={!personalRateInput}>Enregistrer mon taux</button></div></div></section>

        <section className="bw-wallet-total" aria-label="Comparer les valeurs selon le taux"><h2>Comparer les valeurs selon le taux</h2><div><span>Au taux officiel <b>{officialTotal !== null ? `≈ ${money(officialTotal, currency)}` : "—"}</b></span><span>Au taux du marché parallèle <b>{parallelTotal !== null ? `≈ ${money(parallelTotal, currency)}` : "—"}</b></span>{personalTotal !== null ? <span>À mon taux du {personalRate?.day} <b>≈ {money(personalTotal, currency)}</b></span> : null}</div><p>Espèces en dinars converties + devises encore détenues. Le taux parallèle donne davantage de DA pour 1 euro : le même billet en DA vaut donc moins d’euros. Estimations, sans garantie de change.</p></section>
        {wallet.exchanges.length ? <section className="bw-wallet-history"><h2>Mes changes enregistrés</h2>{wallet.exchanges.slice(-3).reverse().map((entry) => <p key={entry.id}><time dateTime={entry.day}>{new Date(`${entry.day}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</time><strong>{money(entry.spent, entry.currency)} → {money(entry.received, "DZD")}</strong></p>)}</section> : null}

        <button type="button" className="bw-wallet-evening" onClick={saveSnapshot}>{wallet.snapshots.some((snapshot) => snapshot.day === today) ? "Point du jour enregistré · mettre à jour" : "Faire le point ce soir"} <ArrowRightLeft size={18} aria-hidden /></button>
        {wallet.snapshots.length ? <section className="bw-wallet-history"><h2>Mes derniers points</h2>{wallet.snapshots.slice(-5).reverse().map((snapshot) => <p key={snapshot.day}><time dateTime={snapshot.day}>{new Date(`${snapshot.day}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</time><strong>{money(snapshot.dinars, "DZD")}</strong></p>)}</section> : null}
        <p className="bw-wallet-privacy">{user ? syncError ? "Enregistré sur cet appareil. La synchronisation du compte est indisponible." : "Enregistré sur cet appareil et dans votre compte BledWay." : <>Enregistré sur cet appareil. <Link to="/auth">Connectez-vous</Link> pour le retrouver sur votre compte.</>}</p>
        <p className="bw-wallet-credit">Visuels des billets et de la pièce 200 DA : <a href="https://www.bank-of-algeria.dz/pieces-et-billets-algeriens/" target="_blank" rel="noopener noreferrer">Banque d’Algérie ↗</a></p>
      </div>
    </main>
    <SiteFooter />
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden"><MobileTabBar /></div>
  </>;
}
