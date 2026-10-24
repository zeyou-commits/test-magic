import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { verifyAdminSession } from "./session.server";
const getUser = vi.fn();
const db = { auth: { getUser } } as unknown as SupabaseClient<Database>;
const jwt = (claims: Record<string, string>) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.fake`;
const call = (token = "token") =>
  verifyAdminSession(
    new Request("https://example.test", { headers: { Authorization: `Bearer ${token}` } }),
    db,
  );
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://same.supabase.co");
  vi.stubEnv("VITE_SUPABASE_URL", "https://same.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_not-real");
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "admin" } }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("Diagnostic de session serveur", () => {
  it("vérifie toujours le jeton auprès de Supabase", async () => {
    expect((await call()).user?.id).toBe("admin");
    expect(getUser).toHaveBeenCalledWith("token");
  });
  it("distingue une session expirée d'une configuration serveur incorrecte", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT", status: 401 },
    });
    expect((await call()).response?.status).toBe(401);
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid API key", status: 401 },
    });
    const result = await call();
    expect(result.response?.status).toBe(503);
    expect(await result.response?.json()).toMatchObject({ code: "ADMIN_AUTH_CONFIG" });
  });
  it("refuse des variables navigateur et serveur de projets différents", async () => {
    vi.stubEnv("SUPABASE_URL", "https://other.supabase.co");
    const result = await call();
    expect(await result.response?.json()).toMatchObject({ code: "ADMIN_PROJECT_MISMATCH" });
    expect(getUser).not.toHaveBeenCalled();
  });
  it("refuse une clé service_role d'un autre projet", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", jwt({ ref: "other", role: "service_role" }));
    expect((await call()).response?.status).toBe(503);
    expect(getUser).not.toHaveBeenCalled();
  });
  it("refuse une ancienne session d'un autre projet", async () => {
    const result = await call(jwt({ iss: "https://old.supabase.co/auth/v1" }));
    expect(await result.response?.json()).toMatchObject({ code: "SESSION_PROJECT_MISMATCH" });
    expect(getUser).not.toHaveBeenCalled();
  });
  it("ne transforme pas une panne réseau en expiration de session", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Fetch failed", name: "AuthRetryableFetchError", status: 0 },
    });
    expect((await call()).response?.status).toBe(503);
  });
});
