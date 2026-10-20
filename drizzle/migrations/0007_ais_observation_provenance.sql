ALTER TABLE public.vessel_positions
  ADD COLUMN IF NOT EXISTS departure_port_id uuid REFERENCES public.ports(id),
  ADD COLUMN IF NOT EXISTS arrival_port_id uuid REFERENCES public.ports(id),
  ADD COLUMN IF NOT EXISTS event_departure_id uuid REFERENCES public.departures(id),
  ADD COLUMN IF NOT EXISTS atd_after timestamptz,
  ADD COLUMN IF NOT EXISTS ata_after timestamptz;
COMMENT ON COLUMN public.vessel_positions.atd_at IS 'First AIS report outside departure port, not exact official departure time';
COMMENT ON COLUMN public.vessel_positions.fetched_at IS 'Refresh attempt/lease timestamp; never a measure of AIS freshness';
CREATE TABLE public.vessel_position_observations (
  mmsi bigint NOT NULL,
  reported_at timestamptz NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  speed_knots double precision,
  course_deg double precision,
  PRIMARY KEY (mmsi, reported_at)
);
GRANT ALL ON public.vessel_position_observations TO service_role;
ALTER TABLE public.vessel_position_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service stores AIS observations" ON public.vessel_position_observations FOR ALL TO service_role USING (true) WITH CHECK (true);