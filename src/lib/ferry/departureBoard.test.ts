import { describe, expect, it } from "vitest";
import { boardStatus, inPeriod, priceSearchHref } from "./departureBoard";

const now = Date.parse("2026-10-30T12:00:00Z");
const base = {
  departure: { status: "scheduled" as string, departure_at: "2026-10-31T12:00:00Z" },
  observedArrival: false,
  hold: null,
  signal: null,
  shiftMinutes: null,
  alert: null,
  now,
};

describe("boardStatus", () => {
  it("n'affiche qu'un statut prévu sans signal", () => {
    expect(boardStatus(base as never).label).toBe("Prévu");
  });
  it("ne confirme pas un départ passé sans signal", () => {
    const past = {
      ...base,
      departure: { ...base.departure, departure_at: "2026-10-30T10:00:00Z" },
    };
    expect(boardStatus(past as never).label).toBe("Non confirmé");
  });
  it("donne la priorité à l'alerte sur le signal", () => {
    const status = boardStatus({
      ...base,
      alert: { label: "Navire immobilisé", short: "Immobilisé" },
      signal: { phase: "sea", ageMinutes: 5 },
    } as never);
    expect(status).toMatchObject({ tone: "alert", label: "Immobilisé · à confirmer" });
  });
  it("garde une arrivée constatée et une annulation avant l'alerte", () => {
    const alert = { label: "Navire immobilisé", short: "Immobilisé" };
    expect(boardStatus({ ...base, alert, observedArrival: true } as never).label).toBe(
      "Arrivée constatée",
    );
    expect(
      boardStatus({
        ...base,
        alert,
        departure: { ...base.departure, status: "cancelled" },
      } as never).label,
    ).toBe("Annulée");
  });
  it("distingue en mer et à quai selon le signal", () => {
    expect(boardStatus({ ...base, signal: { phase: "sea", ageMinutes: 5 } } as never).label).toBe(
      "En mer",
    );
    expect(boardStatus({ ...base, signal: { phase: "port", ageMinutes: 5 } } as never).label).toBe(
      "À quai",
    );
  });
});

describe("inPeriod", () => {
  it("filtre par jour, par semaine ou par date précise", () => {
    expect(inPeriod("2026-10-30", "today", "2026-10-30", "2026-10-31", "2026-11-06")).toBe(true);
    expect(inPeriod("2026-10-31", "today", "2026-10-30", "2026-10-31", "2026-11-06")).toBe(false);
    expect(inPeriod("2026-11-06", "week", "2026-10-30", "2026-10-31", "2026-11-06")).toBe(true);
    expect(inPeriod("2026-11-07", "week", "2026-10-30", "2026-10-31", "2026-11-06")).toBe(false);
    expect(inPeriod("2026-11-07", "2026-11-07", "2026-10-30", "2026-10-31", "2026-11-06")).toBe(
      true,
    );
  });
});

describe("priceSearchHref", () => {
  it("préremplit le trajet, la date et le sens", () => {
    const href = priceSearchHref({ id: "alg", country_code: "DZ" }, { id: "mrs" }, "2026-11-02");
    const params = new URLSearchParams(href.slice(2));
    expect(params.get("from")).toBe("alg");
    expect(params.get("to")).toBe("mrs");
    expect(params.get("date")).toBe("2026-11-02");
    expect(params.get("way")).toBe("1");
    expect(params.get("dir")).toBe("dz");
  });
});
