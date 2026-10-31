-- BledWay · Un signalement validé par l'équipe agit sur la traversée, et survit à l'expiration de l'alerte.
ALTER TABLE public.departures
  ADD COLUMN IF NOT EXISTS reported_quay_at timestamptz,
  ADD COLUMN IF NOT EXISTS reported_departed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reported_arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS reported_delay_minutes integer,
  ADD COLUMN IF NOT EXISTS reported_postponed_at timestamptz;

COMMENT ON COLUMN public.departures.reported_quay_at IS 'Dernier signalement validé plaçant le navire à quai (son horodatage).';
COMMENT ON COLUMN public.departures.reported_departed_at IS 'Dernier signalement validé de départ.';
COMMENT ON COLUMN public.departures.reported_arrived_at IS 'Premier signalement validé de débarquement.';
COMMENT ON COLUMN public.departures.reported_delay_minutes IS 'Retard du dernier signalement validé.';
COMMENT ON COLUMN public.departures.reported_postponed_at IS 'Report ou annulation signalé et validé : rien n''est confirmé.';

-- Recalcul complet : retirer un signalement validé par erreur rend les horaires précédents.
CREATE OR REPLACE FUNCTION private.bw_sync_departure_reports(p_departure uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  UPDATE public.departures d SET
    reported_quay_at = r.quay,
    reported_departed_at = r.departed,
    reported_arrived_at = r.arrived,
    reported_delay_minutes = r.delay,
    reported_postponed_at = r.postponed
  FROM (
    SELECT
      max(a.created_at) FILTER (WHERE a.detail = 'state_quay' OR a.category = 'boarding') AS quay,
      max(a.created_at) FILTER (WHERE a.detail = 'state_departed') AS departed,
      min(a.created_at) FILTER (WHERE a.category = 'disembarking') AS arrived,
      (array_agg(a.delay_minutes ORDER BY a.created_at DESC)
        FILTER (WHERE a.category = 'delay' AND a.delay_minutes IS NOT NULL))[1] AS delay,
      max(a.created_at) FILTER (WHERE a.detail = 'delay_postponed') AS postponed
    FROM public.bw_travel_alerts a
    WHERE a.departure_id = p_departure
      AND a.target_kind = 'vessel'
      AND a.validated_at IS NOT NULL
      AND NOT a.resolved
  ) r
  WHERE d.id = p_departure;
$$;
REVOKE ALL ON FUNCTION private.bw_sync_departure_reports(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.bw_travel_alert_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.departure_id IS NOT NULL AND NEW.validated_at IS NOT NULL THEN
    PERFORM private.bw_sync_departure_reports(NEW.departure_id);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.bw_travel_alert_sync() FROM PUBLIC;

DROP TRIGGER IF EXISTS bw_travel_alert_sync ON public.bw_travel_alerts;
CREATE TRIGGER bw_travel_alert_sync
  AFTER INSERT OR UPDATE OF validated_at, resolved ON public.bw_travel_alerts
  FOR EACH ROW EXECUTE FUNCTION private.bw_travel_alert_sync();

-- Les signalements déjà validés prennent effet tout de suite.
SELECT private.bw_sync_departure_reports(x.departure_id)
FROM (
  SELECT DISTINCT departure_id FROM public.bw_travel_alerts
  WHERE departure_id IS NOT NULL AND validated_at IS NOT NULL
) x;
