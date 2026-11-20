import { describe, expect, it, vi } from "vitest";
import jpeg from "jpeg-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publishProfilePhoto } from "./profilePhoto.server";

const USER = "11111111-2222-3333-4444-555555555555";
const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function plainJpeg() {
  const width = 320;
  const height = 320;
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([200, 160, 120, 255], i);
  return new Uint8Array(jpeg.encode({ data, width, height }, 85).data);
}

function fakeAdmin(bytes: Uint8Array) {
  const uploaded: string[] = [];
  const removed: string[] = [];
  const bucket = {
    download: vi.fn(async () => ({
      data: new Blob([bytes as Uint8Array<ArrayBuffer>]),
      error: null,
    })),
    upload: vi.fn(async (path: string) => (uploaded.push(path), { error: null })),
    remove: vi.fn(async (paths: string[]) => (removed.push(...paths), { error: null })),
  };
  return {
    client: { storage: { from: () => bucket } } as unknown as SupabaseClient,
    uploaded,
    removed,
  };
}

const fakeUser = (error: { message: string } | null = null) => {
  const rpc = vi.fn(async () => ({ error }));
  return { client: { rpc } as unknown as SupabaseClient, rpc };
};

describe("photo de profil publiée sans attendre l'équipe", () => {
  it("refuse le dépôt d'une autre personne", async () => {
    const admin = fakeAdmin(plainJpeg());
    const user = fakeUser();
    const result = await publishProfilePhoto(admin.client, user.client, USER, {
      pendingPath: `99999999-2222-3333-4444-555555555555/profil-${ID}.jpg`,
      width: 320,
      height: 320,
    });
    expect(result.ok).toBe(false);
    expect(admin.uploaded).toEqual([]);
    expect(user.rpc).not.toHaveBeenCalled();
  });

  it(
    "contrôle, publie dans profils/ et enregistre la photo comme validée",
    { timeout: 60_000 },
    async () => {
      const admin = fakeAdmin(plainJpeg());
      const user = fakeUser();
      const result = await publishProfilePhoto(admin.client, user.client, USER, {
        pendingPath: `${USER}/profil-${ID}.jpg`,
        width: 320,
        height: 320,
      });
      expect(result).toEqual({ ok: true });
      expect(admin.uploaded).toEqual([`profils/${USER}/${ID}.jpg`]);
      expect(admin.removed).toEqual([`${USER}/profil-${ID}.jpg`]);
      expect(user.rpc).toHaveBeenCalledWith("bw_profile_photo_publish", {
        p_path: `profils/${USER}/${ID}.jpg`,
        p_width: 320,
        p_height: 320,
      });
    },
  );

  it(
    "retire le fichier publié si la base refuse (limite du jour)",
    { timeout: 60_000 },
    async () => {
      const admin = fakeAdmin(plainJpeg());
      const user = fakeUser({ message: "Patientez : 3 photos de profil au plus par jour." });
      const result = await publishProfilePhoto(admin.client, user.client, USER, {
        pendingPath: `${USER}/profil-${ID}.jpg`,
        width: 320,
        height: 320,
      });
      expect(result).toEqual({
        ok: false,
        reason: "rpc:Patientez : 3 photos de profil au plus par jour.",
      });
      expect(admin.removed).toContain(`profils/${USER}/${ID}.jpg`);
    },
  );
});
