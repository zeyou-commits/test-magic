import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({}) }) },
}));

const umami = { track: vi.fn(), identify: vi.fn() };

beforeEach(() => {
  vi.resetModules();
  umami.track.mockReset();
  umami.identify.mockReset();
  vi.stubGlobal("navigator", { webdriver: false });
  vi.stubGlobal("window", {
    location: { hostname: "bledway.com", pathname: "/" },
    umami,
    setTimeout,
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("mesure Umami", () => {
  it("envoie l'événement avec ses propriétés lisibles, sans les vides", async () => {
    const { track } = await import("./usage");
    track("fiche-ouverte", "vessel", { nom: "Le Cracovia", vide: "", rien: null });
    expect(umami.track).toHaveBeenCalledWith("fiche-ouverte", {
      detail: "vessel",
      nom: "Le Cracovia",
    });
  });

  it("décrit la visite une seule fois tant que rien ne change", async () => {
    const { describeVisit } = await import("./usage");
    describeVisit({ compte: "inscrit", langue: "fr" });
    describeVisit({ compte: "inscrit", langue: "fr" });
    expect(umami.identify).toHaveBeenCalledTimes(1);
    describeVisit({ compte: "inscrit", langue: "ar" });
    expect(umami.identify).toHaveBeenCalledTimes(2);
    expect(umami.identify).toHaveBeenLastCalledWith({ compte: "inscrit", langue: "ar" });
  });

  it("ne mesure rien en local ni dans l'admin", async () => {
    (window as unknown as { location: { hostname: string } }).location.hostname = "localhost";
    const { track } = await import("./usage");
    track("partage", "whatsapp");
    expect(umami.track).not.toHaveBeenCalled();
  });
});
