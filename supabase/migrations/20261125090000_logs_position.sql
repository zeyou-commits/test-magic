-- BledWay · Diagnostic de la géolocalisation : ce qui s'est passé sur l'appareil, jamais les coordonnées. Conservé 14 jours.
CREATE TABLE IF NOT EXISTS private.bw_location_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  attempt text,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS bw_location_logs_time ON private.bw_location_logs(created_at DESC);

CREATE OR REPLACE FUNCTION public.bw_log_location(p_attempt text, p_event text, p_detail jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Protège la table : ce journal ne doit jamais grossir sans limite.
  IF (SELECT count(*) FROM private.bw_location_logs WHERE created_at > now() - interval '1 hour') >= 3000 THEN RETURN; END IF;
  IF length(coalesce(p_detail::text, '')) > 2000 THEN RETURN; END IF;
  INSERT INTO private.bw_location_logs(user_id, attempt, event, detail)
  VALUES (auth.uid(), left(p_attempt, 40), left(p_event, 40), coalesce(p_detail, '{}'::jsonb) - 'latitude' - 'longitude' - 'lat' - 'lng');
  DELETE FROM private.bw_location_logs WHERE created_at < now() - interval '14 days';
END $$;
REVOKE ALL ON FUNCTION public.bw_log_location(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_log_location(text, text, jsonb) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
