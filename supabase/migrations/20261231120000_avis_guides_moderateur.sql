-- Avis guidés (ports, navires, compagnies) : ouverts au modérateur, comme les autres avis.
-- Avant : lecture et décision réservées à l'administrateur, alors que l'écran « Avis et photos »
-- les montre au modérateur (qui recevait une erreur).

-- 1. Lecture : le modérateur actif lit tous les avis guidés (l'auteur et l'admin gardent leur accès).
DROP POLICY IF EXISTS bw_entity_reviews_moderator_read ON public.bw_entity_reviews;
CREATE POLICY bw_entity_reviews_moderator_read ON public.bw_entity_reviews
  FOR SELECT TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['moderator'])));

-- 2. Décision (publier / masquer) : administrateur ou modérateur actif et non suspendu.
CREATE OR REPLACE FUNCTION public.bw_moderate_entity_review(p_review uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT private.bw_account_active()
 OR NOT coalesce(private.bw_staff_permission(ARRAY['admin','moderator']), false)
 OR p_status IS NULL OR p_status NOT IN ('published','hidden') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 UPDATE public.bw_entity_reviews SET status=p_status,
 published_scores=CASE WHEN p_status='published' THEN scores ELSE NULL END,
 published_at=CASE WHEN p_status='published' THEN now() ELSE NULL END WHERE id=p_review;
 IF NOT FOUND THEN RAISE EXCEPTION 'Avis introuvable'; END IF;
END $function$;
