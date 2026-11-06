import type { SupabaseClient } from "@supabase/supabase-js";
import { NSFW_REFUSAL, isExplicit, nsfwScores } from "./nsfwVerdict";

/**
 * Contrôle serveur des photos de salon. Le téléphone dépose la photo (JPEG) dans l'espace en
 * attente ; ici, elle est relue, classée par le même modèle NSFWJS qu'au téléphone, puis copiée
 * dans l'espace public. Les salons n'acceptent plus d'envoi direct (script
 * 20261111120000_photos_salons_serveur.sql) : contourner le filtre du téléphone ne sert à rien.
 */

const PENDING_BUCKET = "bledway-photos-attente";
const PUBLIC_BUCKET = "bledway-photos";
const MAX_BYTES = 6 * 1024 * 1024;
const MAX_SIDE = 1600;

type Classifier = {
  classify: (image: unknown) => Promise<{ className: string; probability: number }[]>;
};
let model: Promise<Classifier> | null = null;

const getModel = () =>
  (model ??= (async () => {
    const [tf, core, definition] = await Promise.all([
      import("@tensorflow/tfjs"),
      import("nsfwjs/core"),
      import("nsfwjs/models/mobilenet_v2"),
    ]);
    await tf.setBackend("cpu");
    await tf.ready();
    return (await core.load("MobileNetV2", {
      modelDefinitions: [definition.MobileNetV2Model],
    })) as unknown as Classifier;
  })().catch((error: unknown) => {
    model = null;
    throw error;
  }));

const isJpeg = (bytes: Uint8Array) =>
  bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

/** Vrai si la photo est explicite. Une image illisible est refusée. */
export async function isExplicitJpeg(bytes: Uint8Array) {
  if (!isJpeg(bytes)) throw new Error("Format de photo inattendu.");
  const [{ default: jpeg }, tf, classifier] = await Promise.all([
    import("jpeg-js"),
    import("@tensorflow/tfjs"),
    getModel(),
  ]);
  const raw = jpeg.decode(bytes, {
    useTArray: true,
    formatAsRGBA: false,
    maxResolutionInMP: 4,
    maxMemoryUsageInMB: 128,
  });
  if (!raw.width || !raw.height || Math.max(raw.width, raw.height) > MAX_SIDE + 1)
    throw new Error("Dimensions de photo inattendues.");
  const image = tf.tensor3d(raw.data, [raw.height, raw.width, 3], "int32");
  try {
    return isExplicit(nsfwScores(await classifier.classify(image)));
  } finally {
    image.dispose();
  }
}

export type ChatPhotoInput = {
  pendingPath: string;
  roomKind: string;
  room: string;
  width: number;
  height: number;
};

/**
 * `user` agit au nom de la personne (bw_photo_chat vérifie le salon et la limite d'une photo) ;
 * `admin` lit l'attente et écrit dans l'espace public.
 */
export async function publishChatPhoto(
  admin: SupabaseClient,
  user: SupabaseClient,
  userId: string,
  input: ChatPhotoInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const match = new RegExp(`^${userId}/salon-([0-9a-f-]{36})\\.jpg$`).exec(input.pendingPath);
  if (!match) return { ok: false, reason: "Photo introuvable." };
  const dropPending = () =>
    admin.storage
      .from(PENDING_BUCKET)
      .remove([input.pendingPath])
      .catch(() => undefined);

  const file = await admin.storage.from(PENDING_BUCKET).download(input.pendingPath);
  if (file.error || !file.data) return { ok: false, reason: "Photo introuvable." };
  if (file.data.size > MAX_BYTES) {
    await dropPending();
    return { ok: false, reason: "Image trop lourde." };
  }
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  let explicit: boolean;
  try {
    explicit = await isExplicitJpeg(bytes);
  } catch {
    await dropPending();
    return { ok: false, reason: "Vérification de la photo impossible. Réessayez avec une autre." };
  }
  if (explicit) {
    await dropPending();
    return { ok: false, reason: NSFW_REFUSAL };
  }

  const publicPath = `salons/${userId}/${match[1]}.jpg`;
  const upload = await admin.storage.from(PUBLIC_BUCKET).upload(publicPath, bytes, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (upload.error) return { ok: false, reason: "Envoi de la photo impossible. Réessayez." };
  const { error } = await user.rpc("bw_photo_chat", {
    p_kind: input.roomKind,
    p_room: input.room,
    p_path: publicPath,
    p_width: input.width,
    p_height: input.height,
  });
  await dropPending();
  if (error) {
    await admin.storage
      .from(PUBLIC_BUCKET)
      .remove([publicPath])
      .catch(() => undefined);
    return { ok: false, reason: `rpc:${error.message}` };
  }
  return { ok: true };
}
