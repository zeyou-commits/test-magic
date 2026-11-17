import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { handleCompanyAccessRequest, hashAddress } from "./accessRequest.server";

const USER = "00000000-0000-4000-8000-000000000021";
const calls: { name: string; args: Record<string, unknown> }[] = [];
let rpcError: { message: string } | null = null;

const db = {
  rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    return { data: rpcError ? null : "00000000-0000-4000-8000-000000000999", error: rpcError };
  }),
  auth: {
    getUser: vi.fn(async (token: string) =>
      token === "jeton-valide"
        ? { data: { user: { id: USER } }, error: null }
        : { data: { user: null }, error: { message: "invalid" } },
    ),
  },
} as unknown as SupabaseClient<Database>;

const valid = {
  fullName: "Lina M.",
  companyName: "Compagnie Exemple",
  jobTitle: "Responsable relation clients",
  email: "Lina@Exemple.test",
  consent: true,
  elapsed: 12_000,
};
const post = (body: unknown, headers: Record<string, string> = {}) =>
  handleCompanyAccessRequest(
    new Request("https://bledway.test/api/company-access-request", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    db,
  );

beforeEach(() => {
  calls.length = 0;
  rpcError = null;
});

describe("demande d'accès à l'espace compagnie", () => {
  it("enregistre une demande valide, e-mail en minuscules, sans compte", async () => {
    const response = await post(valid);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("bw_company_access_request_submit");
    expect(calls[0]!.args).toMatchObject({
      _email: "lina@exemple.test",
      _user: null,
      _company_id: null,
    });
  });

  it("garde seulement une empreinte de l'adresse réseau, jamais l'adresse elle-même", async () => {
    await post(valid);
    const hash = calls[0]!.args["_ip_hash"] as string;
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(calls[0]!.args)).not.toContain("203.0.113.7");
    const same = hashAddress(
      new Request("https://bledway.test", {
        headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
      }),
    );
    expect(same).toBe(hash);
  });

  it("le compte vient du jeton vérifié ; un jeton invalide n'est pas retenu", async () => {
    await post(valid, { authorization: "Bearer jeton-valide" });
    expect(calls[0]!.args["_user"]).toBe(USER);
    await post(valid, { authorization: "Bearer faux" });
    expect(calls[1]!.args["_user"]).toBeNull();
  });

  it("un identifiant de compte envoyé par le navigateur est ignoré", async () => {
    await post({ ...valid, userId: USER, _user: USER });
    expect(calls[0]!.args["_user"]).toBeNull();
  });

  it("champ piège rempli ou saisie trop rapide : réponse normale, rien n'est enregistré", async () => {
    expect(await (await post({ ...valid, website: "https://spam.test" })).json()).toEqual({
      ok: true,
    });
    expect(await (await post({ ...valid, elapsed: 800 })).json()).toEqual({ ok: true });
    expect(calls).toHaveLength(0);
  });

  it("sans accord, sans e-mail valide ou trop longue : refusée avant la base", async () => {
    expect((await post({ ...valid, consent: false })).status).toBe(400);
    expect((await post({ ...valid, email: "pas-un-email" })).status).toBe(400);
    expect((await post("{ pas du json")).status).toBe(400);
    expect((await post({ ...valid, message: "a".repeat(9_000) })).status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it("limite atteinte en base : message clair, code 429", async () => {
    rpcError = { message: "BW_LIMIT" };
    const response = await post(valid);
    expect(response.status).toBe(429);
    expect((await response.json()).error).toContain("Réessayez demain");
  });

  it("panne de la base : message neutre, aucun détail technique", async () => {
    rpcError = { message: 'relation "bw_company_access_requests" does not exist' };
    const response = await post(valid);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("relation");
  });
});
