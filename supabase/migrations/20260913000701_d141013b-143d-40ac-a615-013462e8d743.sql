CREATE POLICY port_reviews_own_delete ON public.port_reviews
FOR DELETE TO authenticated
USING (user_id = auth.uid() AND status IN ('pending','rejected','hidden'));