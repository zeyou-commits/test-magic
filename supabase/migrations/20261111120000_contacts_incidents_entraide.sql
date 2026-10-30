-- BledWay · Contacts des compagnies, navire immobilisé (selon source), entraide entre voyageurs.
-- Ajouts seulement. Seules les fiches compagnies vides reçoivent les contacts trouvés sur les sites.
BEGIN;

-- 1. Contacts vérifiables des compagnies.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_url text,
  ADD COLUMN IF NOT EXISTS contact_url text,
  ADD COLUMN IF NOT EXISTS claims_url text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_source_url text,
  ADD COLUMN IF NOT EXISTS contact_verified_at timestamptz;

UPDATE public.companies SET
  booking_url = coalesce(booking_url, 'https://www.corsicalinea.com/tsw/search/'),
  contact_url = coalesce(contact_url, 'https://www.corsicalinea.com/contactez-nous/'),
  claims_url = coalesce(claims_url, 'https://www.corsicalinea.com/informations/legal/#droits-passagers'),
  phone = coalesce(phone, '0825 88 80 88'),
  contact_source_url = coalesce(contact_source_url, 'https://www.corsicalinea.com/eng/more/frequently-asked-questions-faq'),
  contact_verified_at = coalesce(contact_verified_at, '2026-10-30T10:00:00Z')
WHERE slug = 'corsica-linea';
UPDATE public.companies SET
  website_url = coalesce(website_url, 'https://www.gnv.it'),
  booking_url = coalesce(booking_url, 'https://www.gnv.it/en/booking'),
  contact_url = coalesce(contact_url, 'https://www.gnv.it/en/assistence/contacts/information-and-booking'),
  claims_url = coalesce(claims_url, 'https://www.gnv.it/en/assistence/contacts/claims'),
  phone = coalesce(phone, '+33 1 86 26 10 18'),
  contact_source_url = coalesce(contact_source_url, 'https://www.gnv.it/en/assistence/contacts'),
  contact_verified_at = coalesce(contact_verified_at, '2026-10-30T10:00:00Z')
WHERE slug = 'gnv';
UPDATE public.companies SET
  website_url = 'https://algerieferries.com',
  booking_url = coalesce(booking_url, 'https://afs.algerieferries.dz'),
  contact_url = coalesce(contact_url, 'https://algerieferries.com/contact'),
  phone = coalesce(phone, '3307'),
  contact_email = coalesce(contact_email, 'callcenter.entmv@algerieferries.dz'),
  contact_source_url = coalesce(contact_source_url, 'https://algerieferries.com/'),
  contact_verified_at = coalesce(contact_verified_at, '2026-10-30T10:00:00Z')
WHERE slug = 'algerie-ferries';
-- Pages non consultables ou vides le 30/10 : liens de départ, sans date de vérification (« à vérifier »).
UPDATE public.companies SET
  contact_url = coalesce(contact_url, 'https://helpcenter.balearia.com'),
  booking_url = coalesce(booking_url, 'https://www.balearia.com/en/routes-timetables/algeria-regions')
WHERE slug = 'balearia';
UPDATE public.companies SET
  contact_url = coalesce(contact_url, 'https://helpcenter.balearia.com'),
  booking_url = coalesce(booking_url, 'https://www.balearia.com/en/routes-timetables/algeria-regions')
WHERE slug LIKE 'naviera-armas%';
UPDATE public.companies SET
  website_url = coalesce(website_url, 'https://www.nouriselbahrferries.com'),
  booking_url = coalesce(booking_url, 'https://www.nouriselbahrferries.com')
WHERE slug = 'nouris-elbahr-ferries';

-- 2. Signalements voyageurs possibles sur un navire ou une compagnie (arrivent à l'équipe, jamais publics).
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.reports'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%target_type%' LOOP
    EXECUTE format('ALTER TABLE public.reports DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.reports ADD CONSTRAINT reports_target_type_check
  CHECK (target_type = ANY (ARRAY['port','route','departure','review','schedule','vessel','company']));

-- 3. Navire immobilisé : un dossier par événement, et son effet départ par départ.
CREATE TABLE IF NOT EXISTS public.bw_vessel_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id uuid NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  -- reported : à vérifier (équipe seule) ; verifying et confirmed : publics ; resolved : levé ; rejected : écarté.
  status text NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','verifying','confirmed','resolved','rejected')),
  public_note text NOT NULL DEFAULT '' CHECK (char_length(public_note) <= 500),
  source_name text NOT NULL DEFAULT '' CHECK (char_length(source_name) <= 120),
  source_url text CHECK (source_url IS NULL OR source_url ~ '^https://'),
  verified_at timestamptz,
  report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- « Immobilisé selon [source] » : jamais confirmé sans source ni date de vérification.
  CONSTRAINT bw_incident_confirmed_sourced CHECK (status <> 'confirmed' OR (source_name <> '' AND verified_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS bw_vessel_incidents_one_open
  ON public.bw_vessel_incidents (vessel_id) WHERE status IN ('reported','verifying','confirmed');

CREATE TABLE IF NOT EXISTS public.bw_incident_departures (
  incident_id uuid NOT NULL REFERENCES public.bw_vessel_incidents(id) ON DELETE CASCADE,
  departure_id uuid NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  impact text NOT NULL DEFAULT 'possible' CHECK (impact IN ('confirmed','possible','none')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (incident_id, departure_id)
);
CREATE INDEX IF NOT EXISTS bw_incident_departures_departure ON public.bw_incident_departures (departure_id);

-- Trace de chaque changement.
CREATE TABLE IF NOT EXISTS public.bw_incident_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES public.bw_vessel_incidents(id) ON DELETE CASCADE,
  status text NOT NULL,
  source_name text,
  verified_at timestamptz,
  actor uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION private.bw_log_incident() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.source_name IS DISTINCT FROM OLD.source_name
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
    INSERT INTO public.bw_incident_events (incident_id, status, source_name, verified_at)
    VALUES (NEW.id, NEW.status, NEW.source_name, NEW.verified_at);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.bw_log_incident() FROM PUBLIC;
DROP TRIGGER IF EXISTS bw_log_incident ON public.bw_vessel_incidents;
CREATE TRIGGER bw_log_incident AFTER INSERT OR UPDATE ON public.bw_vessel_incidents
  FOR EACH ROW EXECUTE FUNCTION private.bw_log_incident();

ALTER TABLE public.bw_vessel_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_incident_departures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_incident_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bw_incidents_public ON public.bw_vessel_incidents;
CREATE POLICY bw_incidents_public ON public.bw_vessel_incidents FOR SELECT TO anon, authenticated
  USING (status IN ('verifying','confirmed') OR (status = 'resolved' AND updated_at > now() - interval '3 days'));
DROP POLICY IF EXISTS bw_incidents_staff ON public.bw_vessel_incidents;
CREATE POLICY bw_incidents_staff ON public.bw_vessel_incidents FOR ALL TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])))
  WITH CHECK ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
DROP POLICY IF EXISTS bw_incident_departures_public ON public.bw_incident_departures;
CREATE POLICY bw_incident_departures_public ON public.bw_incident_departures FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.bw_vessel_incidents i WHERE i.id = incident_id
    AND (i.status IN ('verifying','confirmed') OR (i.status = 'resolved' AND i.updated_at > now() - interval '3 days'))));
DROP POLICY IF EXISTS bw_incident_departures_staff ON public.bw_incident_departures;
CREATE POLICY bw_incident_departures_staff ON public.bw_incident_departures FOR ALL TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])))
  WITH CHECK ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
DROP POLICY IF EXISTS bw_incident_events_staff ON public.bw_incident_events;
CREATE POLICY bw_incident_events_staff ON public.bw_incident_events FOR SELECT TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
GRANT SELECT ON public.bw_vessel_incidents, public.bw_incident_departures TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bw_vessel_incidents, public.bw_incident_departures TO authenticated;
GRANT SELECT ON public.bw_incident_events TO authenticated;
GRANT ALL ON public.bw_vessel_incidents, public.bw_incident_departures, public.bw_incident_events TO service_role;

-- 4. Entraide : demandes limitées à un port ou un départ, catégories fermées, sans position ni texte libre.
CREATE TABLE IF NOT EXISTS public.bw_help_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_kind text NOT NULL CHECK (scope_kind IN ('port','departure')),
  scope_id uuid NOT NULL,
  need text NOT NULL CHECK (need IN ('medical','baby','water','charger','luggage','elderly')),
  meeting_point text NOT NULL CHECK (meeting_point IN ('checkin','boarding_control','port_entrance','vehicle_queue','ship_reception')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '6 hours',
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS bw_help_requests_scope ON public.bw_help_requests (scope_kind, scope_id, created_at DESC);
CREATE TABLE IF NOT EXISTS public.bw_help_responses (
  request_id uuid NOT NULL REFERENCES public.bw_help_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, user_id)
);
ALTER TABLE public.bw_help_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_help_responses ENABLE ROW LEVEL SECURITY;
-- Aucun accès direct : user_id n'est jamais public, tout passe par les fonctions ci-dessous.
REVOKE ALL ON public.bw_help_requests, public.bw_help_responses FROM anon, authenticated;
GRANT ALL ON public.bw_help_requests, public.bw_help_responses TO service_role;

CREATE OR REPLACE FUNCTION public.bw_help_open(p_kind text, p_scope uuid, p_need text, p_point text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); new_id uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Connectez-vous pour demander de l''aide'; END IF;
  -- Une seule demande ouverte par personne : la nouvelle remplace la précédente.
  UPDATE public.bw_help_requests SET closed_at = now() WHERE user_id = me AND closed_at IS NULL;
  INSERT INTO public.bw_help_requests (user_id, scope_kind, scope_id, need, meeting_point)
  VALUES (me, p_kind, p_scope, p_need, p_point) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.bw_help_list(p_kind text, p_scope uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'need', r.need, 'meeting_point', r.meeting_point, 'created_at', r.created_at,
      'mine', r.user_id = auth.uid(),
      'responders', (SELECT count(*) FROM public.bw_help_responses x WHERE x.request_id = r.id),
      'responded', EXISTS (SELECT 1 FROM public.bw_help_responses x WHERE x.request_id = r.id AND x.user_id = auth.uid()),
      'pseudo', coalesce((SELECT t.pseudo FROM public.bw_traveller_profiles t WHERE t.user_id = r.user_id), 'Un voyageur'),
      'avatar', (SELECT t.avatar FROM public.bw_traveller_profiles t WHERE t.user_id = r.user_id)
    ) ORDER BY (r.need = 'medical') DESC, r.created_at DESC), '[]'::jsonb)
  FROM public.bw_help_requests r
  WHERE r.scope_kind = p_kind AND r.scope_id = p_scope AND r.closed_at IS NULL AND r.expires_at > now();
$$;

CREATE OR REPLACE FUNCTION public.bw_help_respond(p_request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Connectez-vous pour proposer votre aide'; END IF;
  IF EXISTS (SELECT 1 FROM public.bw_help_requests WHERE id = p_request AND user_id = me) THEN
    RAISE EXCEPTION 'C''est votre propre demande';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bw_help_requests WHERE id = p_request AND closed_at IS NULL AND expires_at > now()) THEN
    RAISE EXCEPTION 'Cette demande est terminée';
  END IF;
  INSERT INTO public.bw_help_responses (request_id, user_id) VALUES (p_request, me) ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.bw_help_close(p_request uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.bw_help_requests SET closed_at = now() WHERE id = p_request AND user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.bw_help_open(text,uuid,text,text), public.bw_help_list(text,uuid),
  public.bw_help_respond(uuid), public.bw_help_close(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_help_list(text,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_help_open(text,uuid,text,text), public.bw_help_respond(uuid), public.bw_help_close(uuid) TO authenticated;

-- 5. Envoi immédiat : un signalement équipe ou une réponse d'entraide déclenche le passage d'envoi.
DO $do$
DECLARE t text;
BEGIN
  IF to_regprocedure('private.bw_kick_dispatch()') IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY['reports','bw_help_requests','bw_help_responses','bw_alert_denials','bw_reactions'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS bw_kick_dispatch ON public.%I', t);
      EXECUTE format('CREATE TRIGGER bw_kick_dispatch AFTER INSERT ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION private.bw_kick_dispatch()', t);
    END LOOP;
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
COMMIT;
