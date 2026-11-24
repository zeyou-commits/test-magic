-- Routes du bled : 1 à 3 photos par halte proposée, publiées seulement après validation de l'équipe
-- (même circuit que les photos d'avis : seau d'attente, file « Photos » de l'admin, seau public).
-- Script additif et rejouable : aucune donnée supprimée.
BEGIN;

ALTER TABLE public.bw_photos DROP CONSTRAINT IF EXISTS bw_photos_kind_check;
ALTER TABLE public.bw_photos ADD CONSTRAINT bw_photos_kind_check
  CHECK (kind = ANY (ARRAY['report', 'vessel_review', 'port_review', 'chat', 'profile', 'route_stop']));

CREATE OR REPLACE FUNCTION public.bw_photo_submit(p_kind text, p_parent uuid, p_path text, p_width integer, p_height integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE me uuid := auth.uid(); parent uuid; review_kind text; new_id uuid; limit_n integer;
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RAISE EXCEPTION 'Connectez-vous pour envoyer une photo.'; END IF;
  IF p_path IS NULL OR p_path NOT LIKE me::text || '/%' OR p_path LIKE '%..%' THEN RAISE EXCEPTION 'Photo invalide.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'bledway-photos-attente' AND o.name = p_path) THEN
    RAISE EXCEPTION 'Photo introuvable : renvoyez-la.';
  END IF;
  IF (SELECT count(*) FROM public.bw_photos WHERE user_id = me AND created_at > now() - interval '24 hours') >= 12 THEN
    RAISE EXCEPTION 'Patientez : 12 photos au plus par jour.';
  END IF;
  IF p_kind IN ('vessel_review', 'port_review') THEN
    review_kind := CASE p_kind WHEN 'vessel_review' THEN 'vessel' ELSE 'port' END;
    SELECT r.id INTO parent FROM public.bw_entity_reviews r
      WHERE r.id = p_parent AND r.user_id = me AND r.target_kind = review_kind;
    limit_n := 3;
  ELSIF p_kind = 'report' THEN
    SELECT a.id INTO parent FROM public.bw_travel_alerts a
      WHERE a.user_id = me AND a.target_kind = 'port' AND a.target_id = p_parent
        AND a.created_at > now() - interval '15 minutes'
      ORDER BY a.created_at DESC LIMIT 1;
    limit_n := 1;
  ELSIF p_kind = 'route_stop' THEN
    -- Sa propre halte, tant qu'elle attend la relecture.
    SELECT s.id INTO parent FROM public.bw_route_stops s
      WHERE s.id = p_parent AND s.user_id = me AND s.status = 'pending';
    limit_n := 3;
  ELSE
    RAISE EXCEPTION 'Photo non prévue ici.';
  END IF;
  IF parent IS NULL THEN RAISE EXCEPTION 'Avis ou signalement introuvable.'; END IF;
  IF (SELECT count(*) FROM public.bw_photos WHERE kind = p_kind AND parent_id = parent) >= limit_n THEN
    RAISE EXCEPTION 'Nombre de photos atteint (% au plus).', limit_n;
  END IF;
  INSERT INTO public.bw_photos(user_id, kind, parent_id, pending_path, width, height)
  VALUES (me, p_kind, parent, p_path, p_width, p_height) RETURNING id INTO new_id;
  RETURN new_id;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_photos_public(p_kind text, p_parents uuid[])
RETURNS TABLE(id uuid, parent_id uuid, path text, width integer, height integer, mine boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT p.id, p.parent_id, p.public_path, p.width, p.height, coalesce(p.user_id = auth.uid(), false)
  FROM public.bw_photos p
  WHERE p.kind = p_kind AND p.parent_id = ANY (p_parents[1:200]) AND p.status = 'approved'
    AND p.public_path IS NOT NULL
    AND (p.kind <> 'chat' OR EXISTS (SELECT 1 FROM public.bw_chat_messages m WHERE m.id = p.parent_id AND m.hidden_at IS NULL))
    AND (p.kind NOT IN ('vessel_review','port_review')
         OR EXISTS (SELECT 1 FROM public.bw_entity_reviews r WHERE r.id = p.parent_id AND r.status = 'published'))
    -- Photo d'une halte : visible seulement une fois la halte publiée.
    AND (p.kind <> 'route_stop'
         OR EXISTS (SELECT 1 FROM public.bw_route_stops s WHERE s.id = p.parent_id AND s.status = 'approved'))
  ORDER BY p.created_at;
$function$;

CREATE OR REPLACE FUNCTION public.bw_photos_queue()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  IF NOT private.bw_photo_staff() THEN RAISE EXCEPTION 'Action réservée à l’équipe'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', p.id, 'kind', p.kind, 'parent_id', p.parent_id, 'pending_path', p.pending_path,
      'public_path', p.public_path, 'created_at', p.created_at,
      'reports', (SELECT count(*) FROM public.bw_photo_reports r WHERE r.photo_id = p.id),
      'place', CASE
        WHEN p.kind IN ('vessel_review','port_review') THEN (
          SELECT coalesce(v.name, po.name) FROM public.bw_entity_reviews r
          LEFT JOIN public.vessels v ON v.id = r.vessel_id LEFT JOIN public.ports po ON po.id = r.port_id
          WHERE r.id = p.parent_id)
        WHEN p.kind = 'report' THEN (
          SELECT po.name FROM public.bw_travel_alerts a JOIN public.ports po ON po.id = a.target_id
          WHERE a.id = p.parent_id)
        WHEN p.kind = 'route_stop' THEN (
          SELECT s.name || ' (' || s.route_code || ', ' || s.place || ')' FROM public.bw_route_stops s
          WHERE s.id = p.parent_id)
        ELSE 'Salon' END,
      'author', (SELECT t.pseudo FROM public.bw_traveller_profiles t WHERE t.user_id = p.user_id)
    ) ORDER BY p.created_at)
    FROM public.bw_photos p WHERE p.status = 'pending'), '[]'::jsonb);
END $function$;

-- Halte supprimée : ses photos partent avec elle (fichiers ramassés par la purge habituelle).
DROP TRIGGER IF EXISTS bw_photo_parent_gone ON public.bw_route_stops;
CREATE TRIGGER bw_photo_parent_gone AFTER DELETE ON public.bw_route_stops
  FOR EACH ROW EXECUTE FUNCTION private.bw_photo_parent_gone('route_stop');

COMMIT;
