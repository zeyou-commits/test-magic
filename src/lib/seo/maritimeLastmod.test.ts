import { describe, expect, it } from "vitest";
import { maritimeLastmods } from "./maritimeLastmod";

describe("maritimeLastmods", () => {
  const ports = [
    { id: "m", slug: "marseille", updated_at: "2026-09-15T10:00:00Z" },
    { id: "a", slug: "alger", updated_at: "2026-09-14T10:00:00Z" },
    { id: "o", slug: "oran", updated_at: "2026-11-01T10:00:00Z" },
  ];
  const routes = [
    {
      id: "ma",
      slug: "marseille-alger",
      updated_at: "2026-09-10T00:00:00Z",
      departure_port_id: "m",
      arrival_port_id: "a",
    },
    {
      id: "mo",
      slug: "marseille-oran",
      updated_at: "2026-09-10T00:00:00Z",
      departure_port_id: "m",
      arrival_port_id: "o",
    },
  ];

  it("date une ligne par son horaire le plus récemment modifié", () => {
    const entries = maritimeLastmods({
      ports,
      routes,
      departures: [
        { route_id: "ma", updated_at: "2026-11-20T08:00:00Z" },
        { route_id: "ma", updated_at: "2026-11-02T08:00:00Z" },
      ],
    });
    expect(entries.find((e) => e.path === "/lignes/marseille-alger")?.lastmod).toBe(
      "2026-11-20T08:00:00Z",
    );
    expect(entries.find((e) => e.path === "/lignes/marseille-oran")?.lastmod).toBe(
      "2026-09-10T00:00:00Z",
    );
  });

  it("date un port par la plus récente de ses lignes, ou par sa fiche si elle est plus récente", () => {
    const entries = maritimeLastmods({
      ports,
      routes,
      departures: [{ route_id: "ma", updated_at: "2026-11-20T08:00:00Z" }],
    });
    expect(entries.find((e) => e.path === "/ports/marseille")?.lastmod).toBe(
      "2026-11-20T08:00:00Z",
    );
    expect(entries.find((e) => e.path === "/ports/alger")?.lastmod).toBe("2026-11-20T08:00:00Z");
    expect(entries.find((e) => e.path === "/ports/oran")?.lastmod).toBe("2026-11-01T10:00:00Z");
  });
});
