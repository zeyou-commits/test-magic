import type { SupabaseClient } from "@supabase/supabase-js";
import { NSFW_REFUSAL } from "./nsfwVerdict";
import { isExplicitJpeg } from "./chatPhoto.server";

/**
 * Photo de profil publiée tout de suite, sans attendre l'équipe (20/11/2026).
 * Même contrôle que les photos de salon : le téléphone dépose un JPEG en attente, le serveur le
 * relit, le passe au filtre de contenu explicite, puis le copie dans l'espace public.
 * Deux signalements la retirent de l'affichage et la renvoient à l'équipe (trigger en base).
 */

const PENDING_BUCKET = "bledway-photos-attente";
const PUBLIC_BUCKET = "bledway-photos";
const MAX_BYTES = 6 * 1024 * 1024;

export type ProfilePhotoInput = { pendingPath: string; width: number; height: number };

export async function publishProfilePhoto(
  admin: SupabaseClient,
  user: SupabaseClient,
  userId: string,
  input: ProfilePhotoInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const match = new RegExp(`^${userId}/profil-([0-9a-f-]{36})\\.jpg$`).exec(input.pendingPath);
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

  const publicPath = `profils/${userId}/${match[1]}.jpg`;
  const upload = await admin.storage.from(PUBLIC_BUCKET).upload(publicPath, bytes, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (upload.error) return { ok: false, reason: "Envoi de la photo impossible. Réessayez." };
  const { error } = await user.rpc("bw_profile_photo_publish", {
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
