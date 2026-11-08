import { describe, expect, it } from "vitest";
import {
  JOURNEY_STEPS,
  RELATIVE_STEPS,
  currentStep,
  shownStep,
  journeyTimeline,
  stepGuide,
  stepItems,
  stepLabel,
  stepOfItem,
  stepState,
} from "./journeySteps";
import { defaultProfile, itemsFor, prepItems } from "./preparation";

const HOUR = 3_600_000;
const departureMs = Date.parse("2026-07-07T12:00:00Z");
const endMs = departureMs + 19 * HOUR;
const timeline = journeyTimeline({ departureMs, endMs, presentationMinutes: 300 });

describe("la route du bled en 8 étapes", () => {
  it("range chaque action du parcours dans une étape, sans en perdre", () => {
    for (const item of prepItems) expect(JOURNEY_STEPS).toContain(stepOfItem(item));
    const all = (direction: "outbound" | "return") =>
      JOURNEY_STEPS.flatMap((step) =>
        stepItems(step, defaultProfile, direction).map((i) => i.id),
      ).sort();
    expect(all("outbound")).toEqual(
      itemsFor(defaultProfile, "outbound")
        .map((i) => i.id)
        .sort(),
    );
    expect(all("return")).toEqual(
      itemsFor(defaultProfile, "return")
        .map((i) => i.id)
        .sort(),
    );
    expect(stepItems("road", defaultProfile, "outbound").map((i) => i.id)).toContain("route");
    expect(stepItems("last", defaultProfile, "outbound").map((i) => i.id)).toContain("fuel-dz");
  });

  it("nomme les étapes selon le sens et le lecteur", () => {
    expect(stepLabel("last")).toBe("Route au bled");
    expect(stepLabel("last", "return")).toBe("Route vers la destination");
    expect(stepLabel("home", "return")).toBe("À destination");
    expect(stepLabel("home", "outbound", "relative")).toBe("Bien arrivé·e");
  });

  it("suit le calendrier autour de la traversée", () => {
    const at = (ms: number) => currentStep({ timeline, now: ms });
    expect(at(departureMs - 20 * 24 * HOUR)).toBe("papers");
    expect(at(departureMs - 4 * 24 * HOUR)).toBe("vehicle");
    expect(at(departureMs - 24 * HOUR)).toBe("road");
    // Consigne de 5 h : à 4 h du départ, on est au port.
    expect(at(departureMs - 4 * HOUR)).toBe("port");
    expect(at(departureMs + 2 * HOUR)).toBe("sea");
    expect(at(endMs + HOUR)).toBe("arrival");
    expect(at(endMs + 5 * HOUR)).toBe("last");
    expect(at(endMs + 30 * HOUR)).toBe("home");
  });

  it("préfère la déclaration du voyageur, en avance ou en retard d'une étape", () => {
    // Bloqué au port alors que le départ est passé : le statut l'emporte.
    expect(currentStep({ timeline, now: departureMs + HOUR, status: "port" })).toBe("port");
    // Déjà en route la veille.
    expect(currentStep({ timeline, now: departureMs - 30 * HOUR, status: "en_route" })).toBe(
      "road",
    );
    // Un vieux statut « en route » n'efface pas l'arrivée.
    expect(currentStep({ timeline, now: endMs + HOUR, status: "en_route" })).toBe("arrival");
    // Débarquement en cours, puis « Sorti du port » : sur la route.
    expect(currentStep({ timeline, now: endMs + HOUR, status: "landing" })).toBe("arrival");
    expect(currentStep({ timeline, now: endMs + HOUR, status: "arrived" })).toBe("last");
    // « À bord » coché près de 6 h avant le départ : pas plausible, l'horaire l'emporte.
    expect(currentStep({ timeline, now: departureMs - 6 * HOUR, status: "onboard" })).toBe("road");
    // Embarqué 2 h avant le départ : plausible.
    expect(currentStep({ timeline, now: departureMs - 2 * HOUR, status: "onboard" })).toBe("sea");
    // Loin du voyage, le statut ne compte pas.
    expect(currentStep({ timeline, now: departureMs - 10 * 24 * HOUR, status: "port" })).toBe(
      "papers",
    );
  });

  it("passe à l'étape suivante quand les préparatifs sont bouclés en avance", () => {
    const now = departureMs - 20 * 24 * HOUR;
    expect(currentStep({ timeline, now, completed: ["papers"] })).toBe("vehicle");
    expect(currentStep({ timeline, now, completed: ["papers", "vehicle"] })).toBe("road");
  });

  it("limite la vue d'un proche à la traversée et l'arrivée", () => {
    expect(currentStep({ timeline, now: departureMs - 3 * 24 * HOUR, steps: RELATIVE_STEPS })).toBe(
      "sea",
    );
    expect(currentStep({ timeline, now: endMs + 5 * HOUR, steps: RELATIVE_STEPS })).toBe("last");
    expect(stepState("sea", "arrival", RELATIVE_STEPS)).toBe("done");
    expect(stepState("last", "arrival", RELATIVE_STEPS)).toBe("todo");
  });

  it("annonce la présentation au port sans la confondre avec une règle", () => {
    const guide = stepGuide({
      step: "port",
      direction: "outbound",
      audience: "traveller",
      from: "Barcelone",
      to: "Alger",
      presentationMinutes: null,
      departureMs,
      endMs,
      timeZone: "Europe/Madrid",
      arrivalTimeZone: "Africa/Algiers",
      vehicle: true,
    });
    // 14:00 à Barcelone : 10:00 en véhicule, 11:00 à pied, repère indicatif.
    expect(guide.lead).toContain("10:00 en véhicule");
    expect(guide.lead).toContain("11:00 à pied");
    expect(guide.lead).toContain("repère indicatif");
    expect(guide.lead).toContain("billet fait foi");
    const road = stepGuide({
      step: "road",
      direction: "outbound",
      audience: "traveller",
      from: "Barcelone",
      to: "Alger",
      presentationMinutes: 300,
      departureMs,
      endMs,
      timeZone: "Europe/Madrid",
      arrivalTimeZone: "Africa/Algiers",
      vehicle: true,
      roadMin: 640,
    });
    expect(road.lead).toContain("09:00");
    expect(road.lead).toContain("10 h 40");
    expect(road.links[0]?.href).toContain("stations-services.fr");
  });
});

describe("le volet de « Mon voyage » reste sur l'étape choisie", () => {
  it("un clic sur la frise l'emporte sur le survol et sur l'étape du moment", () => {
    expect(shownStep({ pinned: "papers", hover: "sea", closed: false, current: "sea" })).toBe("papers");
    expect(shownStep({ pinned: "papers", hover: null, closed: true, current: "road" })).toBe("papers");
  });
  it("l'étape du moment qui avance ne déplace pas une étape choisie", () => {
    const pinned = "vehicle" as const;
    const before = currentStep({ timeline, now: departureMs - 30 * 24 * HOUR });
    const during = currentStep({ timeline, now: departureMs + HOUR });
    expect(before).not.toBe(during);
    for (const current of [before, during])
      expect(shownStep({ pinned, hover: null, closed: false, current })).toBe(pinned);
  });
  it("sans choix : aperçu au survol, sinon l'étape du moment", () => {
    expect(shownStep({ pinned: null, hover: "port", closed: false, current: "papers" })).toBe("port");
    expect(shownStep({ pinned: null, hover: null, closed: false, current: "papers" })).toBe("papers");
    expect(shownStep({ pinned: null, hover: null, closed: true, current: "papers" })).toBeNull();
  });
});
