-- Photo de profil publiée tout de suite, sans validation de l'équipe (20/11/2026).
-- Le serveur du site a déjà passé la photo au filtre de contenu explicite et l'a copiée dans
-- l'espace public (profils/<compte>/…). Cette fonction l'enregistre comme validée et remplace
-- l'ancienne photo (le fichier part à la corbeille, vidée chaque nuit).
-- Deux signalements la renvoient toujours à l'équipe (trigger bw_profile_photo_reported).
-- L'ancienne fonction bw_profile_photo_submit reste en place pour les versions en cache du site.

CREATE OR REPLACE FUNCTION public.bw_profile_photo_publish(p_path text, p_width integer, p_height integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); new_id uuid;
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RAISE EXCEPTION 'Connectez-vous pour envoyer une photo.'; END IF;
  IF p_path IS NULL OR p_path NOT LIKE 'profils/' || me::text || '/%' OR p_path LIKE '%..%' THEN RAISE EXCEPTION 'Photo invalide.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'bledway-photos' AND o.name = p_path) THEN
    RAISE EXCEPTION 'Photo introuvable : renvoyez-la.';
  END IF;
  IF (SELECT count(*) FROM public.bw_photos WHERE user_id = me AND created_at > now() - interval '24 hours') >= 12 THEN
    RAISE EXCEPTION 'Patientez : 12 photos au plus par jour.';
  END IF;
  -- Chaque photo efface la précédente : la limite se compte sur les fichiers publiés (nouveau compris).
  IF (SELECT count(*) FROM storage.objects o WHERE o.bucket_id = 'bledway-photos'
        AND o.name LIKE 'profils/' || me::text || '/%' AND o.created_at > now() - interval '24 hours') > 3 THEN
    RAISE EXCEPTION 'Patientez : 3 photos de profil au plus par jour.';
  END IF;
  DELETE FROM public.bw_photos WHERE user_id = me AND kind = 'profile';
  INSERT INTO public.bw_photos(user_id, kind, parent_id, status, public_path, width, height, decided_at)
  VALUES (me, 'profile', me, 'approved', p_path, p_width, p_height, now()) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

REVOKE ALL ON FUNCTION public.bw_profile_photo_publish(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_profile_photo_publish(text, integer, integer) TO authenticated;
