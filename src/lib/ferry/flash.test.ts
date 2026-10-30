import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { newsForContext, type NewsItem } from "./flash";

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const news = (id: string, kind: NewsItem["kind"], origin: NewsItem["origin"], hours: number) =>
  ({
    id,
    kind,
    origin,
    starts_at: hoursAgo(hours),
    route_ids: [],
    port_ids: [],
    company_ids: [],
    departure_ids: [],
  }) as unknown as NewsItem;

describe("hiérarchie du fil Flash", () => {
  it("alerte, perturbation récente, info de l'équipe, média, puis l'ancien par date", () => {
    const sorted = newsForContext([
      news("vieille-perturbation", "perturbation", "bledway", 72),
      news("media", "info", "media", 1),
      news("equipe", "info", "bledway", 5),
      news("perturbation", "perturbation", "official", 20),
      news("alerte", "alerte", "bledway", 60),
    ]);
    expect(sorted.map((item) => item.id)).toEqual([
      "alerte",
      "perturbation",
      "equipe",
      "media",
      "vieille-perturbation",
    ]);
  });
});

describe("newsForContext : fiche d'un navire", () => {
  const item = (over: Partial<NewsItem>) =>
    ({
      id: "x",
      kind: "alerte",
      origin: "bledway",
      starts_at: "2026-10-30T10:00:00Z",
      route_ids: ["line"],
      port_ids: [],
      company_ids: [],
      departure_ids: [],
      vessel_id: null,
      ...over,
    }) as NewsItem;
  it("n'affiche jamais une info qui nomme un autre navire", () => {
    const other = item({ vessel_id: "tariq" });
    expect(newsForContext([other], { routeIds: ["line"], vesselId: "nicoli" })).toEqual([]);
    expect(newsForContext([other], { routeIds: ["line"], vesselId: null })).toEqual([]);
  });
  it("garde son propre navire et les infos de ligne sans navire", () => {
    const own = item({ id: "a", vessel_id: "nicoli", route_ids: [] });
    const line = item({ id: "b" });
    const ids = newsForContext([own, line], { routeIds: ["line"], vesselId: "nicoli" }).map(
      (n) => n.id,
    );
    expect(ids.sort()).toEqual(["a", "b"]);
  });
  it("écarte les infos générales si la fiche le demande", () => {
    const general = item({ route_ids: [] });
    expect(newsForContext([general], { vesselId: "nicoli", attachedOnly: true })).toEqual([]);
  });
});
