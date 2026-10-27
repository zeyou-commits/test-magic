-- BledWay · Messages de l'équipe aux voyageurs, envoyés tout de suite ou planifiés.
-- L'admin choisit qui prévenir (une traversée, un bateau, un port un jour donné, une ligne, ou tout le monde),
-- rédige à partir d'un modèle, puis confirme. Les messages planifiés partent au passage suivant
-- de l'envoi automatique (toutes les 10 minutes si le script du 03/11/2026 est actif).
-- Script additif : aucune donnée existante n'est modifiée ni supprimée, il peut être relancé.
BEGIN;

CREATE TABLE IF NOT EXISTS public.bw_admin_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience jsonb NOT NULL,
  audience_label text NOT NULL DEFAULT '' CHECK (char_length(audience_label) <= 200),
  category text NOT NULL DEFAULT 'reminders' CHECK (category IN ('reminders','community')),
  template text NOT NULL DEFAULT 'free' CHECK (char_length(template) <= 30),
  title text NOT NULL CHECK (char_length(title) BETWEEN 4 AND 80),
  body text NOT NULL CHECK (char_length(body) BETWEEN 4 AND 300),
  url text NOT NULL DEFAULT '/' CHECK (url ~ '^/'),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','sending','sent','cancelled','failed')),
  recipients integer,
  news_id uuid,
  last_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS bw_admin_messages_due ON public.bw_admin_messages(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS bw_admin_messages_recent ON public.bw_admin_messages(created_at DESC);
-- Lecture et écriture uniquement par le serveur du site (route admin protégée).
ALTER TABLE public.bw_admin_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_admin_messages FROM anon, authenticated;
GRANT ALL ON public.bw_admin_messages TO service_role;

-- L'envoi automatique toutes les 10 minutes est-il en place ? (pour prévenir l'admin qui planifie)
CREATE OR REPLACE FUNCTION public.bw_push_scheduler_active()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE found boolean;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN false; END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = ''bledway-push-10m'' AND active)' INTO found;
  RETURN coalesce(found, false);
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.bw_push_scheduler_active() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_push_scheduler_active() TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
