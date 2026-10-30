import { describe, expect, it } from "vitest";
import { computeVesselFacts } from "./vesselFacts";
import type { Vessel } from "./types";

const vessel = (id: string, values: Partial<Vessel>) =>
  ({ id, name: id, status: "active", ...values }) as Vessel;
const upcoming = (...ids: string[]) => new Map(ids.map((id) => [id, 3]));

describe("computeVesselFacts", () => {
  it("ne classe que les navires qui ont un départ à venir", () => {
    const facts = computeVesselFacts(
      [vessel("a", { build_year: 2000 }), vessel("idle", { build_year: 1970 })],
      upcoming("a"),
    );
    expect(facts.byVessel.has("idle")).toBe(false);
    expect(facts.podiums.find((p) => p.key === "doyen")?.places[0]?.name).toBe("a");
  });

  it("donne le même rang à deux valeurs égales", () => {
    const facts = computeVesselFacts(
      [
        vessel("a", { build_year: 2005 }),
        vessel("b", { build_year: 2005 }),
        vessel("c", { build_year: 1990 }),
      ],
      upcoming("a", "b", "c"),
    );
    const places = facts.podiums.find((p) => p.key === "youngest")!.places;
    expect(places.map((p) => p.rank)).toEqual([1, 1, 3]);
  });

  it("donne quelque chose à dire à chaque navire, le meilleur rang d'abord", () => {
    const facts = computeVesselFacts(
      [
        vessel("big", { length_meters: 200, passenger_capacity: 3000 }),
        vessel("small", { length_meters: 100, passenger_capacity: 500 }),
      ],
      upcoming("big", "small"),
    );
    expect(facts.byVessel.get("small")![0]).toMatchObject({ rank: 1 });
    expect(facts.byVessel.get("small")!.map((f) => f.key)).toContain("intimate");
  });

  it("ignore une note sous cinq avis", () => {
    const list = [vessel("a", {}), vessel("b", {})];
    const reviews = new Map([
      ["a", { count: 1, average: 5 }],
      ["b", { count: 5, average: 3.5 }],
    ]);
    const places = computeVesselFacts(list, upcoming("a", "b"), reviews).podiums.find(
      (p) => p.key === "rated",
    )!.places;
    expect(places.map((p) => p.name)).toEqual(["b"]);
  });
});
