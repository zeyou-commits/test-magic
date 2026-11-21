-- Rôles et droits : l'administrateur affine, à l'intérieur du cadre de chaque rôle, les rubriques
-- ouvertes à l'éditeur et au modérateur, et choisit leur page d'arrivée.
-- Le cadre lui-même (ce que la base permet à chaque rôle) ne change pas ici.
BEGIN;

CREATE TABLE IF NOT EXISTS public.bw_staff_role_config (
  role text PRIMARY KEY CHECK (role IN ('editor','moderator')),
  removed_tabs text[] NOT NULL DEFAULT '{}' CHECK (cardinality(removed_tabs) <= 60),
  home_tab text CHECK (home_tab IS NULL OR char_length(home_tab) BETWEEN 1 AND 40),
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bw_staff_role_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_staff_role_config FROM anon, authenticated;
GRANT SELECT ON public.bw_staff_role_config TO authenticated;
GRANT ALL ON public.bw_staff_role_config TO service_role;

-- Toute l'équipe lit le réglage (pour son propre menu) ; personne n'écrit en direct.
DROP POLICY IF EXISTS bw_staff_role_config_read ON public.bw_staff_role_config;
CREATE POLICY bw_staff_role_config_read ON public.bw_staff_role_config FOR SELECT TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor','moderator'])));

-- Écriture : administrateur seulement, tracée dans le journal d'administration.
CREATE OR REPLACE FUNCTION public.bw_admin_set_role_config(p_role text, p_removed text[], p_home text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE before public.bw_staff_role_config;
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin']) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('editor','moderator') THEN RAISE EXCEPTION 'Rôle inconnu'; END IF;
  SELECT * INTO before FROM public.bw_staff_role_config WHERE role = p_role;
  INSERT INTO public.bw_staff_role_config(role, removed_tabs, home_tab, updated_by, updated_at)
  VALUES (p_role, coalesce(p_removed, '{}'), nullif(p_home, ''), auth.uid(), now())
  ON CONFLICT (role) DO UPDATE SET removed_tabs = excluded.removed_tabs,
    home_tab = excluded.home_tab, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  INSERT INTO public.bw_user_admin_log(actor_id, target_id, action, details)
  VALUES (auth.uid(), NULL, 'role_config', jsonb_build_object(
    'role', p_role,
    'removed_before', coalesce(before.removed_tabs, '{}'),
    'removed_after', coalesce(p_removed, '{}'),
    'home_before', before.home_tab,
    'home_after', nullif(p_home, '')));
END $$;
REVOKE ALL ON FUNCTION public.bw_admin_set_role_config(text, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_admin_set_role_config(text, text[], text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
