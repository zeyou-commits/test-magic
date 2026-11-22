import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isExplicitJpeg } from "@/lib/photos/chatPhoto.server";
import { NSFW_REFUSAL } from "@/lib/photos/nsfwVerdict";

/**
 * Lot 3 de l'espace compagnie : avis, signalements, fiche publique, photos et responsable.
 * Appelé par handleCompanyAccess après la vérification de session ; chaque action repasse par
 * une fonction bw_company_* qui revérifie le compte, la compagnie et le niveau.
 * Les photos sont déposées par le serveur seulement. Depuis le 22/11/2026, une photo JPEG est
 * contrôlée (contenu explicite) puis publiée tout de suite ; BledWay peut la retirer après coup.
 */
export const GALLERY_PENDING_BUCKET = "bledway-galeries-attente";
export const GALLERY_PUBLIC_BUCKET = "bledway-galeries";
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

const uuid = z.string().uuid();
const note = z.string().trim().max(500);
const httpsUrl = z.string().trim().max(300);
const profileChanges = z
  .object({
    description: z.string().trim().max(1000),
    website_url: httpsUrl,
    booking_url: httpsUrl,
    contact_url: httpsUrl,
    claims_url: httpsUrl,
    phone: z.string().trim().max(40),
    contact_email: z.string().trim().max(255),
  })
  .partial()
  .strict()
  .refine((changes) => Object.keys(changes).length > 0);

export const companyDeskActions = [
  // Côté compagnie.
  z.object({ action: z.literal("feedback"), companyId: uuid }),
  z.object({
    action: z.literal("reply_save"),
    companyId: uuid,
    targetKind: z.enum(["entity_review", "vessel_review", "alert"]),
    targetId: uuid,
    kind: z.enum(["reply", "contest"]),
    body: z.string().trim().min(3).max(1000),
  }),
  z.object({ action: z.literal("reply_withdraw"), id: uuid }),
  z.object({ action: z.literal("profile"), companyId: uuid }),
  z.object({
    action: z.literal("profile_propose"),
    companyId: uuid,
    changes: profileChanges,
    message: note.optional(),
  }),
  z.object({ action: z.literal("profile_withdraw"), id: uuid }),
  z.object({
    action: z.literal("photo_add"),
    companyId: uuid,
    vesselId: uuid.nullable(),
    caption: z.string().trim().min(3).max(200),
    credit: z.string().trim().max(120).optional(),
    rights: z.literal(true),
    width: z.number().int().min(200).max(4000),
    height: z.number().int().min(200).max(4000),
    /** Image déjà réduite et réencodée dans le navigateur, en base64 (sans préfixe data:). */
    image: z
      .string()
      .max(Math.ceil((PHOTO_MAX_BYTES * 4) / 3) + 8)
      .regex(/^[A-Za-z0-9+/]+=*$/),
  }),
  z.object({ action: z.literal("photo_withdraw"), id: uuid }),
  z.object({ action: z.literal("manager_overview"), companyId: uuid }),
  z.object({
    action: z.literal("manager_invite"),
    companyId: uuid,
    email: z.string().trim().toLowerCase().email().max(255),
    level: z.enum(["read", "operations"]),
    verification: z.string().trim().min(3).max(500),
  }),
  z.object({ action: z.literal("manager_invite_revoke"), inviteId: uuid }),
  z.object({
    action: z.literal("manager_member"),
    memberId: uuid,
    change: z.enum(["level", "suspend", "resume", "revoke"]),
    level: z.enum(["read", "operations"]).optional(),
    reason: note.optional(),
  }),
  // Côté équipe BledWay.
  z.object({ action: z.literal("desk_queue") }),
  z.object({
    action: z.literal("reply_decide"),
    id: uuid,
    decision: z.enum(["publish", "acknowledge", "refuse", "remove"]),
    note: note.optional(),
  }),
  z.object({
    action: z.literal("profile_decide"),
    id: uuid,
    decision: z.enum(["apply", "refuse"]),
    note: note.optional(),
  }),
  z.object({
    action: z.literal("photo_decide"),
    id: uuid,
    decision: z.enum(["publish", "refuse", "remove"]),
    note: note.optional(),
  }),
  z.object({
    action: z.literal("admin_manager"),
    memberId: uuid,
    on: z.boolean(),
    reason: note.optional(),
  }),
  z.object({ action: z.literal("admin_managers"), companyId: uuid }),
] as const;

const deskSchema = z.discriminatedUnion("action", [...companyDeskActions]);
export type CompanyDeskInput = z.infer<typeof deskSchema>;
const DESK_ACTION_NAMES = new Set<string>(companyDeskActions.map((s) => s.shape.action.value));
export const isDeskAction = (input: { action: string }): input is CompanyDeskInput =>
  DESK_ACTION_NAMES.has(input.action);

/** Rôles d'équipe admis par action (premier filtre ; la base revérifie). */
type StaffRole = "admin" | "editor" | "moderator";
export const DESK_STAFF_ACTIONS: Record<string, StaffRole[]> = {
  desk_queue: ["admin", "editor", "moderator"],
  reply_decide: ["admin", "moderator"],
  profile_decide: ["admin", "editor"],
  photo_decide: ["admin", "editor"],
};

export const DESK_FAILURES: Record<string, { status: number; error: string }> = {
  BW_CLOSED: { status: 409, error: "Cet élément a déjà été traité ou retiré. Rechargez la page." },
  BW_NO_CHANGE: { status: 400, error: "Aucun champ n'est différent de la fiche actuelle." },
  BW_STALE: {
    status: 409,
    error: "L'avis ou le signalement n'est plus affiché : la réponse ne peut pas être publiée.",
  },
  BW_LIMIT: { status: 429, error: "Limite atteinte. Réessayez plus tard." },
};

const CLOSED_TEXT = "Cet élément a déjà été traité ou retiré. Rechargez la page.";

const LIMIT_TEXT: Partial<Record<string, string>> = {
  reply_save: "Limite de 50 réponses par jour atteinte pour votre compagnie.",
  profile_propose: "Limite de 10 propositions par jour atteinte.",
  photo_add:
    "Galerie complète (12 photos) ou 30 photos déjà publiées aujourd'hui : retirez-en une ou réessayez demain.",
  manager_invite: "Limite de 10 invitations par jour atteinte.",
};

type CallResult = { data: unknown; response: Response | null };
export type DeskContext = {
  me: string;
  db: SupabaseClient;
  origin: string;
  call: (name: string, args: Record<string, unknown>) => Promise<CallResult>;
  respond: (body: unknown, status?: number) => Response;
  newToken: () => string;
  hashToken: (token: string) => string;
};

/** Reconnaît le format réel du fichier : WebP ou JPEG, rien d'autre. */
export function photoFormat(bytes: Uint8Array): "webp" | "jpg" | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

type PhotoRow = { pendingPath?: string | null; publicPath?: string | null; url?: string | null };

export async function handleCompanyDesk(input: CompanyDeskInput, ctx: DeskContext) {
  const { me, db, call, respond } = ctx;
  const storage = db.storage;
  const removeQuietly = async (bucket: string, path: string | null | undefined) => {
    if (!path) return;
    try {
      await storage.from(bucket).remove([path]);
    } catch {
      // Un fichier resté orphelin n'est jamais affiché : la base fait foi.
    }
  };
  /** Liens d'affichage : temporaires pour les photos en attente, publics pour les autres. */
  const withUrls = async (photos: PhotoRow[] | null | undefined) => {
    if (!photos?.length) return;
    const pending = photos.filter((p) => p.pendingPath).map((p) => p.pendingPath!);
    let signed: { path: string | null; signedUrl: string }[] = [];
    if (pending.length) {
      const result = await storage.from(GALLERY_PENDING_BUCKET).createSignedUrls(pending, 600);
      signed = (result.data ?? []) as typeof signed;
    }
    for (const photo of photos) {
      if (photo.pendingPath)
        photo.url = signed.find((s) => s.path === photo.pendingPath)?.signedUrl ?? null;
      else if (photo.publicPath)
        photo.url = storage
          .from(GALLERY_PUBLIC_BUCKET)
          .getPublicUrl(photo.publicPath).data.publicUrl;
      // Le chemin interne de l'espace privé n'est pas renvoyé au navigateur.
      delete photo.pendingPath;
    }
  };
  const finish = (result: CallResult) => result.response ?? respond(result.data ?? { ok: true });
  const limited = (result: CallResult) => {
    if (result.response?.status === 429 && LIMIT_TEXT[input.action])
      return respond({ error: LIMIT_TEXT[input.action], code: "BW_LIMIT" }, 429);
    return null;
  };

  switch (input.action) {
    case "feedback":
      return finish(await call("bw_company_feedback", { _user: me, _company: input.companyId }));
    case "reply_save": {
      const result = await call("bw_company_reply_save", {
        _user: me,
        _company: input.companyId,
        _target_kind: input.targetKind,
        _target: input.targetId,
        _kind: input.kind,
        _body: input.body,
      });
      return limited(result) ?? finish(result);
    }
    case "reply_withdraw":
      return finish(await call("bw_company_reply_withdraw", { _user: me, _id: input.id }));
    case "profile": {
      const result = await call("bw_company_profile", { _user: me, _company: input.companyId });
      if (result.response) return result.response;
      const data = result.data as { photos?: PhotoRow[] };
      await withUrls(data.photos).catch(() => undefined);
      return respond(data);
    }
    case "profile_propose": {
      const result = await call("bw_company_profile_propose", {
        _user: me,
        _company: input.companyId,
        _changes: input.changes,
        _message: input.message ?? null,
      });
      return limited(result) ?? finish(result);
    }
    case "profile_withdraw":
      return finish(await call("bw_company_profile_withdraw", { _user: me, _id: input.id }));
    case "photo_add": {
      // Droit et place vérifiés AVANT de déposer quoi que ce soit.
      const check = await call("bw_company_photo_check", {
        _user: me,
        _company: input.companyId,
        _vessel: input.vesselId,
      });
      if (check.response) return limited(check) ?? check.response;
      const bytes = new Uint8Array(Buffer.from(input.image, "base64"));
      const format = photoFormat(bytes);
      if (!format || bytes.length > PHOTO_MAX_BYTES)
        return respond(
          { error: "Image refusée : une photo WebP ou JPEG de 2 Mo au plus.", code: "BAD_IMAGE" },
          400,
        );
      const id = randomUUID();
      const path = `${input.companyId}/${id}.${format}`;
      // Publication directe (22/11/2026) : une photo JPEG passe le filtre de contenu explicite,
      // puis va droit dans l'espace public. Un WebP (ancienne version du site en cache) ne peut
      // pas être contrôlé ici : il suit l'ancien circuit, en attente de l'équipe.
      if (format === "jpg") {
        let explicit: boolean;
        try {
          explicit = await isExplicitJpeg(bytes);
        } catch {
          return respond(
            {
              error: "Vérification de la photo impossible. Réessayez avec une autre.",
              code: "BAD_IMAGE",
            },
            503,
          );
        }
        if (explicit) return respond({ error: NSFW_REFUSAL, code: "BAD_IMAGE" }, 400);
        const upload = await storage.from(GALLERY_PUBLIC_BUCKET).upload(path, bytes, {
          contentType: "image/jpeg",
          cacheControl: "31536000",
          upsert: false,
        });
        if (upload.error)
          return respond(
            { error: "Envoi de la photo impossible pour le moment. Réessayez.", code: "UPLOAD" },
            503,
          );
        const published = await call("bw_company_photo_publish", {
          _user: me,
          _company: input.companyId,
          _vessel: input.vesselId,
          _id: id,
          _path: path,
          _caption: input.caption,
          _credit: input.credit ?? null,
          _rights: input.rights,
          _width: input.width,
          _height: input.height,
          _bytes: bytes.length,
        });
        if (published.response) {
          await removeQuietly(GALLERY_PUBLIC_BUCKET, path);
          return limited(published) ?? published.response;
        }
        return respond(published.data);
      }
      const upload = await storage.from(GALLERY_PENDING_BUCKET).upload(path, bytes, {
        contentType: format === "webp" ? "image/webp" : "image/jpeg",
        upsert: false,
      });
      if (upload.error)
        return respond(
          { error: "Envoi de la photo impossible pour le moment. Réessayez.", code: "UPLOAD" },
          503,
        );
      const result = await call("bw_company_photo_add", {
        _user: me,
        _company: input.companyId,
        _vessel: input.vesselId,
        _id: id,
        _path: path,
        _caption: input.caption,
        _credit: input.credit ?? null,
        _rights: input.rights,
        _width: input.width,
        _height: input.height,
        _bytes: bytes.length,
      });
      if (result.response) {
        await removeQuietly(GALLERY_PENDING_BUCKET, path);
        return limited(result) ?? result.response;
      }
      return respond(result.data);
    }
    case "photo_withdraw": {
      const result = await call("bw_company_photo_withdraw", { _user: me, _id: input.id });
      if (result.response) return result.response;
      const paths = result.data as { pendingPath?: string; publicPath?: string | null };
      await removeQuietly(GALLERY_PENDING_BUCKET, paths.pendingPath);
      await removeQuietly(GALLERY_PUBLIC_BUCKET, paths.publicPath);
      return respond({ ok: true });
    }
    case "manager_overview":
      return finish(
        await call("bw_company_manager_overview", { _user: me, _company: input.companyId }),
      );
    case "manager_invite": {
      const token = ctx.newToken();
      const result = await call("bw_company_manager_invite", {
        _user: me,
        _company: input.companyId,
        _email: input.email,
        _level: input.level,
        _token_hash: ctx.hashToken(token),
        _verification: input.verification,
      });
      if (result.response) return limited(result) ?? result.response;
      // Le lien n'est montré qu'ici, une seule fois : seule son empreinte est gardée en base.
      return respond({
        ...(result.data as Record<string, unknown>),
        link: `${ctx.origin}/rejoindre-compagnie#code=${token}`,
      });
    }
    case "manager_invite_revoke":
      return finish(
        await call("bw_company_manager_invite_revoke", { _user: me, _invite: input.inviteId }),
      );
    case "manager_member":
      return finish(
        await call("bw_company_manager_member", {
          _user: me,
          _member: input.memberId,
          _change: input.change,
          _level: input.level ?? null,
          _reason: input.reason ?? null,
        }),
      );
    case "desk_queue": {
      const result = await call("bw_company_desk_queue", { _actor: me });
      if (result.response) return result.response;
      const data = result.data as { photos?: PhotoRow[] | null };
      await withUrls(data.photos).catch(() => undefined);
      return respond(data);
    }
    case "reply_decide":
      return finish(
        await call("bw_company_reply_decide", {
          _actor: me,
          _id: input.id,
          _decision: input.decision,
          _note: input.note ?? null,
        }),
      );
    case "profile_decide":
      return finish(
        await call("bw_company_profile_decide", {
          _actor: me,
          _id: input.id,
          _decision: input.decision,
          _note: input.note ?? null,
        }),
      );
    case "photo_decide": {
      if (input.decision !== "publish") {
        const result = await call("bw_company_photo_decide", {
          _actor: me,
          _id: input.id,
          _decision: input.decision,
          _note: input.note ?? null,
          _public_path: null,
        });
        if (result.response) return result.response;
        const paths = result.data as { pendingPath?: string; publicPath?: string | null };
        if (input.decision === "refuse")
          await removeQuietly(GALLERY_PENDING_BUCKET, paths.pendingPath);
        else await removeQuietly(GALLERY_PUBLIC_BUCKET, paths.publicPath);
        return respond(result.data);
      }
      const { data: row, error } = await db
        .from("bw_company_photos")
        .select("pending_path,status")
        .eq("id", input.id)
        .maybeSingle();
      if (error)
        return respond({ error: "Lecture de la photo impossible.", code: "UNAVAILABLE" }, 503);
      const photo = row as { pending_path: string; status: string } | null;
      if (!photo) return respond({ error: CLOSED_TEXT, code: "BW_NOT_FOUND" }, 404);
      if (photo.status !== "pending")
        return respond({ error: CLOSED_TEXT, code: "BW_CLOSED" }, 409);
      // Copie vers l'espace public, puis décision en base ; en cas d'échec, la copie est retirée.
      const file = await storage.from(GALLERY_PENDING_BUCKET).download(photo.pending_path);
      if (file.error || !file.data)
        return respond(
          { error: "Photo introuvable dans l'espace de relecture.", code: "UPLOAD" },
          503,
        );
      const copy = await storage
        .from(GALLERY_PUBLIC_BUCKET)
        .upload(photo.pending_path, new Uint8Array(await file.data.arrayBuffer()), {
          contentType: photo.pending_path.endsWith(".webp") ? "image/webp" : "image/jpeg",
          upsert: true,
        });
      if (copy.error)
        return respond(
          { error: "Publication impossible pour le moment. Réessayez.", code: "UPLOAD" },
          503,
        );
      const result = await call("bw_company_photo_decide", {
        _actor: me,
        _id: input.id,
        _decision: "publish",
        _note: input.note ?? null,
        _public_path: photo.pending_path,
      });
      if (result.response) {
        const { data: after } = await db
          .from("bw_company_photos")
          .select("status")
          .eq("id", input.id)
          .maybeSingle();
        if ((after as { status?: string } | null)?.status !== "published")
          await removeQuietly(GALLERY_PUBLIC_BUCKET, photo.pending_path);
        return result.response;
      }
      await removeQuietly(GALLERY_PENDING_BUCKET, photo.pending_path);
      return respond(result.data);
    }
    case "admin_manager":
      return finish(
        await call("bw_company_member_manager", {
          _actor: me,
          _member: input.memberId,
          _on: input.on,
          _reason: input.reason ?? null,
        }),
      );
    case "admin_managers":
      return finish(await call("bw_company_managers", { _actor: me, _company: input.companyId }));
  }
}
