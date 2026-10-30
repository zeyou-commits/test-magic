-- Une alerte Flash sur un navire vit tant que son dossier est ouvert, et se lève avec lui.
UPDATE public.bw_news n SET ends_at = NULL
WHERE n.kind = 'alerte' AND n.published AND n.vessel_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.bw_vessel_incidents i
    WHERE i.vessel_id = n.vessel_id AND i.status IN ('reported', 'verifying', 'confirmed')
  );

CREATE OR REPLACE FUNCTION public.bw_close_incident_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status IN ('resolved', 'rejected') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.bw_news SET ends_at = now()
    WHERE kind = 'alerte' AND published AND vessel_id = NEW.vessel_id
      AND (ends_at IS NULL OR ends_at > now());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bw_incident_closes_alerts ON public.bw_vessel_incidents;
CREATE TRIGGER bw_incident_closes_alerts
  AFTER UPDATE OF status ON public.bw_vessel_incidents
  FOR EACH ROW EXECUTE FUNCTION public.bw_close_incident_alerts();

-- Mesure d'usage : ni compte, ni adresse IP, ni cookie. Seulement un événement, une page, un jour.
CREATE TABLE IF NOT EXISTS public.bw_usage_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Paris')::date,
  event text NOT NULL CHECK (event IN ('page_view', 'search_results', 'search_choice', 'booking_click')),
  path text NOT NULL CHECK (char_length(path) <= 120),
  detail text CHECK (char_length(detail) <= 60)
);
CREATE INDEX IF NOT EXISTS bw_usage_events_day ON public.bw_usage_events (day, event);
ALTER TABLE public.bw_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tout visiteur ajoute un événement" ON public.bw_usage_events;
CREATE POLICY "Tout visiteur ajoute un événement" ON public.bw_usage_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Les administrateurs lisent la mesure" ON public.bw_usage_events;
CREATE POLICY "Les administrateurs lisent la mesure" ON public.bw_usage_events
  FOR SELECT TO authenticated USING (private.bw_staff_permission(ARRAY['admin']));

GRANT INSERT ON public.bw_usage_events TO anon, authenticated;
GRANT SELECT ON public.bw_usage_events TO authenticated;

-- Les compagnies d'une ligne se déduisent des traversées réelles.
INSERT INTO public.route_operators (route_id, company_id)
SELECT DISTINCT d.route_id, d.company_id FROM public.departures d
WHERE d.departure_at >= now() AND d.status <> 'cancelled'
  AND NOT EXISTS (
    SELECT 1 FROM public.route_operators o
    WHERE o.route_id = d.route_id AND o.company_id = d.company_id
  );

-- Noms de navires : même écriture partout.
UPDATE public.vessels SET name = 'Almariya' WHERE name = 'ALMARIYA';
UPDATE public.vessels SET name = 'Regina Baltica' WHERE name = 'REGINA BALTICA';
UPDATE public.vessels SET name = 'Rosalind Franklin' WHERE name = 'ROSALIND FRANKLIN';
UPDATE public.bw_news SET title = replace(title, 'Tariq ibn Ziyad', 'Tariq Ibn Ziyad')
WHERE title LIKE '%Tariq ibn Ziyad%';
