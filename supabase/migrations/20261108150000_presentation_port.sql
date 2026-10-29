-- Consigne de présentation en minutes avant le départ, fournie par la compagnie.
-- NULL : BledWay affiche un repère de préparation de 4 h, clairement indiqué comme indicatif.
ALTER TABLE public.departures
  ADD COLUMN IF NOT EXISTS presentation_minutes integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departures_presentation_minutes_range') THEN
    ALTER TABLE public.departures
      ADD CONSTRAINT departures_presentation_minutes_range
      CHECK (presentation_minutes IS NULL OR presentation_minutes BETWEEN 30 AND 720);
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
