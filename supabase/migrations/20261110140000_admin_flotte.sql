-- BledWay · Flotte : retrait guidé d'un navire (archiver, remplacer, fusionner un doublon, supprimer).
-- Aucune donnée n'est modifiée par ce script : il ajoute cinq fonctions réservées à l'équipe.
-- Les tables qui pointent vers un navire sont détectées automatiquement (clés étrangères),
-- y compris celles ajoutées plus tard (avis, signalements, suivis…).
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

-- 1. Où un navire est-il utilisé ? { "departures.vessel_id": 120, "departures (à venir)": 8, … }
CREATE OR REPLACE FUNCTION public.bw_admin_vessel_usage(p_vessel uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; n bigint; result jsonb := '{}'::jsonb;
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin','editor']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.vessels'::regclass AND cardinality(c.conkey) = 1
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', r.tbl, r.col) INTO n USING p_vessel;
    IF n > 0 THEN result := result || jsonb_build_object(r.tbl::text || '.' || r.col, n); END IF;
  END LOOP;
  SELECT count(*) INTO n FROM public.departures WHERE vessel_id = p_vessel AND departure_at >= now() AND status <> 'cancelled';
  IF n > 0 THEN result := result || jsonb_build_object('upcoming', n); END IF;
  RETURN result;
END $$;

-- 2. Archiver : le navire disparaît des listes publiques ; ses traversées à venir peuvent être libérées.
CREATE OR REPLACE FUNCTION public.bw_admin_archive_vessel(p_vessel uuid, p_release_upcoming boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n_departures int := 0; n_schedules int := 0;
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin','editor']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE public.vessels SET status = 'inactive' WHERE id = p_vessel;
  IF NOT FOUND THEN RAISE EXCEPTION 'Navire introuvable'; END IF;
  IF p_release_upcoming THEN
    UPDATE public.departures SET vessel_id = NULL WHERE vessel_id = p_vessel AND departure_at >= now();
    GET DIAGNOSTICS n_departures = ROW_COUNT;
    UPDATE public.schedules SET default_vessel_id = NULL WHERE default_vessel_id = p_vessel;
    GET DIAGNOSTICS n_schedules = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('departures', n_departures, 'schedules', n_schedules);
END $$;

-- 3. Remplacer : traversées à venir et programmes passent sur un autre navire, puis archivage.
CREATE OR REPLACE FUNCTION public.bw_admin_replace_vessel(p_vessel uuid, p_replacement uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n_departures int; n_schedules int; n_exceptions int := 0;
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin','editor']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF p_replacement IS NULL OR p_replacement = p_vessel THEN RAISE EXCEPTION 'Choisissez un autre navire'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vessels WHERE id = p_replacement) THEN RAISE EXCEPTION 'Navire de remplacement introuvable'; END IF;
  UPDATE public.departures SET vessel_id = p_replacement WHERE vessel_id = p_vessel AND departure_at >= now();
  GET DIAGNOSTICS n_departures = ROW_COUNT;
  UPDATE public.schedules SET default_vessel_id = p_replacement WHERE default_vessel_id = p_vessel;
  GET DIAGNOSTICS n_schedules = ROW_COUNT;
  IF to_regclass('public.schedule_exceptions') IS NOT NULL THEN
    UPDATE public.schedule_exceptions SET new_vessel_id = p_replacement WHERE new_vessel_id = p_vessel;
    GET DIAGNOSTICS n_exceptions = ROW_COUNT;
  END IF;
  UPDATE public.vessels SET status = 'inactive' WHERE id = p_vessel;
  RETURN jsonb_build_object('departures', n_departures, 'schedules', n_schedules, 'exceptions', n_exceptions);
END $$;

-- 4. Fusionner un doublon : tout ce qui pointe vers p_remove passe sur p_keep (avis, suivis…),
--    la fiche gardée récupère ce qui lui manque (MMSI, IMO, photo, caractéristiques), puis p_remove
--    est supprimée. Une ligne qui existerait déjà côté gardé (même voyageur…) est retirée.
CREATE OR REPLACE FUNCTION public.bw_admin_merge_vessels(p_keep uuid, p_remove uuid, p_alias_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; row_id tid; n bigint; dropped bigint; moved jsonb := '{}'::jsonb; gone public.vessels;
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin','editor']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF p_keep IS NULL OR p_remove IS NULL OR p_keep = p_remove THEN RAISE EXCEPTION 'Choisissez deux navires différents'; END IF;
  SELECT * INTO gone FROM public.vessels WHERE id = p_remove FOR UPDATE;
  IF gone.id IS NULL OR NOT EXISTS (SELECT 1 FROM public.vessels WHERE id = p_keep) THEN RAISE EXCEPTION 'Navire introuvable'; END IF;

  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.vessels'::regclass AND cardinality(c.conkey) = 1
  LOOP
    BEGIN
      EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', r.tbl, r.col, r.col) USING p_keep, p_remove;
      GET DIAGNOSTICS n = ROW_COUNT;
    EXCEPTION WHEN unique_violation THEN
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

  -- Le MMSI est unique : on le libère sur la fiche retirée avant de le reporter.
  DELETE FROM public.vessels WHERE id = p_remove;
  UPDATE public.vessels k SET
    mmsi = coalesce(k.mmsi, gone.mmsi),
    imo = coalesce(k.imo, gone.imo),
    photo_url = coalesce(k.photo_url, gone.photo_url),
    company_id = coalesce(k.company_id, gone.company_id),
    description = coalesce(nullif(k.description, ''), gone.description),
    build_year = coalesce(k.build_year, gone.build_year),
    length_meters = coalesce(k.length_meters, gone.length_meters),
    passenger_capacity = coalesce(k.passenger_capacity, gone.passenger_capacity),
    car_capacity = coalesce(k.car_capacity, gone.car_capacity),
    freight_lane_meters = coalesce(k.freight_lane_meters, gone.freight_lane_meters),
    speed_knots = coalesce(k.speed_knots, gone.speed_knots)
  WHERE k.id = p_keep;

  -- Le nom retiré reste reconnu aux prochains imports.
  IF to_regclass('public.bw_import_aliases') IS NOT NULL AND coalesce(p_alias_key, '') <> '' THEN
    INSERT INTO public.bw_import_aliases (kind, raw_key, target_id)
    VALUES ('vessel', left(p_alias_key, 120), p_keep)
    ON CONFLICT (kind, raw_key) DO UPDATE SET target_id = excluded.target_id;
  END IF;
  RETURN moved;
END $$;

-- 5. Supprimer : seulement un navire que plus rien n'utilise (sinon archiver, remplacer ou fusionner).
CREATE OR REPLACE FUNCTION public.bw_admin_delete_vessel(p_vessel uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF public.bw_admin_vessel_usage(p_vessel) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Navire encore utilisé : archivez-le, remplacez-le ou fusionnez-le';
  END IF;
  DELETE FROM public.vessels WHERE id = p_vessel;
  IF NOT FOUND THEN RAISE EXCEPTION 'Navire introuvable'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.bw_admin_vessel_usage(uuid), public.bw_admin_archive_vessel(uuid,boolean),
  public.bw_admin_replace_vessel(uuid,uuid), public.bw_admin_merge_vessels(uuid,uuid,text), public.bw_admin_delete_vessel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_admin_vessel_usage(uuid), public.bw_admin_archive_vessel(uuid,boolean),
  public.bw_admin_replace_vessel(uuid,uuid), public.bw_admin_merge_vessels(uuid,uuid,text), public.bw_admin_delete_vessel(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
