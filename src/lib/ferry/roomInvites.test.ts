import { describe, expect, it } from "vitest";
import { activeInvite, activeWave, stageInvite, voyageStage } from "./roomInvites";

const START = "2026-11-02T10:00:00Z";
const at = (hours: number) => Date.parse(START) + hours * 3_600_000;
const iso = (hours: number) => new Date(at(hours)).toISOString();
const base = {
  departureAt: START,
  leadMinutes: 240,
  departed: false,
  arrivedAt: null,
  postponed: false,
};

describe("les invitations au salon selon l'état du voyage", () => {
  it("suit le voyage, de quelques jours avant jusqu'à l'arrivée à quai", () => {
    expect(voyageStage({ ...base, now: at(-24 * 8) })).toBeNull();
    expect(voyageStage({ ...base, now: at(-48) })).toBe("soon");
    expect(voyageStage({ ...base, now: at(-3) })).toBe("boarding");
    expect(voyageStage({ ...base, departed: true, now: at(2) })).toBe("sea");
    expect(voyageStage({ ...base, departed: true, arrivedAt: iso(9), now: at(10) })).toBe("docked");
    expect(voyageStage({ ...base, arrivedAt: iso(9), now: at(18) })).toBeNull();
  });

  it("n'invite pas si le départ est reporté, ni longtemps après sans signal", () => {
    expect(voyageStage({ ...base, postponed: true, now: at(-1) })).toBeNull();
    expect(voyageStage({ ...base, now: at(7) })).toBeNull();
  });

  it("donne des exemples et limite le salon animé à 2 rappels", () => {
    expect(stageInvite("docked").examples.length).toBeGreaterThan(0);
    expect(activeInvite(8).body).toMatch(/8 messages/);
    expect(activeWave(4)).toBe(0);
    expect(activeWave(5)).toBe(1);
    expect(activeWave(15)).toBe(2);
    expect(activeWave(500)).toBe(2);
  });
});
