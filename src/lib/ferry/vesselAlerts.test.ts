import { describe, expect, it } from "vitest";
import type { NewsItem } from "./flash";
import type { VesselIncident } from "./incidents";
import { vesselAlerts } from "./vesselAlerts";

const news = (over: Partial<NewsItem>) =>
  ({
    id: "n",
    kind: "alerte",
    title: "Le navire est immobilisé",
    summary: "Détail",
    source_name: "Source",
    source_url: null,
    vessel_id: "v1",
    ...over,
  }) as NewsItem;
const incident = (status: VesselIncident["status"]) =>
  ({ id: "i", vessel_id: "v1", status, public_note: "", source_name: "Presse" }) as VesselIncident;

describe("vesselAlerts", () => {
  it("signale un navire rattaché à une alerte Flash", () => {
    expect(vesselAlerts([], [news({})]).get("v1")).toMatchObject({
      level: "critical",
      label: "Navire immobilisé",
      fromIncident: false,
    });
  });

  it("ignore les infos ordinaires et les alertes sans navire", () => {
    expect(vesselAlerts([], [news({ kind: "info" }), news({ vessel_id: null })]).size).toBe(0);
  });

  it("n'expose pas un dossier encore seulement signalé", () => {
    expect(vesselAlerts([incident("reported"), incident("resolved")], []).size).toBe(0);
  });

  it("donne la priorité au dossier confirmé", () => {
    expect(vesselAlerts([incident("confirmed")], [news({})]).get("v1")?.fromIncident).toBe(true);
  });

  it("ne laisse pas un dossier en vérification adoucir une alerte publiée", () => {
    expect(vesselAlerts([incident("verifying")], [news({})]).get("v1")?.level).toBe("critical");
    expect(vesselAlerts([incident("verifying")], []).get("v1")?.level).toBe("possible");
  });
});
