import { describe, expect, it } from "vitest";
import { chatParts, emoteToken } from "./chatEmotes";

const BANK = [{ code: "chaleur", label: "Il fait chaud", image: "/cabas/humeurs/chaleur.webp" }];

describe("les émoticônes du site dans un message", () => {
  it("remplace le code par l'image de la banque", () => {
    expect(chatParts(`On étouffe ${emoteToken("chaleur")} ici`, BANK)).toEqual([
      { type: "text", text: "On étouffe " },
      { type: "emote", code: "chaleur", label: "Il fait chaud", image: BANK[0]!.image },
      { type: "text", text: " ici" },
    ]);
  });

  it("laisse tel quel un code inconnu ou une heure", () => {
    expect(chatParts(":retiree: à 17:30:", BANK)).toEqual([
      { type: "text", text: ":retiree: à 17:30:" },
    ]);
  });
});
