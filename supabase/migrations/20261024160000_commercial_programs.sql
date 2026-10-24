BEGIN;
CREATE OR REPLACE FUNCTION public.bw_valid_official_urls(_urls text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT cardinality(_urls)<=6 AND NOT EXISTS(SELECT 1 FROM unnest(_urls) url WHERE url IS NULL OR length(url)>2048 OR url !~ '^https://[^[:space:]]+$');
$$;
ALTER TABLE public.route_operators ADD COLUMN IF NOT EXISTS official_urls text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.route_operators ADD COLUMN IF NOT EXISTS commercial_checked_at timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bw_operator_urls_valid' AND conrelid='public.route_operators'::regclass) THEN
    ALTER TABLE public.route_operators ADD CONSTRAINT bw_operator_urls_valid CHECK(public.bw_valid_official_urls(official_urls));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.bw_port_zone(_country text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE upper(trim(_country)) WHEN 'DZ' THEN 'Africa/Algiers' WHEN 'ES' THEN 'Europe/Madrid' WHEN 'IT' THEN 'Europe/Rome'
    WHEN 'PT' THEN 'Europe/Lisbon' WHEN 'MT' THEN 'Europe/Malta' WHEN 'GR' THEN 'Europe/Athens' WHEN 'TR' THEN 'Europe/Istanbul'
    WHEN 'TN' THEN 'Africa/Tunis' WHEN 'MA' THEN 'Africa/Casablanca' WHEN 'BE' THEN 'Europe/Brussels' WHEN 'DE' THEN 'Europe/Berlin'
    WHEN 'NL' THEN 'Europe/Amsterdam' WHEN 'GB' THEN 'Europe/London' ELSE 'Europe/Paris' END;
$$;
ALTER TABLE public.departures ADD COLUMN IF NOT EXISTS bw_schedule_date date;
-- Mémorise l'occurrence avant toute correction de date ; les éditions suivantes conservent cette clé.
UPDATE public.departures d SET bw_schedule_date=(d.departure_at AT TIME ZONE public.bw_port_zone(p.country_code))::date
  FROM public.routes r JOIN public.ports p ON p.id=r.departure_port_id
  WHERE d.route_id=r.id AND d.schedule_id IS NOT NULL AND d.bw_schedule_date IS NULL;

-- Ajoute uniquement ce qui manque. Aucun DELETE : les corrections et les suivis conservent leur départ.
CREATE OR REPLACE FUNCTION public.bw_generate_schedule_missing(_schedule uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.schedules; ex public.schedule_exceptions; day date; first_day date; last_day date;
  zone text; country text; start_at timestamptz; added integer:=0; boat uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles r JOIN auth.users u ON u.id=r.user_id
    WHERE r.user_id=auth.uid() AND r.role::text IN ('admin','editor') AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()))
    THEN RAISE EXCEPTION 'Accès édition requis.'; END IF;
  SELECT * INTO s FROM public.schedules WHERE id=_schedule FOR UPDATE;
  IF NOT FOUND OR s.status::text<>'active' OR s.duration_minutes<=0 OR s.duration_minutes>10080 THEN RAISE EXCEPTION 'Calendrier actif valide requis.'; END IF;
  -- Même compagnie et même ligne : deux générations concurrentes ne créent pas de doublon.
  PERFORM pg_advisory_xact_lock(hashtextextended(s.route_id::text||':'||s.company_id::text,0));
  SELECT p.country_code INTO country FROM public.routes r JOIN public.ports p ON p.id=r.departure_port_id WHERE r.id=s.route_id;
  zone:=public.bw_port_zone(country);
  first_day:=greatest((now() AT TIME ZONE zone)::date,s.valid_from);
  last_day:=least(first_day+59,coalesce(s.valid_to,first_day+59));
  FOR day IN SELECT generate_series(first_day,last_day,'1 day'::interval)::date LOOP
    IF NOT extract(isodow FROM day)::smallint=ANY(s.weekdays) THEN CONTINUE; END IF;
    SELECT * INTO ex FROM public.schedule_exceptions WHERE schedule_id=s.id AND exception_date=day;
    IF FOUND AND ex.exception_type::text='cancellation' THEN CONTINUE; END IF;
    start_at:=(day+coalesce(ex.new_departure_time,s.departure_time)) AT TIME ZONE zone;
    boat:=coalesce(ex.new_vessel_id,s.default_vessel_id);
    IF start_at<=now() THEN CONTINUE; END IF;
    -- Une correction manuelle d'heure le même jour et une annulation sont conservées.
    IF EXISTS(SELECT 1 FROM public.departures d WHERE d.company_id=s.company_id AND d.route_id=s.route_id AND
      (d.departure_at=start_at OR (d.schedule_id=s.id AND coalesce(d.bw_schedule_date,(d.departure_at AT TIME ZONE zone)::date)=day))) THEN CONTINUE; END IF;
    INSERT INTO public.departures(route_id,company_id,vessel_id,schedule_id,departure_at,arrival_at,duration_minutes,status,reliability,source_name,source_url,last_verified_at,is_demo,bw_schedule_date)
      VALUES(s.route_id,s.company_id,boat,s.id,start_at,start_at+make_interval(mins=>s.duration_minutes),s.duration_minutes,'scheduled',s.reliability,s.source_name,s.source_url,s.last_verified_at,s.is_demo,day);
    added:=added+1;
  END LOOP;
  RETURN added;
END $$;
REVOKE ALL ON FUNCTION public.bw_generate_schedule_missing(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bw_generate_schedule_missing(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
