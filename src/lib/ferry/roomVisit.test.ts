import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { joinRoomAsVisitor, leaveRoomVisit, visitRefusal } from "./roomGuests";

const ROOM = "dddddddd-0000-0000-0000-000000000001";

describe("rejoindre en invité le salon d'une autre traversée", () => {
  beforeEach(() => rpc.mockReset());

  it("demande l'entrée à la base, pour ce salon seulement", async () => {
    rpc.mockResolvedValue({ data: { ok: true, status: "visitor" }, error: null });
    await expect(joinRoomAsVisitor(ROOM)).resolves.toBe("visitor");
    expect(rpc).toHaveBeenCalledWith("bw_room_visit_join", { p_departure: ROOM });
  });

  it("un passager du navire reste passager", async () => {
    rpc.mockResolvedValue({ data: { ok: true, status: "member" }, error: null });
    await expect(joinRoomAsVisitor(ROOM)).resolves.toBe("member");
  });

  it.each([
    ["too_many", "déjà invité dans 3 salons"],
    ["removed", "masqué"],
    ["expired", "terminée"],
    ["banned", "ne peut pas écrire"],
  ])("explique le refus « %s » de la base", async (refused, words) => {
    rpc.mockResolvedValue({ data: { ok: false, refused }, error: null });
    await expect(joinRoomAsVisitor(ROOM)).rejects.toThrow(words);
  });

  it("une panne ou un script absent donne un message simple", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "absent" } });
    await expect(joinRoomAsVisitor(ROOM)).rejects.toThrow("Réessayez");
    expect(visitRefusal("inconnu")).toContain("Réessayez");
  });

  it("quitter le salon", async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(leaveRoomVisit(ROOM)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("bw_room_visit_leave", { p_departure: ROOM });
    rpc.mockResolvedValue({ data: null, error: { message: "panne" } });
    await expect(leaveRoomVisit(ROOM)).rejects.toThrow("quitter");
  });
});
