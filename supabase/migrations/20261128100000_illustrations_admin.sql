-- Illustrations de l'application : image et nom choisis depuis l'admin.
-- Le chemin d'origine (/cabas/...) reste l'identifiant : profils et humeurs n'ont pas à changer.
CREATE TABLE IF NOT EXISTS public.bw_illustrations (
  src text PRIMARY KEY CHECK (src LIKE '/cabas/%'),
  storage_path text,
  label text CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 40),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.bw_illustrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bw_illustrations_read ON public.bw_illustrations;
DROP POLICY IF EXISTS bw_illustrations_write ON public.bw_illustrations;
CREATE POLICY bw_illustrations_read ON public.bw_illustrations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY bw_illustrations_write ON public.bw_illustrations FOR ALL TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])))
  WITH CHECK ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
GRANT SELECT ON public.bw_illustrations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bw_illustrations TO authenticated;

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bledway-illustrations', 'bledway-illustrations', true, 1048576, ARRAY['image/webp','image/png'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 1048576,
  allowed_mime_types = ARRAY['image/webp','image/png'];
DROP POLICY IF EXISTS bw_illustrations_insert ON storage.objects;
DROP POLICY IF EXISTS bw_illustrations_delete ON storage.objects;
CREATE POLICY bw_illustrations_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bledway-illustrations' AND (SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
CREATE POLICY bw_illustrations_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bledway-illustrations' AND (SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
