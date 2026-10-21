import { describe, expect, it } from "vitest";
import { emptyFilters } from "./types";
import { filtersFromUrl, mapStateToSearch } from "./urlState";

describe("sens du voyage dans l'URL", () => {
  it("montre les allers simples quand aucun trajet n'est demandé", () => {
    expect(filtersFromUrl("").roundTrip).toBe(false);
    expect(mapStateToSearch(emptyFilters, null)).toBe("");
  });

  it("conserve le choix aller-retour dans un lien partagé", () => {
    const url = mapStateToSearch({ ...emptyFilters, roundTrip: true }, null);
    expect(url).toBe("?way=2");
    expect(filtersFromUrl(url).roundTrip).toBe(true);
  });

  it("reconnaît les anciens liens avec une date de retour", () => {
    expect(filtersFromUrl("?date=2026-11-01&ret=2026-11-15").roundTrip).toBe(true);
    expect(filtersFromUrl("?way=1&ret=2026-11-15").roundTrip).toBe(false);
    expect(filtersFromUrl("?way=1&ret=2026-11-15").returnDate).toBeNull();
  });
});
