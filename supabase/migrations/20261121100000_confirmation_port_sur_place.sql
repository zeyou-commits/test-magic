-- Au port, confirmer ou démentir un signalement exige d'être sur place, comme le signaler.
CREATE OR REPLACE FUNCTION public.bw_alert_action(p_alert uuid, p_action text, p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE a public.bw_travel_alerts; n_denials integer; n_confirms integer;
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  SELECT * INTO a FROM public.bw_travel_alerts WHERE id=p_alert AND NOT resolved AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ce signalement a expiré'; END IF;
  IF p_action IN ('confirm','deny') AND a.target_kind='port' AND NOT private.bw_on_site(a.target_kind,a.target_id,p_lat,p_lng) THEN
    RAISE EXCEPTION 'Pour répondre à un signalement de port, il faut être sur place, à moins de 3 km, localisation activée.';
  END IF;
  IF p_action='resolve' AND (a.user_id=auth.uid() OR coalesce(private.bw_staff_permission(ARRAY['admin','moderator']),false)) THEN
    UPDATE public.bw_travel_alerts SET resolved=true WHERE id=p_alert;
  ELSIF p_action='confirm' AND a.user_id<>auth.uid() THEN
    DELETE FROM public.bw_alert_denials WHERE alert_id=p_alert AND user_id=auth.uid();
    INSERT INTO public.bw_alert_confirmations(alert_id,user_id,on_site)
    VALUES(p_alert,auth.uid(),private.bw_on_site(a.target_kind,a.target_id,p_lat,p_lng))
    ON CONFLICT (alert_id,user_id) DO UPDATE SET on_site = public.bw_alert_confirmations.on_site OR excluded.on_site;
  ELSIF p_action='deny' AND a.user_id<>auth.uid() THEN
    DELETE FROM public.bw_alert_confirmations WHERE alert_id=p_alert AND user_id=auth.uid();
    INSERT INTO public.bw_alert_denials(alert_id,user_id) VALUES(p_alert,auth.uid()) ON CONFLICT DO NOTHING;
    SELECT count(*) INTO n_denials FROM public.bw_alert_denials WHERE alert_id=p_alert;
    SELECT count(*) INTO n_confirms FROM public.bw_alert_confirmations WHERE alert_id=p_alert;
    IF n_denials >= 2 AND n_denials > n_confirms THEN
      UPDATE public.bw_travel_alerts SET resolved=true WHERE id=p_alert;
    END IF;
  ELSE RAISE EXCEPTION 'Action non autorisée'; END IF;
END $function$;
