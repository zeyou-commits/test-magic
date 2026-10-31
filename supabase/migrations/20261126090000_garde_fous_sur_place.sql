-- BledWay · Consulter reste libre. Affirmer un fait de terrain ou s'engager à aider exige d'être sur place, vérifié ici et non dans l'application.

-- Validation par l'équipe : un signalement peut être publié sur le seul avis d'un admin ou d'un modérateur.
ALTER TABLE public.bw_travel_alerts
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS validated_by uuid;

-- Entraide : répondre « J'y vais » suit la même règle que demander de l'aide.
DROP FUNCTION IF EXISTS public.bw_help_respond(uuid);
CREATE OR REPLACE FUNCTION public.bw_help_respond(p_request uuid, p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  port_lat double precision;
  port_lng double precision;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Connectez-vous pour proposer votre aide'; END IF;
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  IF EXISTS (SELECT 1 FROM public.bw_help_requests WHERE id = p_request AND user_id = me) THEN
    RAISE EXCEPTION 'C''est votre propre demande';
  END IF;
  SELECT p.latitude, p.longitude INTO port_lat, port_lng
  FROM public.bw_help_requests q
  JOIN public.departures d ON d.id = q.scope_id
  JOIN public.routes r ON r.id = d.route_id
  JOIN public.ports p ON p.id = r.departure_port_id
  WHERE q.id = p_request AND q.closed_at IS NULL AND q.expires_at > now();
  IF port_lat IS NULL THEN RAISE EXCEPTION 'Cette demande est terminée'; END IF;
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RAISE EXCEPTION 'Partagez votre position pour proposer votre aide';
  END IF;
  IF private.bw_km(p_lat, p_lng, port_lat, port_lng) > 6 THEN
    RAISE EXCEPTION 'Vous devez être au port de départ pour proposer votre aide';
  END IF;
  INSERT INTO public.bw_help_responses (request_id, user_id) VALUES (p_request, me) ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.bw_help_respond(uuid, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_help_respond(uuid, double precision, double precision) TO authenticated;

-- Entraide : un compte suspendu ne peut plus demander de l'aide.
CREATE OR REPLACE FUNCTION public.bw_help_open(p_kind text, p_scope uuid, p_need text, p_point text, p_lat double precision, p_lng double precision)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  new_id uuid;
  port_lat double precision;
  port_lng double precision;
  km double precision;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Connectez-vous pour demander de l''aide'; END IF;
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  IF p_kind <> 'departure' THEN RAISE EXCEPTION 'Choisissez votre traversée pour demander de l''aide'; END IF;
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RAISE EXCEPTION 'Partagez votre position pour demander de l''aide';
  END IF;

  SELECT p.latitude, p.longitude INTO port_lat, port_lng
  FROM public.departures d
  JOIN public.routes r ON r.id = d.route_id
  JOIN public.ports p ON p.id = r.departure_port_id
  WHERE d.id = p_scope AND d.status <> 'cancelled'
    AND d.departure_at BETWEEN now() - interval '24 hours' AND now() + interval '24 hours';
  IF port_lat IS NULL THEN
    RAISE EXCEPTION 'L''entraide s''ouvre le jour de la traversée';
  END IF;

  km := 2 * 6371 * asin(sqrt(
    power(sin(radians(p_lat - port_lat) / 2), 2)
    + cos(radians(port_lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - port_lng) / 2), 2)
  ));
  IF km > 6 THEN
    RAISE EXCEPTION 'Vous devez être au port de départ pour demander de l''aide';
  END IF;

  UPDATE public.bw_help_requests SET closed_at = now() WHERE user_id = me AND closed_at IS NULL;
  INSERT INTO public.bw_help_requests (user_id, scope_kind, scope_id, need, meeting_point)
  VALUES (me, p_kind, p_scope, p_need, p_point) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

-- Confirmer ou démentir : sur place, au port comme sur un navire. Deux démentis ferment un signalement.
CREATE OR REPLACE FUNCTION public.bw_alert_action(p_alert uuid, p_action text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.bw_travel_alerts; n_denials integer; n_confirms integer;
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  SELECT * INTO a FROM public.bw_travel_alerts WHERE id=p_alert AND NOT resolved AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ce signalement a expiré'; END IF;
  IF p_action IN ('confirm','deny') AND NOT private.bw_on_site(a.target_kind,a.target_id,p_lat,p_lng) THEN
    RAISE EXCEPTION 'Pour répondre à ce signalement, il faut être sur place, localisation activée.';
  END IF;
  IF p_action='validate' THEN
    IF NOT coalesce(private.bw_staff_permission(ARRAY['admin','moderator']),false) THEN RAISE EXCEPTION 'Action non autorisée'; END IF;
    UPDATE public.bw_travel_alerts SET validated_at=now(), validated_by=auth.uid() WHERE id=p_alert;
  ELSIF p_action='resolve' AND (a.user_id=auth.uid() OR coalesce(private.bw_staff_permission(ARRAY['admin','moderator']),false)) THEN
    UPDATE public.bw_travel_alerts SET resolved=true WHERE id=p_alert;
  ELSIF p_action='confirm' AND a.user_id<>auth.uid() THEN
    DELETE FROM public.bw_alert_denials WHERE alert_id=p_alert AND user_id=auth.uid();
    INSERT INTO public.bw_alert_confirmations(alert_id,user_id,on_site)
    VALUES(p_alert,auth.uid(),true)
    ON CONFLICT (alert_id,user_id) DO UPDATE SET on_site = true;
  ELSIF p_action='deny' AND a.user_id<>auth.uid() THEN
    DELETE FROM public.bw_alert_confirmations WHERE alert_id=p_alert AND user_id=auth.uid();
    INSERT INTO public.bw_alert_denials(alert_id,user_id) VALUES(p_alert,auth.uid()) ON CONFLICT DO NOTHING;
    SELECT count(*) INTO n_denials FROM public.bw_alert_denials WHERE alert_id=p_alert;
    SELECT count(*) INTO n_confirms FROM public.bw_alert_confirmations WHERE alert_id=p_alert;
    IF n_denials >= 2 AND n_denials > n_confirms AND a.validated_at IS NULL THEN
      UPDATE public.bw_travel_alerts SET resolved=true WHERE id=p_alert;
    END IF;
  ELSE RAISE EXCEPTION 'Action non autorisée'; END IF;
END $$;

-- Observation mise en attente : l'équipe peut la publier si la traversée est connue.
CREATE OR REPLACE FUNCTION public.bw_anomaly_publish(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.bw_report_anomalies; life integer;
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin','moderator']),false) THEN RAISE EXCEPTION 'Action non autorisée'; END IF;
  SELECT * INTO r FROM public.bw_report_anomalies WHERE id = p_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Observation déjà traitée'; END IF;
  IF r.departure_id IS NULL THEN RAISE EXCEPTION 'Traversée inconnue : cette observation ne peut pas être publiée'; END IF;
  SELECT coalesce(o.lifetime_minutes, s.lifetime_minutes) INTO life
  FROM public.bw_signal_situations s
  LEFT JOIN public.bw_signal_options o ON o.situation = s.code AND o.code = r.detail
  WHERE s.code = r.category;
  INSERT INTO public.bw_travel_alerts(target_kind,target_id,user_id,category,delay_minutes,detail,on_site,expires_at,departure_id,validated_at,validated_by)
  VALUES('vessel',r.vessel_id,r.user_id,r.category,r.delay_minutes,r.detail,false,now() + make_interval(mins => coalesce(life,120)),r.departure_id,now(),auth.uid());
  UPDATE public.bw_report_anomalies SET status='handled', handled_at=now() WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION public.bw_anomaly_publish(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_anomaly_publish(uuid) TO authenticated;

-- Le fil indique les signalements validés par l'équipe.
CREATE OR REPLACE FUNCTION public.bw_community_feed(p_kind text DEFAULT NULL::text, p_target uuid DEFAULT NULL::uuid, p_moderation boolean DEFAULT false)
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
        a.validated_at IS NOT NULL AS validated,
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

-- Signalement de port : toutes les situations, plus seulement celles marquées « sur place ».
CREATE OR REPLACE FUNCTION public.bw_report_travel(p_kind text, p_target uuid, p_category text, p_delay integer DEFAULT NULL::integer, p_detail text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE here boolean; lifetime integer; topic text; new_id uuid; s public.bw_signal_situations; o public.bw_signal_options; svc text;
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  IF NOT ((p_kind='vessel' AND EXISTS(SELECT 1 FROM public.vessels WHERE id=p_target AND status='active')) OR (p_kind='port' AND EXISTS(SELECT 1 FROM public.ports WHERE id=p_target AND status='active'))) THEN RAISE EXCEPTION 'Lieu ou navire introuvable'; END IF;
  SELECT * INTO s FROM public.bw_signal_situations WHERE code = p_category AND active;
  IF NOT FOUND OR s.target_kind <> p_kind THEN RAISE EXCEPTION 'Situation introuvable'; END IF;
  p_detail := nullif(p_detail, '');
  IF p_category = 'service' THEN
    svc := substring(p_detail from '^service_([a-z0-9]+)_(open|closed)$');
    IF svc IS NULL OR NOT EXISTS(SELECT 1 FROM public.bw_signal_services WHERE code = svc AND active) THEN
      RAISE EXCEPTION 'Service introuvable';
    END IF;
  ELSIF p_detail IS NOT NULL THEN
    SELECT * INTO o FROM public.bw_signal_options WHERE code = p_detail AND situation = p_category AND active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Précision introuvable'; END IF;
  ELSIF p_category = 'delay' THEN
    IF NOT EXISTS(SELECT 1 FROM public.bw_signal_options WHERE situation = 'delay' AND active AND delay_minutes = p_delay) THEN
      RAISE EXCEPTION 'Précision introuvable';
    END IF;
  ELSIF s.required THEN
    RAISE EXCEPTION 'Choisissez une précision';
  END IF;
  IF (SELECT count(*) FROM public.bw_travel_alerts WHERE user_id=auth.uid() AND created_at>now()-interval '15 minutes')>=5 THEN RAISE EXCEPTION 'Maximum de cinq signalements par quart d’heure'; END IF;
  topic := private.bw_alert_group(p_category, p_detail);
  IF EXISTS(SELECT 1 FROM public.bw_travel_alerts WHERE user_id=auth.uid() AND target_kind=p_kind AND target_id=p_target
            AND private.bw_alert_group(category, detail)=topic AND detail IS NOT DISTINCT FROM p_detail
            AND (p_category <> 'delay' OR delay_minutes IS NOT DISTINCT FROM p_delay)
            AND NOT resolved AND expires_at>now()) THEN
    RAISE EXCEPTION 'Vous avez déjà signalé cette situation';
  END IF;
  UPDATE public.bw_travel_alerts SET resolved=true
   WHERE user_id=auth.uid() AND target_kind=p_kind AND target_id=p_target
     AND private.bw_alert_group(category, detail)=topic AND NOT resolved AND expires_at>now();
  here := private.bw_on_site(p_kind, p_target, p_lat, p_lng);
  IF (p_kind = 'port' OR coalesce(o.on_site, false)) AND NOT here THEN
    RAISE EXCEPTION 'Ce signalement doit être fait sur place, localisation activée';
  END IF;
  lifetime := coalesce(o.lifetime_minutes, s.lifetime_minutes);
  INSERT INTO public.bw_travel_alerts(target_kind,target_id,user_id,category,delay_minutes,detail,on_site,expires_at)
  VALUES(p_kind,p_target,auth.uid(),p_category,
         CASE WHEN p_category = 'delay' AND p_detail IS NULL THEN p_delay END,
         p_detail,here,now() + make_interval(mins => lifetime))
  RETURNING id INTO new_id;
  -- Au port, le nouvel état clôt l'état opposé des autres voyageurs, sauf s'il a été confirmé par au moins 2 personnes.
  IF p_kind = 'port' THEN
    UPDATE public.bw_travel_alerts a SET resolved=true
     WHERE a.target_kind='port' AND a.target_id=p_target AND a.id<>new_id AND NOT a.resolved AND a.expires_at>now()
       AND private.bw_alert_group(a.category, a.detail)=topic
       AND a.detail IS DISTINCT FROM p_detail
       AND (SELECT count(*) FROM public.bw_alert_confirmations c WHERE c.alert_id=a.id) < 2;
  END IF;
  RETURN here;
END $$;
REVOKE EXECUTE ON FUNCTION public.bw_report_travel(text, uuid, text, integer, text, double precision, double precision) FROM anon;

-- Signalement de navire : embarquement au port de départ, débarquement au port d'arrivée, le reste à l'un ou l'autre, ou près du navire.
-- Une traversée à vérifier part en modération : il suffit alors d'être à un port, car rien n'est publié.
CREATE OR REPLACE FUNCTION public.bw_report_travel(p_kind text, p_target uuid, p_category text, p_delay integer, p_detail text, p_lat double precision, p_lng double precision, p_departure uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  crossing public.departures%ROWTYPE;
  result boolean;
  alert_id uuid;
  limit_at timestamptz;
  anomaly text;
  detail_required boolean;
  present boolean;
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
    IF p_lat IS NULL OR p_lng IS NULL THEN
      present := false;
    ELSIF anomaly IS NOT NULL THEN
      present := EXISTS (
        SELECT 1 FROM public.ports pt
        WHERE pt.status = 'active' AND private.bw_km(p_lat, p_lng, pt.latitude, pt.longitude) <= 3
      ) OR private.bw_on_site('vessel', p_target, p_lat, p_lng);
    ELSE
      present := EXISTS (
        SELECT 1 FROM public.routes r
        JOIN public.ports pt ON pt.id = CASE WHEN p_category = 'disembarking' THEN r.arrival_port_id ELSE r.departure_port_id END
          OR (p_category NOT IN ('boarding', 'disembarking') AND pt.id = r.arrival_port_id)
        WHERE r.id = crossing.route_id AND private.bw_km(p_lat, p_lng, pt.latitude, pt.longitude) <= 3
      ) OR EXISTS (
        SELECT 1 FROM public.vessel_positions vp JOIN public.vessels v ON v.mmsi = vp.mmsi
        WHERE v.id = p_target AND vp.latitude IS NOT NULL AND vp.reported_at > now() - interval '3 hours'
          AND private.bw_km(p_lat, p_lng, vp.latitude, vp.longitude) <= 15
      );
    END IF;
    IF NOT present THEN
      RAISE EXCEPTION 'Ce signalement doit être fait sur place, localisation activée';
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

-- Nouveau motif : l'entrée habituelle a changé. Il vit 24 h, attend un second voyageur, et un « Ça roule » ne l'efface pas.
INSERT INTO public.bw_signal_options(code, situation, label, icon, sort, on_site, active, lifetime_minutes)
VALUES ('access_moved', 'access', 'L’entrée habituelle a changé', 'door-open', 35, true, true, 1440)
ON CONFLICT (code) DO NOTHING;
CREATE OR REPLACE FUNCTION private.bw_alert_group(p_category text, p_detail text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_category = 'service' THEN coalesce(substring(p_detail from '^(service_[a-z]+)_'), 'service')
              WHEN p_detail = 'access_moved' THEN 'access_moved'
              ELSE p_category END;
$$;
NOTIFY pgrst, 'reload schema';
