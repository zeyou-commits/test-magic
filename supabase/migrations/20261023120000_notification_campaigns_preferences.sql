BEGIN;

ALTER TABLE public.bw_push_deliveries ADD COLUMN IF NOT EXISTS leased_until timestamptz;

-- Les préférences sont personnelles. Le rôle d'un voyageur n'est jamais modifiable ici.
CREATE TABLE IF NOT EXISTS public.bw_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reminders boolean NOT NULL DEFAULT true,
  community boolean NOT NULL DEFAULT true,
  openings boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bw_notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bw_preferences_own ON public.bw_notification_preferences;
CREATE POLICY bw_preferences_own ON public.bw_notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bw_notification_preferences TO authenticated;
GRANT ALL ON public.bw_notification_preferences TO service_role;

CREATE TABLE IF NOT EXISTS public.bw_notification_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  period_month date NOT NULL CHECK (extract(day FROM period_month) = 1),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'sent', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  last_error text,
  UNIQUE (route_id, period_month)
);
CREATE INDEX IF NOT EXISTS bw_campaigns_pending ON public.bw_notification_campaigns(status, created_at);
ALTER TABLE public.bw_notification_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bw_campaigns_admin_read ON public.bw_notification_campaigns;
CREATE POLICY bw_campaigns_admin_read ON public.bw_notification_campaigns FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.bw_notification_campaigns TO authenticated;
GRANT ALL ON public.bw_notification_campaigns TO service_role;
-- Aucun accès en écriture depuis le navigateur : validation admin côté serveur.
REVOKE INSERT, UPDATE, DELETE ON public.bw_notification_campaigns FROM authenticated, anon;

-- Prépare automatiquement une campagne par liaison/mois quand un départ publié
-- répond à au moins une alerte. Cette fonction n'envoie jamais de notification.
CREATE OR REPLACE FUNCTION public.bw_prepare_opening_campaigns(p_route uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer;
BEGIN
  INSERT INTO public.bw_notification_campaigns(route_id, period_month)
  SELECT DISTINCT w.route_id, w.period_month
  FROM public.bw_itinerary_watches w
  JOIN public.routes r ON r.id = w.route_id AND r.status = 'active'
  JOIN public.ports p ON p.id = r.departure_port_id AND p.status = 'active'
  JOIN public.ports a ON a.id = r.arrival_port_id AND a.status = 'active'
  JOIN public.departures d ON d.route_id = w.route_id
  WHERE w.active AND (p_route IS NULL OR w.route_id = p_route)
    AND d.status <> 'cancelled' AND NOT coalesce(d.is_demo, false) AND d.departure_at > now()
    AND (d.departure_at AT TIME ZONE CASE p.country_code WHEN 'DZ' THEN 'Africa/Algiers' WHEN 'ES' THEN 'Europe/Madrid' WHEN 'IT' THEN 'Europe/Rome' ELSE 'Europe/Paris' END)::date >= w.period_month
    AND (d.departure_at AT TIME ZONE CASE p.country_code WHEN 'DZ' THEN 'Africa/Algiers' WHEN 'ES' THEN 'Europe/Madrid' WHEN 'IT' THEN 'Europe/Rome' ELSE 'Europe/Paris' END)::date < (w.period_month + interval '1 month')::date
    AND NOT EXISTS (SELECT 1 FROM public.bw_notification_preferences n WHERE n.user_id = w.user_id AND NOT n.openings)
    AND NOT EXISTS (SELECT 1 FROM public.bw_notifications n WHERE n.user_id = w.user_id AND n.event_key = 'opening:' || w.id::text)
  ON CONFLICT (route_id, period_month) DO UPDATE SET status = 'pending', approved_at = NULL, approved_by = NULL, sent_at = NULL, updated_at = now()
    WHERE public.bw_notification_campaigns.status = 'sent';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION public.bw_prepare_opening_campaigns(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_prepare_opening_campaigns(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.bw_queue_departure_opening()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.bw_prepare_opening_campaigns(NEW.route_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.bw_queue_departure_opening() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS bw_departure_opening_campaign ON public.departures;
CREATE TRIGGER bw_departure_opening_campaign
AFTER INSERT OR UPDATE OF route_id, departure_at, status, is_demo ON public.departures
FOR EACH ROW EXECUTE FUNCTION public.bw_queue_departure_opening();
DROP TRIGGER IF EXISTS bw_watch_opening_campaign ON public.bw_itinerary_watches;
CREATE TRIGGER bw_watch_opening_campaign
AFTER INSERT OR UPDATE OF active, route_id, period_month ON public.bw_itinerary_watches
FOR EACH ROW EXECUTE FUNCTION public.bw_queue_departure_opening();

-- Profil voyageur : les mises à jour ne peuvent concerner que son propre profil.
DROP POLICY IF EXISTS bw_profile_own_update ON public.profiles;
CREATE POLICY bw_profile_own_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name, avatar_url) ON public.profiles TO authenticated;
REVOKE UPDATE ON public.bw_notifications FROM authenticated;
GRANT UPDATE (read_at) ON public.bw_notifications TO authenticated;

-- Les modifications d'un départ suivi alimentent les notifications automatiques.
CREATE TABLE IF NOT EXISTS public.bw_voyage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  departure_id uuid NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  previous_vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bw_voyage_events_recent ON public.bw_voyage_events(created_at);
ALTER TABLE public.bw_voyage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_voyage_events FROM anon, authenticated;
GRANT ALL ON public.bw_voyage_events TO service_role;
CREATE OR REPLACE FUNCTION public.bw_record_departure_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE from_name text; to_name text; country text; vessel_name text; local_departure text;
BEGIN
  IF coalesce(NEW.is_demo, false) OR coalesce(OLD.is_demo, false) OR greatest(NEW.departure_at, OLD.departure_at) < now() - interval '1 day' THEN RETURN NEW; END IF;
  IF ROW(OLD.status, OLD.departure_at, OLD.vessel_id, OLD.route_id, OLD.duration_minutes)
    IS NOT DISTINCT FROM ROW(NEW.status, NEW.departure_at, NEW.vessel_id, NEW.route_id, NEW.duration_minutes) THEN RETURN NEW; END IF;
  SELECT p.name, a.name, p.country_code INTO from_name, to_name, country
    FROM public.routes r JOIN public.ports p ON p.id = r.departure_port_id JOIN public.ports a ON a.id = r.arrival_port_id WHERE r.id = NEW.route_id;
  SELECT v.name INTO vessel_name FROM public.vessels v WHERE v.id = NEW.vessel_id;
  local_departure := to_char(NEW.departure_at AT TIME ZONE CASE country WHEN 'DZ' THEN 'Africa/Algiers' WHEN 'ES' THEN 'Europe/Madrid' WHEN 'IT' THEN 'Europe/Rome' ELSE 'Europe/Paris' END, 'DD/MM/YYYY "à" HH24:MI');
  INSERT INTO public.bw_voyage_events(departure_id, vessel_id, previous_vessel_id, title, body)
  VALUES (NEW.id, NEW.vessel_id, OLD.vessel_id,
    coalesce(from_name, 'Départ') || ' → ' || coalesce(to_name, 'Arrivée') || CASE WHEN NEW.status = 'cancelled' THEN ' · annulation signalée' ELSE ' · voyage mis à jour' END,
    CASE WHEN NEW.status = 'cancelled' THEN 'La traversée suivie est indiquée comme annulée. Contactez la compagnie pour connaître vos options.'
      ELSE 'Départ prévu le ' || local_departure || ', heure du port. Navire : ' || coalesce(vessel_name, 'à confirmer') || '. Vérifiez les nouvelles informations auprès de la compagnie.' END);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.bw_record_departure_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS bw_departure_change_event ON public.departures;
CREATE TRIGGER bw_departure_change_event AFTER UPDATE OF status, departure_at, vessel_id, route_id, duration_minutes ON public.departures
FOR EACH ROW EXECUTE FUNCTION public.bw_record_departure_change();

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bledway-avatars', 'bledway-avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS bw_avatar_own_insert ON storage.objects;
CREATE POLICY bw_avatar_own_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bledway-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS bw_avatar_own_delete ON storage.objects;
CREATE POLICY bw_avatar_own_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bledway-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

SELECT public.bw_prepare_opening_campaigns();

-- Réutilise le planificateur et les secrets existants si leur installation a déjà été faite.
DO $setup$
DECLARE existing_job bigint; command_text text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
    AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
    AND to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    IF (SELECT count(DISTINCT name) FROM vault.decrypted_secrets WHERE name IN ('bledway_dispatch_url', 'bledway_cron_secret')) = 2 THEN
      command_text := $job$SELECT net.http_get(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bledway_dispatch_url'),
        headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bledway_cron_secret')),
        timeout_milliseconds := 30000
      );$job$;
      SELECT jobid INTO existing_job FROM cron.job WHERE jobname = 'bledway-push-10m' LIMIT 1;
      IF existing_job IS NULL THEN PERFORM cron.schedule('bledway-push-10m', '*/10 * * * *', command_text);
      ELSE PERFORM cron.alter_job(existing_job, schedule := '*/10 * * * *', command := command_text, active := true);
      END IF;
    ELSE RAISE NOTICE 'Planification 10 min : ajouter les secrets bledway_dispatch_url et bledway_cron_secret dans Vault. Le cron Vercel quotidien reste disponible.';
    END IF;
  ELSE RAISE NOTICE 'Planification 10 min : activer pg_cron et pg_net, puis suivre le guide. Le cron Vercel quotidien reste disponible.';
  END IF;
END;
$setup$;
NOTIFY pgrst, 'reload schema';
COMMIT;
