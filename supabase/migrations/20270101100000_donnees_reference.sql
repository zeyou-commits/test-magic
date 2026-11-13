-- Données de référence relevées aux sources officielles ou ouvertes (vacances scolaires d'Europe,
-- consulats d'Algérie en Europe). L'admin relance le relevé, compare, puis approuve : seule la
-- version approuvée (active) est lue par le site ; sans ligne, le site garde les données du dépôt.
CREATE TABLE IF NOT EXISTS public.bw_reference_data (
  key text PRIMARY KEY CHECK (key IN ('vacances', 'consulats')),
  active jsonb,
  active_checked date,
  pending jsonb,
  pending_checked date,
  pending_summary jsonb,
  pending_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  pending_at timestamptz,
  approved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bw_reference_data ENABLE ROW LEVEL SECURITY;

-- Lecture publique de la version approuvée seulement (colonnes) ; l'écriture passe par le serveur.
REVOKE ALL ON public.bw_reference_data FROM anon, authenticated;
GRANT SELECT (key, active, active_checked) ON public.bw_reference_data TO anon, authenticated;
DROP POLICY IF EXISTS bw_reference_data_read ON public.bw_reference_data;
CREATE POLICY bw_reference_data_read ON public.bw_reference_data
  FOR SELECT TO anon, authenticated
  USING (active IS NOT NULL);
