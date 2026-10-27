-- BledWay · Catalogue des signalements géré depuis l'admin (ajout, modification, masquage, suppression).
-- Les situations, leurs choix et les services du port passent dans trois tables, préremplies avec le
-- catalogue actuel. L'envoi d'un signalement est désormais validé à partir de ces tables.
-- Script additif : aucun signalement existant n'est modifié ni supprimé, il peut être relancé.
-- Prérequis : le script 20261030120000_signalements_port.sql doit avoir été exécuté.
BEGIN;

DO $do$
BEGIN
  IF to_regprocedure('public.bw_signal_catalog_version()') IS NULL OR public.bw_signal_catalog_version() < 3 THEN
    RAISE EXCEPTION 'Exécutez d''abord le script 20261030120000_signalements_port.sql, puis relancez celui-ci.';
  END IF;
END
$do$;

-- 1. Tables du catalogue. Les codes ne changent jamais (ils sont enregistrés dans les signalements) ;
--    seuls les libellés, pictos, couleurs, durées et l'ordre se modifient.
CREATE TABLE IF NOT EXISTS public.bw_signal_situations (
  code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9]{1,30}$'),
  label text NOT NULL CHECK (char_length(label) BETWEEN 2 AND 60),
  target_kind text NOT NULL CHECK (target_kind IN ('port','vessel')),
  color text NOT NULL DEFAULT '#0f766e' CHECK (color ~ '^#[0-9a-f]{6}$'),
  icon text NOT NULL DEFAULT 'flag' CHECK (char_length(icon) <= 40),
  lifetime_minutes integer NOT NULL DEFAULT 120 CHECK (lifetime_minutes BETWEEN 15 AND 1440),
  question text NOT NULL DEFAULT '' CHECK (char_length(question) <= 80),
  required boolean NOT NULL DEFAULT false,
  sort integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  -- Situations avec une logique propre dans le code (retard) : non supprimables.
  builtin boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.bw_signal_options (
  code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9]*_[a-z0-9_]{1,40}$'),
  situation text NOT NULL REFERENCES public.bw_signal_situations(code) ON UPDATE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 2 AND 60),
  icon text NOT NULL DEFAULT 'circle' CHECK (char_length(icon) <= 40),
  -- Signalement impactant : il faut être sur place (position vérifiée par le serveur).
  on_site boolean NOT NULL DEFAULT false,
  -- Retard : durée enregistrée dans delay_minutes au lieu d'une précision.
  delay_minutes integer CHECK (delay_minutes IN (30,60,120)),
  lifetime_minutes integer CHECK (lifetime_minutes IS NULL OR lifetime_minutes BETWEEN 15 AND 1440),
  sort integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_with(code, situation || '_'))
);
CREATE TABLE IF NOT EXISTS public.bw_signal_services (
  code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9]{1,30}$'),
  label text NOT NULL CHECK (char_length(label) BETWEEN 2 AND 60),
  open_label text NOT NULL DEFAULT 'ouvert' CHECK (char_length(open_label) BETWEEN 2 AND 30),
  closed_label text NOT NULL DEFAULT 'fermé' CHECK (char_length(closed_label) BETWEEN 2 AND 30),
  icon text NOT NULL DEFAULT 'store' CHECK (char_length(icon) <= 40),
  sort integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Droits : lecture publique, écriture réservée à l'équipe (admin, éditeur).
ALTER TABLE public.bw_signal_situations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_signal_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_signal_services ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.bw_signal_situations, public.bw_signal_options, public.bw_signal_services TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bw_signal_situations, public.bw_signal_options, public.bw_signal_services TO authenticated;
GRANT ALL ON public.bw_signal_situations, public.bw_signal_options, public.bw_signal_services TO service_role;
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bw_signal_situations','bw_signal_options','bw_signal_services'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', t || '_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_staff', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING ((SELECT private.bw_staff_permission(ARRAY[''admin'',''editor'']))) WITH CHECK ((SELECT private.bw_staff_permission(ARRAY[''admin'',''editor''])))', t || '_staff', t);
  END LOOP;
END
$do$;

-- 3. Pas de suppression d'une situation, d'un choix ou d'un service déjà utilisé : on le masque.
CREATE OR REPLACE FUNCTION private.bw_signal_guard_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'bw_signal_situations' THEN
    IF OLD.builtin THEN RAISE EXCEPTION 'Situation intégrée : masquez-la plutôt que de la supprimer'; END IF;
    IF EXISTS(SELECT 1 FROM public.bw_travel_alerts WHERE category = OLD.code) THEN
      RAISE EXCEPTION 'Déjà utilisée par des signalements : masquez-la plutôt que de la supprimer';
    END IF;
  ELSIF TG_TABLE_NAME = 'bw_signal_options' THEN
    IF EXISTS(SELECT 1 FROM public.bw_travel_alerts WHERE detail = OLD.code) THEN
      RAISE EXCEPTION 'Déjà utilisé par des signalements : masquez-le plutôt que de le supprimer';
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM public.bw_travel_alerts WHERE detail LIKE 'service\_' || OLD.code || '\_%') THEN
      RAISE EXCEPTION 'Déjà utilisé par des signalements : masquez-le plutôt que de le supprimer';
    END IF;
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS bw_signal_situations_guard ON public.bw_signal_situations;
CREATE TRIGGER bw_signal_situations_guard BEFORE DELETE ON public.bw_signal_situations
  FOR EACH ROW EXECUTE FUNCTION private.bw_signal_guard_delete();
DROP TRIGGER IF EXISTS bw_signal_options_guard ON public.bw_signal_options;
CREATE TRIGGER bw_signal_options_guard BEFORE DELETE ON public.bw_signal_options
  FOR EACH ROW EXECUTE FUNCTION private.bw_signal_guard_delete();
DROP TRIGGER IF EXISTS bw_signal_services_guard ON public.bw_signal_services;
CREATE TRIGGER bw_signal_services_guard BEFORE DELETE ON public.bw_signal_services
  FOR EACH ROW EXECUTE FUNCTION private.bw_signal_guard_delete();
-- Un choix ne peut pas changer de situation après création.
CREATE OR REPLACE FUNCTION private.bw_signal_guard_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.code <> OLD.code THEN RAISE EXCEPTION 'Le code ne se modifie pas : créez un nouvel élément'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bw_signal_situations_touch ON public.bw_signal_situations;
CREATE TRIGGER bw_signal_situations_touch BEFORE UPDATE ON public.bw_signal_situations
  FOR EACH ROW EXECUTE FUNCTION private.bw_signal_guard_update();
DROP TRIGGER IF EXISTS bw_signal_options_touch ON public.bw_signal_options;
CREATE TRIGGER bw_signal_options_touch BEFORE UPDATE ON public.bw_signal_options
  FOR EACH ROW EXECUTE FUNCTION private.bw_signal_guard_update();
DROP TRIGGER IF EXISTS bw_signal_services_touch ON public.bw_signal_services;
CREATE TRIGGER bw_signal_services_touch BEFORE UPDATE ON public.bw_signal_services
  FOR EACH ROW EXECUTE FUNCTION private.bw_signal_guard_update();

-- 4. Reprise du catalogue actuel (ne remplace rien de ce qui aurait déjà été saisi).
INSERT INTO public.bw_signal_situations(code,label,target_kind,color,icon,lifetime_minutes,question,required,sort,active,builtin) VALUES
  ('access','Accès au port','port','#dc4c1d','traffic-cone',120,'Comment ça se passe ?',false,10,true,false),
  ('checkin','Enregistrement','port','#2563eb','ticket',120,'Aux guichets de la compagnie',true,20,true,false),
  ('queue','File d’attente','port','#e0a100','users',90,'Comment avance la file ?',false,30,true,false),
  ('formalities','Formalités (police, douane)','port','#c2410c','stamp',90,'Aux contrôles',false,40,true,false),
  ('call','Appel à l’embarquement','port','#9333ea','bell-ring',60,'Avant de monter à bord',true,50,true,false),
  ('service','Services du port','port','#0f766e','store',120,'Quel service ?',true,60,true,true),
  ('parking','Parking complet','port','#2f6fd6','parking-circle',120,'',false,90,false,false),
  ('fluid','Ça passe bien','port','#2e9d6a','circle-check',60,'',false,95,false,false),
  ('delay','Retard','vessel','#d6336c','clock',180,'Retard annoncé sur place',true,110,true,true),
  ('boarding','Embarquement commencé','vessel','#0c8599','log-in',60,'Pour qui ?',false,120,true,false),
  ('disembarking','Débarquement commencé','vessel','#6741d9','log-out',60,'Pour qui ?',false,130,true,false)
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.bw_signal_options(code,situation,label,icon,on_site,delay_minutes,lifetime_minutes,sort,active) VALUES
  ('access_ok','access','Ça roule','circle-check',false,NULL,NULL,10,true),
  ('access_traffic','access','Bouchon pour entrer','car',false,NULL,NULL,20,true),
  ('access_closed','access','Accès fermé ou dévié','ban',true,NULL,NULL,30,true),
  ('access_works','access','Travaux','construction',false,NULL,NULL,40,true),
  ('checkin_open','checkin','Ouvert','door-open',false,NULL,NULL,10,true),
  ('checkin_notyet','checkin','Pas encore ouvert','clock',false,NULL,NULL,20,true),
  ('checkin_queue','checkin','Longue file au guichet','users',false,NULL,NULL,30,true),
  ('queue_moving','queue','La file avance','chevrons-right',false,NULL,NULL,10,true),
  ('queue_stopped','queue','File à l’arrêt','pause',false,NULL,NULL,20,true),
  ('queue_long','queue','File très longue','list-ordered',false,NULL,NULL,30,true),
  ('queue_30','queue','Moins de 30 min','timer',false,NULL,NULL,80,false),
  ('queue_60','queue','Environ 1 h','hourglass',false,NULL,NULL,81,false),
  ('queue_120','queue','2 h et plus','hourglass',false,NULL,NULL,82,false),
  ('formalities_open','formalities','Ouvertes','door-open',false,NULL,NULL,10,true),
  ('formalities_short','formalities','Attente courte','timer',false,NULL,NULL,20,true),
  ('formalities_long','formalities','Longue attente','hourglass',false,NULL,NULL,30,true),
  ('formalities_notyet','formalities','Pas encore ouvertes','clock',false,NULL,NULL,40,true),
  ('formalities_30','formalities','Moins de 30 min','timer',false,NULL,NULL,80,false),
  ('formalities_60','formalities','Environ 1 h','hourglass',false,NULL,NULL,81,false),
  ('formalities_120','formalities','2 h et plus','hourglass',false,NULL,NULL,82,false),
  ('call_called','call','Embarquement appelé','bell-ring',false,NULL,NULL,10,true),
  ('call_waiting','call','Pas encore appelé, on patiente','hourglass',false,NULL,NULL,20,true),
  ('parking_boarding','parking','Parking d’embarquement','parking-circle',false,NULL,NULL,10,false),
  ('parking_visitors','parking','Parking accompagnants','parking-circle',false,NULL,NULL,20,false),
  ('delay_30','delay','≈ 30 min','timer',false,30,NULL,10,true),
  ('delay_60','delay','≈ 1 h','hourglass',false,60,NULL,20,true),
  ('delay_120','delay','2 h et plus','hourglass',false,120,NULL,30,true),
  ('delay_postponed','delay','Reporté ou annulé','calendar-x',true,NULL,360,40,true),
  ('boarding_vehicles','boarding','Véhicules','car',false,NULL,NULL,10,true),
  ('boarding_foot','boarding','Passagers à pied','footprints',false,NULL,NULL,20,true),
  ('disembarking_vehicles','disembarking','Véhicules','car',false,NULL,NULL,10,true),
  ('disembarking_foot','disembarking','Passagers à pied','footprints',false,NULL,NULL,20,true)
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.bw_signal_services(code,label,open_label,closed_label,icon,sort,active) VALUES
  ('snack','Snack, restauration','ouvert','fermé','utensils',10,true),
  ('prayer','Salle de prière','disponible','indisponible','moon-star',20,true),
  ('toilets','Toilettes','ouvertes','fermées','toilet',30,true),
  ('water','Eau potable','disponible','indisponible','glass-water',40,true),
  ('atm','Distributeur','en service','hors service','banknote',50,true),
  ('exchange','Bureau de change','ouvert','fermé','coins',60,true),
  ('fuel','Station-service','ouverte','fermée','fuel',70,true),
  ('kids','Espace enfants','ouvert','fermé','baby',80,true)
ON CONFLICT (code) DO NOTHING;

-- 5. Les listes figées des scripts précédents sont remplacées par le catalogue.
ALTER TABLE public.bw_travel_alerts DROP CONSTRAINT IF EXISTS bw_travel_alerts_category_check;
ALTER TABLE public.bw_travel_alerts DROP CONSTRAINT IF EXISTS bw_travel_alerts_target_rule;
ALTER TABLE public.bw_travel_alerts DROP CONSTRAINT IF EXISTS bw_travel_alerts_detail_check;
ALTER TABLE public.bw_travel_alerts DROP CONSTRAINT IF EXISTS bw_travel_alerts_detail_required;
ALTER TABLE public.bw_travel_alerts ADD CONSTRAINT bw_travel_alerts_detail_check
  CHECK (detail IS NULL OR (char_length(detail) <= 80 AND starts_with(detail, category || '_')));
-- Retard : soit une durée (delay_minutes), soit une précision du catalogue (ex. « reporté »), jamais les deux.
ALTER TABLE public.bw_travel_alerts DROP CONSTRAINT IF EXISTS bw_travel_alerts_delay_rule;
ALTER TABLE public.bw_travel_alerts ADD CONSTRAINT bw_travel_alerts_delay_rule
  CHECK ((category = 'delay' AND target_kind = 'vessel' AND (delay_minutes IS NOT NULL) <> (detail IS NOT NULL))
      OR (category <> 'delay' AND delay_minutes IS NULL));

-- 6. Signaler : situation, choix et service validés à partir du catalogue (actifs uniquement).
CREATE OR REPLACE FUNCTION public.bw_report_travel(p_kind text,p_target uuid,p_category text,p_delay integer DEFAULT NULL,p_detail text DEFAULT NULL,p_lat double precision DEFAULT NULL,p_lng double precision DEFAULT NULL)
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
  IF coalesce(o.on_site, false) AND NOT here THEN
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
REVOKE ALL ON FUNCTION public.bw_report_travel(text,uuid,text,integer,text,double precision,double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_report_travel(text,uuid,text,integer,text,double precision,double precision) TO authenticated;

-- 7. Version du catalogue lue par l'application : 4 = catalogue en base, géré depuis l'admin.
CREATE OR REPLACE FUNCTION public.bw_signal_catalog_version() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 4 $$;
GRANT EXECUTE ON FUNCTION public.bw_signal_catalog_version() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
