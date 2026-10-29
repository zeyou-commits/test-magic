-- Images des billets choisies dans l'admin. Lecture publique, écriture réservée à l'équipe éditoriale.
CREATE TABLE IF NOT EXISTS public.bw_wallet_media (
  value integer NOT NULL CHECK (value IN (2000, 1000, 500)),
  slot text NOT NULL CHECK (slot IN ('front', 'variant')),
  storage_path text NOT NULL,
  credit_label text NOT NULL DEFAULT 'BledWay',
  credit_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (value, slot),
  CONSTRAINT bw_wallet_media_credit_url CHECK (credit_url IS NULL OR credit_url ~* '^https?://')
);
ALTER TABLE public.bw_wallet_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bw_wallet_media_read ON public.bw_wallet_media;
DROP POLICY IF EXISTS bw_wallet_media_insert ON public.bw_wallet_media;
DROP POLICY IF EXISTS bw_wallet_media_update ON public.bw_wallet_media;
DROP POLICY IF EXISTS bw_wallet_media_delete ON public.bw_wallet_media;
CREATE POLICY bw_wallet_media_read ON public.bw_wallet_media FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY bw_wallet_media_insert ON public.bw_wallet_media FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
CREATE POLICY bw_wallet_media_update ON public.bw_wallet_media FOR UPDATE TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])))
  WITH CHECK ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
CREATE POLICY bw_wallet_media_delete ON public.bw_wallet_media FOR DELETE TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
GRANT SELECT ON public.bw_wallet_media TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bw_wallet_media TO authenticated;

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bledway-banknotes', 'bledway-banknotes', true, 3145728, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=true, file_size_limit=3145728,
  allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'];
DROP POLICY IF EXISTS bw_banknotes_insert ON storage.objects;
DROP POLICY IF EXISTS bw_banknotes_delete ON storage.objects;
CREATE POLICY bw_banknotes_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='bledway-banknotes' AND (SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
CREATE POLICY bw_banknotes_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='bledway-banknotes' AND (SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
