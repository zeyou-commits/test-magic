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
  tripsToDemote,
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
  // Aucune autre traversée déclarée : rien à déclasser.
  const none = {
    eq: () => none,
    then: (done: (r: unknown) => void) => done({ data: [], error: null }),
  };
  mocks.from.mockReturnValue({ upsert: mocks.upsert, select: () => none });
});
describe("« Ma traversée » est unique", () => {
  const now = Date.parse("2026-11-01T00:00:00Z");
  const trip = (id: string, day: string) => ({
    id,
    departure_at: `2026-${day}T10:00:00Z`,
    arrival_at: `2026-${day}T22:00:00Z`,
  });
  const trips = [trip("past", "10-01"), trip("a", "11-10"), trip("b", "11-20"), trip("c", "12-05")];
  it("un nouvel aller déclasse les autres voyages à venir, jamais les passés", () => {
    expect(tripsToDemote(trips, ["c"], "outbound", now)).toEqual(["a", "b"]);
  });
  it("un aller-retour garde ses deux traversées", () => {
    expect(tripsToDemote(trips, ["a", "b"], "outbound", now)).toEqual(["c"]);
  });
  it("un retour déclaré seul garde l'aller qui le précède", () => {
    expect(tripsToDemote(trips, ["c"], "inbound", now)).toEqual(["a"]);
  });
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
  it("enregistre l’aller et le retour dans un même voyage, puis suit les deux départs", async () => {
    const outward = "00000000-0000-4000-8000-000000000011";
    const returning = "00000000-0000-4000-8000-000000000012";
    await saveTravelAction("voyageur", {
      type: "follow",
      kind: "departure",
      targetId: outward,
      label: "Sète → Béjaïa",
      traveller: true,
      purpose: "voyageur",
      journeyLeg: "outbound",
      returnDepartureId: returning,
    });
    expect(mocks.from).toHaveBeenCalledWith("bw_journeys");
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "voyageur",
        outbound_departure_id: outward,
        inbound_departure_id: returning,
      }),
      { onConflict: "user_id,outbound_departure_id" },
    );
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        target_id: returning,
        traveller: true,
        follow_purpose: "voyageur",
      }),
      { onConflict: "user_id,target_kind,target_id" },
    );
  });
  it("ne crée pas de voyage personnel pour un proche ou un curieux", async () => {
    await saveTravelAction("proche", {
      type: "follow",
      kind: "departure",
      targetId: "00000000-0000-4000-8000-000000000011",
      label: "Alger → Marseille",
      traveller: false,
      purpose: "proche",
    });
    expect(mocks.from).not.toHaveBeenCalledWith("bw_journeys");
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        traveller: false,
        follow_purpose: "proche",
      }),
      { onConflict: "user_id,target_kind,target_id" },
    );
  });
});
