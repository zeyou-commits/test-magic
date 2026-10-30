-- BledWay · Flash info : un niveau « alerte » (navire immobilisé…), au-dessus des perturbations,
-- et le navire concerné, pour ouvrir sa fiche depuis le fil.
ALTER TABLE public.bw_news DROP CONSTRAINT bw_news_kind_check;
ALTER TABLE public.bw_news ADD CONSTRAINT bw_news_kind_check CHECK (kind = ANY (ARRAY['alerte','perturbation','info']));
ALTER TABLE public.bw_news ADD COLUMN IF NOT EXISTS vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';
