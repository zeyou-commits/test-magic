-- « Vérifié en mer » : la personne dit qu'elle est à bord, et peut, si elle le veut, le confirmer
-- avec sa position. Le serveur compare cette position à la dernière position connue du navire
-- (moins de 3 h, 15 km, comme les signalements « sur place ») et garde SEULEMENT le résultat :
-- vérifié ou non. Aucune coordonnée n'est enregistrée.
BEGIN;

-- 1. Le résultat, une ligne par voyageur et par traversée.
CREATE TABLE IF NOT EXISTS public.bw_at_sea_checks (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  departure_id uuid NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  verified boolean NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, departure_id)
);
CREATE INDEX IF NOT EXISTS bw_at_sea_checks_departure ON public.bw_at_sea_checks(departure_id) WHERE verified;
ALTER TABLE public.bw_at_sea_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_at_sea_checks FROM anon, authenticated;
GRANT SELECT ON public.bw_at_sea_checks TO authenticated;
GRANT ALL ON public.bw_at_sea_checks TO service_role;
DROP POLICY IF EXISTS bw_at_sea_checks_own_read ON public.bw_at_sea_checks;
CREATE POLICY bw_at_sea_checks_own_read ON public.bw_at_sea_checks FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2. La vérification. Position arrondie à ~100 m côté appli, utilisée ici puis oubliée.
CREATE OR REPLACE FUNCTION public.bw_confirm_at_sea(p_departure uuid, p_lat double precision, p_lng double precision)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  d public.departures;
  ok boolean := false;
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  SELECT * INTO d FROM public.departures WHERE id = p_departure;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traversée introuvable'; END IF;
  -- Seulement pendant la traversée (même fenêtre que les signalements en cours de route).
  IF now() < d.departure_at - interval '1 hour'
     OR now() > coalesce(d.arrival_at, d.departure_at + interval '48 hours') + interval '2 hours' THEN
    RAISE EXCEPTION 'La traversée n’est pas en cours';
  END IF;
  -- Une vérification toutes les 2 minutes au plus.
  IF EXISTS (
    SELECT 1 FROM public.bw_at_sea_checks
    WHERE user_id = auth.uid() AND departure_id = p_departure AND checked_at > now() - interval '2 minutes'
  ) THEN
    RAISE EXCEPTION 'Réessayez dans deux minutes';
  END IF;
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL AND abs(p_lat) <= 90 AND abs(p_lng) <= 180
     AND d.vessel_id IS NOT NULL THEN
    -- Près du navire, d'après sa position récente…
    SELECT EXISTS (
      SELECT 1 FROM public.vessel_positions vp JOIN public.vessels v ON v.mmsi = vp.mmsi
      WHERE v.id = d.vessel_id AND vp.latitude IS NOT NULL AND vp.reported_at > now() - interval '3 hours'
        AND private.bw_km(p_lat, p_lng, vp.latitude, vp.longitude) <= 15
    ) INTO ok;
    -- … et pas à quai : à plus de 3 km des deux ports de la ligne.
    IF ok THEN
      ok := NOT EXISTS (
        SELECT 1 FROM public.routes r
        JOIN public.ports pt ON pt.id IN (r.departure_port_id, r.arrival_port_id)
        WHERE r.id = d.route_id AND private.bw_km(p_lat, p_lng, pt.latitude, pt.longitude) <= 3
      );
    END IF;
  END IF;
  -- Une fois vérifié, le badge reste pour cette traversée.
  INSERT INTO public.bw_at_sea_checks(user_id, departure_id, verified)
  VALUES (auth.uid(), p_departure, ok)
  ON CONFLICT (user_id, departure_id)
  DO UPDATE SET verified = public.bw_at_sea_checks.verified OR excluded.verified, checked_at = now();
  RETURN jsonb_build_object('verified', ok);
END $$;

-- 3. Pour afficher la coche dans le salon (étape suivante) : qui est vérifié en mer sur une traversée.
--    Seulement les identifiants, jamais d'heure ni de position.
CREATE OR REPLACE FUNCTION public.bw_at_sea_verified(p_departure uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.user_id FROM public.bw_at_sea_checks c
  WHERE c.departure_id = p_departure AND c.verified;
$$;

REVOKE ALL ON FUNCTION public.bw_confirm_at_sea(uuid, double precision, double precision),
  public.bw_at_sea_verified(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_confirm_at_sea(uuid, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bw_at_sea_verified(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
