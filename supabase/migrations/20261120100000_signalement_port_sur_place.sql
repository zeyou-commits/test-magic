-- Un signalement de port n'existe que sur place : position disponible et à moins de 3 km (private.bw_on_site).
-- Contrôlé à l'écriture, quelle que soit la fonction appelée.
CREATE OR REPLACE FUNCTION private.bw_guard_port_alert()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.target_kind = 'port' AND NOT NEW.on_site THEN
    RAISE EXCEPTION 'Pour signaler au port, il faut être sur place, à moins de 3 km, localisation activée.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bw_travel_alert_port_guard ON public.bw_travel_alerts;
CREATE TRIGGER bw_travel_alert_port_guard
  BEFORE INSERT ON public.bw_travel_alerts
  FOR EACH ROW EXECUTE FUNCTION private.bw_guard_port_alert();
