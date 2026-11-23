import { describe, expect, it } from "vitest";
import {
  emptyTicker,
  enqueueTicker,
  stepTicker,
  TICKER_LIFE_MS,
  TICKER_STEP_MS,
  type TickerLine,
} from "./generalRoom";

const line = (id: string): TickerLine => ({
  id,
  kind: "general",
  room: "r",
  place: "member",
  body: `message ${id}`,
  created_at: "2026-11-23T10:00:00Z",
  author: { handle: "abcdef0123", pseudo: "Voyageur" } as TickerLine["author"],
  label: "Salon général",
});

describe("fil des salons sur la carte", () => {
  it("au premier chargement, ne garde que les 3 derniers, du plus ancien au plus récent", () => {
    // Le serveur renvoie du plus récent au plus ancien.
    const state = enqueueTicker(emptyTicker, ["e", "d", "c", "b", "a"].map(line), true);
    expect(state.queue.map((item) => item.id)).toEqual(["c", "d", "e"]);
  });

  it("n'ajoute jamais deux fois le même message", () => {
    const once = enqueueTicker(emptyTicker, [line("b"), line("a")], true);
    const twice = enqueueTicker(once, [line("c"), line("b"), line("a")], false);
    expect(twice.queue.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("fait entrer un message par pas, 3 au plus, et retire ceux qui ont fait leur temps", () => {
    let state = enqueueTicker(emptyTicker, ["d", "c", "b", "a"].map(line), false);
    let now = 0;
    state = stepTicker(state, now);
    expect(state.shown.map((item) => item.line.id)).toEqual(["a"]);
    now += TICKER_STEP_MS;
    state = stepTicker(state, now);
    expect(state.shown.map((item) => item.line.id)).toEqual(["a", "b"]);
    now += TICKER_STEP_MS;
    // 6 s après son entrée, « a » laisse la place.
    expect(now).toBe(TICKER_LIFE_MS);
    state = stepTicker(state, now);
    expect(state.shown.map((item) => item.line.id)).toEqual(["b", "c"]);
  });

  it("réduction des animations : une seule ligne à la fois", () => {
    let state = enqueueTicker(emptyTicker, [line("b"), line("a")], false);
    state = stepTicker(state, 0, 1);
    state = stepTicker(state, 1000, 1);
    expect(state.shown.map((item) => item.line.id)).toEqual(["b"]);
  });
});
