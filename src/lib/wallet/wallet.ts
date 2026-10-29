export const CURRENCIES = ["EUR", "USD", "GBP", "CAD", "CHF"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const DENOMINATIONS = [
  { value: 2000, kind: "note", image: "https://www.bank-of-algeria.dz/stoodroa/2022/12/2000_01_12.png", source: "https://www.bank-of-algeria.dz/2000-da-annee-2022/" },
  { value: 1000, kind: "note", image: "https://www.bank-of-algeria.dz/stoodroa/2026/01/billet-1000-da.jpg", variant: "https://www.bank-of-algeria.dz/stoodroa/2022/05/1000da-98-scaled.jpg", source: "https://www.bank-of-algeria.dz/la-serie-histoire-et-patrimoine/" },
  { value: 500, kind: "note", image: "https://www.bank-of-algeria.dz/stoodroa/2022/04/1992-500DA-F2.png", variant: "https://www.bank-of-algeria.dz/stoodroa/2022/03/1998-500DA-R.png", source: "https://www.bank-of-algeria.dz/la-serie-histoire-et-patrimoine/" },
  { value: 200, kind: "coin", image: "https://www.bank-of-algeria.dz/stoodroa/2022/08/200.png", source: "https://www.bank-of-algeria.dz/celebration-du-60eme-anniversaire-de-lindependance/" },
  { value: 100, kind: "coin", image: null, source: "https://www.bank-of-algeria.dz/reglement-piece-de-monnaie/" },
  { value: 50, kind: "coin", image: null, source: "https://www.bank-of-algeria.dz/reglement-piece-de-monnaie/" },
  { value: 20, kind: "coin", image: null, source: "https://www.bank-of-algeria.dz/reglement-piece-de-monnaie/" },
  { value: 10, kind: "coin", image: null, source: "https://www.bank-of-algeria.dz/reglement-piece-de-monnaie/" },
  { value: 5, kind: "coin", image: null, source: "https://www.bank-of-algeria.dz/reglement-piece-de-monnaie/" },
  { value: 2, kind: "coin", image: null, source: "https://www.bank-of-algeria.dz/reglement-piece-de-monnaie/" },
  { value: 1, kind: "coin", image: null, source: "https://www.bank-of-algeria.dz/reglement-piece-de-monnaie/" },
] as const;

export type WalletSnapshot = { day: string; dinars: number; foreign: Partial<Record<Currency, number>> };
export type PersonalRate = { rate: number; day: string };
export type ExchangeRecord = { id: string; day: string; currency: Currency; spent: number; received: number; rate: number };
export type WalletState = {
  counts: Record<string, number>;
  looseDinars: number;
  foreign: Partial<Record<Currency, number>>;
  currency: Currency;
  personalRates: Partial<Record<Currency, PersonalRate>>;
  exchanges: ExchangeRecord[];
  snapshots: WalletSnapshot[];
  updatedAt: string;
};
export type Rate = { official: number | null; parallel: number | null; officialDate: string | null; parallelDate: string | null };
export type RatesResponse = { rates: Partial<Record<Currency, Rate>>; checkedAt: string | null };

export const emptyWallet = (): WalletState => ({ counts: {}, looseDinars: 0, foreign: {}, currency: "EUR", personalRates: {}, exchanges: [], snapshots: [], updatedAt: new Date().toISOString() });

export function sanitizeWallet(input: unknown): WalletState {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const countsRaw = raw['counts'] && typeof raw['counts'] === "object" ? raw['counts'] as Record<string, unknown> : {};
  const foreignRaw = raw['foreign'] && typeof raw['foreign'] === "object" ? raw['foreign'] as Record<string, unknown> : {};
  const counts: Record<string, number> = {};
  for (const { value } of DENOMINATIONS) counts[String(value)] = clampInt(countsRaw[String(value)]);
  const foreign: Partial<Record<Currency, number>> = {};
  for (const currency of CURRENCIES) foreign[currency] = clampMoney(foreignRaw[currency]);
  const personalRaw = raw['personalRates'] && typeof raw['personalRates'] === "object" ? raw['personalRates'] as Record<string, PersonalRate> : {};
  const personalRates: Partial<Record<Currency, PersonalRate>> = {};
  for (const currency of CURRENCIES) {
    const entry = personalRaw[currency];
    if (entry && Number.isFinite(entry.rate) && entry.rate > 10 && entry.rate < 1000 && /^\d{4}-\d{2}-\d{2}$/.test(entry.day)) personalRates[currency] = { rate: entry.rate, day: entry.day };
  }
  const exchanges: ExchangeRecord[] = Array.isArray(raw['exchanges']) ? raw['exchanges'].slice(-100).filter((entry): entry is ExchangeRecord =>
    !!entry && typeof entry === "object" && typeof entry.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.day) && CURRENCIES.includes(entry.currency) && Number.isFinite(entry.spent) && entry.spent > 0 && Number.isFinite(entry.received) && entry.received > 0,
  ) : [];
  const snapshots = Array.isArray(raw['snapshots']) ? raw['snapshots'].slice(-31).filter((item): item is WalletSnapshot =>
    !!item && typeof item === "object" && typeof item.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.day) && Number.isFinite(item.dinars) && item.dinars >= 0,
  ).map((item) => ({ day: item.day, dinars: item.dinars, foreign: item.foreign && typeof item.foreign === "object" ? item.foreign : {} })) : [];
  return { counts, looseDinars: clampMoney(raw['looseDinars']), foreign, currency: CURRENCIES.includes(raw['currency'] as Currency) ? raw['currency'] as Currency : "EUR", personalRates, exchanges, snapshots, updatedAt: typeof raw['updatedAt'] === "string" ? raw['updatedAt'] : new Date().toISOString() };
}

function clampInt(value: unknown) { return Math.min(100000, Math.max(0, Math.trunc(Number(value) || 0))); }
function clampMoney(value: unknown) { return Math.min(100000000, Math.max(0, Math.round((Number(value) || 0) * 100) / 100)); }

export function dinarTotal(wallet: WalletState) {
  return DENOMINATIONS.reduce((sum, note) => sum + note.value * (wallet.counts[String(note.value)] || 0), wallet.looseDinars);
}

export function convertedForeign(wallet: WalletState, selected: Currency, rates: RatesResponse, mode: "official" | "parallel") {
  const selectedRate = rates.rates[selected]?.[mode];
  if (!selectedRate || selectedRate <= 0) return null;
  let result = 0;
  for (const currency of CURRENCIES) {
    const amount = wallet.foreign[currency] || 0;
    if (!amount) continue;
    if (currency === selected) result += amount;
    else {
      const sourceRate = rates.rates[currency]?.[mode];
      if (!sourceRate || sourceRate <= 0) return null;
      result += amount * sourceRate / selectedRate;
    }
  }
  return result;
}

export function walletTotal(wallet: WalletState, selected: Currency, rates: RatesResponse, mode: "official" | "parallel") {
  const rate = rates.rates[selected]?.[mode];
  const foreign = convertedForeign(wallet, selected, rates, mode);
  return rate && foreign !== null ? dinarTotal(wallet) / rate + foreign : null;
}

export function exchangeCurrency(wallet: WalletState, currency: Currency, amount: number, receivedDinars: number, day = new Date().toISOString().slice(0, 10)): WalletState | null {
  if (!Number.isFinite(amount) || !Number.isFinite(receivedDinars) || amount <= 0 || receivedDinars <= 0 || amount > (wallet.foreign[currency] || 0) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  // L'opération n'invente pas de billets : la somme reçue reste en appoint jusqu'au comptage.
  const rate = receivedDinars / amount;
  if (rate <= 10 || rate >= 1000) return null;
  return { ...wallet, looseDinars: clampMoney(wallet.looseDinars + receivedDinars), foreign: { ...wallet.foreign, [currency]: clampMoney((wallet.foreign[currency] || 0) - amount) }, personalRates: { ...wallet.personalRates, [currency]: { rate, day } }, exchanges: [...wallet.exchanges, { id: crypto.randomUUID(), day, currency, spent: amount, received: receivedDinars, rate }].slice(-100), updatedAt: new Date().toISOString() };
}

// Dernier relevé vérifié, conservé comme secours si la collecte est temporairement indisponible.
// Les dates restent visibles dans l'interface ; ce jeu ne doit jamais être présenté comme un cours du jour.
export const LAST_KNOWN_RATES: RatesResponse = { checkedAt: null, rates: {
  EUR: { official: 150.5966, parallel: 277, officialDate: "2026-10-28", parallelDate: "2026-10-20T18:00:29.328Z" },
  USD: { official: 135.1187, parallel: 242.5, officialDate: "2026-10-28", parallelDate: "2026-10-20T18:00:29.328Z" },
  GBP: { official: 179.9903, parallel: 317.5, officialDate: "2026-10-28", parallelDate: "2026-10-20T18:00:29.328Z" },
  CAD: { official: 96.2899, parallel: 171.5, officialDate: "2026-10-28", parallelDate: "2026-10-20T18:00:29.328Z" },
  CHF: { official: 162.9605, parallel: 289.75, officialDate: "2026-10-28", parallelDate: "2026-10-20T18:00:29.328Z" },
} };
