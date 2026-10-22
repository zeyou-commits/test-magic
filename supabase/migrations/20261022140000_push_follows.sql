-- Abonnements Web Push et suivi des navires/traversées, privés par utilisateur.
CREATE TABLE public.bw_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  CONSTRAINT bw_push_endpoint_https CHECK (endpoint ~ '^https://'),
  CONSTRAINT bw_push_keys CHECK (length(p256dh) BETWEEN 30 AND 512 AND length(auth_key) BETWEEN 8 AND 256)
);
CREATE INDEX bw_push_subscriptions_user ON public.bw_push_subscriptions(user_id);

CREATE TABLE public.bw_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_kind text NOT NULL CHECK (target_kind IN ('vessel','departure')),
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  last_community_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,target_kind,target_id),
  CONSTRAINT bw_follows_target_exists CHECK (target_id <> '00000000-0000-0000-0000-000000000000'::uuid)
);
CREATE INDEX bw_follows_target ON public.bw_follows(target_kind,target_id) WHERE active;

CREATE TABLE public.bw_itinerary_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  period_month date NOT NULL CHECK (extract(day FROM period_month)=1),
  origin_label text NOT NULL,
  destination_label text NOT NULL,
  journey_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,route_id,period_month),
  CONSTRAINT bw_itinerary_labels_length CHECK (length(origin_label) BETWEEN 2 AND 250 AND length(destination_label) BETWEEN 2 AND 250)
);
CREATE INDEX bw_itinerary_watches_route_period ON public.bw_itinerary_watches(route_id,period_month) WHERE active;

CREATE TABLE public.bw_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  follow_id uuid REFERENCES public.bw_follows(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  url text NOT NULL DEFAULT '/',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE(user_id,event_key)
);
CREATE INDEX bw_notifications_user ON public.bw_notifications(user_id,created_at DESC);

CREATE TABLE public.bw_push_deliveries (
  notification_id uuid NOT NULL REFERENCES public.bw_notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.bw_push_subscriptions(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  last_error text,
  PRIMARY KEY(notification_id,subscription_id)
);
CREATE INDEX bw_push_deliveries_pending ON public.bw_push_deliveries(attempts) WHERE sent_at IS NULL;

ALTER TABLE public.bw_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_itinerary_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_push_subscriptions,public.bw_follows,public.bw_itinerary_watches,public.bw_notifications,public.bw_push_deliveries FROM anon;

CREATE POLICY bw_push_own_select ON public.bw_push_subscriptions FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY bw_push_own_insert ON public.bw_push_subscriptions FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid());
CREATE POLICY bw_push_own_update ON public.bw_push_subscriptions FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY bw_push_own_delete ON public.bw_push_subscriptions FOR DELETE TO authenticated USING (user_id=auth.uid());
CREATE POLICY bw_follows_own_select ON public.bw_follows FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY bw_follows_own_insert ON public.bw_follows FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid());
CREATE POLICY bw_follows_own_update ON public.bw_follows FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY bw_follows_own_delete ON public.bw_follows FOR DELETE TO authenticated USING (user_id=auth.uid());
CREATE POLICY bw_itinerary_watches_own_select ON public.bw_itinerary_watches FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY bw_itinerary_watches_own_insert ON public.bw_itinerary_watches FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid());
CREATE POLICY bw_itinerary_watches_own_update ON public.bw_itinerary_watches FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY bw_itinerary_watches_own_delete ON public.bw_itinerary_watches FOR DELETE TO authenticated USING (user_id=auth.uid());
CREATE POLICY bw_notifications_own_select ON public.bw_notifications FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY bw_notifications_own_update ON public.bw_notifications FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY bw_follows_admin_select ON public.bw_follows FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY bw_itinerary_watches_admin_select ON public.bw_itinerary_watches FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY bw_notifications_admin_select ON public.bw_notifications FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY bw_push_deliveries_admin_select ON public.bw_push_deliveries FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

GRANT SELECT,INSERT,UPDATE,DELETE ON public.bw_push_subscriptions,public.bw_follows TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.bw_itinerary_watches TO authenticated;
GRANT SELECT,UPDATE ON public.bw_notifications TO authenticated;
GRANT SELECT ON public.bw_push_deliveries TO authenticated;
GRANT ALL ON public.bw_push_subscriptions,public.bw_follows,public.bw_notifications TO service_role;
GRANT ALL ON public.bw_itinerary_watches TO service_role;
GRANT ALL ON public.bw_push_deliveries TO service_role;
GRANT SELECT ON public.bw_travel_alerts,public.bw_vessel_reviews TO service_role;
