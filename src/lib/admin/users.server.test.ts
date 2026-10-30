import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { handleUsersAdmin } from "./users.server";
import { canUseAdminTab } from "./permissions";
const actor = "00000000-0000-4000-8000-000000000001";
const target = "00000000-0000-4000-8000-000000000002";
const mocks = {
  getUser: vi.fn(),
  role: vi.fn(),
  roles: vi.fn(),
  rpc: vi.fn(),
  getUserById: vi.fn(),
  updateUserById: vi.fn(),
  deleteUser: vi.fn(),
  inviteUserByEmail: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
};
const chain = {
  select: () => chain,
  eq: () => chain,
  maybeSingle: mocks.role,
  then: (resolve: (result: unknown) => unknown) => mocks.roles().then(resolve),
};
const db = {
  auth: { getUser: mocks.getUser, admin: mocks },
  from: () => chain,
  rpc: mocks.rpc,
  storage: { from: () => ({ list: mocks.list, remove: mocks.remove }) },
} as unknown as SupabaseClient<Database>;
const body = {
  action: "ban",
  userId: target,
  confirmation: "voyageur@example.test",
  reason: "Spam répété",
  duration: "168h",
};
const call = (input: unknown = body, token: string | null = "token") =>
  handleUsersAdmin(
    new Request("https://example.test/api/admin-users", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
    }),
    db,
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: actor } }, error: null });
  mocks.role.mockResolvedValue({ data: { role: "admin" }, error: null });
  mocks.roles.mockResolvedValue({ data: [{ role: "user" }], error: null });
  mocks.rpc.mockResolvedValue({ data: { total: 1, members: [] }, error: null });
  mocks.getUserById.mockResolvedValue({
    data: { user: { id: target, email: "voyageur@example.test" } },
    error: null,
  });
  mocks.updateUserById.mockResolvedValue({ error: null });
  mocks.deleteUser.mockResolvedValue({ error: null });
  mocks.inviteUserByEmail.mockResolvedValue({ data: { user: { id: target } }, error: null });
  mocks.list.mockResolvedValue({ data: [{ name: "avatar.webp" }], error: null });
  mocks.remove.mockResolvedValue({ error: null });
});
describe("Gestion des utilisateurs côté serveur", () => {
  it("refuse l'absence de session et les faux jetons", async () => {
    expect((await call(body, null)).status).toBe(401);
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    expect((await call()).status).toBe(401);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });
  it("refuse une promotion déclarée seulement dans le navigateur", async () => {
    mocks.role.mockResolvedValue({ data: null, error: null });
    expect((await call({ ...body, isAdmin: true })).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("refuse toute mutation si la migration de contrôle manque", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "missing" } });
    expect((await call()).status).toBe(503);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });
  it("refuse les modifications sur soi-même", async () => {
    expect((await call({ ...body, userId: actor })).status).toBe(409);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });
  it("exige la confirmation exacte de la cible et un motif", async () => {
    expect((await call({ ...body, confirmation: "autre@example.test" })).status).toBe(400);
    expect((await call({ ...body, reason: "" })).status).toBe(400);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });
  it("interdit le bannissement et la suppression d'un administrateur", async () => {
    mocks.roles.mockResolvedValue({ data: [{ role: "admin" }], error: null });
    expect((await call()).status).toBe(409);
    expect((await call({ ...body, action: "delete" })).status).toBe(409);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("bannit avec la durée choisie et journalise l'action", async () => {
    expect((await call()).status).toBe(200);
    expect(mocks.updateUserById).toHaveBeenCalledWith(target, { ban_duration: "168h" });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "bw_admin_user_audit",
      expect.objectContaining({ _actor: actor, _target: target, _action: "ban_completed" }),
    );
  });
  it("passe les changements de rôle par une transaction protégée", async () => {
    expect((await call({ ...body, action: "role", role: "editor", enabled: true })).status).toBe(
      200,
    );
    expect(mocks.rpc).toHaveBeenCalledWith("bw_admin_set_user_role", {
      _actor: actor,
      _target: target,
      _role: "editor",
      _enabled: true,
    });
  });
  it("supprime uniquement les avatars du compte choisi avant Auth", async () => {
    expect((await call({ ...body, action: "delete" })).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(target, { limit: 1000 });
    expect(mocks.remove).toHaveBeenCalledWith([`${target}/avatar.webp`]);
    expect(mocks.deleteUser).toHaveBeenCalledWith(target);
  });
  it("ne supprime pas Auth si le retrait des fichiers échoue", async () => {
    mocks.remove.mockResolvedValue({ error: { message: "storage error" } });
    expect((await call({ ...body, action: "delete" })).status).toBe(500);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("l'invitation crée un voyageur sans attribuer de privilège", async () => {
    expect(
      (await call({ action: "invite", email: "nouveau@example.test", role: "admin" })).status,
    ).toBe(200);
    expect(mocks.inviteUserByEmail).toHaveBeenCalledWith("nouveau@example.test", {
      redirectTo: "https://example.test/auth?mode=reset",
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith("bw_admin_set_user_role", expect.anything());
  });
  it("lit chiffres, fiche et historique par les fonctions réservées au serveur", async () => {
    expect((await call({ action: "stats" })).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("bw_admin_users_stats", { _actor: actor });
    expect((await call({ action: "detail", userId: target })).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("bw_admin_user_detail", {
      _actor: actor,
      _target: target,
    });
    expect((await call({ action: "audit" })).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("bw_admin_audit_page", { _actor: actor, _limit: 60 });
  });
  it("inscrit chaque export de données au journal", async () => {
    expect((await call({ action: "export", userId: target })).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("bw_admin_user_export", {
      _actor: actor,
      _target: target,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("bw_admin_user_audit", {
      _actor: actor,
      _target: target,
      _action: "export_completed",
      _details: {},
    });
  });
  it("signale le script SQL manquant au lieu d'échouer en silence", async () => {
    mocks.rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === "bw_admin_users_stats"
          ? { data: null, error: { message: "function does not exist" } }
          : { data: { total: 0, members: [] }, error: null },
      ),
    );
    const response = await call({ action: "stats" });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("utilisateurs");
  });
  it("respecte les périmètres admin, édition et modération", () => {
    expect(canUseAdminTab(["editor"], "users")).toBe(false);
    expect(canUseAdminTab(["moderator"], "notifications")).toBe(false);
    expect(canUseAdminTab(["editor"], "departures")).toBe(true);
    expect(canUseAdminTab(["moderator"], "reviews")).toBe(true);
    expect(canUseAdminTab([], "departures")).toBe(false);
  });
});
