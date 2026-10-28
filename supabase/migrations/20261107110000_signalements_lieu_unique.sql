-- Protection commune à toutes les versions de bw_report_travel, y compris les anciens clients.
-- Aucune coordonnée supplémentaire conservée. Les signalements existants restent intacts.
BEGIN;
CREATE INDEX IF NOT EXISTS bw_travel_alerts_user_recent ON public.bw_travel_alerts(user_id,created_at DESC);
CREATE OR REPLACE FUNCTION private.bw_guard_report_place()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous_port text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
  IF EXISTS(SELECT 1 FROM public.bw_travel_alerts WHERE user_id=NEW.user_id AND created_at>now()-interval '1 minute') THEN
    RAISE EXCEPTION 'Patientez une minute entre deux signalements';
  END IF;
  IF NEW.target_kind='port' THEN
    SELECT p.name INTO previous_port FROM public.bw_travel_alerts a JOIN public.ports p ON p.id=a.target_id
     WHERE a.user_id=NEW.user_id AND a.target_kind='port' AND a.target_id<>NEW.target_id
       AND ((NOT a.resolved AND a.expires_at>now()) OR a.created_at>now()-interval '1 hour')
     ORDER BY a.created_at DESC LIMIT 1;
    IF previous_port IS NOT NULL THEN
      RAISE EXCEPTION 'Vos signalements concernent le port de %. Un seul port à la fois : terminez vos signalements sur place et patientez au moins une heure avant de changer de port.',previous_port;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.bw_guard_report_place() FROM PUBLIC;
DROP TRIGGER IF EXISTS bw_report_place_guard ON public.bw_travel_alerts;
CREATE TRIGGER bw_report_place_guard BEFORE INSERT ON public.bw_travel_alerts FOR EACH ROW EXECUTE FUNCTION private.bw_guard_report_place();
NOTIFY pgrst,'reload schema';
COMMIT;
