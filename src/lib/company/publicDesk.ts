import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lecture publique du lot 3 : réponses publiées des compagnies et galeries relues.
 * Deux fonctions ouvertes aux visiteurs ; si le script n'est pas installé, rien ne s'affiche.
 */
const db = supabase as unknown as SupabaseClient;
export const GALLERY_PUBLIC_BUCKET = "bledway-galeries";

export type PublicCompanyReply = {
  targetId: string;
  body: string;
  companyName: string;
  date: string;
};
export type GalleryPhoto = {
  id: string;
  path: string;
  caption: string;
  credit: string | null;
  width: number;
  height: number;
  companyName: string;
};

export const companyRepliesQuery = (
  kind: "entity_review" | "vessel_review" | "alert",
  ids: string[],
) =>
  queryOptions({
    queryKey: ["company-public-replies", kind, [...ids].sort().join(",")],
    queryFn: async () => {
      const { data, error } = await db.rpc("bw_company_public_replies", {
        _kind: kind,
        _ids: ids.slice(0, 100),
      });
      if (error) return new Map<string, PublicCompanyReply>();
      const byTarget = new Map<string, PublicCompanyReply>();
      for (const reply of (data ?? []) as PublicCompanyReply[]) byTarget.set(reply.targetId, reply);
      return byTarget;
    },
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

export const companyGalleryQuery = (companyId: string | null, vesselId: string | null) =>
  queryOptions({
    queryKey: ["company-gallery", companyId ?? "", vesselId ?? ""],
    queryFn: async () => {
      const { data, error } = await db.rpc("bw_company_gallery", {
        _company: companyId,
        _vessel: vesselId,
      });
      if (error) return [] as GalleryPhoto[];
      return (data ?? []) as GalleryPhoto[];
    },
    enabled: Boolean(companyId || vesselId),
    staleTime: 10 * 60_000,
    retry: false,
  });

export const galleryUrl = (path: string) =>
  db.storage.from(GALLERY_PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
