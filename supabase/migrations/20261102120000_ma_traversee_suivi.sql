-- BledWay · « Ma traversée » rattachée au suivi, et étapes (cabas) modifiables dans l'admin.
-- Script additif : aucune donnée existante n'est modifiée ni supprimée, il peut être relancé.
BEGIN;

-- 1. Un suivi de traversée peut être « je voyage » (Ma traversée) ou « je suis un proche ».
ALTER TABLE public.bw_follows ADD COLUMN IF NOT EXISTS traveller boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS bw_follows_my_trips ON public.bw_follows(user_id)
  WHERE active AND traveller AND target_kind = 'departure';

-- 2. Les 4 étapes de « Ma traversée » : libellés et illustration modifiables, codes fixes.
CREATE TABLE IF NOT EXISTS public.bw_trip_steps (
  code text PRIMARY KEY CHECK (code IN ('en_route','port','onboard','arrived')),
  label text NOT NULL CHECK (char_length(label) BETWEEN 2 AND 60),
  short_label text NOT NULL CHECK (char_length(short_label) BETWEEN 2 AND 20),
  image text NOT NULL CHECK (image ~ '^/cabas/[a-z0-9_/-]+\.webp$'),
  sort integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.bw_trip_steps(code, label, short_label, image, sort) VALUES
  ('en_route', 'En route vers le port', 'En route', '/cabas/statut-en-route.webp', 10),
  ('port', 'Au port', 'Au port', '/cabas/statut-au-port.webp', 20),
  ('onboard', 'À bord', 'À bord', '/cabas/statut-a-bord.webp', 30),
  ('arrived', 'Arrivé', 'Arrivé', '/cabas/statut-arrive.webp', 40)
ON CONFLICT (code) DO NOTHING;
ALTER TABLE public.bw_trip_steps ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.bw_trip_steps TO anon, authenticated;
GRANT UPDATE ON public.bw_trip_steps TO authenticated;
GRANT ALL ON public.bw_trip_steps TO service_role;
DROP POLICY IF EXISTS bw_trip_steps_read ON public.bw_trip_steps;
CREATE POLICY bw_trip_steps_read ON public.bw_trip_steps FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS bw_trip_steps_staff ON public.bw_trip_steps;
CREATE POLICY bw_trip_steps_staff ON public.bw_trip_steps FOR UPDATE TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])))
  WITH CHECK ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));

NOTIFY pgrst, 'reload schema';
COMMIT;
