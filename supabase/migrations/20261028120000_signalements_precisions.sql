-- BledWay · Précisions des signalements voyageurs (parcours « Signaler » façon Waze).
-- Ajoute une précision facultative (ex. « File d'attente · environ 1 h ») à chaque signalement.
-- Script additif : aucune donnée existante n'est modifiée ni supprimée, il peut être relancé.
-- Prérequis : le script 20261026120000_ma_traversee_flash_info.sql doit avoir été exécuté.
BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.bw_travel_alerts') IS NULL OR to_regclass('public.bw_alert_denials') IS NULL THEN
    RAISE EXCEPTION 'Exécutez d''abord le script 20261026120000_ma_traversee_flash_info.sql, puis relancez celui-ci.';
  END IF;
END
$do$;

-- 1. Précision choisie dans une liste fermée, toujours cohérente avec la situation signalée.
ALTER TABLE public.bw_travel_alerts ADD COLUMN IF NOT EXISTS detail text;
ALTER TABLE public.bw_travel_alerts DROP CONSTRAINT IF EXISTS bw_travel_alerts_detail_check;
ALTER TABLE public.bw_travel_alerts ADD CONSTRAINT bw_travel_alerts_detail_check CHECK (
  detail IS NULL OR (
    detail IN ('queue_30','queue_60','queue_120',
               'access_traffic','access_closed','access_works',
               'parking_boarding','parking_visitors',
               'boarding_vehicles','boarding_foot',
               'disembarking_vehicles','disembarking_foot')
    AND starts_with(detail, category || '_')
  )
);

-- 2. Signaler : même fonction qu'avant, avec une précision facultative.
--    L'ancienne version (4 paramètres) est remplacée pour éviter toute ambiguïté d'appel ;
--    les appels existants sans précision continuent de fonctionner.
DROP FUNCTION IF EXISTS public.bw_report_travel(text,uuid,text,integer);
CREATE OR REPLACE FUNCTION public.bw_report_travel(p_kind text,p_target uuid,p_category text,p_delay integer DEFAULT NULL,p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  IF NOT ((p_kind='vessel' AND EXISTS(SELECT 1 FROM public.vessels WHERE id=p_target AND status='active')) OR (p_kind='port' AND EXISTS(SELECT 1 FROM public.ports WHERE id=p_target AND status='active'))) THEN RAISE EXCEPTION 'Lieu ou navire introuvable'; END IF;
  IF (SELECT count(*) FROM public.bw_travel_alerts WHERE user_id=auth.uid() AND created_at>now()-interval '15 minutes')>=5 THEN RAISE EXCEPTION 'Maximum de cinq signalements par quart d’heure'; END IF;
  IF EXISTS(SELECT 1 FROM public.bw_travel_alerts WHERE user_id=auth.uid() AND target_kind=p_kind AND target_id=p_target AND category=p_category AND NOT resolved AND expires_at>now()) THEN RAISE EXCEPTION 'Vous avez déjà signalé cette situation'; END IF;
  INSERT INTO public.bw_travel_alerts(target_kind,target_id,user_id,category,delay_minutes,detail) VALUES(p_kind,p_target,auth.uid(),p_category,p_delay,nullif(p_detail,''));
END $$;
REVOKE ALL ON FUNCTION public.bw_report_travel(text,uuid,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_report_travel(text,uuid,text,integer,text) TO authenticated;

-- 3. Flux communautaire : mêmes champs que le script du 26/10, plus la précision.
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
      SELECT a.id,a.target_kind,a.target_id,a.category,a.delay_minutes,a.detail,a.created_at,a.expires_at,
        a.user_id = auth.uid() AS own,
        (SELECT count(*)::integer FROM public.bw_alert_confirmations c WHERE c.alert_id=a.id) AS confirmations,
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

NOTIFY pgrst, 'reload schema';
COMMIT;
