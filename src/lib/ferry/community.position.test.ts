import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { currentPosition, locationProblem } from "./community";

const located = { coords: { latitude: 43.3, longitude: 5.3 } };
function stub(getCurrentPosition: unknown) {
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
  vi.stubGlobal("window", { setTimeout, clearTimeout, location: { pathname: "/" } });
}

describe("position de l'appareil", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("un navigateur muet ne bloque jamais l'action", async () => {
    stub(() => undefined);
    const result = currentPosition(1_000);
    await vi.advanceTimersByTimeAsync(13_000);
    await expect(result).resolves.toBeNull();
    expect(locationProblem()).toBe("silent");
  });
  it("position refusée : pas de second essai", async () => {
    const get = vi.fn((_ok, fail) => fail({ code: 1, PERMISSION_DENIED: 1 }));
    stub(get);
    await expect(currentPosition(1_000)).resolves.toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
    expect(locationProblem()).toBe("denied");
  });
  it("réseau d'abord, GPS seulement à défaut", async () => {
    const get = vi.fn();
    get.mockImplementationOnce((_ok, fail) => fail({ code: 3, PERMISSION_DENIED: 1 }));
    get.mockImplementationOnce((ok) => ok(located));
    stub(get);
    await expect(currentPosition(1_000)).resolves.toEqual([43.3, 5.3]);
    expect(get.mock.calls[0]![2].enableHighAccuracy).toBe(false);
    expect(get.mock.calls[1]![2].enableHighAccuracy).toBe(true);
  });
});
