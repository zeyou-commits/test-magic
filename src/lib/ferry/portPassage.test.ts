import { describe, expect, it } from "vitest";
import {
  chatRefusal,
  formatDocked,
  passageQuestion,
  pickerRows,
  portPassage,
  searchRows,
  visibleSteps,
} from "./portPassage";

const END = Date.parse("2026-11-01T13:00:00Z");
const DOCKED = "2026-11-01T13:00:00Z";
const at = (hours: number) => END + hours * 3_600_000;

describe("le passage du port", () => {
  it("s'ouvre à l'arrêt à quai et compte le temps, comme pour le Rosalind", () => {
    const state = portPassage({
      dockedSince: DOCKED,
      scheduledEnd: END,
      status: "onboard",
      now: at(2.25),
    });
    expect(state).toEqual({ active: true, minutes: 135 });
    expect(formatDocked(135)).toBe("2 h 15");
    expect(formatDocked(40)).toBe("40 min");
  });

  it("reste ouvert au-delà des 2 h de l'ancien réglage, jusqu'à 8 h", () => {
    expect(
      portPassage({ dockedSince: DOCKED, scheduledEnd: END, status: null, now: at(4) }).active,
    ).toBe(true);
    expect(
      portPassage({ dockedSince: DOCKED, scheduledEnd: END, status: null, now: at(8.1) }).active,
    ).toBe(false);
  });

  it("se ferme dès que la personne est sortie", () => {
    expect(
      portPassage({ dockedSince: DOCKED, scheduledEnd: END, status: "arrived", now: at(1) }).active,
    ).toBe(false);
  });

  it("sans signal, s'ouvre sur déclaration, sans inventer de durée", () => {
    expect(
      portPassage({ dockedSince: null, scheduledEnd: END, status: null, now: at(1) }).active,
    ).toBe(false);
    expect(
      portPassage({ dockedSince: null, scheduledEnd: END, status: "landing", now: at(1) }),
    ).toEqual({
      active: true,
      minutes: null,
    });
  });

  it("propose les étapes du voyage, puis celles de l'arrivée", () => {
    expect(visibleSteps(null, END, at(-3))).toEqual(["en_route", "port", "onboard", "landing"]);
    expect(visibleSteps("onboard", END, at(-0.25))).toEqual([
      "onboard",
      "landing",
      "controls",
      "arrived",
    ]);
    expect(visibleSteps("controls", END, at(-3))).toContain("arrived");
  });

  it("pose une question adaptée à l'étape", () => {
    expect(passageQuestion("controls").question).toMatch(/contrôles/);
    expect(passageQuestion("landing").question).toMatch(/débarquement/i);
    expect(passageQuestion(null).answers.length).toBe(4);
  });

  it("retrouve une traversée par port ou date, sans tenir compte des accents", () => {
    const rows = pickerRows(
      [
        { id: "b", departure_at: "2026-11-12T10:00:00Z", route_id: "r2" },
        { id: "a", departure_at: "2026-11-05T10:00:00Z", route_id: "r1" },
      ],
      [
        { id: "r1", departure_port_id: "p1", arrival_port_id: "p2" },
        { id: "r2", departure_port_id: "p2", arrival_port_id: "p3" },
      ],
      [
        { id: "p1", name: "Sète" },
        { id: "p2", name: "Oran" },
        { id: "p3", name: "Béjaïa" },
      ],
      (iso) => iso.slice(8, 10) + " nov",
    );
    expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
    expect(rows[1]!.line).toBe("Oran → Béjaïa");
    expect(searchRows(rows, "sete").map((row) => row.id)).toEqual(["a"]);
    expect(searchRows(rows, "BEJAIA 12").map((row) => row.id)).toEqual(["b"]);
    expect(searchRows(rows, "alger")).toEqual([]);
    expect(searchRows(rows, "  ")).toHaveLength(2);
  });

  it("explique un refus", () => {
    expect(chatRefusal("phone")).toMatch(/téléphone/);
    expect(chatRefusal("inconnu")).toMatch(/refusé/);
  });
});
