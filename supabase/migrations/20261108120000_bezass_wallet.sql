-- Portefeuille privé et cache partagé des taux. Aucune clé utilisateur dans le navigateur pour la collecte.
CREATE TABLE IF NOT EXISTS public.bw_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bw_wallet_data_object CHECK (jsonb_typeof(data) = 'object')
);
ALTER TABLE public.bw_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bw_wallet_select_own ON public.bw_wallets;
DROP POLICY IF EXISTS bw_wallet_insert_own ON public.bw_wallets;
DROP POLICY IF EXISTS bw_wallet_update_own ON public.bw_wallets;
CREATE POLICY bw_wallet_select_own ON public.bw_wallets FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY bw_wallet_insert_own ON public.bw_wallets FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY bw_wallet_update_own ON public.bw_wallets FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE ON public.bw_wallets TO authenticated;

CREATE TABLE IF NOT EXISTS public.bw_fx_cache (
  id text PRIMARY KEY CHECK (id = 'latest'),
  rates jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz,
  attempted_at timestamptz
);
ALTER TABLE public.bw_fx_cache ENABLE ROW LEVEL SECURITY;
INSERT INTO public.bw_fx_cache(id) VALUES ('latest') ON CONFLICT DO NOTHING;
REVOKE ALL ON public.bw_fx_cache FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.bw_claim_fx_refresh() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected integer;
BEGIN
  PERFORM pg_advisory_xact_lock(728604);
  UPDATE public.bw_fx_cache SET attempted_at = now()
    WHERE id = 'latest' AND (attempted_at IS NULL OR attempted_at < now() - interval '12 hours');
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END $$;
REVOKE ALL ON FUNCTION public.bw_claim_fx_refresh() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_claim_fx_refresh() TO service_role;
