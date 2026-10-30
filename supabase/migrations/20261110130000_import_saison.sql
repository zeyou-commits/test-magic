-- BledWay · Import de saison (par compagnie) : correspondances de noms retenues, publication
-- en une seule fois et annulation d'un import pendant 30 jours.
-- Aucune donnée existante n'est modifiée par ce script : il ajoute deux tables et deux fonctions.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

-- 1. Correspondances retenues : « Trasmed » → Naviera Armas - Trasmediterránea, etc.
CREATE TABLE IF NOT EXISTS public.bw_import_aliases (
  kind text NOT NULL CHECK (kind IN ('port','company','vessel')),
  raw_key text NOT NULL CHECK (char_length(raw_key) BETWEEN 1 AND 120),
  target_id uuid NOT NULL,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, raw_key)
);
ALTER TABLE public.bw_import_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bw_import_aliases_staff ON public.bw_import_aliases;
CREATE POLICY bw_import_aliases_staff ON public.bw_import_aliases FOR ALL TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])))
  WITH CHECK ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bw_import_aliases TO authenticated;

-- 2. Lots d'import : ce qui a été créé, et l'état d'avant de ce qui a été modifié ou annulé.
CREATE TABLE IF NOT EXISTS public.bw_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL DEFAULT '',
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  scope_from timestamptz,
  scope_to timestamptz,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  inserted uuid[] NOT NULL DEFAULT '{}',
  previous jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz
);
ALTER TABLE public.bw_import_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bw_import_batches_staff_read ON public.bw_import_batches;
CREATE POLICY bw_import_batches_staff_read ON public.bw_import_batches FOR SELECT TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
GRANT SELECT ON public.bw_import_batches TO authenticated;

-- 3. Publier un import vérifié à l'écran, en une seule transaction.
--    p_inserts / p_updates : [{route_id, company_id, vessel_id, departure_at, arrival_at, duration_minutes, status}]
--    (p_updates porte aussi l'id du départ publié). p_cancels : départs absents du fichier à annuler.
--    p_aliases : [{kind, raw_key, target_id}] à retenir pour les prochains imports.
CREATE OR REPLACE FUNCTION public.bw_admin_publish_import(
  p_file_name text,
  p_company uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_inserts jsonb,
  p_updates jsonb,
  p_cancels uuid[],
  p_aliases jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  batch uuid;
  source text := left('Import Excel — ' || coalesce(nullif(p_file_name, ''), 'fichier'), 200);
  new_ids uuid[];
  before jsonb;
  n_updates int;
  n_cancels int;
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin','editor']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;

  INSERT INTO public.bw_import_batches (file_name, company_id, scope_from, scope_to)
  VALUES (coalesce(p_file_name, ''), p_company, p_from, p_to) RETURNING id INTO batch;

  -- État d'avant, pour pouvoir annuler.
  SELECT coalesce(jsonb_agg(to_jsonb(d.*)), '[]'::jsonb) INTO before
  FROM public.departures d
  WHERE d.id IN (SELECT (u->>'id')::uuid FROM jsonb_array_elements(coalesce(p_updates, '[]')) u)
     OR d.id = ANY(coalesce(p_cancels, '{}'));

  WITH created AS (
    INSERT INTO public.departures
      (route_id, company_id, vessel_id, departure_at, arrival_at, duration_minutes, status,
       reliability, source_name, last_verified_at)
    SELECT x.route_id, x.company_id, x.vessel_id, x.departure_at, x.arrival_at, x.duration_minutes,
           x.status::public.departure_status, 'verified', source, now()
    FROM jsonb_to_recordset(coalesce(p_inserts, '[]')) AS x(
      route_id uuid, company_id uuid, vessel_id uuid, departure_at timestamptz,
      arrival_at timestamptz, duration_minutes int, status text)
    RETURNING id
  )
  SELECT coalesce(array_agg(id), '{}') INTO new_ids FROM created;

  UPDATE public.departures d SET
    departure_at = x.departure_at,
    arrival_at = x.arrival_at,
    duration_minutes = x.duration_minutes,
    vessel_id = coalesce(x.vessel_id, d.vessel_id),
    status = CASE
      WHEN x.status = 'cancelled' THEN 'cancelled'::public.departure_status
      WHEN d.departure_at <> x.departure_at THEN 'modified'::public.departure_status
      ELSE x.status::public.departure_status END,
    reliability = 'verified',
    source_name = source,
    last_verified_at = now()
  FROM jsonb_to_recordset(coalesce(p_updates, '[]')) AS x(
    id uuid, vessel_id uuid, departure_at timestamptz, arrival_at timestamptz,
    duration_minutes int, status text)
  WHERE d.id = x.id;
  GET DIAGNOSTICS n_updates = ROW_COUNT;

  UPDATE public.departures SET status = 'cancelled', last_verified_at = now()
  WHERE id = ANY(coalesce(p_cancels, '{}')) AND status <> 'cancelled';
  GET DIAGNOSTICS n_cancels = ROW_COUNT;

  -- Une liaison suspendue redevient visible dès qu'elle reçoit des départs.
  UPDATE public.routes SET status = 'active'
  WHERE status <> 'active' AND id IN (SELECT route_id FROM public.departures WHERE id = ANY(new_ids));

  INSERT INTO public.bw_import_aliases (kind, raw_key, target_id)
  SELECT a.kind, a.raw_key, a.target_id
  FROM jsonb_to_recordset(coalesce(p_aliases, '[]')) AS a(kind text, raw_key text, target_id uuid)
  WHERE a.kind IN ('port','company','vessel') AND coalesce(a.raw_key, '') <> ''
  ON CONFLICT (kind, raw_key) DO UPDATE SET target_id = excluded.target_id, created_at = now();

  UPDATE public.bw_import_batches SET
    inserted = new_ids,
    previous = before,
    counts = jsonb_build_object('added', cardinality(new_ids), 'changed', n_updates, 'cancelled', n_cancels)
  WHERE id = batch;
  RETURN batch;
END $$;

-- 4. Annuler un import (30 jours) : départs créés supprimés, modifiés et annulés remis comme avant.
CREATE OR REPLACE FUNCTION public.bw_admin_undo_import(p_batch uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE b public.bw_import_batches; n_deleted int; n_restored int;
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin','editor']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO b FROM public.bw_import_batches WHERE id = p_batch FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Import introuvable'; END IF;
  IF b.undone_at IS NOT NULL THEN RAISE EXCEPTION 'Cet import a déjà été annulé'; END IF;
  IF b.created_at < now() - interval '30 days' THEN RAISE EXCEPTION 'Import trop ancien pour être annulé (30 jours)'; END IF;

  DELETE FROM public.departures WHERE id = ANY(b.inserted);
  GET DIAGNOSTICS n_deleted = ROW_COUNT;

  UPDATE public.departures d SET
    departure_at = p.departure_at,
    arrival_at = p.arrival_at,
    duration_minutes = p.duration_minutes,
    vessel_id = p.vessel_id,
    status = p.status,
    reliability = p.reliability,
    source_name = p.source_name,
    last_verified_at = p.last_verified_at
  FROM jsonb_populate_recordset(NULL::public.departures, b.previous) AS p
  WHERE d.id = p.id;
  GET DIAGNOSTICS n_restored = ROW_COUNT;

  UPDATE public.bw_import_batches SET undone_at = now() WHERE id = p_batch;
  RETURN jsonb_build_object('deleted', n_deleted, 'restored', n_restored);
END $$;

REVOKE ALL ON FUNCTION public.bw_admin_publish_import(text,uuid,timestamptz,timestamptz,jsonb,jsonb,uuid[],jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bw_admin_undo_import(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_admin_publish_import(text,uuid,timestamptz,timestamptz,jsonb,jsonb,uuid[],jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bw_admin_undo_import(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
