CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM public;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

DROP POLICY "companies_admin_write" ON public.companies;
CREATE POLICY "companies_admin_write" ON public.companies FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
DROP POLICY "departures_admin_write" ON public.departures;
CREATE POLICY "departures_admin_write" ON public.departures FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
DROP POLICY "moderation_log_admin_read" ON public.moderation_log;
CREATE POLICY "moderation_log_admin_read" ON public.moderation_log FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'admin'));
DROP POLICY "port_reviews_admin_all" ON public.port_reviews;
CREATE POLICY "port_reviews_admin_all" ON public.port_reviews FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
DROP POLICY "port_reviews_admin_read" ON public.port_reviews;
CREATE POLICY "port_reviews_admin_read" ON public.port_reviews FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'admin'));
DROP POLICY "ports_admin_write" ON public.ports;
CREATE POLICY "ports_admin_write" ON public.ports FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
DROP POLICY "rating_criteria_admin_write" ON public.rating_criteria;
CREATE POLICY "rating_criteria_admin_write" ON public.rating_criteria FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
DROP POLICY "reports_admin_all" ON public.reports;
CREATE POLICY "reports_admin_all" ON public.reports FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
DROP POLICY "reports_own_read" ON public.reports;
CREATE POLICY "reports_own_read" ON public.reports FOR SELECT TO authenticated USING (reporter_id = auth.uid() OR private.has_role(auth.uid(),'admin'));
DROP POLICY "review_ratings_admin_all" ON public.review_ratings;
CREATE POLICY "review_ratings_admin_all" ON public.review_ratings FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
DROP POLICY "route_operators_admin_write" ON public.route_operators;
CREATE POLICY "route_operators_admin_write" ON public.route_operators FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
DROP POLICY "routes_admin_write" ON public.routes;
CREATE POLICY "routes_admin_write" ON public.routes FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
DROP POLICY "schedule_exceptions_admin_write" ON public.schedule_exceptions;
CREATE POLICY "schedule_exceptions_admin_write" ON public.schedule_exceptions FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
DROP POLICY "schedules_admin_write" ON public.schedules;
CREATE POLICY "schedules_admin_write" ON public.schedules FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
DROP POLICY "user_roles_admin_all" ON public.user_roles;
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
DROP POLICY "user_roles_self_read" ON public.user_roles;
CREATE POLICY "user_roles_self_read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.has_role(auth.uid(),'admin'));
DROP POLICY "vessels_admin_write" ON public.vessels;
CREATE POLICY "vessels_admin_write" ON public.vessels FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);