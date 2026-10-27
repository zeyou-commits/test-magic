-- BledWay · Un téléphone appartient au compte connecté.
-- Quand on change de compte sur le même téléphone, son abonnement aux notifications passe au nouveau
-- compte (avant, il pouvait rester bloqué sur l'ancien, et plus personne ne recevait rien).
-- Script additif : aucune donnée n'est supprimée en dehors de cet abonnement repris ; il peut être relancé.
BEGIN;

CREATE OR REPLACE FUNCTION public.bw_claim_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
  IF p_endpoint !~ '^https://' THEN RAISE EXCEPTION 'Abonnement invalide'; END IF;
  -- Le même téléphone ne peut appartenir qu'à un seul compte : celui qui vient de l'activer.
  DELETE FROM public.bw_push_subscriptions WHERE endpoint = p_endpoint AND user_id <> auth.uid();
  INSERT INTO public.bw_push_subscriptions(user_id, endpoint, p256dh, auth_key)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth)
  ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth_key = excluded.auth_key;
END $$;
REVOKE ALL ON FUNCTION public.bw_claim_push_subscription(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_claim_push_subscription(text,text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
