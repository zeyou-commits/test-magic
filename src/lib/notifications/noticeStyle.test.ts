import { describe, expect, it } from "vitest";
import { noticeHref, noticeKind } from "./noticeStyle";

describe("présentation des notifications", () => {
  it("la gravité du titre prime sur l'origine", () => {
    expect(noticeKind("admin-msg:1", "Le Tariq ibn Ziyad est immobilisé")).toBe("alert");
    expect(noticeKind("voyage-update:1:2", "Marseille → Alger · traversée annulée")).toBe("alert");
    expect(noticeKind("admin-msg:1", "Marseille → Alger · retard d’environ 2 h")).toBe("warning");
  });
  it("sinon l'origine donne le picto", () => {
    expect(noticeKind("departure:1:2:7j", "Valence → Mostaganem · départ dans 7j")).toBe("trip");
    expect(noticeKind("signal:1:2", "ALMARIYA · Information voyageurs")).toBe("community");
    expect(noticeKind("test:1", "Test BledWay")).toBe("info");
  });
  it("le lien vers une fiche porte la notification, pas les autres pages", () => {
    expect(noticeHref("/?select=vessel&id=v", "n")).toBe("/?select=vessel&id=v&notice=n");
    expect(noticeHref("/compte", "n")).toBe("/compte");
  });
});
