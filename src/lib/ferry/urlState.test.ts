import { describe, expect, it } from "vitest";
import { emptyFilters } from "./types";
import { filtersFromUrl, mapStateToSearch } from "./urlState";

describe("sens du voyage dans l'URL", () => {
  it("propose l'aller-retour par défaut", () => {
    expect(filtersFromUrl("").roundTrip).toBe(true);
    expect(mapStateToSearch(emptyFilters, null)).toBe("");
  });

  it("conserve le choix aller simple dans un lien partagé", () => {
    const url = mapStateToSearch({ ...emptyFilters, roundTrip: false }, null);
    expect(url).toBe("?way=1");
    expect(filtersFromUrl(url).roundTrip).toBe(false);
  });

  it("reconnaît les anciens liens avec une date de retour", () => {
    expect(filtersFromUrl("?date=2026-11-01&ret=2026-11-15").roundTrip).toBe(true);
    expect(filtersFromUrl("?way=1&ret=2026-11-15").roundTrip).toBe(false);
    expect(filtersFromUrl("?way=1&ret=2026-11-15").returnDate).toBeNull();
  });
});
