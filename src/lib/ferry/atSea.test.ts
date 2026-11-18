import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { seaCheck } from "./atSea";

const ship = { latitude: 40, longitude: 4, ageMinutes: 10 };

describe("vérifié en mer", () => {
  it("vérifie quand la personne est près du navire", () => {
    expect(seaCheck([40.05, 4.05], ship).state).toBe("verified");
  });

  it("reste non vérifié sans position, loin du navire ou sans position récente du navire", () => {
    expect(seaCheck(null, ship)).toMatchObject({ state: "unverified" });
    expect(seaCheck([43.3, 5.37], ship)).toMatchObject({ state: "unverified" });
    expect(seaCheck([40, 4], { ...ship, ageMinutes: 400 })).toMatchObject({ state: "unverified" });
    expect(seaCheck([40, 4], null).reason).toMatch(/navire/);
  });
});
