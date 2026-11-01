-- BledWay · Suivre une compagnie : ses actualités préviennent ceux qui la suivent.
ALTER TABLE public.bw_follows DROP CONSTRAINT IF EXISTS bw_follows_target_kind_check;
ALTER TABLE public.bw_follows ADD CONSTRAINT bw_follows_target_kind_check
  CHECK (target_kind = ANY (ARRAY['vessel'::text, 'departure'::text, 'company'::text]));
