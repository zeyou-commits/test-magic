import { describe, expect, it } from "vitest";
import { audienceSchema, inQuietHours, templateText, type AudienceContext } from "./messages";

const departure: AudienceContext = {
  subject: "Marseille → Alger",
  from: "Marseille",
  to: "Alger",
  port: "Marseille",
  when: "le mar. 4 nov. à 19:00",
  url: "/?select=departure&id=x",
  urlLabel: "la fiche de la traversée",
};
const fields = { minutes: "", newTime: "", oldTime: "" };

describe("modèles de messages", () => {
  it("rédige un retard pour une traversée, en heures au-delà d'une heure", () => {
    const text = templateText("delay", departure, { ...fields, minutes: "90" });
    expect(text.title).toBe("Marseille → Alger · retard d’environ 1 h 30");
    expect(text.body).toContain("Le départ prévu le mar. 4 nov. à 19:00");
  });
  it("parle de plusieurs traversées pour un port un jour donné", () => {
    const text = templateText(
      "cancel",
      { subject: "Alger", port: "Alger", when: "le mar. 4 nov.", url: "/", urlLabel: "" },
      fields,
    );
    expect(text.title).toBe("Alger · traversées annulées");
  });
  it("rappelle l'ancien horaire après un déplacement fait dans l'admin", () => {
    const text = templateText("reschedule", departure, { ...fields, oldTime: "17:00" });
    expect(text.body).toContain("départ le mar. 4 nov. à 19:00 (au lieu de 17:00)");
  });
  it("laisse le message libre vide", () => {
    expect(templateText("free", departure, fields)).toEqual({ title: "", body: "" });
  });
  it("tient les titres des modèles sous la limite de 80 caractères", () => {
    for (const id of [
      "delay",
      "cancel",
      "reschedule",
      "port_access",
      "port_closed",
      "documents",
    ] as const)
      expect(
        templateText(id, departure, { ...fields, minutes: "120" }).title.length,
      ).toBeLessThanOrEqual(80);
  });
});

describe("garde-fous", () => {
  it("repère les heures calmes à Paris", () => {
    expect(inQuietHours(new Date("2026-11-04T22:30:00Z"))).toBe(true); // 23 h 30 à Paris
    expect(inQuietHours(new Date("2026-11-04T09:00:00Z"))).toBe(false); // 10 h à Paris
  });
  it("refuse une cible incomplète", () => {
    expect(audienceSchema.safeParse({ kind: "departure", departureId: "x" }).success).toBe(false);
    expect(audienceSchema.safeParse({ kind: "all" }).success).toBe(true);
  });
});
