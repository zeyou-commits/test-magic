/**
 * Marchés de la rive sud. Le lancement ne concerne que l'Algérie : la Tunisie et le Maroc sont
 * déclarés mais inactifs. Ouvrir un pays : passer `active` à true, ajouter ses ports et sa devise.
 * Le code parle de « rive sud », jamais de « DZ », pour que ce soit le seul endroit à changer.
 */
export const MARKETS = {
  DZ: { name: "Algérie", currency: "DZD", active: true },
  TN: { name: "Tunisie", currency: "TND", active: false },
  MA: { name: "Maroc", currency: "MAD", active: false },
} as const;

export type MarketCode = keyof typeof MARKETS;

const clean = (code: string) => code.trim().toUpperCase();

/** Pays de la rive sud actuellement ouvert aux voyageurs. */
export const isSouthShore = (code: string) => {
  const market = MARKETS[clean(code) as MarketCode];
  return Boolean(market?.active);
};
export const isNorthShore = (code: string) => !isSouthShore(code);

/** Une traversée vers le bled : d'une rive nord vers un marché ouvert. */
export const isTowardsSouth = (fromCode: string, toCode: string) =>
  isNorthShore(fromCode) && isSouthShore(toCode);
