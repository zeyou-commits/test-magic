-- BledWay · Phrases d'amorce des salons et des questions, gérées dans l'admin.
-- Elles se remplissent avec la traversée : {depart}, {arrivee}, {navire}, {compagnie}, {port}.
-- Une phrase dont un mot manque (navire inconnu…) n'est pas proposée.

CREATE TABLE IF NOT EXISTS public.bw_chat_starters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment text NOT NULL CHECK (moment IN ('before', 'boarding', 'sea', 'arrival', 'port', 'questions')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 2 AND 90),
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bw_chat_starters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bw_chat_starters_read ON public.bw_chat_starters;
CREATE POLICY bw_chat_starters_read ON public.bw_chat_starters
  FOR SELECT TO anon, authenticated
  USING (active OR (SELECT private.bw_staff_permission(ARRAY['admin', 'editor'])));
DROP POLICY IF EXISTS bw_chat_starters_staff ON public.bw_chat_starters;
CREATE POLICY bw_chat_starters_staff ON public.bw_chat_starters
  FOR ALL TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin', 'editor'])))
  WITH CHECK ((SELECT private.bw_staff_permission(ARRAY['admin', 'editor'])));
GRANT SELECT ON public.bw_chat_starters TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bw_chat_starters TO authenticated;

INSERT INTO public.bw_chat_starters (moment, body, sort)
SELECT * FROM (VALUES
  -- Avant le départ (plus de 8 h)
  ('before', 'Qui part aussi de {depart} sur le {navire} ?', 10),
  ('before', 'Première traversée vers {arrivee}, des conseils ?', 20),
  ('before', 'Vous comptez arriver à quelle heure au port de {depart} ?', 30),
  ('before', 'Des familles avec enfants sur ce {navire} ?', 40),
  -- Le jour J, avant d''embarquer
  ('boarding', 'La file au port de {depart}, ça avance ?', 10),
  ('boarding', 'L''embarquement du {navire} a commencé ?', 20),
  ('boarding', 'Combien de temps pour les contrôles à {depart} ?', 30),
  ('boarding', 'Je suis au port, quelqu''un est déjà dans la file ?', 40),
  -- En mer
  ('sea', 'Ça bouge beaucoup de votre côté ?', 10),
  ('sea', 'Le restaurant du {navire} est ouvert ?', 20),
  ('sea', 'Une prise libre quelque part à bord ?', 30),
  ('sea', 'On arrive à {arrivee} à l''heure, vous pensez ?', 40),
  -- À l''arrivée
  ('arrival', 'On débarque bientôt à {arrivee} ?', 10),
  ('arrival', 'La douane à {arrivee}, ça avance ?', 20),
  ('arrival', 'Bien arrivés à {arrivee} !', 30),
  -- Direct du port (sur place)
  ('port', 'La file au port de {port}, ça avance ?', 10),
  ('port', 'Le parking du port de {port} est plein ?', 20),
  ('port', 'Les contrôles à {port}, ça va vite ce matin ?', 30),
  ('port', 'Un café ouvert près de l''embarquement ?', 40),
  -- Questions sur la ligne
  ('questions', 'À quelle heure arriver au port de {depart} ?', 10),
  ('questions', 'Peut-on embarquer une remorque sur {depart} → {arrivee} ?', 20),
  ('questions', 'Combien de temps dure vraiment la traversée vers {arrivee} ?', 30),
  ('questions', 'Les cabines valent-elles le coup sur cette ligne ?', 40)
) AS seed(moment, body, sort)
WHERE NOT EXISTS (SELECT 1 FROM public.bw_chat_starters);
