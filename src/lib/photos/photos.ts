import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Tables, stockage et fonctions du script « photos », absents des types générés.
const db = typedSupabase as unknown as SupabaseClient;

export const PENDING_BUCKET = "bledway-photos-attente";
export const PUBLIC_BUCKET = "bledway-photos";
export type PhotoKind = "report" | "vessel_review" | "port_review" | "chat";

/** Une photo prête à l'envoi : réduite, réencodée (sans aucune métadonnée, position GPS comprise). */
export type PreparedPhoto = { blob: Blob; url: string; width: number; height: number };
export type PublicPhoto = {
  id: string;
  parent_id: string;
  path: string;
  width: number;
  height: number;
};

const MAX_SIDE = 1600;

/**
 * Réduit la photo à 1 600 px au plus et la réencode : l'image redessinée ne garde ni l'EXIF, ni la
 * position GPS, ni le modèle de l'appareil. L'orientation du téléphone est appliquée avant.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith("image/")) throw new Error("Choisissez une image.");
  if (file.size > 25 * 1024 * 1024) throw new Error("Image trop lourde (25 Mo au plus).");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Image illisible : essayez une photo en JPG ou PNG.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // WebP d'abord ; un navigateur qui ne sait pas l'écrire renvoie du PNG : on passe alors en JPEG.
  let blob = await encode("image/webp", 0.82);
  if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg", 0.85);
  if (!blob) throw new Error("Conversion impossible sur ce navigateur.");
  return { blob, url: URL.createObjectURL(blob), width, height };
}

const extension = (blob: Blob) => (blob.type === "image/jpeg" ? "jpg" : "webp");

async function upload(bucket: string, path: string, blob: Blob) {
  const { error } = await db.storage
    .from(bucket)
    .upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error("Envoi de la photo impossible. Réessayez.");
}

const readable = (message: string, fallback: string) =>
  /Patientez|Nombre de photos|Une seule photo|Connectez-vous|introuvable|invalide/.test(message)
    ? message
    : fallback;

/** Avis ou signalement : la photo part en attente ; l'équipe la valide avant publication. */
export async function submitPhoto(
  kind: Exclude<PhotoKind, "chat">,
  parent: string,
  userId: string,
  photo: PreparedPhoto,
) {
  const path = `${userId}/${crypto.randomUUID()}.${extension(photo.blob)}`;
  await upload(PENDING_BUCKET, path, photo.blob);
  const { error } = await db.rpc("bw_photo_submit", {
    p_kind: kind,
    p_parent: parent,
    p_path: path,
    p_width: photo.width,
    p_height: photo.height,
  });
  if (error) {
    await db.storage.from(PENDING_BUCKET).remove([path]);
    throw new Error(readable(error.message, "La photo n’a pas pu être jointe."));
  }
}

/** Salon : photo déjà filtrée sur l'appareil, publiée avec mon dernier message du salon. */
export async function sendChatPhoto(
  roomKind: string,
  room: string,
  userId: string,
  photo: PreparedPhoto,
) {
  const path = `salons/${userId}/${crypto.randomUUID()}.${extension(photo.blob)}`;
  await upload(PUBLIC_BUCKET, path, photo.blob);
  const { error } = await db.rpc("bw_photo_chat", {
    p_kind: roomKind,
    p_room: room,
    p_path: path,
    p_width: photo.width,
    p_height: photo.height,
  });
  if (error) {
    await db.storage.from(PUBLIC_BUCKET).remove([path]);
    throw new Error(readable(error.message, "La photo n’a pas pu être publiée."));
  }
}

export const photoUrl = (path: string) =>
  db.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;

export const photosKey = ["photos"] as const;

/** Les photos publiées d'une liste d'avis, de signalements ou de messages, rangées par parent. */
export const photosQuery = (kind: PhotoKind, parents: string[]) =>
  queryOptions({
    queryKey: [...photosKey, kind, [...parents].sort().join(",")],
    enabled: parents.length > 0,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await db.rpc("bw_photos_public", {
        p_kind: kind,
        p_parents: parents.slice(0, 200),
      });
      // Script pas encore exécuté : aucune photo, sans erreur à l'écran.
      if (error) return new Map<string, PublicPhoto[]>();
      const byParent = new Map<string, PublicPhoto[]>();
      for (const photo of data as PublicPhoto[])
        byParent.set(photo.parent_id, [...(byParent.get(photo.parent_id) ?? []), photo]);
      return byParent;
    },
  });

export async function reportPhoto(id: string) {
  const { error } = await db.rpc("bw_photo_report", { p_id: id });
  if (error) throw new Error(readable(error.message, "Signalement non envoyé."));
}
