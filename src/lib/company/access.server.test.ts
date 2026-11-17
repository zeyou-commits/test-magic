import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { handleCompanyAccess, hashInviteToken } from "./access.server";

// Comptes fictifs : deux compagnies, des collaborateurs, un voyageur, un administrateur.
const ADMIN = "00000000-0000-4000-8000-000000000001";
const OPS_ONE = "00000000-0000-4000-8000-000000000011";
const AGENT_TWO = "00000000-0000-4000-8000-000000000021";
const COMPANY_ONE = "00000000-0000-4000-8000-000000000101";
const COMPANY_TWO = "00000000-0000-4000-8000-000000000102";
const TOKEN = "A".repeat(43);

const mocks = { getUser: vi.fn(), role: vi.fn(), rpc: vi.fn() };
const chain = { select: () => chain, eq: () => chain, maybeSingle: mocks.role };
const db = {
  auth: { getUser: mocks.getUser },
  from: () => chain,
  rpc: mocks.rpc,
} as unknown as SupabaseClient<Database>;
const as = (userId: string | null) =>
  mocks.getUser.mockResolvedValue(
    userId
      ? { data: { user: { id: userId } }, error: null }
      : { data: { user: null }, error: { message: "invalid JWT" } },
  );
const call = (input: unknown, token: string | null = "jeton") =>
  handleCompanyAccess(
    new Request("https://bledway.example/api/company-access", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
    }),
    db,
    () => TOKEN,
  );
/** Base simulée : refuse comme les fonctions SQL quand le compte n'a pas l'accès. */
const access: Record<string, string[]> = {
  [OPS_ONE]: [COMPANY_ONE],
  [AGENT_TWO]: [COMPANY_TWO],
};

beforeEach(() => {
  vi.resetAllMocks();
  as(OPS_ONE);
  mocks.role.mockResolvedValue({ data: null, error: null });
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, string>) => {
    if (name === "bw_company_team") {
      const ok = access[args["_user"]!]?.includes(args["_company"]!) || args["_user"] === ADMIN;
      return ok
        ? { data: [{ name: "Agent", level: "read" }], error: null }
        : { data: null, error: { message: "BW_FORBIDDEN" } };
    }
    if (name === "bw_company_my_access")
      return {
        data: (access[args["_user"]!] ?? []).map((companyId) => ({ companyId })),
        error: null,
      };
    if (name === "bw_company_invite_create")
      return { data: { id: "inv", expiresAt: "2027-01-17T00:00:00Z" }, error: null };
    if (name === "bw_company_invite_accept") return { data: { result: "accepted" }, error: null };
    return { data: null, error: null };
  });
});

describe("Accès professionnels côté serveur", () => {
  it("refuse sans session et avec un faux jeton", async () => {
    expect((await call({ action: "me" }, null)).status).toBe(401);
    as(null);
    expect((await call({ action: "me" })).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("ignore un identifiant de compte envoyé par le navigateur", async () => {
    const response = await call({ action: "me", userId: AGENT_TWO, _user: AGENT_TWO });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("bw_company_my_access", { _user: OPS_ONE });
    expect(await response.json()).toEqual([{ companyId: COMPANY_ONE, manager: false }]);
  });

  it("compte sans rattachement : aucune compagnie", async () => {
    as("00000000-0000-4000-8000-000000000030");
    expect(await (await call({ action: "me" })).json()).toEqual([]);
  });

  it("refuse l'équipe d'une autre compagnie (identifiant falsifié)", async () => {
    const response = await call({ action: "team", companyId: COMPANY_TWO });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("BW_FORBIDDEN");
    expect((await call({ action: "team", companyId: COMPANY_ONE })).status).toBe(200);
  });

  it("réserve les actions d'administration aux administrateurs", async () => {
    for (const input of [
      { action: "admin_overview", companyId: COMPANY_ONE },
      {
        action: "admin_invite",
        companyId: COMPANY_ONE,
        email: "x@cie.test",
        level: "operations",
        verification: "moi-même",
      },
      { action: "admin_member", memberId: COMPANY_ONE, change: "resume" },
      { action: "admin_space", companyId: COMPANY_TWO, status: "suspended", reason: "test" },
    ]) {
      expect((await call({ ...input, isAdmin: true, role: "admin" })).status).toBe(403);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("transmet l'administrateur vérifié, jamais celui annoncé", async () => {
    as(ADMIN);
    mocks.role.mockResolvedValue({ data: { role: "admin" }, error: null });
    await call({
      action: "admin_space",
      companyId: COMPANY_ONE,
      status: "suspended",
      reason: "Contrat",
      _actor: OPS_ONE,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("bw_company_space_set", {
      _actor: ADMIN,
      _company: COMPANY_ONE,
      _status: "suspended",
      _reason: "Contrat",
    });
  });

  it("garde seulement l'empreinte du lien et le montre une fois", async () => {
    as(ADMIN);
    mocks.role.mockResolvedValue({ data: { role: "admin" }, error: null });
    const response = await call({
      action: "admin_invite",
      companyId: COMPANY_ONE,
      email: " Ops@Cie-Un.test ",
      level: "operations",
      verification: "Appel au standard",
    });
    const body = await response.json();
    expect(body.link).toBe(`https://bledway.example/rejoindre-compagnie#code=${TOKEN}`);
    const args = mocks.rpc.mock.calls[0]![1] as Record<string, string>;
    expect(args["_token_hash"]).toBe(hashInviteToken(TOKEN));
    expect(JSON.stringify(args)).not.toContain(TOKEN);
    expect(args["_email"]).toBe("ops@cie-un.test");
  });

  it("refuse un niveau inconnu et un lien mal formé", async () => {
    as(ADMIN);
    mocks.role.mockResolvedValue({ data: { role: "admin" }, error: null });
    expect(
      (
        await call({
          action: "admin_invite",
          companyId: COMPANY_ONE,
          email: "a@b.test",
          level: "admin",
          verification: "ok ok",
        })
      ).status,
    ).toBe(400);
    expect((await call({ action: "accept", token: "court" })).status).toBe(400);
  });

  it("accepte avec l'empreinte du code et le compte vérifié", async () => {
    await call({ action: "accept", token: TOKEN, userId: AGENT_TWO });
    expect(mocks.rpc).toHaveBeenCalledWith("bw_company_invite_accept", {
      _user: OPS_ONE,
      _token_hash: hashInviteToken(TOKEN),
    });
  });

  it("traduit les refus de la base et signale un script manquant", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "BW_MEMBER_REVOKED" } });
    as(ADMIN);
    mocks.role.mockResolvedValue({ data: { role: "admin" }, error: null });
    expect(
      (await call({ action: "admin_member", memberId: COMPANY_ONE, change: "resume" })).status,
    ).toBe(409);
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const response = await call({ action: "me" });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
