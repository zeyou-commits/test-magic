-- Durées standard par ligne : les imports avaient perdu le « lendemain » (2 h au lieu de 26 h).
-- Sauvegarde, durée de référence de chaque ligne, correction des départs, puis garde-fou permanent.
-- Aucun voyageur n'est notifié : ce rattrapage ne change ni l'heure de départ ni le navire.

CREATE TABLE IF NOT EXISTS public.bw_backup_durees_20261113 (
  kind text NOT NULL,
  id uuid NOT NULL,
  data jsonb NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bw_backup_durees_20261113 ENABLE ROW LEVEL SECURITY;

INSERT INTO public.bw_backup_durees_20261113 (kind, id, data)
SELECT 'route', r.id, to_jsonb(r.*) FROM public.routes r;
INSERT INTO public.bw_backup_durees_20261113 (kind, id, data)
SELECT 'departure', d.id, to_jsonb(d.*) FROM public.departures d
WHERE d.departure_at >= now() - interval '3 days' OR d.source_name = 'Données de démonstration';

ALTER TABLE public.departures DISABLE TRIGGER bw_departure_change_event;

-- Les 19 départs de démonstration ne sont pas de vrais départs.
DELETE FROM public.departures WHERE source_name = 'Données de démonstration';

-- Durée de référence : la durée la plus fréquente parmi les valeurs plausibles de la ligne.
WITH reference AS (
  SELECT r.id, greatest(r.typical_duration_minutes, rev.typical_duration_minutes) AS ref
  FROM public.routes r
  LEFT JOIN public.routes rev
    ON rev.departure_port_id = r.arrival_port_id AND rev.arrival_port_id = r.departure_port_id
), plausible AS (
  SELECT d.route_id, round(extract(epoch FROM d.arrival_at - d.departure_at) / 60)::int AS minutes
  FROM public.departures d JOIN reference x ON x.id = d.route_id
  WHERE d.departure_at >= now() - interval '60 days'
    AND extract(epoch FROM d.arrival_at - d.departure_at) / 60 BETWEEN x.ref * 0.7 AND x.ref * 1.4
), standard AS (
  SELECT x.id, coalesce(
    (SELECT mode() WITHIN GROUP (ORDER BY p.minutes) FROM plausible p WHERE p.route_id = x.id),
    x.ref) AS minutes
  FROM reference x
)
UPDATE public.routes r SET typical_duration_minutes = s.minutes
FROM standard s WHERE s.id = r.id AND s.minutes IS NOT NULL;

-- Départs hors plage : durée habituelle de la compagnie sur la ligne, sinon durée de la ligne.
WITH measured AS (
  SELECT d.id, d.route_id, d.company_id, d.departure_at, r.typical_duration_minutes AS typical,
    round(extract(epoch FROM d.arrival_at - d.departure_at) / 60)::int AS minutes
  FROM public.departures d JOIN public.routes r ON r.id = d.route_id
  WHERE d.departure_at >= now() - interval '60 days' AND r.typical_duration_minutes IS NOT NULL
), company_standard AS (
  SELECT route_id, company_id, mode() WITHIN GROUP (ORDER BY minutes) AS minutes
  FROM measured WHERE minutes BETWEEN typical * 0.7 AND typical * 1.25
  GROUP BY route_id, company_id
), target AS (
  SELECT m.id, m.departure_at, coalesce(c.minutes, m.typical) AS minutes
  FROM measured m
  LEFT JOIN company_standard c ON c.route_id = m.route_id AND c.company_id = m.company_id
  WHERE m.departure_at >= now() - interval '3 days'
    AND (m.minutes IS NULL OR m.minutes NOT BETWEEN m.typical * 0.7 AND m.typical * 1.25)
)
UPDATE public.departures d
SET duration_minutes = t.minutes, arrival_at = t.departure_at + make_interval(mins => t.minutes)
FROM target t WHERE t.id = d.id;

-- Les durées restantes suivent l'arrivée réelle, pour que les deux champs disent la même chose.
UPDATE public.departures
SET duration_minutes = round(extract(epoch FROM arrival_at - departure_at) / 60)::int
WHERE departure_at >= now() - interval '3 days' AND arrival_at IS NOT NULL
  AND duration_minutes IS DISTINCT FROM round(extract(epoch FROM arrival_at - departure_at) / 60)::int;

ALTER TABLE public.departures ENABLE TRIGGER bw_departure_change_event;

-- Garde-fou : aucune entrée (import, saisie, programme) ne publie une durée hors plage.
CREATE OR REPLACE FUNCTION public.bw_standardize_departure_duration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  typical int;
  minutes numeric;
BEGIN
  SELECT r.typical_duration_minutes INTO typical FROM public.routes r WHERE r.id = NEW.route_id;
  IF typical IS NULL THEN RETURN NEW; END IF;
  minutes := CASE
    WHEN NEW.arrival_at IS NOT NULL THEN extract(epoch FROM NEW.arrival_at - NEW.departure_at) / 60
    ELSE NEW.duration_minutes END;
  IF minutes IS NULL OR minutes < typical * 0.7 OR minutes > typical * 1.25 THEN
    NEW.duration_minutes := typical;
    NEW.arrival_at := NEW.departure_at + make_interval(mins => typical);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bw_departure_standard_duration ON public.departures;
CREATE TRIGGER bw_departure_standard_duration
  BEFORE INSERT OR UPDATE OF route_id, departure_at, arrival_at, duration_minutes ON public.departures
  FOR EACH ROW EXECUTE FUNCTION public.bw_standardize_departure_duration();
