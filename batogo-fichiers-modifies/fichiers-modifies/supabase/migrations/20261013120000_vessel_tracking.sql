-- Suivi en direct des navires (positions AIS)
--
-- 1) Identifiant MMSI du navire (9 chiffres), saisi dans le back-office (onglet « Navires »).
-- 2) Table de cache des dernières positions : elle est écrite uniquement par le serveur
--    (clé de service), lue par tout le monde. Une position n'est jamais redemandée à
--    l'API tant qu'elle a moins de 20 minutes.

ALTER TABLE public.vessels
  ADD COLUMN IF NOT EXISTS mmsi bigint;

ALTER TABLE public.vessels
  DROP CONSTRAINT IF EXISTS vessels_mmsi_format;
ALTER TABLE public.vessels
  ADD CONSTRAINT vessels_mmsi_format CHECK (mmsi IS NULL OR (mmsi >= 100000000 AND mmsi <= 999999999));

CREATE UNIQUE INDEX IF NOT EXISTS vessels_mmsi_unique ON public.vessels (mmsi) WHERE mmsi IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.vessel_positions (
  mmsi bigint PRIMARY KEY,
  vessel_name text,
  status text,
  latitude double precision,
  longitude double precision,
  speed_knots double precision,
  course_deg double precision,
  reported_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT to_timestamp(0),
  last_error text
);

ALTER TABLE public.vessel_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vessel_positions_public_read" ON public.vessel_positions;
CREATE POLICY "vessel_positions_public_read"
  ON public.vessel_positions FOR SELECT
  TO anon, authenticated
  USING (true);

-- Aucune politique d'écriture : seules les fonctions serveur (clé de service) peuvent écrire.
