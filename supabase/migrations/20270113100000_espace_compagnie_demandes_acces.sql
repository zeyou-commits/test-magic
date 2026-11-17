-- BledWay · Espace compagnie : demandes d'accès envoyées depuis la page d'accueil professionnelle.
-- Prérequis : lots 1 et 2 de l'espace compagnie installés.
-- Principe : le formulaire passe par le serveur (rôle service_role), jamais directement par le
-- navigateur. Une demande ne donne aucun accès : un administrateur la lit, contacte la personne
-- et, s'il le décide, crée une invitation avec l'outil habituel. Rien n'est jamais effacé.
-- Le script peut être relancé : il ne crée que ce qui manque et remplace ses propres fonctions.

BEGIN;

CREATE TABLE IF NOT EXISTS public.bw_company_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 120),
  company_name text NOT NULL CHECK (char_length(btrim(company_name)) BETWEEN 2 AND 120),
  -- Compagnie choisie dans la liste de BledWay, si la personne l'a trouvée.
  company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL,
  job_title text NOT NULL CHECK (char_length(btrim(job_title)) BETWEEN 2 AND 120),
  email text NOT NULL CHECK (char_length(email) <= 255 AND email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 40),
  message text CHECK (message IS NULL OR char_length(message) <= 1000),
  -- Compte BledWay de la personne, si elle était connectée en envoyant la demande.
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  -- Empreinte de l'adresse réseau, seulement pour limiter les envois répétés.
  ip_hash text CHECK (ip_hash IS NULL OR char_length(ip_hash) <= 64),
  consent boolean NOT NULL CHECK (consent),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'invited', 'declined', 'spam')),
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  decided_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bw_company_access_requests_recent
  ON public.bw_company_access_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS bw_company_access_requests_email
  ON public.bw_company_access_requests (email, created_at DESC);
CREATE INDEX IF NOT EXISTS bw_company_access_requests_ip
  ON public.bw_company_access_requests (ip_hash, created_at DESC) WHERE ip_hash IS NOT NULL;

ALTER TABLE public.bw_company_access_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_company_access_requests FROM PUBLIC, anon, authenticated;
-- Supabase donne d'office tous les droits au rôle serveur sur une nouvelle table : on les fixe.
REVOKE ALL ON public.bw_company_access_requests FROM service_role;
GRANT SELECT, INSERT, UPDATE ON public.bw_company_access_requests TO service_role;

-- Envoi d'une demande. Limites : 3 par adresse réseau et 3 par e-mail sur 24 h, 200 au total.
CREATE OR REPLACE FUNCTION public.bw_company_access_request_submit(
  _full_name text, _company_name text, _company_id uuid, _job_title text, _email text,
  _phone text, _message text, _user uuid, _ip_hash text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  clean_email text := lower(btrim(coalesce(_email, '')));
  new_id uuid;
BEGIN
  IF char_length(btrim(coalesce(_full_name, ''))) NOT BETWEEN 2 AND 120
     OR char_length(btrim(coalesce(_company_name, ''))) NOT BETWEEN 2 AND 120
     OR char_length(btrim(coalesce(_job_title, ''))) NOT BETWEEN 2 AND 120
     OR clean_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR char_length(clean_email) > 255
     OR char_length(coalesce(_phone, '')) > 40 OR char_length(coalesce(_message, '')) > 1000
     OR (_company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id)) THEN
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  IF (_ip_hash IS NOT NULL AND (SELECT count(*) FROM public.bw_company_access_requests
        WHERE ip_hash = _ip_hash AND created_at > now() - interval '1 day') >= 3)
     OR (SELECT count(*) FROM public.bw_company_access_requests
         WHERE email = clean_email AND created_at > now() - interval '1 day') >= 3
     OR (SELECT count(*) FROM public.bw_company_access_requests
         WHERE created_at > now() - interval '1 day') >= 200 THEN
    RAISE EXCEPTION 'BW_LIMIT';
  END IF;
  INSERT INTO public.bw_company_access_requests (full_name, company_name, company_id, job_title, email,
    phone, message, user_id, ip_hash, consent)
  VALUES (btrim(_full_name), btrim(_company_name), _company_id, btrim(_job_title), clean_email,
    nullif(btrim(coalesce(_phone, '')), ''), nullif(btrim(coalesce(_message, '')), ''),
    CASE WHEN EXISTS (SELECT 1 FROM auth.users WHERE id = _user) THEN _user END, _ip_hash, true)
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

-- Liste des demandes pour les administrateurs (200 plus récentes).
CREATE OR REPLACE FUNCTION public.bw_company_access_requests_list(_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.bw_company_staff_ok(_actor, ARRAY['admin']) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  RETURN jsonb_build_object(
    'requests', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'fullName', r.full_name,
        'companyName', r.company_name, 'companyId', r.company_id, 'knownCompany', c.name,
        'jobTitle', r.job_title, 'email', r.email, 'phone', r.phone, 'message', r.message,
        'hasAccount', r.user_id IS NOT NULL, 'status', r.status, 'decisionNote', r.decision_note,
        'decidedAt', r.decided_at, 'createdAt', r.created_at) ORDER BY r.created_at DESC)
      FROM (SELECT * FROM public.bw_company_access_requests ORDER BY created_at DESC LIMIT 200) r
      LEFT JOIN public.companies c ON c.id = r.company_id
    ), '[]'::jsonb),
    'pending', (SELECT count(*) FROM public.bw_company_access_requests WHERE status = 'new')
  );
END $$;

-- Suivi d'une demande : contactée, invitée, refusée ou indésirable. Jamais effacée.
CREATE OR REPLACE FUNCTION public.bw_company_access_request_decide(
  _actor uuid, _id uuid, _status text, _note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.bw_company_staff_ok(_actor, ARRAY['admin']) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  IF _status NOT IN ('new', 'contacted', 'invited', 'declined', 'spam')
     OR char_length(coalesce(_note, '')) > 500 THEN
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  UPDATE public.bw_company_access_requests
  SET status = _status, decision_note = nullif(btrim(coalesce(_note, '')), ''),
      decided_by = _actor, decided_at = now()
  WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BW_NOT_FOUND'; END IF;
  INSERT INTO public.bw_user_admin_log (actor_id, target_id, action, details)
  VALUES (_actor, NULL, 'company_access_request_' || _status, jsonb_build_object('request', _id));
END $$;

REVOKE ALL ON FUNCTION
  public.bw_company_access_request_submit(text, text, uuid, text, text, text, text, uuid, text),
  public.bw_company_access_requests_list(uuid),
  public.bw_company_access_request_decide(uuid, uuid, text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.bw_company_access_request_submit(text, text, uuid, text, text, text, text, uuid, text),
  public.bw_company_access_requests_list(uuid),
  public.bw_company_access_request_decide(uuid, uuid, text, text)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
