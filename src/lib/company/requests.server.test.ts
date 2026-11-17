import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AudiencePreview } from "@/lib/notifications/messages";
import { handleCompanyAccess, type CompanyNotifier } from "./access.server";

// Comptes fictifs : deux compagnies, un collaborateur en lecture, un éditeur, un administrateur.
const ADMIN = "00000000-0000-4000-8000-000000000001";
const EDITOR = "00000000-0000-4000-8000-000000000002";
const OPS_ONE = "00000000-0000-4000-8000-000000000011";
const READ_ONE = "00000000-0000-4000-8000-000000000012";
const OPS_TWO = "00000000-0000-4000-8000-000000000021";
const COMPANY_ONE = "00000000-0000-4000-8000-000000000101";
const COMPANY_TWO = "00000000-0000-4000-8000-000000000102";
const DEP_ONE = "00000000-0000-4000-8000-000000000201";
const DEP_TWO = "00000000-0000-4000-8000-000000000202";
const ANNOUNCE = "00000000-0000-4000-8000-000000000301";
const REQUEST = "00000000-0000-4000-8000-000000000401";

const roles: Record<string, string[]> = { [ADMIN]: ["admin"], [EDITOR]: ["editor"] };
const operations: Record<string, string> = { [OPS_ONE]: COMPANY_ONE, [OPS_TWO]: COMPANY_TWO };
const departureCompany: Record<string, string> = { [DEP_ONE]: COMPANY_ONE, [DEP_TWO]: COMPANY_TWO };

const state = {
  user: OPS_ONE as string,
  announcement: { departure_id: DEP_ONE, status: "submitted", message_id: null as string | null },
  departureAt: new Date(Date.now() + 86_400_000).toISOString(),
};

/** Lecture simulée des tables : rôles d'équipe, annonce à valider, horaire de la traversée. */
function table(name: string) {
  const filters: Record<string, unknown> = {};
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => ((filters[column] = value), query),
    in: (column: string, value: unknown) => ((filters[column] = value), query),
    limit: () => query,
    not: () => query,
    is: () => query,
    maybeSingle: async () => {
      if (name === "user_roles") {
        const wanted = filters["role"] as string[] | string;
        const mine = roles[filters["user_id"] as string] ?? [];
        const hit = mine.find((r) => (Array.isArray(wanted) ? wanted.includes(r) : r === wanted));
        return { data: hit ? { role: hit } : null, error: null };
      }
      if (name === "bw_company_announcements")
        return { data: filters["id"] === ANNOUNCE ? state.announcement : null, error: null };
      if (name === "departures") return { data: { departure_at: state.departureAt }, error: null };
      return { data: null, error: null };
    },
    then: (resolve: (value: unknown) => void) => resolve({ count: 3, error: null }),
  };
  return query;
}

const rpc = vi.fn();
const db = {
  auth: { getUser: async () => ({ data: { user: { id: state.user } }, error: null }) },
  from: table,
  rpc,
} as unknown as SupabaseClient<Database>;

const preview = vi.fn<CompanyNotifier["preview"]>();
const dispatch = vi.fn<CompanyNotifier["dispatch"]>();
const call = (input: unknown) =>
  handleCompanyAccess(
    new Request("https://bledway.example/api/company-access", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer jeton" },
      body: JSON.stringify(input),
    }),
    db,
    () => "x".repeat(43),
    { preview, dispatch },
  );
const reach = (reachable: number) =>
  ({
    label: "Marseille → Alger",
    context: { subject: "traversée", url: `/traversee/${DEP_ONE}` },
    relevantUntil: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    reachable,
  }) as unknown as AudiencePreview;

beforeEach(() => {
  vi.resetAllMocks();
  state.user = OPS_ONE;
  state.announcement = { departure_id: DEP_ONE, status: "submitted", message_id: null };
  state.departureAt = new Date(Date.now() + 86_400_000).toISOString();
  preview.mockResolvedValue(reach(12));
  dispatch.mockResolvedValue(undefined);
  // Base simulée : mêmes refus que les fonctions SQL du lot 2.
  rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    const user = (args["_user"] ?? args["_actor"]) as string;
    const departure = args["_departure"] as string | undefined;
    if (departure && operations[user] !== departureCompany[departure])
      return { data: null, error: { message: "BW_FORBIDDEN" } };
    if (name === "bw_company_departure_check")
      return { data: { companyId: departureCompany[departure!] }, error: null };
    if (name === "bw_company_announcement_approve")
      return roles[user]?.includes("admin")
        ? { data: { messageId: "msg-1", already: false }, error: null }
        : { data: null, error: { message: "BW_FORBIDDEN" } };
    return { data: { ok: true }, error: null };
  });
});

describe("Demandes et annonces des compagnies côté serveur", () => {
  it("refuse une demande sur la traversée d'une autre compagnie (identifiant falsifié)", async () => {
    const response = await call({
      action: "request_save",
      departureId: DEP_TWO,
      kind: "delay",
      proposed: { minutes: 30 },
      companyId: COMPANY_TWO,
    });
    expect(response.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith(
      "bw_company_request_save",
      expect.objectContaining({ _user: OPS_ONE }),
    );
  });

  it("niveau Lecture : la base refuse l'envoi, aucun calcul de destinataires", async () => {
    state.user = READ_ONE;
    const response = await call({ action: "announce_preview", departureId: DEP_ONE });
    expect(response.status).toBe(403);
    expect(preview).not.toHaveBeenCalled();
  });

  it("ne révèle aucun nombre de destinataires pour une autre compagnie", async () => {
    const response = await call({ action: "announce_preview", departureId: DEP_TWO });
    expect(response.status).toBe(403);
    expect(preview).not.toHaveBeenCalled();
  });

  it("renvoie seulement un total, pas de liste de personnes", async () => {
    const body = await (await call({ action: "announce_preview", departureId: DEP_ONE })).json();
    expect(body).toEqual({ reachable: 12 });
    expect(preview).toHaveBeenCalledWith({
      kind: "departure",
      departureId: DEP_ONE,
      who: "everyone",
    });
  });

  it("ignore le nombre envoyé par le navigateur et le recalcule", async () => {
    await call({
      action: "announce_save",
      departureId: DEP_ONE,
      reason: "delay",
      body: "Embarquement décalé d'une heure.",
      submit: true,
      previewCount: 9999,
      _preview_count: 9999,
    });
    expect(rpc).toHaveBeenCalledWith(
      "bw_company_announcement_save",
      expect.objectContaining({ _user: OPS_ONE, _preview_count: 12, _submit: true }),
    );
  });

  it("refuse une adresse ou une liste de destinataires choisie par la compagnie", async () => {
    const response = await call({
      action: "announce_save",
      departureId: DEP_ONE,
      reason: "other",
      body: "Message de test assez long.",
      audience: { kind: "all" },
      recipients: ["x@y.test"],
    });
    expect(response.status).toBe(200);
    const args = rpc.mock.calls.find(([name]) => name === "bw_company_announcement_save")![1];
    expect(JSON.stringify(args)).not.toContain("x@y.test");
    expect(JSON.stringify(args)).not.toContain('"all"');
  });

  it("réserve la file de relecture à l'équipe, et la validation des annonces aux administrateurs", async () => {
    expect((await call({ action: "queue" })).status).toBe(403);
    state.user = EDITOR;
    expect((await call({ action: "queue" })).status).toBe(200);
    expect(
      (await call({ action: "request_decide", requestId: REQUEST, decision: "apply" })).status,
    ).toBe(200);
    const refused = await call({
      action: "announce_decide",
      id: ANNOUNCE,
      decision: "approve",
      confirmCount: 12,
    });
    expect(refused.status).toBe(403);
    expect(rpc).not.toHaveBeenCalledWith("bw_company_announcement_approve", expect.anything());
  });

  it("montre le nombre de destinataires aux administrateurs seulement", async () => {
    state.user = EDITOR;
    expect((await call({ action: "announce_check", id: ANNOUNCE })).status).toBe(403);
    state.user = OPS_ONE;
    expect((await call({ action: "announce_check", id: ANNOUNCE })).status).toBe(403);
    expect(preview).not.toHaveBeenCalled();
    state.user = ADMIN;
    const body = await (await call({ action: "announce_check", id: ANNOUNCE })).json();
    expect(body).toEqual({ reachable: 12, label: "Marseille → Alger" });
  });

  it("exige que le nombre confirmé soit encore exact avant l'envoi", async () => {
    state.user = ADMIN;
    const changed = await call({
      action: "announce_decide",
      id: ANNOUNCE,
      decision: "approve",
      confirmCount: 8,
    });
    expect(changed.status).toBe(409);
    expect((await changed.json()).reachable).toBe(12);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("valide, signe côté base et envoie avec la cible recalculée", async () => {
    state.user = ADMIN;
    const response = await call({
      action: "announce_decide",
      id: ANNOUNCE,
      decision: "approve",
      confirmCount: 12,
    });
    expect(await response.json()).toMatchObject({
      messageId: "msg-1",
      reachable: 12,
      sentNow: true,
    });
    expect(rpc).toHaveBeenCalledWith(
      "bw_company_announcement_approve",
      expect.objectContaining({
        _actor: ADMIN,
        _audience: { kind: "departure", departureId: DEP_ONE, who: "everyone" },
        _url: `/traversee/${DEP_ONE}`,
      }),
    );
    expect(dispatch).toHaveBeenCalledWith("msg-1");
  });

  it("une annonce déjà validée n'est ni recalculée ni renvoyée", async () => {
    state.user = ADMIN;
    state.announcement = { departure_id: DEP_ONE, status: "approved", message_id: "msg-1" };
    const body = await (
      await call({ action: "announce_decide", id: ANNOUNCE, decision: "approve", confirmCount: 12 })
    ).json();
    expect(body).toEqual({ messageId: "msg-1", already: true });
    expect(preview).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("un envoi immédiat en échec reste rattrapable", async () => {
    state.user = ADMIN;
    dispatch.mockRejectedValue(new Error("push"));
    const body = await (
      await call({ action: "announce_decide", id: ANNOUNCE, decision: "approve", confirmCount: 12 })
    ).json();
    expect(body).toMatchObject({ messageId: "msg-1", sentNow: false });
  });

  it("traversée déjà partie : la base classe l'annonce périmée, sans calcul ni envoi", async () => {
    state.user = ADMIN;
    state.departureAt = new Date(Date.now() - 3_600_000).toISOString();
    await call({ action: "announce_decide", id: ANNOUNCE, decision: "approve", confirmCount: 12 });
    expect(preview).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "bw_company_announcement_approve",
      expect.objectContaining({ _label: null }),
    );
  });

  it("personne à prévenir : refus clair, rien n'est créé", async () => {
    state.user = ADMIN;
    preview.mockResolvedValue(reach(0));
    const response = await call({
      action: "announce_decide",
      id: ANNOUNCE,
      decision: "approve",
      confirmCount: 0,
    });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("BW_NO_AUDIENCE");
  });

  it("traduit les nouveaux refus de la base", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "BW_DUPLICATE" } });
    const response = await call({
      action: "request_save",
      departureId: DEP_ONE,
      kind: "cancel",
      proposed: {},
      submit: true,
    });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("BW_DUPLICATE");
  });

  it("refuse un retard hors limites avant même la base", async () => {
    const response = await call({
      action: "request_save",
      departureId: DEP_ONE,
      kind: "delay",
      proposed: { minutes: 5000 },
    });
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
