-- BledWay · Rétablit l'envoi des photos de navires par l'équipe (admin, éditeur) :
-- le dossier vessel-photos n'avait plus aucune autorisation d'écriture.
-- Les photos restent publiques en lecture ; aucune donnée n'est modifiée.
DROP POLICY IF EXISTS bw_vessel_photos_select ON storage.objects;
CREATE POLICY bw_vessel_photos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vessel-photos' AND (SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
DROP POLICY IF EXISTS bw_vessel_photos_insert ON storage.objects;
CREATE POLICY bw_vessel_photos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vessel-photos' AND (SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
DROP POLICY IF EXISTS bw_vessel_photos_update ON storage.objects;
CREATE POLICY bw_vessel_photos_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vessel-photos' AND (SELECT private.bw_staff_permission(ARRAY['admin','editor'])))
  WITH CHECK (bucket_id = 'vessel-photos' AND (SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
DROP POLICY IF EXISTS bw_vessel_photos_delete ON storage.objects;
CREATE POLICY bw_vessel_photos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vessel-photos' AND (SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
