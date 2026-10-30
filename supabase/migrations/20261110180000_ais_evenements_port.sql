-- BledWay · Suivi AIS : colonnes et table utilisées par le code mais jamais créées sur la base
-- de référence. Sans elles, l'heure réelle de départ (ATD) et d'arrivée (ATA) n'était jamais
-- enregistrée, et l'heure d'arrivée estimée ne pouvait pas s'appuyer sur le départ réel.
-- Ajout seulement : aucune donnée existante n'est modifiée. Peut être relancé sans risque.
BEGIN;

-- 1. Événements de port sur la dernière position connue de chaque navire.
ALTER TABLE public.vessel_positions
  ADD COLUMN IF NOT EXISTS atd_at timestamptz,
  ADD COLUMN IF NOT EXISTS ata_at timestamptz,
  ADD COLUMN IF NOT EXISTS atd_after timestamptz,
  ADD COLUMN IF NOT EXISTS ata_after timestamptz,
  ADD COLUMN IF NOT EXISTS last_port_id uuid REFERENCES public.ports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS departure_port_id uuid REFERENCES public.ports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS arrival_port_id uuid REFERENCES public.ports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_departure_id uuid REFERENCES public.departures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS destination text,
  ADD COLUMN IF NOT EXISTS eta text;

-- 2. Historique horodaté des positions reçues (écrit uniquement par le serveur).
CREATE TABLE IF NOT EXISTS public.vessel_position_observations (
  mmsi bigint NOT NULL,
  reported_at timestamptz NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  speed_knots double precision,
  course_deg double precision,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mmsi, reported_at)
);
CREATE INDEX IF NOT EXISTS vessel_position_observations_recent ON public.vessel_position_observations (reported_at DESC);
ALTER TABLE public.vessel_position_observations ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.vessel_position_observations TO service_role;

-- 3. Ménage automatique : on garde 60 jours d'historique (si pg_cron est activé).
DO $setup$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bledway-ais-observations-purge') THEN
      PERFORM cron.schedule('bledway-ais-observations-purge', '17 4 * * *',
        $job$DELETE FROM public.vessel_position_observations WHERE reported_at < now() - interval '60 days'$job$);
    END IF;
  END IF;
END
$setup$;

NOTIFY pgrst, 'reload schema';
COMMIT;
