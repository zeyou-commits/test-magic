-- Indexes used by the public map, schedule and detail views.
-- IF NOT EXISTS keeps this migration safe to replay in a development project.
create index if not exists routes_departure_port_idx on public.routes (departure_port_id);
create index if not exists routes_arrival_port_idx on public.routes (arrival_port_id);
create index if not exists routes_status_idx on public.routes (status);
create index if not exists route_operators_company_idx on public.route_operators (company_id);
create index if not exists schedules_route_status_idx on public.schedules (route_id, status);
create index if not exists departures_route_departure_at_idx on public.departures (route_id, departure_at);
create index if not exists departures_company_departure_at_idx on public.departures (company_id, departure_at);
create index if not exists departures_status_departure_at_idx on public.departures (status, departure_at);
create index if not exists port_reviews_port_status_idx on public.port_reviews (port_id, status);
create index if not exists review_ratings_review_idx on public.review_ratings (review_id);
