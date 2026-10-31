-- Parcours de préparation d'une traversée, lié au compte.
CREATE TABLE IF NOT EXISTS public.bw_trip_preparation (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  departure_id uuid NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  done text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, departure_id)
);
ALTER TABLE public.bw_trip_preparation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bw_trip_preparation_own ON public.bw_trip_preparation;
CREATE POLICY bw_trip_preparation_own ON public.bw_trip_preparation
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bw_trip_preparation TO authenticated;

-- Réactions sur un navire, une compagnie ou un port : une seule par compte et par cible.
CREATE TABLE IF NOT EXISTS public.bw_place_reactions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_kind text NOT NULL CHECK (target_kind IN ('vessel','company','port')),
  target_id uuid NOT NULL,
  code text NOT NULL CHECK (code IN ('like','love','haha','wow','sad','angry')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_kind, target_id)
);
CREATE INDEX IF NOT EXISTS bw_place_reactions_target ON public.bw_place_reactions (target_kind, target_id);
ALTER TABLE public.bw_place_reactions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bw_place_reaction_counts(p_kind text, p_target uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'counts', coalesce((SELECT jsonb_object_agg(code, n) FROM (
      SELECT code, count(*)::integer AS n FROM public.bw_place_reactions
      WHERE target_kind = p_kind AND target_id = p_target GROUP BY code) c), '{}'::jsonb),
    'mine', (SELECT code FROM public.bw_place_reactions
      WHERE target_kind = p_kind AND target_id = p_target AND user_id = auth.uid()))
$$;
GRANT EXECUTE ON FUNCTION public.bw_place_reaction_counts(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.bw_place_react(p_kind text, p_target uuid, p_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  IF NOT ((p_kind = 'vessel' AND EXISTS(SELECT 1 FROM public.vessels WHERE id = p_target AND status = 'active'))
       OR (p_kind = 'port' AND EXISTS(SELECT 1 FROM public.ports WHERE id = p_target AND status = 'active'))
       OR (p_kind = 'company' AND EXISTS(SELECT 1 FROM public.companies WHERE id = p_target AND status = 'active'))) THEN
    RAISE EXCEPTION 'Lieu, navire ou compagnie introuvable';
  END IF;
  IF p_code IS NULL THEN
    DELETE FROM public.bw_place_reactions WHERE user_id = auth.uid() AND target_kind = p_kind AND target_id = p_target;
  ELSE
    INSERT INTO public.bw_place_reactions(user_id, target_kind, target_id, code)
    VALUES (auth.uid(), p_kind, p_target, p_code)
    ON CONFLICT (user_id, target_kind, target_id) DO UPDATE SET code = excluded.code, created_at = now();
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.bw_place_react(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_place_react(text, uuid, text) TO authenticated;
