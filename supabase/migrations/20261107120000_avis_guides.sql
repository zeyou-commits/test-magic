-- Ajout non destructif : les anciens avis restent conservés et lisibles.
BEGIN;
CREATE TABLE public.bw_entity_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind text NOT NULL CHECK (target_kind IN ('port','vessel','company')),
  target_id uuid NOT NULL,
  port_id uuid GENERATED ALWAYS AS (CASE WHEN target_kind='port' THEN target_id END) STORED REFERENCES public.ports(id) ON DELETE CASCADE,
  vessel_id uuid GENERATED ALWAYS AS (CASE WHEN target_kind='vessel' THEN target_id END) STORED REFERENCES public.vessels(id) ON DELETE CASCADE,
  company_id uuid GENERATED ALWAYS AS (CASE WHEN target_kind='company' THEN target_id END) STORED REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scores jsonb NOT NULL,
  published_scores jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE(target_kind,target_id,user_id)
);
CREATE INDEX bw_entity_reviews_pending ON public.bw_entity_reviews(updated_at DESC) WHERE status='pending';
CREATE INDEX bw_entity_reviews_own_recent ON public.bw_entity_reviews(user_id,updated_at DESC);
CREATE INDEX bw_entity_reviews_public ON public.bw_entity_reviews(target_kind,target_id) WHERE published_scores IS NOT NULL;
ALTER TABLE public.bw_entity_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_entity_reviews FROM anon,authenticated;
GRANT SELECT ON public.bw_entity_reviews TO authenticated;
CREATE POLICY bw_entity_reviews_own_admin ON public.bw_entity_reviews FOR SELECT TO authenticated
USING (user_id=auth.uid() OR private.has_role(auth.uid(),'admin'));

CREATE FUNCTION private.bw_review_mean(p_scores jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT avg(value::numeric) FROM jsonb_each(p_scores) WHERE value <> 'null'::jsonb
$$;
REVOKE ALL ON FUNCTION private.bw_review_mean(jsonb) FROM PUBLIC;

CREATE FUNCTION public.bw_submit_entity_review(p_kind text,p_target uuid,p_scores jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed text[]; pair record; n integer:=0; result uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT private.bw_account_active() THEN RAISE EXCEPTION 'Connectez-vous avec un compte actif pour noter'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 allowed:=CASE p_kind WHEN 'port' THEN ARRAY['access','signage','cleanliness','waiting','services']
 WHEN 'vessel' THEN ARRAY['cleanliness','comfort','rest','food','facilities']
 WHEN 'company' THEN ARRAY['information','boarding','changes','support','value'] ELSE NULL END;
 IF allowed IS NULL OR p_target IS NULL OR p_scores IS NULL OR jsonb_typeof(p_scores)<>'object' THEN RAISE EXCEPTION 'Évaluation invalide'; END IF;
 IF NOT ((p_kind='port' AND EXISTS(SELECT 1 FROM public.ports WHERE id=p_target AND status='active'))
 OR (p_kind='vessel' AND EXISTS(SELECT 1 FROM public.vessels WHERE id=p_target AND status='active'))
 OR (p_kind='company' AND EXISTS(SELECT 1 FROM public.companies WHERE id=p_target AND status='active'))) THEN RAISE EXCEPTION 'Fiche indisponible'; END IF;
 FOR pair IN SELECT * FROM jsonb_each(p_scores) LOOP
   IF NOT pair.key=ANY(allowed) THEN RAISE EXCEPTION 'Critère invalide'; END IF;
   IF pair.value <> 'null'::jsonb THEN
     IF jsonb_typeof(pair.value)<>'number' OR pair.value::text !~ '^[1-5]$' THEN RAISE EXCEPTION 'Choisissez entre 1 et 5 étoiles'; END IF;
     n:=n+1;
   END IF;
 END LOOP;
 IF n<3 THEN RAISE EXCEPTION 'Notez au moins trois critères'; END IF;
 IF EXISTS(SELECT 1 FROM public.bw_entity_reviews WHERE user_id=auth.uid() AND updated_at>now()-interval '1 minute') THEN RAISE EXCEPTION 'Patientez une minute avant une nouvelle évaluation'; END IF;
 INSERT INTO public.bw_entity_reviews(target_kind,target_id,user_id,scores)
 VALUES(p_kind,p_target,auth.uid(),p_scores)
 ON CONFLICT(target_kind,target_id,user_id) DO UPDATE SET scores=EXCLUDED.scores,status='pending',updated_at=now()
 RETURNING id INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.bw_moderate_entity_review(p_review uuid,p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.bw_account_active() OR NOT coalesce(private.has_role(auth.uid(),'admin'),false)
 OR p_status IS NULL OR p_status NOT IN ('published','hidden') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 UPDATE public.bw_entity_reviews SET status=p_status,
 published_scores=CASE WHEN p_status='published' THEN scores ELSE NULL END,
 published_at=CASE WHEN p_status='published' THEN now() ELSE NULL END WHERE id=p_review;
 IF NOT FOUND THEN RAISE EXCEPTION 'Avis introuvable'; END IF;
END $$;

CREATE FUNCTION public.bw_delete_entity_review(p_review uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 DELETE FROM public.bw_entity_reviews WHERE id=p_review AND user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Avis introuvable'; END IF;
END $$;

CREATE FUNCTION public.bw_entity_review_feed(p_kind text,p_target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF p_kind NOT IN ('port','vessel','company') OR p_kind IS NULL THEN RAISE EXCEPTION 'Fiche invalide'; END IF;
 WITH published AS (
  SELECT id,user_id,published_scores AS scores,published_at FROM public.bw_entity_reviews
  WHERE target_kind=p_kind AND target_id=p_target AND published_scores IS NOT NULL
 ), legacy_port AS (
  SELECT DISTINCT ON (coalesce(r.user_id::text,r.id::text)) r.id,r.user_id,
    coalesce(max(rr.score) FILTER(WHERE c.slug='global'),avg(rr.score)) AS score
  FROM public.port_reviews r JOIN public.review_ratings rr ON rr.review_id=r.id JOIN public.rating_criteria c ON c.id=rr.criterion_id
  WHERE p_kind='port' AND r.port_id=p_target AND r.status='published'
  AND NOT EXISTS(SELECT 1 FROM published p WHERE p.user_id=r.user_id)
  GROUP BY r.id,r.user_id,r.created_at ORDER BY coalesce(r.user_id::text,r.id::text),r.created_at DESC
 ), all_scores AS (
  SELECT private.bw_review_mean(scores) AS score FROM published
  UNION ALL SELECT score FROM legacy_port
  UNION ALL SELECT r.score FROM public.bw_vessel_reviews r WHERE p_kind='vessel' AND r.vessel_id=p_target AND r.status='published'
   AND NOT EXISTS(SELECT 1 FROM published p WHERE p.user_id=r.user_id)
 ), criterion_scores AS (
  SELECT e.key,avg(e.value::numeric) AS average,count(*) AS count FROM published p CROSS JOIN LATERAL jsonb_each(p.scores) e
  WHERE e.value<>'null'::jsonb GROUP BY e.key
 )
 SELECT jsonb_build_object('count',(SELECT count(*) FROM all_scores WHERE score IS NOT NULL),
  'average',(SELECT avg(score) FROM all_scores),
  'criteria',coalesce((SELECT jsonb_object_agg(key,jsonb_build_object('average',average,'count',count)) FROM criterion_scores),'{}'::jsonb),
  'reviews',coalesce((SELECT jsonb_agg(x ORDER BY x.date DESC) FROM (
   SELECT id,scores,private.bw_review_mean(scores) AS score,published_at AS date,
    (SELECT private.bw_traveller_card(t) FROM public.bw_traveller_profiles t WHERE t.user_id=published.user_id) AS author
   FROM published ORDER BY published_at DESC LIMIT 30
  ) x),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.bw_submit_entity_review(text,uuid,jsonb),public.bw_moderate_entity_review(uuid,text),public.bw_delete_entity_review(uuid),public.bw_entity_review_feed(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_submit_entity_review(text,uuid,jsonb),public.bw_moderate_entity_review(uuid,text),public.bw_delete_entity_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bw_entity_review_feed(text,uuid) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.bw_public_profile(p_handle text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.bw_traveller_profiles; uid uuid;
  alerts integer; confirmed integer; confirmations integer; reviews integer; trips integer;
  fav_vessel text; fav_vessel_n integer; fav_port text; fav_port_n integer; since integer;
  badges jsonb := '[]'::jsonb; thanks integer;
BEGIN
  SELECT * INTO p FROM public.bw_traveller_profiles WHERE handle = p_handle;
  IF NOT FOUND THEN RETURN NULL; END IF;
  uid := p.user_id;
  SELECT count(*) INTO alerts FROM public.bw_travel_alerts WHERE user_id = uid;
  SELECT count(*) INTO confirmed FROM public.bw_travel_alerts a
   WHERE a.user_id = uid AND EXISTS (SELECT 1 FROM public.bw_alert_confirmations c WHERE c.alert_id = a.id);
  SELECT count(*) INTO confirmations FROM public.bw_alert_confirmations WHERE user_id = uid;
  SELECT count(*) INTO reviews FROM (
    SELECT 'port' AS kind,port_id AS target FROM public.port_reviews WHERE user_id=uid AND status='published'
    UNION SELECT 'vessel',vessel_id FROM public.bw_vessel_reviews WHERE user_id=uid AND status='published'
    UNION SELECT target_kind,target_id FROM public.bw_entity_reviews WHERE user_id=uid AND published_scores IS NOT NULL
  ) reviewed;

  SELECT count(*) INTO trips FROM public.bw_follows f JOIN public.departures d ON d.id = f.target_id
   WHERE f.user_id = uid AND f.target_kind = 'departure' AND f.traveller AND d.departure_at < now();
  SELECT v.name, count(*) INTO fav_vessel, fav_vessel_n FROM public.bw_follows f
    JOIN public.departures d ON d.id = f.target_id JOIN public.vessels v ON v.id = d.vessel_id
   WHERE f.user_id = uid AND f.target_kind = 'departure' AND f.traveller
   GROUP BY v.name ORDER BY count(*) DESC, v.name LIMIT 1;
  SELECT po.name, count(*) INTO fav_port, fav_port_n FROM public.bw_follows f
    JOIN public.departures d ON d.id = f.target_id JOIN public.routes r ON r.id = d.route_id
    JOIN public.ports po ON po.id = r.departure_port_id
   WHERE f.user_id = uid AND f.target_kind = 'departure' AND f.traveller
   GROUP BY po.name ORDER BY count(*) DESC, po.name LIMIT 1;
  -- « Merci » reçus sur ses signalements et ses avis (hors les siens).
  SELECT count(*) INTO thanks FROM public.bw_reactions x
   WHERE x.code = 'merci' AND x.user_id <> uid AND (
         (x.target_kind = 'alert' AND EXISTS (SELECT 1 FROM public.bw_travel_alerts a WHERE a.id = x.target_id AND a.user_id = uid))
      OR (x.target_kind = 'port_review' AND EXISTS (SELECT 1 FROM public.port_reviews r WHERE r.id = x.target_id AND r.user_id = uid))
      OR (x.target_kind = 'vessel_review' AND EXISTS (SELECT 1 FROM public.bw_vessel_reviews r WHERE r.id = x.target_id AND r.user_id = uid)));
  SELECT extract(year FROM created_at)::integer INTO since FROM auth.users WHERE id = uid;
  IF alerts >= 1 THEN badges := badges || '{"code":"premier_signalement","label":"Premier signalement"}'; END IF;
  IF confirmed >= 10 THEN badges := badges || '{"code":"oeil_de_lynx","label":"10 infos confirmées"}'; END IF;
  IF confirmations >= 10 THEN badges := badges || '{"code":"entraide","label":"Toujours là pour confirmer"}'; END IF;
  IF thanks >= 25 THEN badges := badges || '{"code":"merci","label":"25 mercis reçus"}'; END IF;
  IF reviews >= 1 THEN badges := badges || '{"code":"plume","label":"A donné son avis"}'; END IF;
  IF trips >= 5 THEN badges := badges || '{"code":"habitue","label":"5 traversées"}'; END IF;
  IF fav_vessel_n >= 3 THEN badges := badges || jsonb_build_object('code', 'fidele', 'label', 'Fidèle du ' || fav_vessel); END IF;
  IF fav_port_n >= 3 THEN badges := badges || jsonb_build_object('code', 'port', 'label', 'Habitué·e de ' || fav_port); END IF;
  RETURN private.bw_traveller_card(p) || jsonb_build_object(
    'since', since, 'contributions', alerts + reviews, 'confirmed', confirmed,
    'confirmations', confirmations, 'reviews', reviews, 'thanks', thanks, 'trips', trips,
    'favorite_vessel', fav_vessel, 'favorite_port', fav_port, 'badges', badges,
    'me', uid = auth.uid());
END $$;


NOTIFY pgrst,'reload schema';
COMMIT;
