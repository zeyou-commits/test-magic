import { describe, expect, it } from "vitest";
import { noticeHref, noticeKind, noticePicto, noticeReply } from "./noticeStyle";

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
  it("le picto du téléphone suit le motif", () => {
    expect(noticePicto("port-access:1:2", "Mostaganem · accès au port fermé ou dévié")).toBe("access-closed");
    expect(noticePicto("port-access:1:2", "Alger · l’entrée habituelle du port a changé")).toBe("access-moved");
    expect(noticePicto("help-new:1", "SOS médical sur votre traversée")).toBe("help-medical");
    expect(noticePicto("help-new:1", "Un voyageur demande de l'aide")).toBe("help");
    expect(noticePicto("signal:1:2", "ALMARIYA · Retard signalé")).toBe("delay");
    expect(noticePicto("admin-msg:1", "Port perturbé")).toBe("warning");
    expect(noticePicto("departure:1:2:7j", "Valence → Mostaganem")).toBe("trip");
  });
  it("seuls les signalements et les demandes d'aide proposent une réponse", () => {
    expect(noticeReply("port-access:f:a1")?.reply).toEqual({ target: "alert", id: "a1" });
    expect(noticeReply("signal:f:a2")?.actions).toHaveLength(2);
    expect(noticeReply("help-new:r1")?.reply).toEqual({ target: "help", id: "r1" });
    expect(noticeReply("departure:1:2:7j")).toBeNull();
  });
  it("le lien vers une fiche porte la notification, pas les autres pages", () => {
    expect(noticeHref("/?select=vessel&id=v", "n")).toBe("/?select=vessel&id=v&notice=n");
    expect(noticeHref("/compte", "n")).toBe("/compte");
  });
});
