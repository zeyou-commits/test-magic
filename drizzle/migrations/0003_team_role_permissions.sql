CREATE OR REPLACE FUNCTION private.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles));
$$;
REVOKE EXECUTE ON FUNCTION private.has_any_role(uuid, public.app_role[]) FROM public;
GRANT EXECUTE ON FUNCTION private.has_any_role(uuid, public.app_role[]) TO authenticated, service_role;

-- Éditeurs : gestion des données ferry
CREATE POLICY "ports_editor_write" ON public.ports FOR ALL TO authenticated USING (private.has_any_role(auth.uid(), ARRAY['editor']::public.app_role[])) WITH CHECK (private.has_any_role(auth.uid(), ARRAY['editor']::public.app_role[]));
CREATE POLICY "routes_editor_write" ON public.routes FOR ALL TO authenticated USING (private.has_any_role(auth.uid(), ARRAY['editor']::public.app_role[])) WITH CHECK (private.has_any_role(auth.uid(), ARRAY['editor']::public.app_role[]));
CREATE POLICY "route_operators_editor_write" ON public.route_operators FOR ALL TO authenticated USING (private.has_any_role(auth.uid(), ARRAY['editor']::public.app_role[])) WITH CHECK (private.has_any_role(auth.uid(), ARRAY['editor']::public.app_role[]));
CREATE POLICY "companies_editor_write" ON public.companies FOR ALL TO authenticated USING (private.has_any_role(auth.uid(), ARRAY['editor']::public.app_role[])) WITH CHECK (private.has_any_role(auth.uid(), ARRAY['editor']::public.app_role[]));
CREATE POLICY "vessels_editor_write" ON public.vessels FOR ALL TO authenticated USING (private.has_any_role(auth.uid(), ARRAY['editor']::public.app_role[])) WITH CHECK (private.has_any_role(auth.uid(), ARRAY['editor']::public.app_role[]));
CREATE POLICY "schedules_editor_write" ON public.schedules FOR ALL TO authenticated USING (private.has_any_role(auth.uid(), ARRAY['editor']::public.app_role[])) WITH CHECK (private.has_any_role(auth.uid(), ARRAY['editor']::public.app_role[]));
CREATE POLICY "schedule_exceptions_editor_write" ON public.schedule_exceptions FOR ALL TO authenticated USING (private.has_any_role(auth.uid(), ARRAY['editor']::public.app_role[])) WITH CHECK (private.has_any_role(auth.uid(), ARRAY['editor']::public.app_role[]));
CREATE POLICY "departures_editor_write" ON public.departures FOR ALL TO authenticated USING (private.has_any_role(auth.uid(), ARRAY['editor']::public.app_role[])) WITH CHECK (private.has_any_role(auth.uid(), ARRAY['editor']::public.app_role[]));

-- Modérateurs : avis et signalements
CREATE POLICY "port_reviews_moderator_all" ON public.port_reviews FOR ALL TO authenticated USING (private.has_any_role(auth.uid(), ARRAY['moderator']::public.app_role[])) WITH CHECK (private.has_any_role(auth.uid(), ARRAY['moderator']::public.app_role[]));
CREATE POLICY "review_ratings_moderator_all" ON public.review_ratings FOR ALL TO authenticated USING (private.has_any_role(auth.uid(), ARRAY['moderator']::public.app_role[])) WITH CHECK (private.has_any_role(auth.uid(), ARRAY['moderator']::public.app_role[]));
CREATE POLICY "reports_moderator_all" ON public.reports FOR ALL TO authenticated USING (private.has_any_role(auth.uid(), ARRAY['moderator']::public.app_role[])) WITH CHECK (private.has_any_role(auth.uid(), ARRAY['moderator']::public.app_role[]));

-- Journal des changements de rôles
CREATE OR REPLACE FUNCTION private.log_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin' AND (SELECT count(*) FROM public.user_roles WHERE role = 'admin' AND id <> OLD.id) = 0 THEN
      RAISE EXCEPTION 'Impossible de retirer le dernier administrateur.';
    END IF;
    INSERT INTO public.moderation_log (admin_id, action, target_type, target_id, old_value)
    VALUES (auth.uid(), 'role_revoked', 'user', OLD.user_id, jsonb_build_object('role', OLD.role));
    RETURN OLD;
  END IF;
  INSERT INTO public.moderation_log (admin_id, action, target_type, target_id, new_value)
  VALUES (auth.uid(), 'role_granted', 'user', NEW.user_id, jsonb_build_object('role', NEW.role));
  RETURN NEW;
END; $$;
CREATE TRIGGER user_roles_audit BEFORE INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION private.log_role_change();