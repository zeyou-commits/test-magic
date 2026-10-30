-- Navire en retard : les voyageurs sur place disent s'il est encore à quai ou parti.
-- Les choix passent par les contrôles existants du catalogue ; aucun horaire n'est modifié.
INSERT INTO public.bw_signal_situations
  (code, label, target_kind, color, icon, lifetime_minutes, question, required, sort, active, builtin)
VALUES
  ('state', 'État du navire', 'vessel', '#d97706', 'ship', 120, 'Où en est le navire ?', true, 105, true, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.bw_signal_options (code, situation, label, icon, on_site, sort, active)
VALUES
  ('state_quay', 'state', 'Encore à quai', 'anchor', false, 10, true),
  ('state_departed', 'state', 'Il est parti', 'ship', false, 20, true)
ON CONFLICT (code) DO NOTHING;
