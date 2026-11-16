-- Partage d'une préparation de voyage, réservé aux adresses invitées (16/11/2026).
-- Avant : toute la préparation tenait dans un très long lien, lisible par quiconque l'avait.
-- Maintenant : la préparation est rangée ici sous un identifiant court ; seul son auteur et les
-- comptes dont l'adresse e-mail confirmée a été invitée peuvent la lire. Le partage expire.

CREATE TABLE IF NOT EXISTS public.bw_prep_shares (
  id text PRIMARY KEY DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND pg_column_size(data) < 60000),
  emails text[] NOT NULL CHECK (cardinality(emails) BETWEEN 1 AND 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '120 days'
);
CREATE INDEX IF NOT EXISTS bw_prep_shares_owner ON public.bw_prep_shares (owner_id);

-- Adresses rangées en minuscules, sans espaces.
CREATE OR REPLACE FUNCTION private.bw_prep_shares_clean()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user = 'authenticated' THEN NEW.owner_id := auth.uid(); END IF;
  NEW.emails := ARRAY(SELECT DISTINCT lower(trim(e)) FROM unnest(NEW.emails) e
                       WHERE trim(e) ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
  IF cardinality(NEW.emails) = 0 THEN RAISE EXCEPTION 'Adresse e-mail invalide'; END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS bw_prep_shares_clean ON public.bw_prep_shares;
CREATE TRIGGER bw_prep_shares_clean BEFORE INSERT OR UPDATE ON public.bw_prep_shares
  FOR EACH ROW EXECUTE FUNCTION private.bw_prep_shares_clean();

ALTER TABLE public.bw_prep_shares ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bw_prep_shares TO authenticated;

DROP POLICY IF EXISTS bw_prep_shares_owner ON public.bw_prep_shares;
CREATE POLICY bw_prep_shares_owner ON public.bw_prep_shares FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

-- L'adresse confirmée du compte connecté (null sinon) : lue avec les droits du propriétaire,
-- car un compte ne peut pas lire auth.users directement.
CREATE OR REPLACE FUNCTION public.bw_my_confirmed_email()
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT lower(u.email) FROM auth.users u
   WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
$function$;
REVOKE ALL ON FUNCTION public.bw_my_confirmed_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_my_confirmed_email() TO authenticated;

-- Un invité lit seulement si l'adresse confirmée de son compte figure dans la liste.
DROP POLICY IF EXISTS bw_prep_shares_guest ON public.bw_prep_shares;
CREATE POLICY bw_prep_shares_guest ON public.bw_prep_shares FOR SELECT TO authenticated
  USING (expires_at > now() AND (SELECT public.bw_my_confirmed_email()) = ANY (emails));
