-- BledWay · La fonction « ais-listen » vérifie le secret des tâches planifiées sans en garder de copie.
CREATE OR REPLACE FUNCTION public.bw_cron_secret_ok(p_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(p_token <> '' AND p_token = (
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bledway_cron_secret'
  ), false);
$$;
REVOKE ALL ON FUNCTION public.bw_cron_secret_ok(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_cron_secret_ok(text) TO service_role;
NOTIFY pgrst, 'reload schema';
