-- Entraide : une demande n'est acceptée que depuis le port de départ de la traversée, le jour même.
-- La position sert à ce contrôle et n'est jamais enregistrée.
DROP FUNCTION IF EXISTS public.bw_help_open(text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.bw_help_open(
  p_kind text, p_scope uuid, p_need text, p_point text, p_lat double precision, p_lng double precision
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  me uuid := auth.uid();
  new_id uuid;
  port_lat double precision;
  port_lng double precision;
  km double precision;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Connectez-vous pour demander de l''aide'; END IF;
  IF p_kind <> 'departure' THEN RAISE EXCEPTION 'Choisissez votre traversée pour demander de l''aide'; END IF;
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RAISE EXCEPTION 'Partagez votre position pour demander de l''aide';
  END IF;

  SELECT p.latitude, p.longitude INTO port_lat, port_lng
  FROM public.departures d
  JOIN public.routes r ON r.id = d.route_id
  JOIN public.ports p ON p.id = r.departure_port_id
  WHERE d.id = p_scope AND d.status <> 'cancelled'
    AND d.departure_at BETWEEN now() - interval '24 hours' AND now() + interval '24 hours';
  IF port_lat IS NULL THEN
    RAISE EXCEPTION 'L''entraide s''ouvre le jour de la traversée';
  END IF;

  km := 2 * 6371 * asin(sqrt(
    power(sin(radians(p_lat - port_lat) / 2), 2)
    + cos(radians(port_lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - port_lng) / 2), 2)
  ));
  IF km > 6 THEN
    RAISE EXCEPTION 'Vous devez être au port de départ pour demander de l''aide';
  END IF;

  -- Une seule demande ouverte par personne : la nouvelle remplace la précédente.
  UPDATE public.bw_help_requests SET closed_at = now() WHERE user_id = me AND closed_at IS NULL;
  INSERT INTO public.bw_help_requests (user_id, scope_kind, scope_id, need, meeting_point)
  VALUES (me, p_kind, p_scope, p_need, p_point) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

REVOKE ALL ON FUNCTION public.bw_help_open(text, uuid, text, text, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_help_open(text, uuid, text, text, double precision, double precision) TO authenticated;
