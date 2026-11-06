import { describe, expect, it, vi } from "vitest";
import jpeg from "jpeg-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isExplicitJpeg, publishChatPhoto } from "./chatPhoto.server";

const USER = "11111111-2222-3333-4444-555555555555";
const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function plainJpeg() {
  const width = 320;
  const height = 240;
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([90, 140, 200, 255], i);
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

const fakeUser = (error: { message: string } | null = null) =>
  ({ rpc: vi.fn(async () => ({ error })) }) as unknown as SupabaseClient;

const input = (pendingPath: string) => ({
  pendingPath,
  roomKind: "crossing",
  room: "dep-1",
  width: 320,
  height: 240,
});

describe("contrôle serveur des photos de salon", () => {
  it("refuse un fichier qui n'est pas un JPEG", async () => {
    await expect(isExplicitJpeg(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).rejects.toThrow();
  });

  it("refuse le dépôt d'une autre personne", async () => {
    const admin = fakeAdmin(plainJpeg());
    const result = await publishChatPhoto(
      admin.client,
      fakeUser(),
      USER,
      input(`99999999-2222-3333-4444-555555555555/salon-${ID}.jpg`),
    );
    expect(result.ok).toBe(false);
    expect(admin.uploaded).toEqual([]);
  });

  it("publie une photo ordinaire dans salons/ et vide l'attente", { timeout: 60_000 }, async () => {
    const admin = fakeAdmin(plainJpeg());
    const result = await publishChatPhoto(
      admin.client,
      fakeUser(),
      USER,
      input(`${USER}/salon-${ID}.jpg`),
    );
    expect(result).toEqual({ ok: true });
    expect(admin.uploaded).toEqual([`salons/${USER}/${ID}.jpg`]);
    expect(admin.removed).toEqual([`${USER}/salon-${ID}.jpg`]);
  });

  it("retire la photo publiée si le salon la refuse", { timeout: 60_000 }, async () => {
    const admin = fakeAdmin(plainJpeg());
    const result = await publishChatPhoto(
      admin.client,
      fakeUser({ message: "Une seule photo par personne" }),
      USER,
      input(`${USER}/salon-${ID}.jpg`),
    );
    expect(result).toEqual({ ok: false, reason: "rpc:Une seule photo par personne" });
    expect(admin.removed).toContain(`salons/${USER}/${ID}.jpg`);
  });
});
