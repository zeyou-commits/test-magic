import { describe, expect, it } from "vitest";
import { newsAudience } from "./newsAudience";

const vessels = [
  { id: "nicoli", company_id: "corsica" },
  { id: "tariq", company_id: "algerie" },
];
const departures = [
  { id: "d-corsica", vessel_id: "nicoli", company_id: "corsica" },
  { id: "d-algerie", vessel_id: "tariq", company_id: "algerie" },
];
const follows = [
  { user_id: "bateau", target_kind: "vessel", target_id: "nicoli" },
  { user_id: "voyage", target_kind: "departure", target_id: "d-corsica" },
  { user_id: "compagnie", target_kind: "company", target_id: "corsica" },
  { user_id: "autre", target_kind: "vessel", target_id: "tariq" },
  { user_id: "autre-voyage", target_kind: "departure", target_id: "d-algerie" },
  { user_id: "port", target_kind: "port", target_id: "corsica" },
];
const audience = (news: Partial<Parameters<typeof newsAudience>[0]>) =>
  newsAudience({ company_ids: [], departure_ids: [], ...news }, follows, vessels, departures).sort();

describe("qui prévenir d'une actualité", () => {
  it("une actualité de compagnie prévient la compagnie, ses navires et ses traversées", () => {
    expect(audience({ company_ids: ["corsica"] })).toEqual(["bateau", "compagnie", "voyage"]);
  });

  it("une actualité de navire prévient ce navire et ses traversées, pas sa compagnie", () => {
    expect(audience({ vessel_id: "tariq" })).toEqual(["autre", "autre-voyage"]);
  });

  it("une actualité de traversée prévient ses voyageurs", () => {
    expect(audience({ departure_ids: ["d-algerie"] })).toEqual(["autre-voyage"]);
  });

  it("une actualité générale ne prévient personne", () => {
    expect(audience({})).toEqual([]);
  });

  it("ne prévient qu'une fois une même personne", () => {
    const twice = [
      { user_id: "bateau", target_kind: "vessel", target_id: "nicoli" },
      { user_id: "bateau", target_kind: "company", target_id: "corsica" },
    ];
    expect(
      newsAudience({ company_ids: ["corsica"], departure_ids: [] }, twice, vessels, departures),
    ).toEqual(["bateau"]);
  });
});
