-- Signaler un retard ou l'embarquement : la traversée concernée est obligatoire et doit être
-- programmée au départ d'un port dans les 7 prochains jours (ou encore en cours : partie depuis
-- moins de 36 h et pas arrivée depuis plus de 2 h). L'équipe peut choisir une traversée plus
-- lointaine (bw_report_staff), mais doit, elle aussi, en choisir une.

CREATE OR REPLACE FUNCTION private.bw_report_crossing_ok(
  p_category text, p_target uuid, p_departure uuid, p_staff boolean
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_category NOT IN ('delay', 'boarding') OR EXISTS (
    SELECT 1 FROM public.departures d
    WHERE d.id = p_departure
      AND d.vessel_id = p_target
      AND d.status <> 'cancelled'
      AND NOT coalesce(d.is_demo, false)
      AND (p_staff OR (
        d.departure_at >= now() - interval '36 hours'
        AND d.departure_at < now() + interval '7 days'
        AND coalesce(d.arrival_at, d.departure_at + interval '48 hours') + interval '2 hours' >= now()
      ))
  );
$$;
REVOKE ALL ON FUNCTION private.bw_report_crossing_ok(text, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bw_report_travel(p_kind text, p_target uuid, p_category text, p_delay integer, p_detail text, p_lat double precision, p_lng double precision, p_departure uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- Retard, embarquement : une traversée programmée dans les 7 prochains jours (ou en cours).
    IF NOT private.bw_report_crossing_ok(p_category, p_target, p_departure, false) THEN
      RAISE EXCEPTION 'Choisissez la traversée concernée parmi celles des 7 prochains jours';
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
END $function$;

CREATE OR REPLACE FUNCTION public.bw_report_without_position(p_kind text, p_target uuid, p_category text, p_delay integer, p_detail text, p_departure uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  detail_required boolean;
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  IF NOT ((p_kind = 'vessel' AND EXISTS(SELECT 1 FROM public.vessels WHERE id = p_target AND status = 'active'))
       OR (p_kind = 'port' AND EXISTS(SELECT 1 FROM public.ports WHERE id = p_target AND status = 'active'))) THEN
    RAISE EXCEPTION 'Lieu ou navire introuvable';
  END IF;
  SELECT required INTO detail_required FROM public.bw_signal_situations
    WHERE code = p_category AND target_kind = p_kind AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Situation introuvable'; END IF;
  p_detail := nullif(p_detail, '');
  IF p_detail IS NOT NULL AND p_category <> 'service'
     AND NOT EXISTS(SELECT 1 FROM public.bw_signal_options WHERE code = p_detail AND situation = p_category AND active) THEN
    RAISE EXCEPTION 'Précision introuvable';
  END IF;
  IF p_detail IS NULL AND p_category <> 'delay' AND detail_required THEN
    RAISE EXCEPTION 'Choisissez une précision';
  END IF;
  -- Retard, embarquement : une traversée programmée dans les 7 prochains jours (ou en cours).
  IF p_kind = 'vessel' AND NOT private.bw_report_crossing_ok(p_category, p_target, p_departure, false) THEN
    RAISE EXCEPTION 'Choisissez la traversée concernée parmi celles des 7 prochains jours';
  END IF;
  -- Mêmes garde-fous que les signalements sur place.
  IF (SELECT count(*) FROM public.bw_report_anomalies WHERE user_id = auth.uid() AND created_at > now() - interval '15 minutes')
     + (SELECT count(*) FROM public.bw_travel_alerts WHERE user_id = auth.uid() AND created_at > now() - interval '15 minutes') >= 5 THEN
    RAISE EXCEPTION 'Maximum de cinq signalements par quart d’heure';
  END IF;
  IF EXISTS(SELECT 1 FROM public.bw_report_anomalies
    WHERE user_id = auth.uid() AND status = 'pending' AND category = p_category
      AND detail IS NOT DISTINCT FROM p_detail
      AND (vessel_id = p_target OR port_id = p_target)
      AND created_at > now() - interval '1 hour') THEN
    RAISE EXCEPTION 'Vous avez déjà signalé cette situation';
  END IF;
  INSERT INTO public.bw_report_anomalies(user_id, vessel_id, port_id, departure_id, category, detail, delay_minutes, reason)
  VALUES (
    auth.uid(),
    CASE WHEN p_kind = 'vessel' THEN p_target END,
    CASE WHEN p_kind = 'port' THEN p_target END,
    CASE WHEN p_kind = 'vessel' THEN p_departure END,
    p_category, p_detail,
    CASE WHEN p_category = 'delay' THEN p_delay END,
    'position indisponible : à vérifier'
  );
  RETURN jsonb_build_object('status', 'review', 'on_site', false);
END $function$;

CREATE OR REPLACE FUNCTION public.bw_report_staff(p_kind text, p_target uuid, p_category text, p_delay integer, p_detail text, p_departure uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  life integer;
  new_id uuid;
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin','editor','moderator']), false) THEN
    RAISE EXCEPTION 'Action réservée à l’équipe';
  END IF;
  IF NOT ((p_kind = 'vessel' AND EXISTS(SELECT 1 FROM public.vessels WHERE id = p_target AND status = 'active'))
       OR (p_kind = 'port' AND EXISTS(SELECT 1 FROM public.ports WHERE id = p_target AND status = 'active'))) THEN
    RAISE EXCEPTION 'Lieu ou navire introuvable';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bw_signal_situations WHERE code = p_category AND target_kind = p_kind AND active) THEN
    RAISE EXCEPTION 'Situation introuvable';
  END IF;
  -- L'équipe peut choisir une traversée au-delà de 7 jours, mais doit en choisir une.
  IF p_kind = 'vessel' AND NOT private.bw_report_crossing_ok(p_category, p_target, p_departure, true) THEN
    RAISE EXCEPTION 'Choisissez la traversée concernée';
  END IF;
  p_detail := nullif(p_detail, '');
  SELECT coalesce(o.lifetime_minutes, s.lifetime_minutes) INTO life
  FROM public.bw_signal_situations s
  LEFT JOIN public.bw_signal_options o ON o.situation = s.code AND o.code = p_detail
  WHERE s.code = p_category;
  INSERT INTO public.bw_travel_alerts(target_kind, target_id, user_id, category, delay_minutes, detail,
                                      on_site, expires_at, departure_id, validated_at, validated_by)
  VALUES (p_kind, p_target, auth.uid(), p_category,
          CASE WHEN p_category = 'delay' THEN p_delay END, p_detail, false,
          now() + make_interval(mins => coalesce(life, 120)),
          CASE WHEN p_kind = 'vessel' THEN p_departure END, now(), auth.uid())
  RETURNING id INTO new_id;
  RETURN jsonb_build_object('status', 'published', 'on_site', false, 'id', new_id);
END $function$;
