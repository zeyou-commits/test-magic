BEGIN;

CREATE TABLE public.bw_vessel_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id uuid NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vessel_id,user_id)
);
CREATE INDEX bw_vessel_reviews_public ON public.bw_vessel_reviews(vessel_id,created_at DESC) WHERE status='published';
CREATE TABLE public.bw_travel_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind text NOT NULL CHECK (target_kind IN ('vessel','port')),
  target_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('delay','boarding','queue','access')),
  delay_minutes integer CHECK (delay_minutes IN (30,60,120)),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  resolved boolean NOT NULL DEFAULT false,
  CHECK ((category = 'delay' AND target_kind = 'vessel' AND delay_minutes IS NOT NULL) OR (category <> 'delay' AND delay_minutes IS NULL)),
  CHECK ((target_kind = 'vessel' AND category IN ('delay','boarding')) OR (target_kind = 'port' AND category IN ('queue','access')))
);
CREATE INDEX bw_travel_alerts_active ON public.bw_travel_alerts(expires_at,target_kind,target_id) WHERE NOT resolved;
CREATE TABLE public.bw_alert_confirmations (
  alert_id uuid NOT NULL REFERENCES public.bw_travel_alerts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(alert_id,user_id)
);
ALTER TABLE public.bw_vessel_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_travel_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_alert_confirmations ENABLE ROW LEVEL SECURITY;
-- Read/write access is only through the bounded RPCs below. User IDs are never public.
REVOKE ALL ON public.bw_vessel_reviews, public.bw_travel_alerts, public.bw_alert_confirmations FROM anon, authenticated;

CREATE FUNCTION public.bw_community_feed(p_kind text DEFAULT NULL, p_target uuid DEFAULT NULL, p_moderation boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF p_moderation AND NOT coalesce(private.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT jsonb_build_object('enabled',true,
    'rating_count',(SELECT count(*)::integer FROM public.bw_vessel_reviews WHERE p_kind='vessel' AND vessel_id=p_target AND status='published'),
    'rating_average',(SELECT avg(score) FROM public.bw_vessel_reviews WHERE p_kind='vessel' AND vessel_id=p_target AND status='published'),
    'alerts',coalesce((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
      SELECT a.id,a.target_kind,a.target_id,a.category,a.delay_minutes,a.created_at,a.expires_at,
        a.user_id = auth.uid() AS own,
        (SELECT count(*)::integer FROM public.bw_alert_confirmations c WHERE c.alert_id=a.id) AS confirmations,
        EXISTS(SELECT 1 FROM public.bw_alert_confirmations c WHERE c.alert_id=a.id AND c.user_id=auth.uid()) AS confirmed
      FROM public.bw_travel_alerts a WHERE NOT a.resolved AND a.expires_at>now()
        AND (p_kind IS NULL OR a.target_kind=p_kind) AND (p_target IS NULL OR a.target_id=p_target)
        AND ((a.target_kind='vessel' AND EXISTS(SELECT 1 FROM public.vessels v WHERE v.id=a.target_id AND v.status='active')) OR (a.target_kind='port' AND EXISTS(SELECT 1 FROM public.ports p WHERE p.id=a.target_id AND p.status='active')))
      ORDER BY a.created_at DESC LIMIT 300
    ) x),'[]'::jsonb),
    'reviews',coalesce((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
      SELECT r.id,r.vessel_id,r.score,r.comment,r.status,r.created_at, r.user_id = auth.uid() AS own
      FROM public.bw_vessel_reviews r WHERE (p_moderation OR (p_kind='vessel' AND p_target=r.vessel_id))
        AND (p_moderation OR r.status='published' OR r.user_id=auth.uid())
      ORDER BY (p_moderation AND r.status='pending') DESC, (r.user_id=auth.uid()) DESC NULLS LAST, r.created_at DESC LIMIT 200
    ) x),'[]'::jsonb)) INTO result;
  RETURN result;
END $$;

CREATE FUNCTION public.bw_submit_review(p_vessel uuid,p_score integer,p_comment text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.vessels WHERE id=p_vessel AND status='active') THEN RAISE EXCEPTION 'Navire introuvable'; END IF;
  IF EXISTS(SELECT 1 FROM public.bw_vessel_reviews WHERE user_id=auth.uid() AND updated_at>now()-interval '1 minute') THEN RAISE EXCEPTION 'Patientez une minute avant un nouvel avis'; END IF;
  INSERT INTO public.bw_vessel_reviews(vessel_id,user_id,score,comment) VALUES(p_vessel,auth.uid(),p_score,trim(coalesce(p_comment,'')))
  ON CONFLICT(vessel_id,user_id) DO UPDATE SET score=excluded.score,comment=excluded.comment,status='pending',updated_at=now();
END $$;

CREATE FUNCTION public.bw_report_travel(p_kind text,p_target uuid,p_category text,p_delay integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  IF NOT ((p_kind='vessel' AND EXISTS(SELECT 1 FROM public.vessels WHERE id=p_target AND status='active')) OR (p_kind='port' AND EXISTS(SELECT 1 FROM public.ports WHERE id=p_target AND status='active'))) THEN RAISE EXCEPTION 'Lieu ou navire introuvable'; END IF;
  IF (SELECT count(*) FROM public.bw_travel_alerts WHERE user_id=auth.uid() AND created_at>now()-interval '15 minutes')>=5 THEN RAISE EXCEPTION 'Maximum de cinq signalements par quart d’heure'; END IF;
  IF EXISTS(SELECT 1 FROM public.bw_travel_alerts WHERE user_id=auth.uid() AND target_kind=p_kind AND target_id=p_target AND category=p_category AND NOT resolved AND expires_at>now()) THEN RAISE EXCEPTION 'Vous avez déjà signalé cette situation'; END IF;
  INSERT INTO public.bw_travel_alerts(target_kind,target_id,user_id,category,delay_minutes) VALUES(p_kind,p_target,auth.uid(),p_category,p_delay);
END $$;

CREATE FUNCTION public.bw_alert_action(p_alert uuid,p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.bw_travel_alerts;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
  SELECT * INTO a FROM public.bw_travel_alerts WHERE id=p_alert AND NOT resolved AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ce signalement a expiré'; END IF;
  IF p_action='resolve' AND (a.user_id=auth.uid() OR coalesce(private.has_role(auth.uid(),'admin'),false)) THEN
    UPDATE public.bw_travel_alerts SET resolved=true WHERE id=p_alert;
  ELSIF p_action='confirm' AND a.user_id<>auth.uid() THEN
    INSERT INTO public.bw_alert_confirmations(alert_id,user_id) VALUES(p_alert,auth.uid()) ON CONFLICT DO NOTHING;
  ELSE RAISE EXCEPTION 'Action non autorisée'; END IF;
END $$;

CREATE FUNCTION public.bw_moderate_review(p_review uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT coalesce(private.has_role(auth.uid(),'admin'),false) OR p_status NOT IN ('published','hidden') OR p_status IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE public.bw_vessel_reviews SET status=p_status WHERE id=p_review;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avis introuvable'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.bw_community_feed(text,uuid,boolean),public.bw_submit_review(uuid,integer,text),public.bw_report_travel(text,uuid,text,integer),public.bw_alert_action(uuid,text),public.bw_moderate_review(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_community_feed(text,uuid,boolean) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bw_submit_review(uuid,integer,text),public.bw_report_travel(text,uuid,text,integer),public.bw_alert_action(uuid,text),public.bw_moderate_review(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
