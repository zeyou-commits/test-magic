-- Voix de Mes dinars : un enregistrement par montant, déposé depuis l'admin.
CREATE TABLE IF NOT EXISTS public.bw_dinar_voices (
  said text PRIMARY KEY,
  storage_path text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.bw_dinar_voices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bw_dinar_voices_read ON public.bw_dinar_voices;
DROP POLICY IF EXISTS bw_dinar_voices_write ON public.bw_dinar_voices;
CREATE POLICY bw_dinar_voices_read ON public.bw_dinar_voices FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY bw_dinar_voices_write ON public.bw_dinar_voices FOR ALL TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])))
  WITH CHECK ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
GRANT SELECT ON public.bw_dinar_voices TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bw_dinar_voices TO authenticated;

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bledway-voices', 'bledway-voices', true, 2097152, ARRAY['audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/aac'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 2097152,
  allowed_mime_types = ARRAY['audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/aac'];
DROP POLICY IF EXISTS bw_voices_insert ON storage.objects;
DROP POLICY IF EXISTS bw_voices_delete ON storage.objects;
CREATE POLICY bw_voices_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bledway-voices' AND (SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
CREATE POLICY bw_voices_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bledway-voices' AND (SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
