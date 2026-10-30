-- BledWay · Flash info : un niveau « alerte » (navire immobilisé…), au-dessus des perturbations.
ALTER TABLE public.bw_news DROP CONSTRAINT bw_news_kind_check;
ALTER TABLE public.bw_news ADD CONSTRAINT bw_news_kind_check CHECK (kind = ANY (ARRAY['alerte','perturbation','info']));
NOTIFY pgrst, 'reload schema';
