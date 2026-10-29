-- Un voyage peut commencer par l'aller ou être créé uniquement pour le retour.
ALTER TABLE public.bw_follows
  ADD COLUMN IF NOT EXISTS follow_purpose text;
UPDATE public.bw_follows
SET follow_purpose = CASE WHEN traveller THEN 'voyageur' ELSE 'curieux' END
WHERE follow_purpose IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bw_follows_purpose_valid') THEN
    ALTER TABLE public.bw_follows
      ADD CONSTRAINT bw_follows_purpose_valid CHECK (follow_purpose IN ('voyageur', 'proche', 'curieux'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.bw_journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outbound_departure_id uuid REFERENCES public.departures(id) ON DELETE SET NULL,
  inbound_departure_id uuid REFERENCES public.departures(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bw_journeys_different_legs CHECK (outbound_departure_id IS DISTINCT FROM inbound_departure_id),
  CONSTRAINT bw_journeys_outbound_unique UNIQUE (user_id, outbound_departure_id),
  CONSTRAINT bw_journeys_inbound_unique UNIQUE (user_id, inbound_departure_id)
);
CREATE INDEX IF NOT EXISTS bw_journeys_user ON public.bw_journeys(user_id, created_at DESC);
ALTER TABLE public.bw_journeys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bw_journeys_own_select ON public.bw_journeys;
DROP POLICY IF EXISTS bw_journeys_own_insert ON public.bw_journeys;
DROP POLICY IF EXISTS bw_journeys_own_update ON public.bw_journeys;
DROP POLICY IF EXISTS bw_journeys_own_delete ON public.bw_journeys;
CREATE POLICY bw_journeys_own_select ON public.bw_journeys FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY bw_journeys_own_insert ON public.bw_journeys FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY bw_journeys_own_update ON public.bw_journeys FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY bw_journeys_own_delete ON public.bw_journeys FOR DELETE TO authenticated USING (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bw_journeys TO authenticated;
GRANT ALL ON public.bw_journeys TO service_role;
NOTIFY pgrst, 'reload schema';
