import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { handleCompanyAccess, hashInviteToken } from "./access.server";
import { GALLERY_PENDING_BUCKET, GALLERY_PUBLIC_BUCKET, photoFormat } from "./desk.server";

// Filtre de contenu explicite simulé : le vrai modèle n'est pas chargé dans les tests.
const nsfw = vi.hoisted(() => ({ explicit: false }));
vi.mock("@/lib/photos/chatPhoto.server", () => ({
  isExplicitJpeg: async () => nsfw.explicit,
}));

// Comptes fictifs : deux compagnies, un responsable, un collaborateur Lecture, l'équipe BledWay.
const ADMIN = "00000000-0000-4000-8000-000000000001";
const EDITOR = "00000000-0000-4000-8000-000000000002";
const MODERATOR = "00000000-0000-4000-8000-000000000003";
const OPS_ONE = "00000000-0000-4000-8000-000000000011";
const READ_ONE = "00000000-0000-4000-8000-000000000012";
const MANAGER_ONE = "00000000-0000-4000-8000-000000000013";
const COMPANY_ONE = "00000000-0000-4000-8000-000000000101";
const COMPANY_TWO = "00000000-0000-4000-8000-000000000102";
const REVIEW = "00000000-0000-4000-8000-000000000501";
const PHOTO = "00000000-0000-4000-8000-000000000601";
const MEMBER = "00000000-0000-4000-8000-000000000701";

const roles: Record<string, string[]> = {
  [ADMIN]: ["admin"],
  [EDITOR]: ["editor"],
  [MODERATOR]: ["moderator"],
};
const operations: Record<string, string> = { [OPS_ONE]: COMPANY_ONE, [MANAGER_ONE]: COMPANY_ONE };
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.alloc(4),
  Buffer.from("WEBPVP8 "),
  Buffer.alloc(64),
]);

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

const state = { user: OPS_ONE as string, photoStatus: "pending", closedFor: "" };
const storageCalls: string[] = [];
const bucket = (name: string) => ({
  upload: vi.fn(async (path: string) => {
    storageCalls.push(`upload:${name}:${path}`);
    return { data: { path }, error: null };
  }),
  remove: vi.fn(async (paths: string[]) => {
    storageCalls.push(`remove:${name}:${paths.join(",")}`);
    return { data: [], error: null };
  }),
  download: vi.fn(async () => ({ data: new Blob([WEBP]), error: null })),
  createSignedUrls: vi.fn(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://signe.test/${path}` })),
    error: null,
  })),
  getPublicUrl: (path: string) => ({ data: { publicUrl: `https://public.test/${path}` } }),
});
const buckets: Record<string, ReturnType<typeof bucket>> = {};

function table(name: string) {
  const filters: Record<string, unknown> = {};
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => ((filters[column] = value), query),
    in: (column: string, value: unknown) => ((filters[column] = value), query),
    limit: () => query,
    maybeSingle: async () => {
      if (name === "user_roles") {
        const wanted = filters["role"] as string[] | string;
        const mine = roles[filters["user_id"] as string] ?? [];
        const hit = mine.find((r) => (Array.isArray(wanted) ? wanted.includes(r) : r === wanted));
        return { data: hit ? { role: hit } : null, error: null };
      }
      if (name === "bw_staff_role_config")
        return {
          data: filters["role"] === state.closedFor ? { removed_tabs: ["companyRequests"] } : null,
          error: null,
        };
      if (name === "bw_company_photos")
        return {
          data: { pending_path: `${COMPANY_ONE}/${PHOTO}.webp`, status: state.photoStatus },
          error: null,
        };
      return { data: null, error: null };
    },
  };
  return query;
}

const rpc = vi.fn();
const db = {
  auth: { getUser: async () => ({ data: { user: { id: state.user } }, error: null }) },
  from: table,
  rpc,
  storage: { from: (name: string) => (buckets[name] ??= bucket(name)) },
} as unknown as SupabaseClient<Database>;

const call = (input: unknown) =>
  handleCompanyAccess(
    new Request("https://bledway.example/api/company-access", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer jeton" },
      body: JSON.stringify(input),
    }),
    db,
    () => "y".repeat(43),
  );
const photoInput = (extra: Record<string, unknown> = {}) => ({
  action: "photo_add",
  companyId: COMPANY_ONE,
  vesselId: null,
  caption: "Pont supérieur au départ",
  rights: true,
  width: 1600,
  height: 1067,
  image: WEBP.toString("base64"),
  ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  state.closedFor = "";
  for (const key of Object.keys(buckets)) delete buckets[key];
  storageCalls.length = 0;
  state.user = OPS_ONE;
  state.photoStatus = "pending";
  nsfw.explicit = false;
  // Base simulée : mêmes refus que les fonctions SQL du lot 3.
  rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    const user = (args["_user"] ?? args["_actor"]) as string;
    const company = args["_company"] as string | undefined;
    if (company && operations[user] !== company && !roles[user])
      return { data: null, error: { message: "BW_FORBIDDEN" } };
    if (name === "bw_company_my_access")
      return { data: [{ companyId: COMPANY_ONE }, { companyId: COMPANY_TWO }], error: null };
    if (name === "bw_company_my_manager")
      return { data: user === MANAGER_ONE ? [COMPANY_ONE] : [], error: null };
    if (name === "bw_company_photo_withdraw")
      return {
        data: {
          pendingPath: `${COMPANY_ONE}/${PHOTO}.webp`,
          publicPath: `${COMPANY_ONE}/${PHOTO}.webp`,
        },
        error: null,
      };
    if (name === "bw_company_desk_queue")
      return {
        data: {
          photos: [
            { id: PHOTO, pendingPath: `${COMPANY_ONE}/${PHOTO}.webp`, publicPath: null },
            { id: "autre", pendingPath: null, publicPath: `${COMPANY_ONE}/p.webp` },
          ],
        },
        error: null,
      };
    return { data: { ok: true }, error: null };
  });
});

describe("Lot 3 côté serveur : réponses, fiche, photos, responsable", () => {
  it("reconnaît le vrai format d'image, pas l'extension annoncée", () => {
    expect(photoFormat(new Uint8Array(WEBP))).toBe("webp");
    expect(photoFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(photoFormat(new Uint8Array(Buffer.from("<svg onload=alert(1)>")))).toBeNull();
  });

  it("une réponse part toujours avec le compte vérifié, jamais un identifiant du navigateur", async () => {
    const response = await call({
      action: "reply_save",
      companyId: COMPANY_TWO,
      targetKind: "entity_review",
      targetId: REVIEW,
      kind: "reply",
      body: "Merci pour votre retour.",
      userId: ADMIN,
    });
    expect(response.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith(
      "bw_company_reply_save",
      expect.objectContaining({ _user: OPS_ONE }),
    );
  });

  it("limite atteinte : message clair", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "BW_LIMIT" } });
    const response = await call({
      action: "reply_save",
      companyId: COMPANY_ONE,
      targetKind: "alert",
      targetId: REVIEW,
      kind: "contest",
      body: "Le navire est parti à l'heure.",
    });
    expect(response.status).toBe(429);
    expect((await response.json()).error).toMatch(/50 réponses/);
  });

  it("refuse une proposition de fiche hors des champs ouverts (nom, logo)", async () => {
    const response = await call({
      action: "profile_propose",
      companyId: COMPANY_ONE,
      changes: { name: "Autre nom" },
    });
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalledWith("bw_company_profile_propose", expect.anything());
  });

  it("photo sans déclaration des droits : refusée avant tout envoi", async () => {
    const response = await call(photoInput({ rights: false }));
    expect(response.status).toBe(400);
    expect(storageCalls).toEqual([]);
  });

  it("fichier qui n'est pas une image WebP ou JPEG : refusé, rien n'est déposé", async () => {
    const response = await call(
      photoInput({ image: Buffer.from("<svg>piège</svg>").toString("base64") }),
    );
    expect(response.status).toBe(400);
    expect(storageCalls).toEqual([]);
  });

  it("niveau Lecture : la base refuse avant le dépôt du fichier", async () => {
    state.user = READ_ONE;
    const response = await call(photoInput());
    expect(response.status).toBe(403);
    expect(storageCalls).toEqual([]);
  });

  it("dépôt dans l'espace privé puis enregistrement ; chemin fixé par le serveur", async () => {
    const response = await call(photoInput());
    expect(response.status).toBe(200);
    expect(storageCalls).toHaveLength(1);
    expect(storageCalls[0]).toMatch(
      new RegExp(`^upload:${GALLERY_PENDING_BUCKET}:${COMPANY_ONE}/[0-9a-f-]{36}\\.webp$`),
    );
    const add = rpc.mock.calls.find(([name]) => name === "bw_company_photo_add")![1];
    expect(add._path).toBe(storageCalls[0]!.split(":")[2]);
  });

  it("photo JPEG : contrôlée puis publiée tout de suite dans l'espace public", async () => {
    const response = await call(photoInput({ image: JPEG.toString("base64") }));
    expect(response.status).toBe(200);
    expect(storageCalls).toHaveLength(1);
    expect(storageCalls[0]).toMatch(
      new RegExp(`^upload:${GALLERY_PUBLIC_BUCKET}:${COMPANY_ONE}/[0-9a-f-]{36}\\.jpg$`),
    );
    const publish = rpc.mock.calls.find(([name]) => name === "bw_company_photo_publish")![1];
    expect(publish._user).toBe(OPS_ONE);
    expect(publish._path).toBe(storageCalls[0]!.split(":")[2]);
    expect(rpc).not.toHaveBeenCalledWith("bw_company_photo_add", expect.anything());
  });

  it("photo JPEG explicite : refusée, rien n'est déposé ni enregistré", async () => {
    nsfw.explicit = true;
    const response = await call(photoInput({ image: JPEG.toString("base64") }));
    expect(response.status).toBe(400);
    expect(storageCalls).toEqual([]);
    expect(rpc).not.toHaveBeenCalledWith("bw_company_photo_publish", expect.anything());
  });

  it("photo JPEG : si la base refuse, le fichier public est effacé", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "bw_company_photo_publish"
        ? { data: null, error: { message: "BW_LIMIT" } }
        : { data: null, error: null },
    );
    const response = await call(photoInput({ image: JPEG.toString("base64") }));
    expect(response.status).toBe(429);
    expect(storageCalls[1]).toMatch(new RegExp(`^remove:${GALLERY_PUBLIC_BUCKET}:`));
  });

  it("si l'enregistrement échoue, le fichier déposé est effacé", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "bw_company_photo_add"
        ? { data: null, error: { message: "BW_LIMIT" } }
        : { data: null, error: null },
    );
    const response = await call(photoInput());
    expect(response.status).toBe(429);
    expect(storageCalls[1]).toMatch(new RegExp(`^remove:${GALLERY_PENDING_BUCKET}:`));
  });

  it("retrait d'une photo : les deux fichiers sont effacés", async () => {
    await call({ action: "photo_withdraw", id: PHOTO });
    expect(storageCalls).toEqual([
      `remove:${GALLERY_PENDING_BUCKET}:${COMPANY_ONE}/${PHOTO}.webp`,
      `remove:${GALLERY_PUBLIC_BUCKET}:${COMPANY_ONE}/${PHOTO}.webp`,
    ]);
  });

  it("file de relecture : liens temporaires, aucun chemin interne renvoyé", async () => {
    state.user = EDITOR;
    const body = await (await call({ action: "desk_queue" })).json();
    expect(body.photos[0].url).toBe(`https://signe.test/${COMPANY_ONE}/${PHOTO}.webp`);
    expect(body.photos[0]).not.toHaveProperty("pendingPath");
    expect(body.photos[1].url).toBe(`https://public.test/${COMPANY_ONE}/p.webp`);
  });

  it("rubrique fermée par l'administrateur : l'éditeur n'ouvre plus la file", async () => {
    state.user = EDITOR;
    state.closedFor = "editor";
    const response = await call({ action: "desk_queue" });
    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalledWith("bw_company_desk_queue", expect.anything());
    state.user = MODERATOR;
    expect((await call({ action: "desk_queue" })).status).toBe(200);
  });

  it("un collaborateur de compagnie n'ouvre pas la file de relecture", async () => {
    const response = await call({ action: "desk_queue" });
    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalledWith("bw_company_desk_queue", expect.anything());
  });

  it("réponses : un éditeur ne décide pas, un modérateur oui", async () => {
    state.user = EDITOR;
    expect((await call({ action: "reply_decide", id: REVIEW, decision: "publish" })).status).toBe(
      403,
    );
    state.user = MODERATOR;
    expect((await call({ action: "reply_decide", id: REVIEW, decision: "publish" })).status).toBe(
      200,
    );
  });

  it("photos et fiches : un modérateur ne décide pas", async () => {
    state.user = MODERATOR;
    expect((await call({ action: "photo_decide", id: PHOTO, decision: "publish" })).status).toBe(
      403,
    );
    expect((await call({ action: "profile_decide", id: PHOTO, decision: "apply" })).status).toBe(
      403,
    );
    expect(storageCalls).toEqual([]);
  });

  it("publication d'une photo : copie publique, décision, puis effacement de l'attente", async () => {
    state.user = EDITOR;
    const response = await call({ action: "photo_decide", id: PHOTO, decision: "publish" });
    expect(response.status).toBe(200);
    expect(storageCalls).toEqual([
      `upload:${GALLERY_PUBLIC_BUCKET}:${COMPANY_ONE}/${PHOTO}.webp`,
      `remove:${GALLERY_PENDING_BUCKET}:${COMPANY_ONE}/${PHOTO}.webp`,
    ]);
    expect(rpc).toHaveBeenCalledWith(
      "bw_company_photo_decide",
      expect.objectContaining({ _public_path: `${COMPANY_ONE}/${PHOTO}.webp`, _actor: EDITOR }),
    );
  });

  it("publication refusée par la base : la copie publique est retirée", async () => {
    state.user = EDITOR;
    rpc.mockResolvedValueOnce({ data: null, error: { message: "BW_CLOSED" } });
    const response = await call({ action: "photo_decide", id: PHOTO, decision: "publish" });
    expect(response.status).toBe(409);
    expect(storageCalls.at(-1)).toBe(
      `remove:${GALLERY_PUBLIC_BUCKET}:${COMPANY_ONE}/${PHOTO}.webp`,
    );
  });

  it("photo déjà traitée : ni copie ni décision", async () => {
    state.user = EDITOR;
    state.photoStatus = "published";
    const response = await call({ action: "photo_decide", id: PHOTO, decision: "publish" });
    expect(response.status).toBe(409);
    expect(storageCalls).toEqual([]);
  });

  it("le responsable invite : lien montré une fois, seule l'empreinte part en base", async () => {
    state.user = MANAGER_ONE;
    const body = await (
      await call({
        action: "manager_invite",
        companyId: COMPANY_ONE,
        email: "Nouveau@Cie-Un.test",
        level: "read",
        verification: "Vu en personne",
      })
    ).json();
    expect(body.link).toBe(`https://bledway.example/rejoindre-compagnie#code=${"y".repeat(43)}`);
    const args = rpc.mock.calls.find(([name]) => name === "bw_company_manager_invite")![1];
    expect(args._token_hash).toBe(hashInviteToken("y".repeat(43)));
    expect(args._email).toBe("nouveau@cie-un.test");
    expect(JSON.stringify(args)).not.toContain("y".repeat(43));
  });

  it("« me » indique les compagnies dont le compte est responsable", async () => {
    state.user = MANAGER_ONE;
    const body = await (await call({ action: "me" })).json();
    expect(body).toEqual([
      { companyId: COMPANY_ONE, manager: true },
      { companyId: COMPANY_TWO, manager: false },
    ]);
  });

  it("« me » fonctionne même si le lot 3 n'est pas installé", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "bw_company_my_manager"
        ? { data: null, error: { message: "function does not exist" } }
        : { data: [{ companyId: COMPANY_ONE }], error: null },
    );
    const body = await (await call({ action: "me" })).json();
    expect(body).toEqual([{ companyId: COMPANY_ONE, manager: false }]);
  });

  it("désigner un responsable : administrateurs seulement", async () => {
    state.user = EDITOR;
    expect((await call({ action: "admin_manager", memberId: MEMBER, on: true })).status).toBe(403);
    state.user = ADMIN;
    expect((await call({ action: "admin_manager", memberId: MEMBER, on: true })).status).toBe(200);
  });
});
