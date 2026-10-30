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
