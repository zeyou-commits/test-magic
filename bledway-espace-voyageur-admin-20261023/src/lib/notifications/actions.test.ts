import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  upsert: vi.fn().mockResolvedValue({ error: null }),
  from: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
import {
  clearTravelAction,
  pendingTravelAction,
  rememberTravelAction,
  saveTravelAction,
  travelActionSchema,
  type TravelAction,
} from "./actions";

const intent: TravelAction = {
  type: "opening",
  routeId: "00000000-0000-4000-8000-000000000001",
  from: "Sète",
  to: "Béjaïa",
  period: "2027-07",
  origin: "Paris, France",
  destination: "Chlef, Algérie",
  vehicle: "sedan",
  adults: 2,
  children: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    setItem: (key: string, value: string) => data.set(key, value),
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => data.delete(key),
  });
  mocks.from.mockReturnValue({ upsert: mocks.upsert });
});
describe("Reprise d’une alerte après connexion", () => {
  it("conserve le parcours complet et les passagers jusqu’à son enregistrement", async () => {
    rememberTravelAction(intent);
    expect(pendingTravelAction()).toEqual(intent);
    await saveTravelAction("voyageur", pendingTravelAction()!);
    expect(mocks.from).toHaveBeenCalledWith("bw_itinerary_watches");
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "voyageur",
        period_month: "2027-07-01",
        route_id: intent.routeId,
        journey_context: { vehicle: "sedan", adults: 2, children: 1 },
      }),
      { onConflict: "user_id,route_id,period_month" },
    );
    clearTravelAction();
    expect(pendingTravelAction()).toBeNull();
  });
  it("ne reprend pas une intention expirée", () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(100);
    rememberTravelAction(intent);
    vi.spyOn(Date, "now").mockReturnValueOnce(8 * 86400000);
    expect(pendingTravelAction()).toBeNull();
    vi.restoreAllMocks();
  });
  it("rejette les mois et identifiants invalides avant une écriture", () => {
    expect(travelActionSchema.safeParse({ ...intent, period: "2027-13" }).success).toBe(false);
    expect(
      travelActionSchema.safeParse({
        type: "follow",
        kind: "admin",
        targetId: "invalid",
        label: "Bateau",
      }).success,
    ).toBe(false);
  });
  it("garde une erreur d’enregistrement visible plutôt que de déclarer un succès", async () => {
    mocks.upsert.mockResolvedValueOnce({ error: { message: "database unavailable" } });
    await expect(saveTravelAction("voyageur", intent)).rejects.toThrow("Enregistrement impossible");
  });
});
