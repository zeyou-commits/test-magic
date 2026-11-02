-- BledWay · Une notification déjà poussée ne repart plus, même après une déconnexion.
-- Se déconnecter supprime l'abonnement du téléphone et, avec lui, la trace de ses envois :
-- la mémoire est donc portée par la notification elle-même.

ALTER TABLE public.bw_notifications ADD COLUMN IF NOT EXISTS pushed_at timestamptz;

-- Tout ce qui existe déjà est considéré comme envoyé : aucune rafale à la mise en ligne.
UPDATE public.bw_notifications SET pushed_at = now() WHERE pushed_at IS NULL;
