import { describe, expect, it } from "vitest";
import { crossingPoints, peakWaves, seaLevel } from "./seaState";

describe("état de la mer", () => {
  it("suit l'échelle de Douglas", () => {
    expect(seaLevel(0.3).id).toBe("calm");
    expect(seaLevel(1).id).toBe("slight");
    expect(seaLevel(2).id).toBe("moderate");
    expect(seaLevel(3).id).toBe("rough");
    expect(seaLevel(5).id).toBe("high");
  });
  it("place les repères entre les deux ports", () => {
    const points = crossingPoints({ latitude: 43, longitude: 5 }, { latitude: 37, longitude: 3 });
    expect(points[1]).toEqual({ latitude: 40, longitude: 4 });
  });
  it("retient le maximum pendant la traversée seulement", () => {
    const start = Date.parse("2026-11-02T10:00:00Z");
    const end = Date.parse("2026-11-02T12:00:00Z");
    const hourly = {
      time: ["2026-11-02T05:00", "2026-11-02T10:00", "2026-11-02T12:00", "2026-11-02T20:00"],
      wave_height: [9, 1.1, null, 8],
    };
    expect(peakWaves([{ hourly }, { hourly: { time: ["2026-11-02T11:00"], wave_height: [1.8] } }], start, end)).toBe(1.8);
    expect(peakWaves([{ hourly: { time: ["2026-11-05T11:00"], wave_height: [2] } }], start, end)).toBeNull();
  });
});
