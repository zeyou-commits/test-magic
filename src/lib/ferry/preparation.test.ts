import { describe, expect, it } from "vitest";
import { articles } from "@/content/articles";
import { currentPhase, defaultProfile, itemsFor, prepItems, prepProgress, tripDirection } from "./preparation";

describe("parcours de préparation", () => {
  it("n'affiche que les lignes du voyage", () => {
    const onFoot = itemsFor({ ...defaultProfile, vehicle: false }).map((item) => item.id);
    expect(onFoot).not.toContain("vehicle");
    expect(onFoot).not.toContain("route");
    expect(itemsFor({ ...defaultProfile, kids: true }).map((item) => item.id)).toContain("kids");
  });
  it("ne redemande pas au retour ce qui a été vérifié à l'aller", () => {
    const back = itemsFor(defaultProfile, "return").map((item) => item.id);
    expect(back).not.toContain("identity");
    expect(back).not.toContain("admission");
    expect(back).not.toContain("landing");
    expect(back).toContain("return-papers");
    expect(itemsFor(defaultProfile).map((item) => item.id)).not.toContain("return-papers");
    expect(tripDirection({ country_code: "DZ" })).toBe("return");
    expect(tripDirection({ country_code: "FR" })).toBe("outbound");
  });
  it("compte seulement les lignes concernées et trouve la suivante", () => {
    const progress = prepProgress({
      profile: { ...defaultProfile, vehicle: false },
      done: ["vehicle", "tickets"],
    });
    expect(progress.done).toBe(1);
    expect(progress.next?.id).toBe("identity");
  });
  it("ouvre la bonne phase selon le calendrier", () => {
    expect(currentPhase(40)).toBe("papers");
    expect(currentPhase(5)).toBe("bags");
    expect(currentPhase(1)).toBe("eve");
    expect(currentPhase(-1)).toBe("arrival");
  });
  it("renvoie vers des articles qui existent", () => {
    for (const item of prepItems) {
      if (!item.href?.startsWith("/guide/")) continue;
      expect(articles.some((article) => `/guide/${article.slug}` === item.href)).toBe(true);
    }
  });
});
