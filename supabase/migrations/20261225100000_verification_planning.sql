-- Vérification du planning contre les sources officielles (06/11/2026).
-- La fonction schedule-check compare BledWay au planning publié par les compagnies (Corsica Linea,
-- agents compagnie) et aux capitaineries (Béjaïa, Annaba), puis dépose des propositions dans la Veille.
-- Rien n'est modifié sans l'approbation de l'équipe.
--   schedule_fix      : corriger l'heure de départ, d'arrivée ou le navire d'une traversée (erreur de saisie,
--                       la traversée ne passe donc pas au statut « modifiée »)
--   new_departure     : ajouter une traversée publiée par la compagnie et absente de BledWay
--   remove_departure  : retirer une traversée que la compagnie ne publie pas, sur sa période publiée

ALTER TABLE public.bw_watch_proposals DROP CONSTRAINT IF EXISTS bw_watch_proposals_kind_check;
ALTER TABLE public.bw_watch_proposals ADD CONSTRAINT bw_watch_proposals_kind_check
  CHECK (kind = ANY (ARRAY['flash', 'departure', 'vessel', 'note', 'incident', 'crossing',
                           'schedule_fix', 'new_departure', 'remove_departure']));

CREATE OR REPLACE FUNCTION private.bw_watch_current(p_kind text, p_departure uuid, p_vessel uuid, p_field text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_kind IN ('departure', 'schedule_fix') THEN (
      SELECT CASE p_field
        WHEN 'status' THEN d.status::text
        WHEN 'departure_at' THEN to_char(d.departure_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        WHEN 'arrival_at' THEN to_char(d.arrival_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        WHEN 'vessel_id' THEN d.vessel_id::text
      END FROM public.departures d WHERE d.id = p_departure)
    WHEN p_kind = 'crossing' THEN (
      SELECT to_char(
        CASE p_field
          WHEN 'web_departed_at' THEN d.web_departed_at
          WHEN 'web_arrived_at' THEN d.web_arrived_at
          WHEN 'web_eta_at' THEN d.web_eta_at
        END AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      FROM public.departures d WHERE d.id = p_departure)
    WHEN p_kind = 'vessel' AND p_field = 'status' THEN (SELECT v.status::text FROM public.vessels v WHERE v.id = p_vessel)
    WHEN p_kind = 'incident' THEN (
      SELECT CASE p_field
        WHEN 'verified_at' THEN to_char(n.verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        WHEN 'status' THEN n.status
      END FROM public.bw_vessel_incidents n
      WHERE n.vessel_id = p_vessel AND n.status IN ('verifying', 'confirmed')
      ORDER BY n.created_at DESC LIMIT 1)
  END;
$function$;

-- Dépôt des propositions de la vérification (réservé à la fonction serveur : clé service).
-- Une source = une fiche de Veille inactive (jamais parcourue par la collecte), un passage par jour = un article.
-- Une proposition déjà en attente, ou refusée depuis moins de 30 jours, n'est pas redéposée.
CREATE OR REPLACE FUNCTION public.bw_schedule_propose(p_source_name text, p_source_url text, p_company uuid, p_proposals jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_source uuid; v_item uuid; entry jsonb; v_kind text; v_field text; v_value text; v_dep uuid; v_vessel uuid;
  v_new jsonb; inserted integer := 0; skipped integer := 0; known integer := 0; added integer;
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

      -- Déjà proposé : en attente, ou refusé il y a moins de 30 jours.
      IF EXISTS (
        SELECT 1 FROM public.bw_watch_proposals w
        WHERE w.kind = v_kind
          AND w.departure_id IS NOT DISTINCT FROM v_dep
          AND coalesce(w.field, '') = coalesce(v_field, '')
          AND CASE
                WHEN v_kind = 'new_departure' THEN
                  (w.proposed_value::jsonb->>'route_id') = (v_new->>'route_id')
                  AND (w.proposed_value::jsonb->>'departure_at')::timestamptz = (v_new->>'departure_at')::timestamptz
                WHEN v_kind = 'note' THEN w.title = left(entry->>'title', 160)
                ELSE w.proposed_value IS NOT DISTINCT FROM v_value
              END
          AND (w.status IN ('pending', 'standby') OR (w.status = 'rejected' AND w.decided_at > now() - interval '30 days'))
      ) THEN
        known := known + 1;
        CONTINUE;
      END IF;

      -- Une nouvelle valeur pour le même champ remplace la proposition précédente encore en attente.
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
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS added = ROW_COUNT;
      IF added = 0 THEN known := known + 1; END IF;
      inserted := inserted + added;
    EXCEPTION WHEN others THEN
      skipped := skipped + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('inserted', inserted, 'skipped', skipped, 'known', known);
END $function$;

REVOKE ALL ON FUNCTION public.bw_schedule_propose(text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_schedule_propose(text, text, uuid, jsonb) TO service_role;

-- Décision de l'équipe : mêmes règles qu'avant, plus les trois nouveaux types.
CREATE OR REPLACE FUNCTION public.bw_watch_decide(p_id uuid, p_decision text, p_note text DEFAULT NULL::text, p_news jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p public.bw_watch_proposals%ROWTYPE; i public.bw_watch_items%ROWTYPE; s public.bw_watch_sources%ROWTYPE; did boolean := false; v_source text; v_title text; v_summary text; v_deps uuid[];
  v_new jsonb; v_created uuid;
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin', 'editor']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  IF p_decision NOT IN ('approved', 'rejected', 'standby') THEN RAISE EXCEPTION 'Décision inconnue'; END IF;
  SELECT * INTO p FROM public.bw_watch_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposition introuvable'; END IF;
  IF p.status NOT IN ('pending', 'standby') THEN RAISE EXCEPTION 'Proposition déjà traitée'; END IF;
  IF p_decision = 'approved' THEN
    IF p.kind IN ('departure', 'vessel', 'incident', 'crossing', 'schedule_fix')
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
    ELSIF p.kind = 'schedule_fix' THEN
      -- Correction d'une erreur de saisie : la compagnie n'a rien changé, le statut reste tel quel.
      SELECT * INTO i FROM public.bw_watch_items WHERE id = p.item_id;
      SELECT * INTO s FROM public.bw_watch_sources WHERE id = i.source_id;
      UPDATE public.departures SET
        departure_at = CASE WHEN p.field = 'departure_at' THEN p.proposed_value::timestamptz ELSE departure_at END,
        arrival_at = CASE WHEN p.field = 'arrival_at' THEN p.proposed_value::timestamptz ELSE arrival_at END,
        vessel_id = CASE WHEN p.field = 'vessel_id' THEN p.proposed_value::uuid ELSE vessel_id END,
        source_name = left(s.name, 120), source_url = s.url, last_verified_at = now()
      WHERE id = p.departure_id;
      UPDATE public.departures SET duration_minutes = round(extract(epoch FROM (arrival_at - departure_at)) / 60)
      WHERE id = p.departure_id AND arrival_at IS NOT NULL AND arrival_at > departure_at;
      did := true;
    ELSIF p.kind = 'new_departure' THEN
      SELECT * INTO i FROM public.bw_watch_items WHERE id = p.item_id;
      SELECT * INTO s FROM public.bw_watch_sources WHERE id = i.source_id;
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
      did := true;
    ELSIF p.kind = 'remove_departure' THEN
      -- La proposition est détachée avant la suppression, sinon elle disparaîtrait avec la traversée.
      SELECT * INTO i FROM public.bw_watch_items WHERE id = p.item_id;
      SELECT * INTO s FROM public.bw_watch_sources WHERE id = i.source_id;
      UPDATE public.bw_watch_proposals SET departure_id = NULL, departure_ids = '{}' WHERE id = p_id;
      PERFORM public.bw_admin_remove_departure(p.departure_id, true, left('Absente du planning officiel (' || s.name || ')', 300));
      did := true;
    ELSIF p.kind = 'crossing' THEN
      UPDATE public.departures SET
        web_departed_at = CASE WHEN p.field = 'web_departed_at' THEN p.proposed_value::timestamptz ELSE web_departed_at END,
        web_arrived_at = CASE WHEN p.field = 'web_arrived_at' THEN p.proposed_value::timestamptz ELSE web_arrived_at END,
        web_eta_at = CASE WHEN p.field = 'web_eta_at' THEN p.proposed_value::timestamptz ELSE web_eta_at END
      WHERE id = p.departure_id;
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
      -- Le texte publié est celui relu par l'équipe, sinon le texte grand public proposé ;
      -- la note interne de la veille n'est publiée qu'en dernier recours.
      v_title := left(coalesce(nullif(trim(p_news->>'title'), ''), p.title), 160);
      v_summary := left(coalesce(nullif(trim(p_news->>'summary'), ''), p.public_summary, p.summary), 400);
      IF p_news IS NOT NULL AND jsonb_typeof(p_news->'departure_ids') = 'array' THEN
        v_deps := ARRAY(
          SELECT d.id FROM public.departures d
          WHERE d.id::text IN (
            SELECT x FROM jsonb_array_elements_text(p_news->'departure_ids') x
            WHERE x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
          LIMIT 12);
      ELSE
        v_deps := CASE WHEN cardinality(p.departure_ids) > 0 THEN p.departure_ids
                       WHEN p.departure_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p.departure_id] END;
      END IF;
      INSERT INTO public.bw_news(kind, origin, title, summary, source_name, source_url, vessel_id, company_ids, departure_ids,
                                 source_title, source_excerpt, source_published_at, published, created_by)
      VALUES (coalesce(p.proposed_value, 'info'), CASE WHEN s.tier = 'official' THEN 'official' ELSE 'media' END, v_title, v_summary,
              left(s.name, 80), i.url, p.vessel_id,
              CASE WHEN p.company_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p.company_id] END,
              v_deps, left(i.title, 200), left(i.excerpt, 300), i.published_at,
              true, auth.uid());
      did := true;
    END IF;
  END IF;
  UPDATE public.bw_watch_proposals
     SET status = p_decision, applied = did, decided_by = auth.uid(), decided_at = now(), decision_note = left(p_note, 300)
   WHERE id = p_id;
  RETURN jsonb_build_object('status', p_decision, 'applied', did);
END $function$;

-- Planning : une fois par jour (05:23 UTC). Capitaineries (arrivées constatées) : toutes les 3 heures.
-- Même secret que les autres tâches planifiées.
DO $do$ BEGIN PERFORM cron.unschedule('bledway-planning-check'); EXCEPTION WHEN others THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.unschedule('bledway-ports-check'); EXCEPTION WHEN others THEN NULL; END $do$;
SELECT cron.schedule('bledway-planning-check', '23 5 * * *', $job$
  SELECT net.http_get(
    url := 'https://lwyjhgyuqyflaanrbgkq.supabase.co/functions/v1/schedule-check?scope=planning',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bledway_cron_secret')),
    timeout_milliseconds := 60000
  );
$job$);
SELECT cron.schedule('bledway-ports-check', '53 */3 * * *', $job$
  SELECT net.http_get(
    url := 'https://lwyjhgyuqyflaanrbgkq.supabase.co/functions/v1/schedule-check?scope=ports',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bledway_cron_secret')),
    timeout_milliseconds := 60000
  );
$job$);
