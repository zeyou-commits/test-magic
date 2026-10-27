-- BledWay · « Ma traversée » : statut de voyage en un toucher (en route, au port, à bord, arrivé),
-- et note globale des avis sur les ports.
-- Confidentialité : le statut de chacun n'est lisible que par lui-même ; le public ne voit que des
-- compteurs anonymes (« 23 à bord »), jamais qui. Aucune position n'est enregistrée.
-- Script additif : aucune donnée existante n'est modifiée ni supprimée, il peut être relancé.
BEGIN;

-- 1. Note globale des avis (masquée de la liste des critères détaillés).
INSERT INTO public.rating_criteria (slug, label, sort_order, status)
VALUES ('global', 'Note globale', 0, 'inactive')
ON CONFLICT (slug) DO NOTHING;

-- 2. Statut de voyage : un par voyageur et par traversée.
CREATE TABLE IF NOT EXISTS public.bw_trip_status (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  departure_id uuid NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('en_route','port','onboard','arrived')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, departure_id)
);
CREATE INDEX IF NOT EXISTS bw_trip_status_departure ON public.bw_trip_status(departure_id, status);
ALTER TABLE public.bw_trip_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_trip_status FROM anon, authenticated;
GRANT SELECT ON public.bw_trip_status TO authenticated;
GRANT ALL ON public.bw_trip_status TO service_role;
DROP POLICY IF EXISTS bw_trip_status_own_read ON public.bw_trip_status;
CREATE POLICY bw_trip_status_own_read ON public.bw_trip_status FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 3. Choisir (ou retirer, avec NULL) son statut. Possible de la veille au lendemain de la traversée.
CREATE OR REPLACE FUNCTION public.bw_set_trip_status(p_departure uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d public.departures;
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  SELECT * INTO d FROM public.departures WHERE id = p_departure;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traversée introuvable'; END IF;
  IF p_status IS NULL THEN
    DELETE FROM public.bw_trip_status WHERE user_id = auth.uid() AND departure_id = p_departure;
    RETURN;
  END IF;
  IF p_status NOT IN ('en_route','port','onboard','arrived') THEN RAISE EXCEPTION 'Statut inconnu'; END IF;
  IF d.departure_at < now() - interval '3 days' OR d.departure_at > now() + interval '36 hours' THEN
    RAISE EXCEPTION 'Le statut s’active la veille de la traversée';
  END IF;
  INSERT INTO public.bw_trip_status(user_id, departure_id, status) VALUES (auth.uid(), p_departure, p_status)
  ON CONFLICT (user_id, departure_id) DO UPDATE SET status = excluded.status, updated_at = now();
END $$;

-- 4. Compteurs anonymes des traversées en cours (statuts mis à jour depuis moins de 24 h).
--    Une ligne par traversée : navire, ports, et nombre de voyageurs par étape.
CREATE OR REPLACE FUNCTION public.bw_trip_presence()
RETURNS TABLE (departure_id uuid, vessel_id uuid, departure_port_id uuid, arrival_port_id uuid,
               en_route integer, at_port integer, onboard integer, arrived integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT d.id, d.vessel_id, r.departure_port_id, r.arrival_port_id,
         count(*) FILTER (WHERE s.status = 'en_route')::integer,
         count(*) FILTER (WHERE s.status = 'port')::integer,
         count(*) FILTER (WHERE s.status = 'onboard')::integer,
         count(*) FILTER (WHERE s.status = 'arrived')::integer
  FROM public.bw_trip_status s
  JOIN public.departures d ON d.id = s.departure_id
  JOIN public.routes r ON r.id = d.route_id
  WHERE s.updated_at > now() - interval '24 hours'
    AND d.departure_at BETWEEN now() - interval '3 days' AND now() + interval '36 hours'
  GROUP BY d.id, d.vessel_id, r.departure_port_id, r.arrival_port_id;
$$;

REVOKE ALL ON FUNCTION public.bw_set_trip_status(uuid,text), public.bw_trip_presence() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_set_trip_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bw_trip_presence() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
