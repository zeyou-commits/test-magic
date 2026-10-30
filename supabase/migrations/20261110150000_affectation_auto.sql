-- BledWay · Affectation automatique des navires : réglage par compagnie, règles actives et journal
-- (chaque passage automatique est annulable). Aucune donnée existante n'est modifiée par ce script.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

-- 1. Mode par compagnie : auto (affecté seul), suggest (proposé dans « Aujourd'hui »), manual (rien).
--    Une compagnie sans ligne ici est en « suggest ».
CREATE TABLE IF NOT EXISTS public.bw_assign_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'suggest' CHECK (mode IN ('auto','suggest','manual')),
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Réglages généraux de l'espace équipe (ici : règles d'affectation actives).
CREATE TABLE IF NOT EXISTS public.bw_admin_settings (
  key text PRIMARY KEY CHECK (char_length(key) BETWEEN 1 AND 60),
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Journal : chaque passage automatique, avec ce qu'il a affecté.
CREATE TABLE IF NOT EXISTS public.bw_assign_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin','cron','import')),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bw_assign_settings','bw_admin_settings','bw_assign_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_staff', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING ((SELECT private.bw_staff_permission(ARRAY[''admin'',''editor'']))) WITH CHECK ((SELECT private.bw_staff_permission(ARRAY[''admin'',''editor''])))', t || '_staff', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- 4. Annuler un passage : les bateaux affectés sont retirés, sauf ceux changés depuis à la main.
CREATE OR REPLACE FUNCTION public.bw_admin_undo_assign(p_log uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.bw_assign_log; n integer;
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin','editor']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO l FROM public.bw_assign_log WHERE id = p_log FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Passage introuvable'; END IF;
  IF l.undone_at IS NOT NULL THEN RAISE EXCEPTION 'Déjà annulé'; END IF;
  UPDATE public.departures d SET vessel_id = NULL
  FROM jsonb_to_recordset(l.items) AS x(departure_id uuid, vessel_id uuid)
  WHERE d.id = x.departure_id AND d.vessel_id = x.vessel_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.bw_assign_log SET undone_at = now() WHERE id = p_log;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.bw_admin_undo_assign(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_admin_undo_assign(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
