import type { Currency, Rate, RatesResponse } from "./wallet";
import { CURRENCIES } from "./wallet";

const OFFICIAL_URL = "https://www.bank-of-algeria.dz/taux-de-change-journalier/";
const PARALLEL_URL = "https://squarealgerie.com/api/rates";

async function fetchText(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(9000), headers: { accept: "text/html,application/json" } });
  if (!response.ok) throw new Error(`Source indisponible (${response.status})`);
  return response.text();
}

export function parseOfficial(html: string): { date: string; values: Partial<Record<Currency, number>> } {
  const date = html.match(/<th[^>]*>\s*(\d{2}-\d{2}-\d{4})\s*<\/th>/i)?.[1];
  if (!date) throw new Error("Date de cotation officielle absente");
  const firstTable = html.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1] ?? "";
  const values: Partial<Record<Currency, number>> = {};
  for (const match of firstTable.matchAll(/<tr\b[^>]*>\s*<td[^>]*>\s*([A-Z]{3})\s*<\/td>\s*<td[^>]*>\s*([0-9]+(?:[.,][0-9]+)?)\s*<\/td>/gi)) {
    const code = match[1] as Currency;
    const value = Number((match[2] ?? "").replace(",", "."));
    if (CURRENCIES.includes(code) && value > 10 && value < 1000) values[code] = value;
  }
  if (!values.EUR) throw new Error("Cours EUR officiel absent");
  return { date: date.split("-").reverse().join("-"), values };
}

export function parseParallel(json: string): { date: string; values: Partial<Record<Currency, number>> } {
  const data = JSON.parse(json) as { updatedAt?: string; currencies?: { code: string; buy?: number; sell?: number }[] };
  if (!data.updatedAt || Number.isNaN(Date.parse(data.updatedAt)) || !Array.isArray(data.currencies)) throw new Error("Flux indicatif invalide");
  const values: Partial<Record<Currency, number>> = {};
  for (const row of data.currencies) {
    const code = row.code as Currency;
    if (!CURRENCIES.includes(code)) continue;
    const buy = Number(row.buy), sell = Number(row.sell);
    // Repère central uniquement : le sens achat/vente affiché par le fournisseur n'est pas présumé.
    if (buy > 10 && buy < 1000 && sell > 10 && sell < 1000) values[code] = (buy + sell) / 2;
  }
  if (!values.EUR) throw new Error("Cours EUR indicatif absent");
  return { date: data.updatedAt, values };
}

export async function refreshRates(previous: RatesResponse): Promise<RatesResponse> {
  const [official, parallel] = await Promise.allSettled([fetchText(OFFICIAL_URL), fetchText(PARALLEL_URL)]);
  const officialData = official.status === "fulfilled" ? (() => { try { return parseOfficial(official.value); } catch { return null; } })() : null;
  const parallelData = parallel.status === "fulfilled" ? (() => { try { return parseParallel(parallel.value); } catch { return null; } })() : null;
  if (!officialData && !parallelData) return previous;
  const rates: Partial<Record<Currency, Rate>> = { ...previous.rates };
  for (const currency of CURRENCIES) {
    const old = rates[currency];
    rates[currency] = {
      official: officialData?.values[currency] ?? old?.official ?? null,
      parallel: parallelData?.values[currency] ?? old?.parallel ?? null,
      officialDate: officialData?.values[currency] ? officialData.date : old?.officialDate ?? null,
      parallelDate: parallelData?.values[currency] ? parallelData.date : old?.parallelDate ?? null,
    };
  }
  return { rates, checkedAt: new Date().toISOString() };
}
