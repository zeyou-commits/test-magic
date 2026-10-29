import { queryOptions } from "@tanstack/react-query";

/** Une devise cotée en dinars algériens par Square Algérie (marché parallèle, repère indicatif). */
export type FxQuote = { code: string; buy: number; sell: number; official?: number };
/** `official` : cours de la Banque d'Algérie (date de cotation `officialDate`), joint quand il est lisible. */
export type FxTicker = { updatedAt: string; currencies: FxQuote[]; officialDate?: string };

export const FX_SOURCE_URL = "https://squarealgerie.com/euro-dinar";
export const FX_OFFICIAL_URL = "https://www.bank-of-algeria.dz/taux-de-change-journalier/";
/** Au-delà, le taux n'est plus affiché : mieux vaut rien qu'un chiffre périmé. */
export const FX_MAX_AGE_MS = 24 * 3600_000;
/** Ordre d'affichage : les devises des voyageurs d'abord, le reste ensuite. */
export const FX_ORDER = [
  "EUR",
  "GBP",
  "CHF",
  "CAD",
  "USD",
  "TND",
  "MAD",
  "AED",
  "SAR",
  "TRY",
  "CNY",
  "USDT",
];
const SYMBOLS: Record<string, string> = { EUR: "€", GBP: "£", USD: "$", CHF: "CHF", CAD: "$ CA" };

export const fxSymbol = (code: string) => SYMBOLS[code] ?? code;
export const fxMid = (quote: FxQuote) => (quote.buy + quote.sell) / 2;

/** Lecture défensive du flux : seules les cotations plausibles sont gardées. */
export function parseFxTicker(input: unknown): FxTicker | null {
  type Raw = { updatedAt?: unknown; currencies?: unknown; officialDate?: unknown };
  type Row = { code?: unknown; buy?: unknown; sell?: unknown; official?: unknown } | null;
  const raw: Raw = input && typeof input === "object" ? (input as Raw) : {};
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : "";
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt)) || !Array.isArray(raw.currencies))
    return null;
  const currencies: FxQuote[] = [];
  for (const row of raw.currencies as Row[]) {
    const code = typeof row?.code === "string" ? row.code.toUpperCase() : "";
    const buy = Number(row?.buy);
    const sell = Number(row?.sell);
    if (!/^[A-Z]{3,4}$/.test(code) || !(buy > 0 && buy < 5000) || !(sell > 0 && sell < 5000))
      continue;
    const official = Number(row?.official);
    currencies.push(
      official > 0 && official < 5000 ? { code, buy, sell, official } : { code, buy, sell },
    );
  }
  if (!currencies.some((quote) => quote.code === "EUR")) return null;
  const rank = (code: string) =>
    FX_ORDER.includes(code) ? FX_ORDER.indexOf(code) : FX_ORDER.length;
  currencies.sort((a, b) => rank(a.code) - rank(b.code));
  const officialDate =
    typeof raw.officialDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.officialDate)
      ? raw.officialDate
      : undefined;
  return officialDate ? { updatedAt, currencies, officialDate } : { updatedAt, currencies };
}

/** Taux relus toutes les 15 min, seulement quand l'onglet est visible. */
export const fxTickerQuery = queryOptions({
  queryKey: ["fx-ticker"],
  queryFn: async () => {
    const response = await fetch("/api/fx-ticker");
    if (!response.ok) return null;
    return parseFxTicker(await response.json());
  },
  staleTime: 10 * 60_000,
  refetchInterval: 15 * 60_000,
  refetchIntervalInBackground: false,
  retry: 1,
});
