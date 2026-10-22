import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), role: vi.fn(), rpc: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (config: unknown) => config }));
vi.mock("@/integrations/supabase/client.server", () => {
  const query = { select: () => query, eq: () => query, maybeSingle: mock.role };
  return { supabaseAdmin: { auth: { getUser: mock.getUser }, from: () => query, rpc: mock.rpc } };
});
import { Route } from "@/routes/api.push-admin";
const handler = (
  Route as unknown as {
    server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } };
  }
).server.handlers.POST;
const call = (token?: string, body: unknown = { action: "refresh" }) =>
  handler({
    request: new Request("https://example.test/api/push-admin", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
  mock.role.mockResolvedValue({ data: { role: "admin" }, error: null });
  mock.rpc.mockResolvedValue({ data: 0, error: null });
});
describe("Protection des envois administrateur", () => {
  it("refuse un appel sans session", async () => {
    expect((await call()).status).toBe(401);
    expect(mock.getUser).not.toHaveBeenCalled();
  });
  it("vérifie la session auprès de Supabase", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid token" } });
    expect((await call("faux-token")).status).toBe(401);
  });
  it("interdit à un voyageur d'approuver une campagne", async () => {
    mock.role.mockResolvedValue({ data: null, error: null });
    expect(
      (
        await call("voyageur", {
          action: "send",
          campaignId: "00000000-0000-4000-8000-000000000001",
          isAdmin: true,
        })
      ).status,
    ).toBe(403);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("rejette un identifiant invalide même pour un admin", async () => {
    expect((await call("admin", { action: "send", campaignId: "invalid" })).status).toBe(400);
  });
  it("autorise la préparation sans envoyer de notifications", async () => {
    expect((await call("admin")).status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("bw_prepare_opening_campaigns", {});
  });
});
