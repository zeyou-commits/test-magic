import { describe, expect, it } from "vitest";
import {
  REPORT_DEFAULTS,
  REPORT_LIMITS,
  fillReport,
  reportLang,
  vigieLevel,
} from "../../supabase/functions/_shared/reportTemplate";

describe("réponses aux signalements", () => {
  it("remplit la fiche, le badge et le nombre", () => {
    expect(
      fillReport(REPORT_DEFAULTS.fr.correctedBody, { fiche: "Marseille → Alger · 27/11" }),
    ).toMatch(/^Marseille → Alger · 27\/11 : on a vérifié/);
    expect(fillReport(REPORT_DEFAULTS.fr.badgeTitle, { badge: "Vigie" })).toBe(
      "Nouveau badge : Vigie 🏅",
    );
  });

  it("sans fiche connue, ne laisse pas de « : » en tête", () => {
    expect(fillReport("{fiche} : merci", {})).toBe("merci");
  });

  it("répond dans la langue du signalement, sinon en français", () => {
    expect(reportLang("ar")).toBe("ar");
    expect(reportLang("de")).toBe("fr");
    expect(reportLang(undefined)).toBe("fr");
  });

  it("chaque langue a tous les textes, dans les limites", () => {
    for (const texts of Object.values(REPORT_DEFAULTS)) {
      for (const [key, max] of Object.entries(REPORT_LIMITS)) {
        const text = texts[key as keyof typeof REPORT_LIMITS];
        expect(text, key).toBeTruthy();
        expect(text.length, key).toBeLessThanOrEqual(max);
      }
    }
  });

  it("donne le palier Vigie atteint", () => {
    expect(vigieLevel(0)).toBeNull();
    expect(vigieLevel(1)?.code).toBe("vigie");
    expect(vigieLevel(14)?.code).toBe("vigie_confirmee");
    expect(vigieLevel(60)?.code).toBe("capitaine_vigies");
  });
});
