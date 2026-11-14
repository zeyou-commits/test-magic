-- Modération des observations à vérifier : de quoi décider (qui, quoi, comment, quand)
-- et une trace de la décision (qui a modéré, quand, quoi).
-- Aucune donnée personnelle sensible : ni e-mail, ni IP, ni coordonnées, ni navigateur en clair.

BEGIN;

-- 1. Trace de la décision -----------------------------------------------------------------
ALTER TABLE public.bw_report_anomalies
  ADD COLUMN IF NOT EXISTS handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decision text CHECK (decision IN ('published', 'handled', 'dismissed'));

-- Toute sortie de la file (bouton Traité / Écarter ou publication) note l'auteur et l'heure.
CREATE OR REPLACE FUNCTION private.bw_anomaly_trace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status <> 'pending' THEN
    NEW.handled_by := coalesce(auth.uid(), NEW.handled_by);
    NEW.handled_at := now();
    NEW.decision := coalesce(NEW.decision, NEW.status);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.bw_anomaly_trace() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS bw_report_anomalies_trace ON public.bw_report_anomalies;
CREATE TRIGGER bw_report_anomalies_trace BEFORE UPDATE ON public.bw_report_anomalies
  FOR EACH ROW EXECUTE FUNCTION private.bw_anomaly_trace();

-- 2. Publication : la durée de vie part de l'observation, pas du clic ; périmée = refusée --
CREATE OR REPLACE FUNCTION public.bw_anomaly_publish(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.bw_report_anomalies; life integer; ends timestamptz;
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin','moderator']),false) THEN RAISE EXCEPTION 'Action non autorisée'; END IF;
  SELECT * INTO r FROM public.bw_report_anomalies WHERE id = p_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Observation déjà traitée'; END IF;
  IF r.vessel_id IS NOT NULL AND r.departure_id IS NULL THEN
    RAISE EXCEPTION 'Traversée inconnue : cette observation ne peut pas être publiée';
  END IF;
  SELECT coalesce(o.lifetime_minutes, s.lifetime_minutes) INTO life
  FROM public.bw_signal_situations s
  LEFT JOIN public.bw_signal_options o ON o.situation = s.code AND o.code = r.detail
  WHERE s.code = r.category;
  ends := r.created_at + make_interval(mins => coalesce(life, 120));
  IF ends <= now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Observation trop ancienne pour être publiée : marquez-la « Traité » ou « Écarter »';
  END IF;
  INSERT INTO public.bw_travel_alerts(target_kind,target_id,user_id,category,delay_minutes,detail,on_site,expires_at,departure_id,validated_at,validated_by,created_at)
  VALUES(
    CASE WHEN r.vessel_id IS NOT NULL THEN 'vessel' ELSE 'port' END,
    coalesce(r.vessel_id, r.port_id), r.user_id, r.category, r.delay_minutes, r.detail, false,
    ends, r.departure_id, now(), auth.uid(), r.created_at
  );
  UPDATE public.bw_report_anomalies SET status = 'handled', decision = 'published' WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION public.bw_anomaly_publish(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_anomaly_publish(uuid) TO authenticated;

-- 3. Contexte des observations (équipe seulement) ---------------------------------------
CREATE OR REPLACE FUNCTION public.bw_anomaly_context_staff(p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin','moderator']), false) THEN
    RAISE EXCEPTION 'Action non autorisée';
  END IF;
  IF coalesce(array_length(p_ids, 1), 0) > 100 THEN RAISE EXCEPTION 'Demande invalide'; END IF;

  SELECT coalesce(jsonb_object_agg(a.id, jsonb_build_object(
    -- QUI : carte publique (pseudo, avatar), ancienneté et passé de contributeur.
    'author', jsonb_build_object(
      'card', private.bw_traveller_card(p),
      'joined_at', u.created_at,
      'observations', (SELECT jsonb_build_object(
          'total', count(*),
          'published', count(*) FILTER (WHERE x.decision = 'published'),
          'handled', count(*) FILTER (WHERE x.status = 'handled' AND x.decision IS DISTINCT FROM 'published'),
          'dismissed', count(*) FILTER (WHERE x.status = 'dismissed'))
        FROM public.bw_report_anomalies x WHERE x.user_id = a.user_id AND x.id <> a.id),
      'alerts', (SELECT jsonb_build_object(
          'total', count(*),
          'on_site', count(*) FILTER (WHERE t.on_site),
          'validated', count(*) FILTER (WHERE t.validated_at IS NOT NULL),
          'denied', count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.bw_alert_denials d WHERE d.alert_id = t.id)),
          'confirmed', count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.bw_alert_confirmations c WHERE c.alert_id = t.id AND c.user_id <> t.user_id)))
        FROM public.bw_travel_alerts t WHERE t.user_id = a.user_id)
    ),
    -- COMMENT : ce que l'appareil a dit de la localisation (journal de diagnostic, sans coordonnées).
    'device', (SELECT jsonb_build_object(
        'platform', CASE
          WHEN bool_or(l.detail->>'ua' ~* 'android') THEN 'android'
          WHEN bool_or(l.detail->>'ua' ~* 'iphone|ipad|ipod') THEN 'ios'
          WHEN bool_or(l.detail->>'ua' ~* 'windows|macintosh|linux|cros') THEN 'desktop'
          ELSE NULL END,
        'installed', bool_or((l.detail->>'standalone')::boolean),
        'permission', (array_agg(l.detail->>'permission' ORDER BY l.created_at DESC)
                         FILTER (WHERE l.event = 'start' AND l.detail ? 'permission'))[1],
        'online', bool_and(coalesce((l.detail->>'online')::boolean, true)),
        'attempts', count(*) FILTER (WHERE l.event = 'start'),
        'timeouts', count(*) FILTER (WHERE l.event = 'error' AND l.detail->>'code' = '3'),
        'denied', count(*) FILTER (WHERE l.event = 'error' AND l.detail->>'code' = '1'),
        'unavailable', count(*) FILTER (WHERE l.event = 'error' AND l.detail->>'code' = '2'),
        'silent', count(*) FILTER (WHERE l.event = 'silent'),
        'unsupported', count(*) FILTER (WHERE l.event = 'unsupported'),
        'success', count(*) FILTER (WHERE l.event = 'ok'),
        'logs', count(*))
      FROM private.bw_location_logs l
      WHERE l.user_id = a.user_id
        AND l.created_at BETWEEN a.created_at - interval '10 minutes' AND a.created_at + interval '1 minute'),
    -- QUOI : la traversée concernée et ce qu'on sait du navire.
    'crossing', (SELECT jsonb_build_object(
        'departure_at', d.departure_at, 'arrival_at', d.arrival_at, 'status', d.status,
        'from', pf.name, 'to', pt.name, 'vessel', v.name,
        'reported_delay', d.reported_delay_minutes)
      FROM public.departures d
      LEFT JOIN public.routes r ON r.id = d.route_id
      LEFT JOIN public.ports pf ON pf.id = r.departure_port_id
      LEFT JOIN public.ports pt ON pt.id = r.arrival_port_id
      LEFT JOIN public.vessels v ON v.id = d.vessel_id
      WHERE d.id = a.departure_id),
    'ais', (SELECT jsonb_build_object('speed_knots', vp.speed_knots, 'reported_at', vp.reported_at, 'status', vp.status)
      FROM public.vessels v JOIN public.vessel_positions vp ON vp.mmsi = v.mmsi
      WHERE v.id = a.vessel_id ORDER BY vp.reported_at DESC NULLS LAST LIMIT 1),
    -- Les autres signalements au même endroit, 3 h avant ou après.
    'nearby', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'kind', n.kind, 'category', n.category, 'detail', n.detail, 'delay_minutes', n.delay_minutes,
          'created_at', n.created_at, 'same_author', n.user_id = a.user_id, 'on_site', n.on_site,
          'confirmations', n.confirmations, 'denials', n.denials, 'validated', n.validated,
          'status', n.status) ORDER BY n.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT 'alert' kind, t.category, t.detail, t.delay_minutes, t.created_at, t.user_id, t.on_site,
               (SELECT count(*) FROM public.bw_alert_confirmations c WHERE c.alert_id = t.id) confirmations,
               (SELECT count(*) FROM public.bw_alert_denials d WHERE d.alert_id = t.id) denials,
               t.validated_at IS NOT NULL validated,
               CASE WHEN t.resolved THEN 'resolved' WHEN t.expires_at < now() THEN 'expired' ELSE 'active' END status
        FROM public.bw_travel_alerts t
        WHERE t.target_id = coalesce(a.vessel_id, a.port_id)
          AND t.created_at BETWEEN a.created_at - interval '3 hours' AND a.created_at + interval '3 hours'
        UNION ALL
        SELECT 'observation', o.category, o.detail, o.delay_minutes, o.created_at, o.user_id, false, 0, 0, false, o.status
        FROM public.bw_report_anomalies o
        WHERE o.id <> a.id AND coalesce(o.vessel_id, o.port_id) = coalesce(a.vessel_id, a.port_id)
          AND o.created_at BETWEEN a.created_at - interval '3 hours' AND a.created_at + interval '3 hours'
        LIMIT 20
      ) n),
    'lifetime', (SELECT coalesce(o.lifetime_minutes, s.lifetime_minutes)
      FROM public.bw_signal_situations s
      LEFT JOIN public.bw_signal_options o ON o.situation = s.code AND o.code = a.detail
      WHERE s.code = a.category),
    -- Trace : qui a modéré (carte publique seulement).
    'moderator', (SELECT private.bw_traveller_card(mp) FROM private.bw_ensure_traveller(a.handled_by) mp
                  WHERE a.handled_by IS NOT NULL)
  )), '{}'::jsonb) INTO result
  FROM public.bw_report_anomalies a
  JOIN auth.users u ON u.id = a.user_id
  CROSS JOIN LATERAL private.bw_ensure_traveller(a.user_id) p
  WHERE a.id = ANY(p_ids);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.bw_anomaly_context_staff(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_anomaly_context_staff(uuid[]) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
