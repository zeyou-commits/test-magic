BEGIN;

ALTER TABLE public.bw_travel_alerts
  ADD COLUMN IF NOT EXISTS departure_id uuid REFERENCES public.departures(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS bw_travel_alerts_departure_active
  ON public.bw_travel_alerts(departure_id, expires_at) WHERE NOT resolved;

CREATE TABLE IF NOT EXISTS public.bw_report_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vessel_id uuid NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  departure_id uuid REFERENCES public.departures(id) ON DELETE SET NULL,
  category text NOT NULL,
  detail text,
  delay_minutes integer,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','handled','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz
);
CREATE INDEX IF NOT EXISTS bw_report_anomalies_pending ON public.bw_report_anomalies(created_at DESC) WHERE status='pending';
ALTER TABLE public.bw_report_anomalies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_report_anomalies FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.bw_report_anomalies TO authenticated;
DROP POLICY IF EXISTS bw_report_anomalies_staff_read ON public.bw_report_anomalies;
DROP POLICY IF EXISTS bw_report_anomalies_staff_update ON public.bw_report_anomalies;
CREATE POLICY bw_report_anomalies_staff_read ON public.bw_report_anomalies FOR SELECT TO authenticated
  USING (coalesce(private.bw_staff_permission(ARRAY['admin','moderator']), false));
CREATE POLICY bw_report_anomalies_staff_update ON public.bw_report_anomalies FOR UPDATE TO authenticated
  USING (coalesce(private.bw_staff_permission(ARRAY['admin','moderator']), false))
  WITH CHECK (coalesce(private.bw_staff_permission(ARRAY['admin','moderator']), false));

-- L'ancien RPC sans traversée reste interne : les clients ne peuvent plus contourner le contrôle.
REVOKE EXECUTE ON FUNCTION public.bw_report_travel(text,uuid,text,integer,text,double precision,double precision) FROM authenticated;

CREATE OR REPLACE FUNCTION public.bw_report_travel(
  p_kind text, p_target uuid, p_category text, p_delay integer, p_detail text,
  p_lat double precision, p_lng double precision, p_departure uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  crossing public.departures%ROWTYPE;
  result boolean;
  alert_id uuid;
  limit_at timestamptz;
  anomaly text;
  detail_required boolean;
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  IF p_kind = 'vessel' THEN
    IF NOT EXISTS(SELECT 1 FROM public.vessels WHERE id=p_target AND status='active') THEN
      RAISE EXCEPTION 'Bateau introuvable';
    END IF;
    SELECT required INTO detail_required FROM public.bw_signal_situations
      WHERE code=p_category AND target_kind='vessel' AND active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Situation introuvable';
    END IF;
    IF p_detail IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bw_signal_options WHERE code=p_detail AND situation=p_category AND active) THEN
      RAISE EXCEPTION 'Précision introuvable';
    END IF;
    IF p_detail IS NULL AND p_category='delay' AND NOT EXISTS(
      SELECT 1 FROM public.bw_signal_options WHERE situation='delay' AND active AND delay_minutes=p_delay
    ) THEN RAISE EXCEPTION 'Précision introuvable'; END IF;
    IF p_detail IS NULL AND p_category<>'delay' AND detail_required THEN
      RAISE EXCEPTION 'Choisissez une précision';
    END IF;
    IF p_departure IS NULL THEN
      anomaly := 'traversée non identifiée';
    ELSE
      SELECT * INTO crossing FROM public.departures WHERE id = p_departure;
      IF NOT FOUND OR crossing.vessel_id IS DISTINCT FROM p_target OR crossing.status = 'cancelled' OR coalesce(crossing.is_demo, false) THEN
        anomaly := 'traversée ou affectation du bateau à vérifier';
      END IF;
    END IF;
    IF anomaly IS NULL AND p_category = 'boarding' THEN
      IF now() NOT BETWEEN crossing.departure_at - interval '6 hours' AND crossing.departure_at + interval '5 minutes' THEN
        anomaly := 'embarquement hors de la période prévue';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.vessel_positions vp JOIN public.vessels v ON v.mmsi = vp.mmsi
        WHERE v.id = p_target AND vp.reported_at > now() - interval '45 minutes'
          AND coalesce(vp.speed_knots, 0) >= 5
      ) THEN anomaly := 'embarquement signalé alors que le bateau navigue'; END IF;
      limit_at := crossing.departure_at + interval '30 minutes';
    ELSIF anomaly IS NULL AND p_category = 'disembarking' THEN
      IF crossing.arrival_at IS NULL OR now() NOT BETWEEN crossing.arrival_at - interval '30 minutes' AND crossing.arrival_at + interval '2 hours' THEN
        anomaly := 'débarquement hors de la période prévue';
      END IF;
      limit_at := crossing.arrival_at + interval '2 hours';
    ELSIF anomaly IS NULL THEN
      IF now() < crossing.departure_at - interval '24 hours'
         OR now() > coalesce(crossing.arrival_at, crossing.departure_at + interval '48 hours') + interval '2 hours' THEN
        anomaly := 'traversée non en cours ou éloignée';
      END IF;
      limit_at := coalesce(crossing.arrival_at, crossing.departure_at + interval '48 hours') + interval '2 hours';
    END IF;
    IF anomaly IS NOT NULL THEN
      IF (SELECT count(*) FROM public.bw_report_anomalies WHERE user_id=auth.uid() AND created_at>now()-interval '15 minutes')
         + (SELECT count(*) FROM public.bw_travel_alerts WHERE user_id=auth.uid() AND created_at>now()-interval '15 minutes') >= 5 THEN
        RAISE EXCEPTION 'Maximum de cinq signalements par quart d’heure';
      END IF;
      IF EXISTS(SELECT 1 FROM public.bw_report_anomalies
        WHERE user_id=auth.uid() AND vessel_id=p_target AND departure_id IS NOT DISTINCT FROM p_departure
          AND category=p_category AND detail IS NOT DISTINCT FROM p_detail AND status='pending'
          AND created_at>now()-interval '1 hour') THEN
        RAISE EXCEPTION 'Vous avez déjà signalé cette situation';
      END IF;
      INSERT INTO public.bw_report_anomalies(user_id,vessel_id,departure_id,category,detail,delay_minutes,reason)
        VALUES(auth.uid(),p_target,p_departure,p_category,p_detail,p_delay,anomaly);
      RETURN jsonb_build_object('status','review','on_site',false);
    END IF;
  ELSIF p_departure IS NOT NULL THEN
    RAISE EXCEPTION 'Le signalement de port ne peut pas porter sur un bateau';
  END IF;

  result := public.bw_report_travel(p_kind, p_target, p_category, p_delay, p_detail, p_lat, p_lng);
  IF p_kind = 'vessel' THEN
    SELECT id INTO alert_id FROM public.bw_travel_alerts
      WHERE user_id = auth.uid() ORDER BY created_at DESC, id DESC LIMIT 1;
    UPDATE public.bw_travel_alerts
      SET departure_id = p_departure, expires_at = least(expires_at, limit_at)
      WHERE id = alert_id;
  END IF;
  RETURN jsonb_build_object('status','published','on_site',result);
END $$;
REVOKE ALL ON FUNCTION public.bw_report_travel(text,uuid,text,integer,text,double precision,double precision,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_report_travel(text,uuid,text,integer,text,double precision,double precision,uuid) TO authenticated;

-- Conserver l'identifiant de traversée dans le flux, sans exposer l'auteur.
CREATE OR REPLACE FUNCTION public.bw_community_feed(p_kind text DEFAULT NULL, p_target uuid DEFAULT NULL, p_moderation boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  IF p_moderation AND NOT coalesce(private.bw_staff_permission(ARRAY['admin','moderator']),false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT jsonb_build_object('enabled',true,
    'rating_count',(SELECT count(*)::integer FROM public.bw_vessel_reviews WHERE p_kind='vessel' AND vessel_id=p_target AND status='published'),
    'rating_average',(SELECT avg(score) FROM public.bw_vessel_reviews WHERE p_kind='vessel' AND vessel_id=p_target AND status='published'),
    'alerts',coalesce((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
      SELECT a.id,a.target_kind,a.target_id,a.departure_id,a.category,a.delay_minutes,a.detail,a.on_site,a.created_at,a.expires_at,
        a.user_id = auth.uid() AS own,
        (SELECT count(*)::integer FROM public.bw_alert_confirmations c WHERE c.alert_id=a.id) AS confirmations,
        (SELECT count(*)::integer FROM public.bw_alert_confirmations c WHERE c.alert_id=a.id AND c.on_site) AS on_site_confirmations,
        EXISTS(SELECT 1 FROM public.bw_alert_confirmations c WHERE c.alert_id=a.id AND c.user_id=auth.uid()) AS confirmed,
        (SELECT count(*)::integer FROM public.bw_alert_denials d WHERE d.alert_id=a.id) AS denials,
        EXISTS(SELECT 1 FROM public.bw_alert_denials d WHERE d.alert_id=a.id AND d.user_id=auth.uid()) AS denied
      FROM public.bw_travel_alerts a WHERE NOT a.resolved AND a.expires_at>now()
        AND (p_kind IS NULL OR a.target_kind=p_kind) AND (p_target IS NULL OR a.target_id=p_target)
        AND ((a.target_kind='vessel' AND a.departure_id IS NOT NULL
          AND EXISTS(SELECT 1 FROM public.departures d WHERE d.id=a.departure_id AND d.vessel_id=a.target_id AND d.status<>'cancelled'))
          OR (a.target_kind='port' AND EXISTS(SELECT 1 FROM public.ports p WHERE p.id=a.target_id AND p.status='active')))
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
REVOKE ALL ON FUNCTION public.bw_community_feed(text,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_community_feed(text,uuid,boolean) TO anon, authenticated;

COMMIT;
