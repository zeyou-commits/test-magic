import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
import { adminRequest } from "./request";
const session = (token: string) => ({ data: { session: { access_token: token } }, error: null });
const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  auth.getSession.mockResolvedValue(session("old"));
  auth.refreshSession.mockResolvedValue(session("new"));
});
describe("Session des actions administrateur", () => {
  it("transmet le jeton et conserve la requête après renouvellement", async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ error: "expirée", code: "SESSION_EXPIRED" }, { status: 401 }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }));
    expect(await adminRequest("/api/admin-users", { action: "list" })).toEqual({ ok: true });
    expect(fetchMock.mock.calls.map((call) => call[1].headers.authorization)).toEqual([
      "Bearer old",
      "Bearer new",
    ]);
    expect(fetchMock.mock.calls[1]![1].body).toBe('{"action":"list"}');
  });
  it("limite le renouvellement à un essai", async () => {
    fetchMock.mockImplementation(() =>
      Response.json({ error: "Session expirée" }, { status: 401 }),
    );
    await expect(adminRequest("/api/push-admin", { action: "overview" })).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });
  it.each([403, 500, 503])("ne rejoue jamais une action refusée avec %s", async (status) => {
    fetchMock.mockResolvedValue(Response.json({ error: "refusée" }, { status }));
    await expect(adminRequest("/api/admin-users", { action: "delete" })).rejects.toMatchObject({
      status,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
  it("signale une incohérence de projet sans renouvellement inutile", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: "autre projet", code: "SESSION_PROJECT_MISMATCH" }, { status: 401 }),
    );
    await expect(adminRequest("/api/push-admin", {})).rejects.toMatchObject({
      code: "SESSION_PROJECT_MISMATCH",
    });
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
  it("n'appelle pas l'API sans session", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(adminRequest("/api/admin-users", {})).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("mutualise le renouvellement de deux panneaux simultanés", async () => {
    let renew!: (value: ReturnType<typeof session>) => void;
    auth.refreshSession.mockReturnValue(
      new Promise((resolve) => {
        renew = resolve;
      }),
    );
    fetchMock.mockImplementation((_url, init) =>
      Response.json(
        init.headers.authorization === "Bearer old" ? { code: "SESSION_EXPIRED" } : { ok: true },
        { status: init.headers.authorization === "Bearer old" ? 401 : 200 },
      ),
    );
    const a = adminRequest("/api/admin-users", {}),
      b = adminRequest("/api/push-admin", {});
    await vi.waitFor(() => expect(auth.refreshSession).toHaveBeenCalledTimes(1));
    renew(session("new"));
    await expect(Promise.all([a, b])).resolves.toEqual([{ ok: true }, { ok: true }]);
  });
});
