-- Application automatique des corrections sûres (06/11/2026, demande de l'utilisateur : gagner du temps).
-- Appliqué sans clic, quand la source est officielle et complète (planning publié par la compagnie,
-- capitainerie) : correction d'heure ou de navire, ajout d'une traversée, arrivée constatée.
-- Toujours soumis à validation : les retraits (des voyageurs suivent peut-être la traversée) et tout ce
-- qu'apporte un agent (sources partielles). Chaque application automatique reste annulable.

-- Application d'une proposition (sans contrôle de droits : appelée par bw_watch_decide après contrôle,
-- ou par bw_schedule_propose pour les sources officielles complètes).
CREATE OR REPLACE FUNCTION private.bw_schedule_apply(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p public.bw_watch_proposals%ROWTYPE; i public.bw_watch_items%ROWTYPE; s public.bw_watch_sources%ROWTYPE;
  v_new jsonb; v_created uuid;
BEGIN
  SELECT * INTO p FROM public.bw_watch_proposals WHERE id = p_id;
  SELECT * INTO i FROM public.bw_watch_items WHERE id = p.item_id;
  SELECT * INTO s FROM public.bw_watch_sources WHERE id = i.source_id;
  IF p.kind = 'schedule_fix' THEN
    UPDATE public.departures SET
      departure_at = CASE WHEN p.field = 'departure_at' THEN p.proposed_value::timestamptz ELSE departure_at END,
      arrival_at = CASE WHEN p.field = 'arrival_at' THEN p.proposed_value::timestamptz ELSE arrival_at END,
      vessel_id = CASE WHEN p.field = 'vessel_id' THEN p.proposed_value::uuid ELSE vessel_id END,
      source_name = left(s.name, 120), source_url = s.url, last_verified_at = now()
    WHERE id = p.departure_id;
    UPDATE public.departures SET duration_minutes = round(extract(epoch FROM (arrival_at - departure_at)) / 60)
    WHERE id = p.departure_id AND arrival_at IS NOT NULL AND arrival_at > departure_at;
  ELSIF p.kind = 'new_departure' THEN
    v_new := p.proposed_value::jsonb;
    INSERT INTO public.departures(route_id, company_id, vessel_id, departure_at, arrival_at, duration_minutes,
                                  status, source_name, source_url, last_verified_at, reliability)
    VALUES ((v_new->>'route_id')::uuid, p.company_id, (v_new->>'vessel_id')::uuid,
            (v_new->>'departure_at')::timestamptz, (v_new->>'arrival_at')::timestamptz,
            CASE WHEN v_new->>'arrival_at' IS NOT NULL
                 THEN round(extract(epoch FROM ((v_new->>'arrival_at')::timestamptz - (v_new->>'departure_at')::timestamptz)) / 60) END,
            'scheduled', left(s.name, 120), s.url, now(), 'verified')
    RETURNING id INTO v_created;
    UPDATE public.bw_watch_proposals SET departure_id = v_created, departure_ids = ARRAY[v_created] WHERE id = p_id;
  ELSIF p.kind = 'crossing' THEN
    UPDATE public.departures SET
      web_departed_at = CASE WHEN p.field = 'web_departed_at' THEN p.proposed_value::timestamptz ELSE web_departed_at END,
      web_arrived_at = CASE WHEN p.field = 'web_arrived_at' THEN p.proposed_value::timestamptz ELSE web_arrived_at END,
      web_eta_at = CASE WHEN p.field = 'web_eta_at' THEN p.proposed_value::timestamptz ELSE web_eta_at END
    WHERE id = p.departure_id;
  ELSE
    RAISE EXCEPTION 'Type non applicable automatiquement : %', p.kind;
  END IF;
END $function$;
REVOKE ALL ON FUNCTION private.bw_schedule_apply(uuid) FROM PUBLIC, anon, authenticated;

-- Dépôt : nouveau paramètre p_auto (source officielle complète).
DROP FUNCTION IF EXISTS public.bw_schedule_propose(text, text, uuid, jsonb);
CREATE OR REPLACE FUNCTION public.bw_schedule_propose(p_source_name text, p_source_url text, p_company uuid, p_proposals jsonb,
                                                      p_auto boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_source uuid; v_item uuid; entry jsonb; v_kind text; v_field text; v_value text; v_dep uuid; v_vessel uuid;
  v_new jsonb; v_id uuid; inserted integer := 0; skipped integer := 0; known integer := 0; applied integer := 0;
BEGIN
  IF p_source_url !~ '^https://' THEN RAISE EXCEPTION 'Source invalide'; END IF;
  IF jsonb_array_length(coalesce(p_proposals, '[]'::jsonb)) > 300 THEN RAISE EXCEPTION 'Trop de propositions'; END IF;

  INSERT INTO public.bw_watch_sources(name, url, kind, tier, keywords, check_minutes, active)
  VALUES (left(p_source_name, 80), p_source_url, 'page', 'official', '{}', 1440, false)
  ON CONFLICT (url) DO UPDATE SET last_checked_at = now(), last_error = NULL
  RETURNING id INTO v_source;

  INSERT INTO public.bw_watch_items(source_id, url, title, excerpt, published_at, analyzed_at)
  VALUES (v_source, p_source_url || '#verification-' || to_char(now() AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD'),
          'Vérification du planning du ' || to_char(now() AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY'),
          left(p_source_name, 200), now(), now())
  ON CONFLICT (url) DO UPDATE SET published_at = now()
  RETURNING id INTO v_item;

  FOR entry IN SELECT * FROM jsonb_array_elements(coalesce(p_proposals, '[]'::jsonb)) LOOP
    BEGIN
      v_kind := entry->>'kind';
      v_field := entry->>'field';
      v_value := entry->>'proposed_value';
      v_dep := (entry->>'departure_id')::uuid;
      v_vessel := (entry->>'vessel_id')::uuid;
      v_new := NULL;
      IF v_kind = 'schedule_fix' THEN
        IF v_field NOT IN ('departure_at', 'arrival_at', 'vessel_id') THEN RAISE EXCEPTION 'champ'; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.departures d WHERE d.id = v_dep) THEN RAISE EXCEPTION 'traversée'; END IF;
        IF v_field = 'vessel_id' AND NOT EXISTS (SELECT 1 FROM public.vessels x WHERE x.id = v_value::uuid) THEN RAISE EXCEPTION 'navire'; END IF;
        IF v_field <> 'vessel_id' THEN
          v_value := to_char(v_value::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
        END IF;
      ELSIF v_kind = 'new_departure' THEN
        v_new := v_value::jsonb;
        IF p_company IS NULL OR NOT EXISTS (SELECT 1 FROM public.routes r WHERE r.id = (v_new->>'route_id')::uuid) THEN
          RAISE EXCEPTION 'liaison';
        END IF;
        PERFORM (v_new->>'departure_at')::timestamptz, (v_new->>'arrival_at')::timestamptz;
        IF v_new->>'vessel_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vessels x WHERE x.id = (v_new->>'vessel_id')::uuid) THEN
          RAISE EXCEPTION 'navire';
        END IF;
        v_field := NULL; v_dep := NULL; v_vessel := (v_new->>'vessel_id')::uuid;
      ELSIF v_kind = 'remove_departure' THEN
        IF NOT EXISTS (SELECT 1 FROM public.departures d WHERE d.id = v_dep) THEN RAISE EXCEPTION 'traversée'; END IF;
        v_field := NULL; v_value := NULL;
      ELSIF v_kind = 'crossing' THEN
        IF v_field NOT IN ('web_departed_at', 'web_arrived_at', 'web_eta_at') THEN RAISE EXCEPTION 'champ'; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.departures d WHERE d.id = v_dep AND d.vessel_id = v_vessel) THEN RAISE EXCEPTION 'traversée'; END IF;
        v_value := to_char(v_value::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
      ELSIF v_kind = 'note' THEN
        v_field := NULL; v_value := NULL; v_dep := NULL;
      ELSE
        RAISE EXCEPTION 'type';
      END IF;

      -- Déjà proposé : en attente, ou refusé / annulé il y a moins de 30 jours.
      IF EXISTS (
        SELECT 1 FROM public.bw_watch_proposals w
        WHERE w.kind = v_kind
          AND w.departure_id IS NOT DISTINCT FROM v_dep
          AND coalesce(w.field, '') = coalesce(v_field, '')
          AND CASE
                WHEN v_kind = 'new_departure' THEN
                  CASE WHEN w.proposed_value LIKE '{%' THEN
                    (w.proposed_value::jsonb->>'route_id') = (v_new->>'route_id')
                    AND (w.proposed_value::jsonb->>'departure_at')::timestamptz = (v_new->>'departure_at')::timestamptz
                  ELSE false END
                WHEN v_kind = 'note' THEN w.title = left(entry->>'title', 160)
                ELSE w.proposed_value IS NOT DISTINCT FROM v_value
              END
          AND (w.status IN ('pending', 'standby') OR (w.status = 'rejected' AND w.decided_at > now() - interval '30 days'))
      ) THEN
        known := known + 1;
        CONTINUE;
      END IF;
      -- Un ajout annulé ou refusé reste écarté 30 jours, même s'il a été rattaché entre-temps.
      IF v_kind = 'new_departure' AND EXISTS (
        SELECT 1 FROM public.bw_watch_proposals w
        WHERE w.kind = 'new_departure' AND w.status = 'rejected' AND w.decided_at > now() - interval '30 days'
          AND w.proposed_value LIKE '{%'
          AND (w.proposed_value::jsonb->>'route_id') = (v_new->>'route_id')
          AND (w.proposed_value::jsonb->>'departure_at')::timestamptz = (v_new->>'departure_at')::timestamptz
      ) THEN
        known := known + 1;
        CONTINUE;
      END IF;

      IF v_kind IN ('schedule_fix', 'crossing') THEN
        UPDATE public.bw_watch_proposals
           SET status = 'rejected', decided_at = now(), decision_note = 'Remplacée par une vérification plus récente'
         WHERE kind = v_kind AND departure_id = v_dep AND field = v_field AND status IN ('pending', 'standby');
      END IF;

      INSERT INTO public.bw_watch_proposals(item_id, kind, title, summary, confidence, departure_id, vessel_id, company_id,
                                            field, current_value, proposed_value, departure_ids)
      VALUES (v_item, v_kind, left(entry->>'title', 160), left(coalesce(entry->>'summary', ''), 400),
              CASE WHEN v_kind = 'note' THEN 'medium' ELSE 'high' END, v_dep, v_vessel, p_company, v_field,
              private.bw_watch_current(v_kind, v_dep, v_vessel, v_field), v_value,
              CASE WHEN v_dep IS NULL THEN '{}'::uuid[] ELSE ARRAY[v_dep] END)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_id;
      IF v_id IS NULL THEN known := known + 1; CONTINUE; END IF;
      inserted := inserted + 1;

      IF p_auto AND v_kind IN ('schedule_fix', 'new_departure', 'crossing') THEN
        PERFORM private.bw_schedule_apply(v_id);
        UPDATE public.bw_watch_proposals
           SET status = 'approved', applied = true, decided_at = now(),
               decision_note = 'Appliquée automatiquement (source officielle)'
         WHERE id = v_id;
        applied := applied + 1;
      END IF;
      v_id := NULL;
    EXCEPTION WHEN others THEN
      skipped := skipped + 1;
      v_id := NULL;
    END;
  END LOOP;
  RETURN jsonb_build_object('inserted', inserted, 'applied', applied, 'skipped', skipped, 'known', known);
END $function$;

REVOKE ALL ON FUNCTION public.bw_schedule_propose(text, text, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_schedule_propose(text, text, uuid, jsonb, boolean) TO service_role;

-- Annuler : arrivée constatée (comme avant), correction de planning, ajout de traversée.
CREATE OR REPLACE FUNCTION public.bw_watch_revert(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p public.bw_watch_proposals%ROWTYPE; v_before timestamptz;
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin', 'editor']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  SELECT * INTO p FROM public.bw_watch_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR p.kind NOT IN ('crossing', 'schedule_fix', 'new_departure') OR p.status <> 'approved' OR NOT p.applied THEN
    RAISE EXCEPTION 'Cette proposition ne peut pas être annulée';
  END IF;
  IF p.kind = 'new_departure' THEN
    IF p.departure_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.departures WHERE id = p.departure_id) THEN
      RAISE EXCEPTION 'La traversée ajoutée n''existe plus.';
    END IF;
    -- Détachée avant la suppression, sinon la proposition disparaîtrait et l'ajout reviendrait le lendemain.
    UPDATE public.bw_watch_proposals SET departure_id = NULL, departure_ids = '{}' WHERE id = p_id;
    PERFORM public.bw_admin_remove_departure(p.departure_id, true, 'Ajout automatique annulé');
  ELSE
    IF private.bw_watch_current(p.kind, p.departure_id, p.vessel_id, p.field) IS DISTINCT FROM p.proposed_value THEN
      RAISE EXCEPTION 'Une autre correction a remplacé celle-ci : annulez d''abord la plus récente.';
    END IF;
    IF p.kind = 'crossing' THEN
      v_before := p.current_value::timestamptz;
      UPDATE public.departures SET
        web_departed_at = CASE WHEN p.field = 'web_departed_at' THEN v_before ELSE web_departed_at END,
        web_arrived_at = CASE WHEN p.field = 'web_arrived_at' THEN v_before ELSE web_arrived_at END,
        web_eta_at = CASE WHEN p.field = 'web_eta_at' THEN v_before ELSE web_eta_at END
      WHERE id = p.departure_id;
    ELSE
      UPDATE public.departures SET
        departure_at = CASE WHEN p.field = 'departure_at' THEN p.current_value::timestamptz ELSE departure_at END,
        arrival_at = CASE WHEN p.field = 'arrival_at' THEN p.current_value::timestamptz ELSE arrival_at END,
        vessel_id = CASE WHEN p.field = 'vessel_id' THEN p.current_value::uuid ELSE vessel_id END
      WHERE id = p.departure_id;
    END IF;
  END IF;
  UPDATE public.bw_watch_proposals
     SET status = 'rejected', applied = false, decided_by = auth.uid(), decided_at = now(), decision_note = 'Correction annulée'
   WHERE id = p_id;
  RETURN jsonb_build_object('status', 'rejected', 'applied', false);
END $function$;
