-- BledWay · Messages d'exemple de l'aperçu des salons, gérés depuis l'admin.
-- Affichés (marqués « Exemple ») tant que les vrais messages récents sont rares.

CREATE TABLE IF NOT EXISTS public.bw_chat_demo_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pseudo text NOT NULL CHECK (char_length(pseudo) BETWEEN 2 AND 30),
  avatar text NOT NULL,
  label text NOT NULL CHECK (char_length(label) BETWEEN 2 AND 60),
  body text NOT NULL CHECK (char_length(body) BETWEEN 2 AND 140),
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bw_chat_demo_messages ENABLE ROW LEVEL SECURITY;

-- Tout le monde lit les exemples actifs ; seule l'équipe les écrit.
DROP POLICY IF EXISTS bw_chat_demo_read ON public.bw_chat_demo_messages;
CREATE POLICY bw_chat_demo_read ON public.bw_chat_demo_messages
  FOR SELECT TO anon, authenticated
  USING (active OR (SELECT private.bw_staff_permission(ARRAY['admin', 'editor'])));
DROP POLICY IF EXISTS bw_chat_demo_staff ON public.bw_chat_demo_messages;
CREATE POLICY bw_chat_demo_staff ON public.bw_chat_demo_messages
  FOR ALL TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin', 'editor'])))
  WITH CHECK ((SELECT private.bw_staff_permission(ARRAY['admin', 'editor'])));
GRANT SELECT ON public.bw_chat_demo_messages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bw_chat_demo_messages TO authenticated;

-- Les cinq exemples de départ, à reprendre ou remplacer depuis l'admin.
INSERT INTO public.bw_chat_demo_messages (pseudo, avatar, label, body, sort)
SELECT * FROM (VALUES
  ('Nadia', 'maman', 'Marseille → Alger', 'On est déjà dans la file, ça avance doucement mais ça avance !', 10),
  ('Karim', 'papa', 'Alicante → Oran', 'Quelqu''un sait si le restaurant à bord est ouvert ce soir ?', 20),
  ('Samia', 'fille_bled', 'Port de Sète', 'Parking plein côté gare maritime, prévoyez de l''avance.', 30),
  ('Yacine', 'jeune_degrade', 'Valence → Alger', 'Mer calme pour l''instant, les enfants dorment enfin 😄', 40),
  ('Lina', 'tata_houria', 'Barcelone → Oran', 'Contrôles rapides ce matin, 20 minutes à peine.', 50)
) AS seed(pseudo, avatar, label, body, sort)
WHERE NOT EXISTS (SELECT 1 FROM public.bw_chat_demo_messages);
