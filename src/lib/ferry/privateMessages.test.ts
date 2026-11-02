import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { dmState, leftLabel } = await import("./privateMessages");

describe("les messages privés", () => {
  it("demande d'abord une acceptation", () => {
    expect(dmState({ status: "pending", mine: true, my_left: 3 })).toBe("waiting");
    expect(dmState({ status: "pending", mine: false, my_left: 3 })).toBe("to-answer");
  });

  it("garde un refus discret pour celle qui demande", () => {
    expect(dmState({ status: "refused", mine: true, my_left: 3 })).toBe("waiting");
  });

  it("limite à 3 messages et ferme après un blocage", () => {
    expect(dmState({ status: "accepted", mine: true, my_left: 1 })).toBe("open");
    expect(dmState({ status: "accepted", mine: true, my_left: 0 })).toBe("used-up");
    expect(dmState({ status: "closed", mine: false, my_left: 2 })).toBe("closed");
    expect(leftLabel(2)).toMatch(/2 messages/);
    expect(leftLabel(0)).toMatch(/3 messages/);
  });
});
