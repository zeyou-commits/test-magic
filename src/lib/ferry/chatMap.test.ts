import { describe, expect, it } from "vitest";
import { countLabel, groupPins, isFresh, type MapRoom } from "./chatMap";
import type { RecentMessage } from "./chatDemo";

const room = (id: string, count: number, kind: "crossing" | "port" = "crossing"): MapRoom => ({
  kind,
  room: id,
  count,
  last_at: "2026-11-16T10:00:00Z",
  label: "Marseille → Alger",
  messages: [{ id: `${id}-m`, body: "Salut", created_at: "2026-11-16T10:00:00Z", author: { pseudo: "Samir" } }],
});
const demo = (id: string): RecentMessage => ({
  id,
  demo: true,
  kind: "crossing",
  room: "",
  body: "Exemple",
  created_at: "",
  label: "Port de Marseille",
  author: { pseudo: "Nadia" },
});

describe("groupPins", () => {
  it("une pastille par salon, avec son nombre de messages", () => {
    const pins = groupPins([room("a", 5), room("b", 2, "port")], [], () => null);
    expect(pins.map((p) => [p.key, p.count])).toEqual([
      ["d:a", 5],
      ["p:b", 2],
    ]);
  });
  it("les exemples au même endroit se regroupent", () => {
    const pins = groupPins([], [demo("x"), demo("y")], () => "p:marseille");
    expect(pins).toHaveLength(1);
    expect(pins[0]!.count).toBe(2);
    expect(pins[0]!.demo).toBe(true);
    expect(pins[0]!.room).toBeNull();
  });
  it("un exemple sur un vrai salon le complète sans le remplacer", () => {
    const pins = groupPins([room("a", 1)], [demo("x")], () => "d:a");
    expect(pins).toHaveLength(1);
    expect(pins[0]!.count).toBe(2);
    expect(pins[0]!.room).toEqual({ kind: "crossing", id: "a" });
  });
  it("un exemple sans place à l'écran n'a pas de pastille", () => {
    expect(groupPins([], [demo("x")], () => null)).toEqual([]);
  });
});

describe("countLabel / isFresh", () => {
  it("compteur lisible", () => {
    expect(countLabel(3)).toBe("+3");
    expect(countLabel(150)).toBe("99+");
  });
  it("pulse seulement pour un message de moins de 10 min", () => {
    const now = Date.parse("2026-11-16T10:09:00Z");
    expect(isFresh("2026-11-16T10:00:00Z", now)).toBe(true);
    expect(isFresh("2026-11-16T09:50:00Z", now)).toBe(false);
    expect(isFresh("", now)).toBe(false);
  });
});
