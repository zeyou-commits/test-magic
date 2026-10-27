-- BledWay · Signalements voyageurs : catalogue harmonisé, précisions, durées par situation et « sur place ».
-- Inclut tout le script du 28/10 (20261028120000_signalements_precisions.sql) : inutile d'exécuter les deux.
-- Script additif : aucun signalement existant n'est modifié ni supprimé, il peut être relancé.
-- Prérequis : le script 20261026120000_ma_traversee_flash_info.sql doit avoir été exécuté.
--
-- « Sur place » : l'application envoie la position (arrondie à ~100 m) au moment du geste ;
-- le serveur calcule la distance au port ou au navire et n'enregistre QUE le résultat (oui / non).
-- Les coordonnées ne sont jamais stockées.
BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.bw_travel_alerts') IS NULL OR to_regclass('public.bw_alert_denials') IS NULL THEN
    RAISE EXCEPTION 'Exécutez d''abord le script 20261026120000_ma_traversee_flash_info.sql, puis relancez celui-ci.';
  END IF;
END
$do$;

-- 1. Colonnes : précision, auteur sur place, confirmation faite sur place.
ALTER TABLE public.bw_travel_alerts ADD COLUMN IF NOT EXISTS detail text;
ALTER TABLE public.bw_travel_alerts ADD COLUMN IF NOT EXISTS on_site boolean NOT NULL DEFAULT false;
ALTER TABLE public.bw_alert_confirmations ADD COLUMN IF NOT EXISTS on_site boolean NOT NULL DEFAULT false;

-- 2. Règles : nouvelle situation « formalités », « reporté ou annulé » pour le retard, précisions fermées.
ALTER TABLE public.bw_travel_alerts DROP CONSTRAINT IF EXISTS bw_travel_alerts_category_check;
ALTER TABLE public.bw_travel_alerts ADD CONSTRAINT bw_travel_alerts_category_check
  CHECK (category IN ('delay','boarding','disembarking','queue','formalities','access','parking','fluid'));
ALTER TABLE public.bw_travel_alerts DROP CONSTRAINT IF EXISTS bw_travel_alerts_target_rule;
ALTER TABLE public.bw_travel_alerts ADD CONSTRAINT bw_travel_alerts_target_rule
  CHECK ((target_kind = 'vessel' AND category IN ('delay','boarding','disembarking'))
      OR (target_kind = 'port' AND category IN ('queue','formalities','access','parking','fluid')));
ALTER TABLE public.bw_travel_alerts DROP CONSTRAINT IF EXISTS bw_travel_alerts_delay_rule;
ALTER TABLE public.bw_travel_alerts ADD CONSTRAINT bw_travel_alerts_delay_rule
  CHECK ((category = 'delay' AND target_kind = 'vessel'
          AND ((delay_minutes IS NOT NULL AND detail IS NULL) OR (delay_minutes IS NULL AND detail = 'delay_postponed')))
      OR (category <> 'delay' AND delay_minutes IS NULL));
ALTER TABLE public.bw_travel_alerts DROP CONSTRAINT IF EXISTS bw_travel_alerts_detail_check;
ALTER TABLE public.bw_travel_alerts ADD CONSTRAINT bw_travel_alerts_detail_check CHECK (
  detail IS NULL OR (
    detail IN ('queue_30','queue_60','queue_120',
               'formalities_30','formalities_60','formalities_120',
               'access_traffic','access_closed','access_works',
               'parking_boarding','parking_visitors',
               'boarding_vehicles','boarding_foot',
               'disembarking_vehicles','disembarking_foot',
               'delay_postponed')
    AND starts_with(detail, category || '_')
  )
);

-- 3. Distance (km) et vérification « sur place ».
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.bw_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT 12742 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

-- Port : à moins de 3 km. Navire : à moins de 3 km d'un port d'escale d'un de ses départs
-- (12 h avant ou après), ou à moins de 15 km de sa dernière position AIS de moins de 3 h.
CREATE OR REPLACE FUNCTION private.bw_on_site(p_kind text, p_target uuid, p_lat double precision, p_lng double precision)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE near boolean := false;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL OR abs(p_lat) > 90 OR abs(p_lng) > 180 THEN RETURN false; END IF;
  IF p_kind = 'port' THEN
    SELECT private.bw_km(p_lat, p_lng, p.latitude, p.longitude) <= 3 INTO near
    FROM public.ports p WHERE p.id = p_target;
    RETURN coalesce(near, false);
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.departures d
    JOIN public.routes r ON r.id = d.route_id
    JOIN public.ports p ON p.id IN (r.departure_port_id, r.arrival_port_id)
    WHERE d.vessel_id = p_target
      AND d.departure_at BETWEEN now() - interval '12 hours' AND now() + interval '12 hours'
      AND private.bw_km(p_lat, p_lng, p.latitude, p.longitude) <= 3
  ) INTO near;
  IF near THEN RETURN true; END IF;
  IF to_regclass('public.vessel_positions') IS NOT NULL THEN
    EXECUTE $q$
      SELECT EXISTS (
        SELECT 1 FROM public.vessel_positions vp JOIN public.vessels v ON v.mmsi = vp.mmsi
        WHERE v.id = $1 AND vp.latitude IS NOT NULL AND vp.reported_at > now() - interval '3 hours'
          AND private.bw_km($2, $3, vp.latitude, vp.longitude) <= 15)
    $q$ INTO near USING p_target, p_lat, p_lng;
  END IF;
  RETURN coalesce(near, false);
END $$;
REVOKE ALL ON FUNCTION private.bw_km(double precision,double precision,double precision,double precision), private.bw_on_site(text,uuid,double precision,double precision) FROM PUBLIC;

-- 4. Signaler : précision, durée selon la situation, « sur place » exigé pour les signalements impactants.
DROP FUNCTION IF EXISTS public.bw_report_travel(text,uuid,text,integer);
DROP FUNCTION IF EXISTS public.bw_report_travel(text,uuid,text,integer,text);
CREATE OR REPLACE FUNCTION public.bw_report_travel(p_kind text,p_target uuid,p_category text,p_delay integer DEFAULT NULL,p_detail text DEFAULT NULL,p_lat double precision DEFAULT NULL,p_lng double precision DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE here boolean; lifetime integer;
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  IF NOT ((p_kind='vessel' AND EXISTS(SELECT 1 FROM public.vessels WHERE id=p_target AND status='active')) OR (p_kind='port' AND EXISTS(SELECT 1 FROM public.ports WHERE id=p_target AND status='active'))) THEN RAISE EXCEPTION 'Lieu ou navire introuvable'; END IF;
  IF (SELECT count(*) FROM public.bw_travel_alerts WHERE user_id=auth.uid() AND created_at>now()-interval '15 minutes')>=5 THEN RAISE EXCEPTION 'Maximum de cinq signalements par quart d’heure'; END IF;
  IF EXISTS(SELECT 1 FROM public.bw_travel_alerts WHERE user_id=auth.uid() AND target_kind=p_kind AND target_id=p_target AND category=p_category AND NOT resolved AND expires_at>now()) THEN RAISE EXCEPTION 'Vous avez déjà signalé cette situation'; END IF;
  here := private.bw_on_site(p_kind, p_target, p_lat, p_lng);
  IF p_detail IN ('delay_postponed','access_closed') AND NOT here THEN
    RAISE EXCEPTION 'Ce signalement doit être fait sur place, localisation activée';
  END IF;
  lifetime := CASE p_category
    WHEN 'delay' THEN CASE WHEN p_detail = 'delay_postponed' THEN 360 ELSE 180 END
    WHEN 'boarding' THEN 60 WHEN 'disembarking' THEN 60 WHEN 'fluid' THEN 60
    WHEN 'queue' THEN 90 WHEN 'formalities' THEN 90
    ELSE 120 END;
  INSERT INTO public.bw_travel_alerts(target_kind,target_id,user_id,category,delay_minutes,detail,on_site,expires_at)
  VALUES(p_kind,p_target,auth.uid(),p_category,CASE WHEN p_detail = 'delay_postponed' THEN NULL ELSE p_delay END,
         nullif(p_detail,''),here,now() + make_interval(mins => lifetime));
  RETURN here;
END $$;
REVOKE ALL ON FUNCTION public.bw_report_travel(text,uuid,text,integer,text,double precision,double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_report_travel(text,uuid,text,integer,text,double precision,double precision) TO authenticated;

-- 5. Confirmer / « Ce n'est plus le cas » / clore : mêmes règles que le 26/10, la confirmation note « sur place ».
DROP FUNCTION IF EXISTS public.bw_alert_action(uuid,text);
CREATE OR REPLACE FUNCTION public.bw_alert_action(p_alert uuid,p_action text,p_lat double precision DEFAULT NULL,p_lng double precision DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.bw_travel_alerts; n_denials integer; n_confirms integer;
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  SELECT * INTO a FROM public.bw_travel_alerts WHERE id=p_alert AND NOT resolved AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ce signalement a expiré'; END IF;
  IF p_action='resolve' AND (a.user_id=auth.uid() OR coalesce(private.bw_staff_permission(ARRAY['admin','moderator']),false)) THEN
    UPDATE public.bw_travel_alerts SET resolved=true WHERE id=p_alert;
  ELSIF p_action='confirm' AND a.user_id<>auth.uid() THEN
    DELETE FROM public.bw_alert_denials WHERE alert_id=p_alert AND user_id=auth.uid();
    INSERT INTO public.bw_alert_confirmations(alert_id,user_id,on_site)
    VALUES(p_alert,auth.uid(),private.bw_on_site(a.target_kind,a.target_id,p_lat,p_lng))
    ON CONFLICT (alert_id,user_id) DO UPDATE SET on_site = public.bw_alert_confirmations.on_site OR excluded.on_site;
  ELSIF p_action='deny' AND a.user_id<>auth.uid() THEN
    DELETE FROM public.bw_alert_confirmations WHERE alert_id=p_alert AND user_id=auth.uid();
    INSERT INTO public.bw_alert_denials(alert_id,user_id) VALUES(p_alert,auth.uid()) ON CONFLICT DO NOTHING;
    SELECT count(*) INTO n_denials FROM public.bw_alert_denials WHERE alert_id=p_alert;
    SELECT count(*) INTO n_confirms FROM public.bw_alert_confirmations WHERE alert_id=p_alert;
    IF n_denials >= 2 AND n_denials > n_confirms THEN
      UPDATE public.bw_travel_alerts SET resolved=true WHERE id=p_alert;
    END IF;
  ELSE RAISE EXCEPTION 'Action non autorisée'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.bw_alert_action(uuid,text,double precision,double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_alert_action(uuid,text,double precision,double precision) TO authenticated;

-- 6. Flux communautaire : précision et indices « sur place » en plus.
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
      SELECT a.id,a.target_kind,a.target_id,a.category,a.delay_minutes,a.detail,a.on_site,a.created_at,a.expires_at,
        a.user_id = auth.uid() AS own,
        (SELECT count(*)::integer FROM public.bw_alert_confirmations c WHERE c.alert_id=a.id) AS confirmations,
        (SELECT count(*)::integer FROM public.bw_alert_confirmations c WHERE c.alert_id=a.id AND c.on_site) AS on_site_confirmations,
        EXISTS(SELECT 1 FROM public.bw_alert_confirmations c WHERE c.alert_id=a.id AND c.user_id=auth.uid()) AS confirmed,
        (SELECT count(*)::integer FROM public.bw_alert_denials d WHERE d.alert_id=a.id) AS denials,
        EXISTS(SELECT 1 FROM public.bw_alert_denials d WHERE d.alert_id=a.id AND d.user_id=auth.uid()) AS denied
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
REVOKE ALL ON FUNCTION public.bw_community_feed(text,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_community_feed(text,uuid,boolean) TO anon, authenticated;

-- 7. Version du catalogue, lue par l'application pour proposer les nouveautés.
CREATE OR REPLACE FUNCTION public.bw_signal_catalog_version() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 2 $$;
GRANT EXECUTE ON FUNCTION public.bw_signal_catalog_version() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
