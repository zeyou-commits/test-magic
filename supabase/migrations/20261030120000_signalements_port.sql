-- BledWay · Signalements au port, le long de la file d'attente avant l'embarquement.
-- Nouvelles situations : enregistrement, appel à l'embarquement, services du port (ouvert / fermé) ;
-- file d'attente et formalités en tendance ; « Ça roule » pour l'accès.
-- Un nouvel état remplace l'état opposé (ex. « Snack ouvert » clôt « Snack fermé »).
-- Script additif : aucun signalement existant n'est supprimé, il peut être relancé.
-- Prérequis : le script 20261029120000_signalements_catalogue_sur_place.sql doit avoir été exécuté.
BEGIN;

DO $do$
BEGIN
  IF to_regprocedure('public.bw_signal_catalog_version()') IS NULL THEN
    RAISE EXCEPTION 'Exécutez d''abord le script 20261029120000_signalements_catalogue_sur_place.sql, puis relancez celui-ci.';
  END IF;
END
$do$;

-- 1. Situations et précisions autorisées.
ALTER TABLE public.bw_travel_alerts DROP CONSTRAINT IF EXISTS bw_travel_alerts_category_check;
ALTER TABLE public.bw_travel_alerts ADD CONSTRAINT bw_travel_alerts_category_check
  CHECK (category IN ('delay','boarding','disembarking','queue','formalities','access','parking','fluid','checkin','call','service'));
ALTER TABLE public.bw_travel_alerts DROP CONSTRAINT IF EXISTS bw_travel_alerts_target_rule;
ALTER TABLE public.bw_travel_alerts ADD CONSTRAINT bw_travel_alerts_target_rule
  CHECK ((target_kind = 'vessel' AND category IN ('delay','boarding','disembarking'))
      OR (target_kind = 'port' AND category IN ('queue','formalities','access','parking','fluid','checkin','call','service')));
ALTER TABLE public.bw_travel_alerts DROP CONSTRAINT IF EXISTS bw_travel_alerts_detail_check;
ALTER TABLE public.bw_travel_alerts ADD CONSTRAINT bw_travel_alerts_detail_check CHECK (
  detail IS NULL OR (
    (detail IN ('queue_30','queue_60','queue_120','queue_moving','queue_stopped','queue_long',
                'formalities_30','formalities_60','formalities_120',
                'formalities_open','formalities_short','formalities_long','formalities_notyet',
                'access_ok','access_traffic','access_closed','access_works',
                'parking_boarding','parking_visitors',
                'checkin_open','checkin_notyet','checkin_queue',
                'call_called','call_waiting',
                'boarding_vehicles','boarding_foot',
                'disembarking_vehicles','disembarking_foot',
                'delay_postponed')
     OR detail ~ '^service_(snack|prayer|toilets|water|atm|exchange|fuel|kids)_(open|closed)$')
    AND starts_with(detail, category || '_')
  )
);
-- Enregistrement, appel et services : une précision est obligatoire.
ALTER TABLE public.bw_travel_alerts DROP CONSTRAINT IF EXISTS bw_travel_alerts_detail_required;
ALTER TABLE public.bw_travel_alerts ADD CONSTRAINT bw_travel_alerts_detail_required
  CHECK (category NOT IN ('checkin','call','service') OR detail IS NOT NULL);

-- 2. « Même sujet » : la situation, et pour les services le service concerné (snack, toilettes…).
CREATE OR REPLACE FUNCTION private.bw_alert_group(p_category text, p_detail text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_category = 'service' THEN coalesce(substring(p_detail from '^(service_[a-z]+)_'), 'service')
              ELSE p_category END;
$$;
REVOKE ALL ON FUNCTION private.bw_alert_group(text,text) FROM PUBLIC;

-- 3. Signaler : mêmes règles que le 29/10, plus le remplacement de l'état opposé au port.
CREATE OR REPLACE FUNCTION public.bw_report_travel(p_kind text,p_target uuid,p_category text,p_delay integer DEFAULT NULL,p_detail text DEFAULT NULL,p_lat double precision DEFAULT NULL,p_lng double precision DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE here boolean; lifetime integer; topic text; new_id uuid;
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  IF NOT ((p_kind='vessel' AND EXISTS(SELECT 1 FROM public.vessels WHERE id=p_target AND status='active')) OR (p_kind='port' AND EXISTS(SELECT 1 FROM public.ports WHERE id=p_target AND status='active'))) THEN RAISE EXCEPTION 'Lieu ou navire introuvable'; END IF;
  IF (SELECT count(*) FROM public.bw_travel_alerts WHERE user_id=auth.uid() AND created_at>now()-interval '15 minutes')>=5 THEN RAISE EXCEPTION 'Maximum de cinq signalements par quart d’heure'; END IF;
  topic := private.bw_alert_group(p_category, p_detail);
  -- Même sujet, même état : déjà signalé. Même sujet, autre état : on met à jour son propre signalement.
  IF EXISTS(SELECT 1 FROM public.bw_travel_alerts WHERE user_id=auth.uid() AND target_kind=p_kind AND target_id=p_target
            AND private.bw_alert_group(category, detail)=topic AND detail IS NOT DISTINCT FROM nullif(p_detail,'')
            AND (p_category <> 'delay' OR delay_minutes IS NOT DISTINCT FROM p_delay)
            AND NOT resolved AND expires_at>now()) THEN
    RAISE EXCEPTION 'Vous avez déjà signalé cette situation';
  END IF;
  UPDATE public.bw_travel_alerts SET resolved=true
   WHERE user_id=auth.uid() AND target_kind=p_kind AND target_id=p_target
     AND private.bw_alert_group(category, detail)=topic AND NOT resolved AND expires_at>now();
  here := private.bw_on_site(p_kind, p_target, p_lat, p_lng);
  IF p_detail IN ('delay_postponed','access_closed') AND NOT here THEN
    RAISE EXCEPTION 'Ce signalement doit être fait sur place, localisation activée';
  END IF;
  lifetime := CASE p_category
    WHEN 'delay' THEN CASE WHEN p_detail = 'delay_postponed' THEN 360 ELSE 180 END
    WHEN 'boarding' THEN 60 WHEN 'disembarking' THEN 60 WHEN 'fluid' THEN 60 WHEN 'call' THEN 60
    WHEN 'queue' THEN 90 WHEN 'formalities' THEN 90
    ELSE 120 END;
  INSERT INTO public.bw_travel_alerts(target_kind,target_id,user_id,category,delay_minutes,detail,on_site,expires_at)
  VALUES(p_kind,p_target,auth.uid(),p_category,CASE WHEN p_detail = 'delay_postponed' THEN NULL ELSE p_delay END,
         nullif(p_detail,''),here,now() + make_interval(mins => lifetime))
  RETURNING id INTO new_id;
  -- Au port, le nouvel état clôt l'état opposé des autres voyageurs, sauf s'il a été confirmé par au moins 2 personnes.
  IF p_kind = 'port' THEN
    UPDATE public.bw_travel_alerts o SET resolved=true
     WHERE o.target_kind='port' AND o.target_id=p_target AND o.id<>new_id AND NOT o.resolved AND o.expires_at>now()
       AND private.bw_alert_group(o.category, o.detail)=topic
       AND o.detail IS DISTINCT FROM nullif(p_detail,'')
       AND (SELECT count(*) FROM public.bw_alert_confirmations c WHERE c.alert_id=o.id) < 2;
  END IF;
  RETURN here;
END $$;
REVOKE ALL ON FUNCTION public.bw_report_travel(text,uuid,text,integer,text,double precision,double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_report_travel(text,uuid,text,integer,text,double precision,double precision) TO authenticated;

-- 4. Version du catalogue lue par l'application.
CREATE OR REPLACE FUNCTION public.bw_signal_catalog_version() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 3 $$;
GRANT EXECUTE ON FUNCTION public.bw_signal_catalog_version() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
