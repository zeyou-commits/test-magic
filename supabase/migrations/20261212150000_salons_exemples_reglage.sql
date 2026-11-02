-- BledWay · Réglage des messages d'exemple de la carte : automatique (sous un seuil de vrais
-- messages), toujours, ou jamais. Modifiable dans l'admin, lisible par la carte.

INSERT INTO public.bw_admin_settings (key, value)
VALUES ('chat_demo', '{"mode": "auto", "threshold": 3}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bw_chat_demo_setting()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT coalesce(
    (SELECT s.value FROM public.bw_admin_settings s WHERE s.key = 'chat_demo'),
    '{"mode": "auto", "threshold": 3}'::jsonb);
$function$;
REVOKE ALL ON FUNCTION public.bw_chat_demo_setting() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_chat_demo_setting() TO anon, authenticated;
