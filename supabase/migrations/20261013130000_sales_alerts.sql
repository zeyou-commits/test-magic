-- Alertes « prévenez-moi à l'ouverture des ventes » : un visiteur laisse son e-mail pour une période
-- (ex. vacances de Noël) sans traversée programmée. Aucun envoi automatique : la liste sert à l'équipe.
CREATE TABLE IF NOT EXISTS public.sales_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  from_label text,
  to_label text,
  period_label text,
  period_start date,
  period_end date,
  consent boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_alerts_email_check CHECK (char_length(email) BETWEEN 5 AND 254 AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT sales_alerts_consent_check CHECK (consent)
);

GRANT INSERT ON public.sales_alerts TO anon, authenticated;
GRANT SELECT ON public.sales_alerts TO authenticated;
GRANT ALL ON public.sales_alerts TO service_role;
ALTER TABLE public.sales_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_alerts_public_insert" ON public.sales_alerts
  FOR INSERT TO anon, authenticated WITH CHECK (consent);
CREATE POLICY "sales_alerts_admin_read" ON public.sales_alerts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
