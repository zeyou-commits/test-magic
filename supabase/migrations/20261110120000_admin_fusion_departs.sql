-- BledWay · Fusion des départs en double depuis l'espace équipe (« Aujourd'hui » et planning).
-- Aucune donnée n'est modifiée par ce script : il ajoute une fonction réservée à l'équipe.
-- Tout ce qui pointe vers le départ retiré (suivis, Ma traversée, signalements, voyages…) passe
-- sur le départ gardé. Les tables sont détectées automatiquement par leurs clés étrangères,
-- y compris celles ajoutées plus tard ; la Flash info (bw_news.departure_ids) est aussi suivie.
-- Si un voyageur suivait déjà les deux départs, sa ligne en double est simplement retirée.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION public.bw_admin_merge_departures(p_keep uuid, p_remove uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r record;
  row_id tid;
  n bigint;
  dropped bigint;
  moved jsonb := '{}'::jsonb;
  kept public.departures;
  gone public.departures;
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin','editor']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF p_keep IS NULL OR p_remove IS NULL OR p_keep = p_remove THEN RAISE EXCEPTION 'Choisissez deux départs différents'; END IF;
  SELECT * INTO gone FROM public.departures WHERE id = p_remove FOR UPDATE;
  SELECT * INTO kept FROM public.departures WHERE id = p_keep FOR UPDATE;
  IF gone.id IS NULL OR kept.id IS NULL THEN RAISE EXCEPTION 'Départ introuvable (déjà fusionné ?)'; END IF;
  IF gone.route_id <> kept.route_id THEN RAISE EXCEPTION 'Les deux départs ne sont pas sur la même liaison'; END IF;

  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.departures'::regclass AND cardinality(c.conkey) = 1
  LOOP
    BEGIN
      EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', r.tbl, r.col, r.col) USING p_keep, p_remove;
      GET DIAGNOSTICS n = ROW_COUNT;
    EXCEPTION WHEN unique_violation THEN
      -- Ligne par ligne : celles qui existent déjà côté départ gardé sont retirées.
      n := 0; dropped := 0;
      FOR row_id IN EXECUTE format('SELECT ctid FROM %s WHERE %I = $1', r.tbl, r.col) USING p_remove LOOP
        BEGIN
          EXECUTE format('UPDATE %s SET %I = $1 WHERE ctid = $2', r.tbl, r.col) USING p_keep, row_id;
          n := n + 1;
        EXCEPTION WHEN unique_violation THEN
          EXECUTE format('DELETE FROM %s WHERE ctid = $1', r.tbl) USING row_id;
          dropped := dropped + 1;
        END;
      END LOOP;
      IF dropped > 0 THEN moved := moved || jsonb_build_object(r.tbl::text || '.' || r.col || ' (doublons retirés)', dropped); END IF;
    END;
    IF n > 0 THEN moved := moved || jsonb_build_object(r.tbl::text || '.' || r.col, n); END IF;
  END LOOP;

  IF to_regclass('public.bw_news') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'bw_news' AND column_name = 'departure_ids') THEN
    EXECUTE $q$
      UPDATE public.bw_news
         SET departure_ids = ARRAY(SELECT DISTINCT unnest(array_replace(departure_ids, $2, $1)))
       WHERE $2 = ANY(departure_ids)
    $q$ USING p_keep, p_remove;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN moved := moved || jsonb_build_object('bw_news.departure_ids', n); END IF;
  END IF;

  -- Le départ gardé récupère ce qui lui manque (bateau, notes, source).
  UPDATE public.departures k SET
    vessel_id = coalesce(k.vessel_id, gone.vessel_id),
    notes = coalesce(nullif(k.notes, ''), gone.notes),
    source_url = coalesce(k.source_url, gone.source_url)
  WHERE k.id = p_keep;
  DELETE FROM public.departures WHERE id = p_remove;
  RETURN moved;
END $$;

REVOKE ALL ON FUNCTION public.bw_admin_merge_departures(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_admin_merge_departures(uuid,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
