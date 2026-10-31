import { describe, expect, it } from "vitest";
import { articles } from "@/content/articles";
import { currentPhase, defaultProfile, itemsFor, prepItems, prepProgress } from "./preparation";

describe("parcours de préparation", () => {
  it("n'affiche que les lignes du voyage", () => {
    const onFoot = itemsFor({ ...defaultProfile, vehicle: false }).map((item) => item.id);
    expect(onFoot).not.toContain("vehicle");
    expect(onFoot).not.toContain("route");
    expect(itemsFor({ ...defaultProfile, kids: true }).map((item) => item.id)).toContain("kids");
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
