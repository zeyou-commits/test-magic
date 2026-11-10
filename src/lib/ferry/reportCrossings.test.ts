import { describe, expect, it } from "vitest";
import type { Departure } from "@/lib/ferry/types";
import { crossingsFromPort, crossingWindow, needsCrossing } from "./reportCrossings";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const day = 86_400_000;
const dep = (id: string, offsetMs: number, extra: Partial<Departure> = {}) =>
  ({
    id,
    route_id: "marseille-alger",
    departure_at: new Date(NOW + offsetMs).toISOString(),
    status: "scheduled",
    is_demo: false,
    ...extra,
  }) as Departure;
const routes = [
  { id: "marseille-alger", departure_port_id: "marseille" },
  { id: "alger-marseille", departure_port_id: "alger" },
];

describe("traversées proposées pour un signalement", () => {
  it("concerne le retard et l'embarquement seulement", () => {
    expect(needsCrossing("delay")).toBe(true);
    expect(needsCrossing("boarding")).toBe(true);
    expect(needsCrossing("state")).toBe(false);
    expect(needsCrossing(null)).toBe(false);
  });

  it("ne garde que les départs de ce port sur les 7 prochains jours", () => {
    const list = crossingsFromPort(
      [
        dep("dans-8-jours", 8 * day),
        dep("dans-2-jours", 2 * day),
        dep("dans-1-heure", 3_600_000),
        dep("parti-il-y-a-6h", -6 * 3_600_000),
        dep("parti-il-y-a-2-jours", -2 * day),
        dep("arrive-il-y-a-3h", -20 * 3_600_000, {
          arrival_at: new Date(NOW - 3 * 3_600_000).toISOString(),
        }),
        dep("en-mer", -20 * 3_600_000, { arrival_at: new Date(NOW + 3_600_000).toISOString() }),
        dep("autre-port", day, { route_id: "alger-marseille" }),
        dep("annulee", day, { status: "cancelled" }),
        dep("exemple", day, { is_demo: true }),
      ],
      routes,
      "marseille",
      NOW,
    );
    expect(list.map((item) => item.id)).toEqual([
      "en-mer",
      "parti-il-y-a-6h",
      "dans-1-heure",
      "dans-2-jours",
    ]);
  });

  it("l'équipe peut voir au-delà de 7 jours", () => {
    const list = crossingsFromPort([dep("dans-8-jours", 8 * day)], routes, "marseille", NOW, true);
    expect(list).toHaveLength(1);
    expect(Date.parse(crossingWindow(NOW, false).until) - NOW).toBe(7 * day);
  });

  it("sans port, aucune traversée", () => {
    expect(crossingsFromPort([dep("a", day)], routes, null, NOW)).toEqual([]);
  });
});
