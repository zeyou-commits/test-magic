-- BledWay · Gestion des compagnies dans l'admin : utilisation, suppression sûre et fusion de doublons.
-- Aucune donnée n'est modifiée par ce script : il ajoute seulement trois fonctions réservées aux admins.
-- Les tables qui pointent vers une compagnie sont détectées automatiquement (clés étrangères),
-- y compris celles ajoutées plus tard ; la Flash info (bw_news.company_ids) est aussi prise en compte.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

-- 1. Où une compagnie est-elle utilisée ? { "departures.company_id": 12, "vessels.company_id": 3, … }
CREATE OR REPLACE FUNCTION public.bw_admin_company_usage(p_company uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; n bigint; result jsonb := '{}'::jsonb;
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin','editor']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.companies'::regclass AND cardinality(c.conkey) = 1
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', r.tbl, r.col) INTO n USING p_company;
    IF n > 0 THEN result := result || jsonb_build_object(r.tbl::text || '.' || r.col, n); END IF;
  END LOOP;
  IF to_regclass('public.bw_news') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.bw_news WHERE $1 = ANY(company_ids)' INTO n USING p_company;
    IF n > 0 THEN result := result || jsonb_build_object('bw_news.company_ids', n); END IF;
  END IF;
  RETURN result;
END $$;

-- 2. Supprimer une compagnie : seulement si plus rien ne l'utilise (sinon : fusionner ou masquer).
CREATE OR REPLACE FUNCTION public.bw_admin_delete_company(p_company uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF public.bw_admin_company_usage(p_company) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Compagnie encore utilisée : fusionnez-la avec la bonne compagnie';
  END IF;
  DELETE FROM public.companies WHERE id = p_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compagnie introuvable'; END IF;
END $$;

-- 3. Fusionner : tout ce qui pointe vers p_remove passe sur p_keep, puis p_remove est supprimée.
--    Les informations vides de la compagnie gardée (logo, site, description) sont complétées.
--    En cas de conflit imprévu, rien n'est modifié (toute la fusion est annulée).
CREATE OR REPLACE FUNCTION public.bw_admin_merge_companies(p_keep uuid, p_remove uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; n bigint; moved jsonb := '{}'::jsonb; gone public.companies;
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF p_keep IS NULL OR p_remove IS NULL OR p_keep = p_remove THEN RAISE EXCEPTION 'Choisissez deux compagnies différentes'; END IF;
  SELECT * INTO gone FROM public.companies WHERE id = p_remove FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id = p_keep) THEN RAISE EXCEPTION 'Compagnie introuvable'; END IF;

  -- Opérateurs de liaison : une liaison déjà opérée par la compagnie gardée n'est pas dupliquée.
  IF to_regclass('public.route_operators') IS NOT NULL THEN
    DELETE FROM public.route_operators ro
     WHERE ro.company_id = p_remove
       AND EXISTS(SELECT 1 FROM public.route_operators k WHERE k.route_id = ro.route_id AND k.company_id = p_keep);
  END IF;

  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.companies'::regclass AND cardinality(c.conkey) = 1
  LOOP
    BEGIN
      EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', r.tbl, r.col, r.col) USING p_keep, p_remove;
      GET DIAGNOSTICS n = ROW_COUNT;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Fusion impossible : doublon dans %, à corriger d''abord', r.tbl;
    END;
    IF n > 0 THEN moved := moved || jsonb_build_object(r.tbl::text || '.' || r.col, n); END IF;
  END LOOP;

  IF to_regclass('public.bw_news') IS NOT NULL THEN
    EXECUTE $q$
      UPDATE public.bw_news
         SET company_ids = ARRAY(SELECT DISTINCT unnest(array_replace(company_ids, $2, $1)))
       WHERE $2 = ANY(company_ids)
    $q$ USING p_keep, p_remove;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN moved := moved || jsonb_build_object('bw_news.company_ids', n); END IF;
  END IF;

  UPDATE public.companies k SET
    logo_url = coalesce(k.logo_url, gone.logo_url),
    website_url = coalesce(k.website_url, gone.website_url),
    description = coalesce(nullif(k.description, ''), gone.description)
  WHERE k.id = p_keep;
  DELETE FROM public.companies WHERE id = p_remove;
  RETURN moved;
END $$;

REVOKE ALL ON FUNCTION public.bw_admin_company_usage(uuid), public.bw_admin_delete_company(uuid), public.bw_admin_merge_companies(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_admin_company_usage(uuid), public.bw_admin_delete_company(uuid), public.bw_admin_merge_companies(uuid,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
