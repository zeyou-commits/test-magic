-- BledWay · Veille : un article récent reconfirme ou clôt un incident ouvert, après validation de l'équipe.
ALTER TABLE public.bw_watch_proposals DROP CONSTRAINT IF EXISTS bw_watch_proposals_kind_check;
ALTER TABLE public.bw_watch_proposals ADD CONSTRAINT bw_watch_proposals_kind_check
  CHECK (kind IN ('flash', 'departure', 'vessel', 'note', 'incident'));

CREATE OR REPLACE FUNCTION private.bw_watch_current(p_kind text, p_departure uuid, p_vessel uuid, p_field text)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_kind = 'departure' THEN (
      SELECT CASE p_field
        WHEN 'status' THEN d.status::text
        WHEN 'departure_at' THEN to_char(d.departure_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        WHEN 'arrival_at' THEN to_char(d.arrival_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        WHEN 'vessel_id' THEN d.vessel_id::text
      END FROM public.departures d WHERE d.id = p_departure)
    WHEN p_kind = 'vessel' AND p_field = 'status' THEN (SELECT v.status::text FROM public.vessels v WHERE v.id = p_vessel)
    WHEN p_kind = 'incident' THEN (
      SELECT CASE p_field
        WHEN 'verified_at' THEN to_char(n.verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        WHEN 'status' THEN n.status
      END FROM public.bw_vessel_incidents n
      WHERE n.vessel_id = p_vessel AND n.status IN ('verifying', 'confirmed')
      ORDER BY n.created_at DESC LIMIT 1)
  END;
$$;

CREATE OR REPLACE FUNCTION public.bw_watch_propose(p_proposals jsonb, p_analyzed uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  entry jsonb; v_kind text; v_field text; v_value text; v_dep uuid; v_vessel uuid; v_item uuid; v_published timestamptz; v_known timestamptz;
  inserted integer := 0; skipped integer := 0; added integer;
BEGIN
  IF jsonb_array_length(coalesce(p_proposals, '[]'::jsonb)) > 20 THEN RAISE EXCEPTION 'Trop de propositions'; END IF;
  FOR entry IN SELECT * FROM jsonb_array_elements(coalesce(p_proposals, '[]'::jsonb)) LOOP
    BEGIN
      v_kind := entry->>'kind';
      v_field := entry->>'field';
      v_value := entry->>'proposed_value';
      v_item := (entry->>'item_id')::uuid;
      v_dep := (entry->>'departure_id')::uuid;
      v_vessel := (entry->>'vessel_id')::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.bw_watch_items i WHERE i.id = v_item) THEN RAISE EXCEPTION 'article'; END IF;
      IF v_kind = 'departure' THEN
        IF v_dep IS NULL OR v_field NOT IN ('status', 'departure_at', 'arrival_at', 'vessel_id') THEN RAISE EXCEPTION 'champ'; END IF;
        IF v_field = 'status' AND v_value NOT IN ('scheduled', 'modified', 'cancelled') THEN RAISE EXCEPTION 'statut'; END IF;
        IF v_field IN ('departure_at', 'arrival_at') THEN PERFORM v_value::timestamptz; END IF;
        IF v_field = 'vessel_id' AND NOT EXISTS (SELECT 1 FROM public.vessels x WHERE x.id = v_value::uuid) THEN RAISE EXCEPTION 'navire'; END IF;
      ELSIF v_kind = 'vessel' THEN
        IF v_vessel IS NULL OR v_field <> 'status' OR v_value NOT IN ('active', 'inactive') THEN RAISE EXCEPTION 'champ'; END IF;
      ELSIF v_kind = 'incident' THEN
        SELECT n.verified_at INTO v_known FROM public.bw_vessel_incidents n
          WHERE n.vessel_id = v_vessel AND n.status IN ('verifying', 'confirmed') ORDER BY n.created_at DESC LIMIT 1;
        IF NOT FOUND THEN RAISE EXCEPTION 'incident'; END IF;
        IF v_field = 'verified_at' THEN
          -- La date est celle de l'article : seul un article plus récent peut rafraîchir l'incident.
          SELECT i.published_at INTO v_published FROM public.bw_watch_items i WHERE i.id = v_item;
          IF v_published IS NULL OR v_published > now() + interval '1 hour' OR v_published <= coalesce(v_known, '-infinity') THEN RAISE EXCEPTION 'date'; END IF;
          v_value := to_char(v_published AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
        ELSIF v_field <> 'status' OR v_value <> 'resolved' THEN
          RAISE EXCEPTION 'champ';
        END IF;
      ELSIF v_kind = 'flash' THEN
        v_field := NULL;
        IF v_value NOT IN ('info', 'perturbation', 'alerte') THEN v_value := 'info'; END IF;
      ELSIF v_kind = 'note' THEN
        v_field := NULL; v_value := NULL;
      ELSE
        RAISE EXCEPTION 'type';
      END IF;
      INSERT INTO public.bw_watch_proposals(item_id, kind, title, summary, confidence, departure_id, vessel_id, company_id, field, current_value, proposed_value)
      VALUES (v_item, v_kind, left(entry->>'title', 160), left(coalesce(entry->>'summary', ''), 400),
              coalesce(entry->>'confidence', 'medium'), v_dep, v_vessel, (entry->>'company_id')::uuid, v_field,
              private.bw_watch_current(v_kind, v_dep, v_vessel, v_field), v_value)
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS added = ROW_COUNT;
      inserted := inserted + added;
    EXCEPTION WHEN others THEN
      skipped := skipped + 1;
    END;
  END LOOP;
  UPDATE public.bw_watch_items SET analyzed_at = now() WHERE id = ANY(coalesce(p_analyzed, '{}')) AND analyzed_at IS NULL;
  RETURN jsonb_build_object('inserted', inserted, 'skipped', skipped);
END $$;
REVOKE ALL ON FUNCTION public.bw_watch_propose(jsonb, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_watch_propose(jsonb, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.bw_watch_decide(p_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.bw_watch_proposals%ROWTYPE; i public.bw_watch_items%ROWTYPE; s public.bw_watch_sources%ROWTYPE; did boolean := false; v_source text;
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin', 'editor']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  IF p_decision NOT IN ('approved', 'rejected', 'standby') THEN RAISE EXCEPTION 'Décision inconnue'; END IF;
  SELECT * INTO p FROM public.bw_watch_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposition introuvable'; END IF;
  IF p.status NOT IN ('pending', 'standby') THEN RAISE EXCEPTION 'Proposition déjà traitée'; END IF;
  IF p_decision = 'approved' THEN
    IF p.kind IN ('departure', 'vessel', 'incident')
       AND private.bw_watch_current(p.kind, p.departure_id, p.vessel_id, p.field) IS DISTINCT FROM p.current_value THEN
      RAISE EXCEPTION 'La donnée a changé depuis cette proposition : vérifiez-la, puis refusez la proposition.';
    END IF;
    IF p.kind = 'departure' THEN
      IF p.field = 'status' THEN
        UPDATE public.departures SET status = p.proposed_value::public.departure_status WHERE id = p.departure_id;
      ELSIF p.field = 'departure_at' THEN
        UPDATE public.departures SET departure_at = p.proposed_value::timestamptz, status = 'modified' WHERE id = p.departure_id;
      ELSIF p.field = 'arrival_at' THEN
        UPDATE public.departures SET arrival_at = p.proposed_value::timestamptz, status = 'modified' WHERE id = p.departure_id;
      ELSIF p.field = 'vessel_id' THEN
        UPDATE public.departures SET vessel_id = p.proposed_value::uuid WHERE id = p.departure_id;
      END IF;
      did := true;
    ELSIF p.kind = 'vessel' THEN
      UPDATE public.vessels SET status = p.proposed_value::public.entity_status WHERE id = p.vessel_id;
      did := true;
    ELSIF p.kind = 'incident' THEN
      SELECT * INTO i FROM public.bw_watch_items WHERE id = p.item_id;
      SELECT * INTO s FROM public.bw_watch_sources WHERE id = i.source_id;
      -- Le titre d'une recherche d'actualités se termine par le nom du journal.
      v_source := left(coalesce(CASE WHEN s.url LIKE '%{name}%' THEN substring(i.title from ' - ([^-]+)$') END, s.name), 120);
      UPDATE public.bw_vessel_incidents
         SET verified_at = CASE WHEN p.field = 'verified_at' THEN p.proposed_value::timestamptz ELSE verified_at END,
             status = CASE WHEN p.field = 'status' THEN 'resolved' ELSE status END,
             source_name = v_source,
             source_url = CASE WHEN i.url LIKE 'https://%' THEN i.url ELSE source_url END
       WHERE vessel_id = p.vessel_id AND status IN ('verifying', 'confirmed');
      did := true;
    ELSIF p.kind = 'flash' THEN
      SELECT * INTO i FROM public.bw_watch_items WHERE id = p.item_id;
      SELECT * INTO s FROM public.bw_watch_sources WHERE id = i.source_id;
      INSERT INTO public.bw_news(kind, origin, title, summary, source_name, source_url, vessel_id, company_ids, departure_ids, published, created_by)
      VALUES (coalesce(p.proposed_value, 'info'), CASE WHEN s.tier = 'official' THEN 'official' ELSE 'media' END, p.title, p.summary,
              left(s.name, 80), i.url, p.vessel_id,
              CASE WHEN p.company_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p.company_id] END,
              CASE WHEN p.departure_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p.departure_id] END,
              true, auth.uid());
      did := true;
    END IF;
  END IF;
  UPDATE public.bw_watch_proposals
     SET status = p_decision, applied = did, decided_by = auth.uid(), decided_at = now(), decision_note = left(p_note, 300)
   WHERE id = p_id;
  RETURN jsonb_build_object('status', p_decision, 'applied', did);
END $$;
NOTIFY pgrst, 'reload schema';
