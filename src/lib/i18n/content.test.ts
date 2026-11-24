import { afterEach, describe, expect, it } from "vitest";
import { lazyContent, localizeContent, originalOf, setContentDict, tc } from "./content";
import { setCurrentLocale } from "./translate";

setContentDict("ar", { "Le visa": "التأشيرة", "Adulte {0}": "بالغ {0}", "{0} et {1}": "{0} و{1}" });

describe("contenus traduits", () => {
  afterEach(() => setCurrentLocale("fr"));

  it("laisse le français intact", () => {
    const data = [{ title: "Le visa" }];
    expect(localizeContent(data)).toBe(data);
    expect(tc("Adulte 2")).toBe("Adulte 2");
  });

  it("traduit textes, gabarits et lieux en arabe", () => {
    setCurrentLocale("ar");
    expect(tc("Adulte 2")).toBe("بالغ 2");
    expect(tc("Le visa et Adulte 3")).toBe("التأشيرة وبالغ 3");
    expect(tc("Inconnu")).toBe("Inconnu");
    const copy = localizeContent([{ id: "visa", title: "Le visa" }]);
    expect(copy[0]).toEqual({ id: "visa", title: "التأشيرة" });
    expect(originalOf(copy[0]!).title).toBe("Le visa");
  });

  it("une donnée exportée suit la langue", () => {
    const list = lazyContent([{ title: "Le visa" }]);
    expect(list[0]!.title).toBe("Le visa");
    setCurrentLocale("ar");
    expect(list.map((x) => x.title)).toEqual(["التأشيرة"]);
  });
});
