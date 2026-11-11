import { describe, expect, it } from "vitest";
import { articles } from "@/content/articles";
import { prepItems } from "@/lib/ferry/preparation";
import { generalFaq, lineFaq } from "@/lib/seo/answers";
import { assistantPrompt, buildCorpus, highlightParts, searchHelp } from "./search";

const corpus = buildCorpus({
  line: lineFaq({
    from: "Marseille",
    to: "Alger",
    fromSlug: undefined,
    toSlug: undefined,
    minutes: 22 * 60,
    operators: ["Corsica Linea"],
    hasReverse: true,
  }),
  general: generalFaq([], [], []),
  articles,
  prep: prepItems,
});
const first = (query: string) => searchHelp(corpus, query)[0];

describe("« Une question ? » trouve la réponse dans ce que BledWay sait déjà", () => {
  it("rassemble questions fréquentes, dossiers et conseils, sans doublon", () => {
    expect(corpus.some((item) => item.source === "faq")).toBe(true);
    expect(corpus.some((item) => item.source === "guide")).toBe(true);
    expect(corpus.some((item) => item.source === "preparation")).toBe(true);
    const keys = corpus.map((item) => item.q.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("comprend les mots du voyageur, sans accents ni pluriel", () => {
    expect(first("TPD voiture")?.q).toMatch(/TPD/);
    expect(first("chien")?.q.toLowerCase()).toMatch(/animal/);
    expect(first("bébé")?.q.toLowerCase()).toMatch(/enfant|b[eé]b[eé]/);
    expect(first("especes 10000 euros")?.q.toLowerCase()).toMatch(/esp[eè]ces/);
  });

  it("met la ligne regardée en avant", () => {
    expect(first("combien de temps dure le ferry")?.source).toBe("ligne");
  });

  it("supporte une faute de frappe", () => {
    expect(first("cabinne fauteuil")?.q.toLowerCase()).toMatch(/cabine/);
  });

  it("ne répond rien plutôt que n'importe quoi", () => {
    expect(searchHelp(corpus, "")).toEqual([]);
    expect(searchHelp(corpus, "trottinette électrique pliable")).toEqual([]);
  });

  it("surligne les mots trouvés", () => {
    const parts = highlightParts("Prendre le ferry avec un animal", "chien");
    expect(parts.find((part) => part.hit)?.text).toMatch(/animal/);
  });

  it("prépare la question pour un assistant IA, avec le trajet", () => {
    const prompt = assistantPrompt("  Faut-il un visa ? ", "Marseille → Alger");
    expect(prompt).toMatch(/Marseille → Alger/);
    expect(prompt).toMatch(/Ma question : Faut-il un visa \?/);
  });
});
