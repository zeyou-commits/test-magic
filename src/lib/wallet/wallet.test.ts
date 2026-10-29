import { describe, expect, it } from "vitest";
import { dinarTotal, emptyWallet, exchangeCurrency, sanitizeWallet, walletTotal, type RatesResponse } from "./wallet";
import { parseOfficial, parseParallel } from "./rates.server";

const rates: RatesResponse = { checkedAt: "2026-10-29T00:00:00Z", rates: {
  EUR: { official: 150, parallel: 275, officialDate: "2026-10-28", parallelDate: "2026-10-28" },
  USD: { official: 135, parallel: 240, officialDate: "2026-10-28", parallelDate: "2026-10-28" },
} };

describe("Ma bezass", () => {
  it("compte chaque valeur une seule fois et garde les devises séparées", () => {
    const wallet = sanitizeWallet({ counts: { "2000": 5, "1000": 2, "500": 1 }, foreign: { EUR: 300 }, currency: "EUR" });
    expect(dinarTotal(wallet)).toBe(12500);
    expect(walletTotal(wallet, "EUR", rates, "official")).toBeCloseTo(383.333, 2);
    expect(walletTotal(wallet, "EUR", rates, "parallel")).toBeCloseTo(345.4545, 2);
  });

  it("transfère un change réel sans doubler les devises", () => {
    const wallet = sanitizeWallet({ foreign: { EUR: 300 } });
    const changed = exchangeCurrency(wallet, "EUR", 100, 27500);
    expect(changed?.foreign.EUR).toBe(200);
    expect(changed && dinarTotal(changed)).toBe(27500);
    expect(changed && walletTotal(changed, "EUR", rates, "parallel")).toBe(300);
    expect(exchangeCurrency(wallet, "EUR", 301, 1000)).toBeNull();
  });

  it("neutralise les quantités invalides", () => {
    const wallet = sanitizeWallet({ counts: { "2000": -5, "1000": "abc" }, foreign: { EUR: -100, USD: 12.345 }, currency: "XXX" });
    expect(wallet.counts[2000]).toBe(0);
    expect(wallet.counts[1000]).toBe(0);
    expect(wallet.foreign.EUR).toBe(0);
    expect(wallet.foreign.USD).toBe(12.35);
    expect(wallet.currency).toBe("EUR");
    expect(emptyWallet().counts).toEqual({});
  });

  it("lit les deux sources avec leurs dates et refuse un flux sans EUR", () => {
    const official = parseOfficial("<table><tr><th></th><th>28-10-2026</th></tr><tr><td>USD</td><td>135.1187</td></tr><tr><td>EUR</td><td>150.5966</td></tr></table>");
    expect(official.date).toBe("2026-10-28");
    expect(official.values.EUR).toBe(150.5966);
    const parallel = parseParallel(JSON.stringify({ updatedAt: "2026-10-28T18:00:00Z", currencies: [{ code: "EUR", buy: 278, sell: 276 }] }));
    expect(parallel.values.EUR).toBe(277);
    expect(() => parseParallel(JSON.stringify({ updatedAt: "2026-10-28", currencies: [] }))).toThrow();
  });
});
