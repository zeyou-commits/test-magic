-- ENUMS
CREATE TYPE public.app_role AS ENUM ('user','admin');
CREATE TYPE public.entity_status AS ENUM ('active','inactive','draft');
CREATE TYPE public.label_anchor AS ENUM ('left','right','top','bottom');
CREATE TYPE public.reliability_status AS ENUM ('verified','to_verify','possibly_outdated');
CREATE TYPE public.departure_status AS ENUM ('scheduled','modified','cancelled');
CREATE TYPE public.review_status AS ENUM ('pending','approved','published','rejected','hidden','deleted');
CREATE TYPE public.report_status AS ENUM ('new','in_progress','resolved','rejected');
CREATE TYPE public.exception_type AS ENUM ('cancellation','time_change','vessel_change');

-- UPDATED_AT HELPER
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_public_read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "user_roles_self_read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- PORTS
CREATE TABLE public.ports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  city TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  label_anchor public.label_anchor NOT NULL DEFAULT 'left',
  label_offset_x INTEGER NOT NULL DEFAULT 0,
  label_offset_y INTEGER NOT NULL DEFAULT 0,
  status public.entity_status NOT NULL DEFAULT 'active',
  facilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  info_source TEXT,
  info_source_url TEXT,
  info_verified_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ports TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ports TO authenticated;
GRANT ALL ON public.ports TO service_role;
ALTER TABLE public.ports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ports_public_read" ON public.ports FOR SELECT USING (true);
CREATE POLICY "ports_admin_write" ON public.ports FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER ports_updated_at BEFORE UPDATE ON public.ports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- COMPANIES
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  logo_url TEXT,
  description TEXT,
  website_url TEXT,
  status public.entity_status NOT NULL DEFAULT 'active',
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.companies TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies_public_read" ON public.companies FOR SELECT USING (true);
CREATE POLICY "companies_admin_write" ON public.companies FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- VESSELS
CREATE TABLE public.vessels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  photo_url TEXT,
  vessel_type TEXT,
  description TEXT,
  status public.entity_status NOT NULL DEFAULT 'active',
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vessels TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vessels TO authenticated;
GRANT ALL ON public.vessels TO service_role;
ALTER TABLE public.vessels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vessels_public_read" ON public.vessels FOR SELECT USING (true);
CREATE POLICY "vessels_admin_write" ON public.vessels FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER vessels_updated_at BEFORE UPDATE ON public.vessels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ROUTES
CREATE TABLE public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  departure_port_id UUID NOT NULL REFERENCES public.ports(id) ON DELETE CASCADE,
  arrival_port_id UUID NOT NULL REFERENCES public.ports(id) ON DELETE CASCADE,
  typical_duration_minutes INTEGER,
  distance_km INTEGER,
  status public.entity_status NOT NULL DEFAULT 'active',
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT routes_distinct_ports CHECK (departure_port_id <> arrival_port_id),
  UNIQUE (departure_port_id, arrival_port_id)
);
GRANT SELECT ON public.routes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.routes TO authenticated;
GRANT ALL ON public.routes TO service_role;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routes_public_read" ON public.routes FOR SELECT USING (true);
CREATE POLICY "routes_admin_write" ON public.routes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER routes_updated_at BEFORE UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ROUTE OPERATORS
CREATE TABLE public.route_operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_id, company_id)
);
GRANT SELECT ON public.route_operators TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.route_operators TO authenticated;
GRANT ALL ON public.route_operators TO service_role;
ALTER TABLE public.route_operators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "route_operators_public_read" ON public.route_operators FOR SELECT USING (true);
CREATE POLICY "route_operators_admin_write" ON public.route_operators FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- SCHEDULES
CREATE TABLE public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  default_vessel_id UUID REFERENCES public.vessels(id) ON DELETE SET NULL,
  departure_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL,
  weekdays SMALLINT[] NOT NULL DEFAULT '{}',
  valid_from DATE NOT NULL,
  valid_to DATE,
  status public.entity_status NOT NULL DEFAULT 'active',
  source_name TEXT,
  source_url TEXT,
  last_verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users ON DELETE SET NULL,
  reliability public.reliability_status NOT NULL DEFAULT 'to_verify',
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.schedules TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.schedules TO authenticated;
GRANT ALL ON public.schedules TO service_role;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedules_public_read" ON public.schedules FOR SELECT USING (true);
CREATE POLICY "schedules_admin_write" ON public.schedules FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER schedules_updated_at BEFORE UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- SCHEDULE EXCEPTIONS
CREATE TABLE public.schedule_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  exception_type public.exception_type NOT NULL,
  new_departure_time TIME,
  new_vessel_id UUID REFERENCES public.vessels(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, exception_date)
);
GRANT SELECT ON public.schedule_exceptions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.schedule_exceptions TO authenticated;
GRANT ALL ON public.schedule_exceptions TO service_role;
ALTER TABLE public.schedule_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedule_exceptions_public_read" ON public.schedule_exceptions FOR SELECT USING (true);
CREATE POLICY "schedule_exceptions_admin_write" ON public.schedule_exceptions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- DEPARTURES
CREATE TABLE public.departures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE SET NULL,
  schedule_id UUID REFERENCES public.schedules(id) ON DELETE SET NULL,
  departure_at TIMESTAMPTZ NOT NULL,
  arrival_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  status public.departure_status NOT NULL DEFAULT 'scheduled',
  source_name TEXT,
  source_url TEXT,
  last_verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users ON DELETE SET NULL,
  reliability public.reliability_status NOT NULL DEFAULT 'to_verify',
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX departures_departure_at_idx ON public.departures (departure_at);
CREATE INDEX departures_route_idx ON public.departures (route_id);
GRANT SELECT ON public.departures TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.departures TO authenticated;
GRANT ALL ON public.departures TO service_role;
ALTER TABLE public.departures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "departures_public_read" ON public.departures FOR SELECT USING (true);
CREATE POLICY "departures_admin_write" ON public.departures FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER departures_updated_at BEFORE UPDATE ON public.departures FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RATING CRITERIA
CREATE TABLE public.rating_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rating_criteria TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.rating_criteria TO authenticated;
GRANT ALL ON public.rating_criteria TO service_role;
ALTER TABLE public.rating_criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rating_criteria_public_read" ON public.rating_criteria FOR SELECT USING (true);
CREATE POLICY "rating_criteria_admin_write" ON public.rating_criteria FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- PORT REVIEWS
CREATE TABLE public.port_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  port_id UUID NOT NULL REFERENCES public.ports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  comment TEXT,
  status public.review_status NOT NULL DEFAULT 'pending',
  moderated_by UUID REFERENCES auth.users ON DELETE SET NULL,
  moderated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX port_reviews_port_status_idx ON public.port_reviews (port_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.port_reviews TO authenticated;
GRANT SELECT ON public.port_reviews TO anon;
GRANT ALL ON public.port_reviews TO service_role;
ALTER TABLE public.port_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "port_reviews_published_read" ON public.port_reviews FOR SELECT USING (status = 'published');
CREATE POLICY "port_reviews_own_read" ON public.port_reviews FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "port_reviews_admin_read" ON public.port_reviews FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "port_reviews_own_insert" ON public.port_reviews FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'pending');
CREATE POLICY "port_reviews_own_update" ON public.port_reviews FOR UPDATE TO authenticated USING (user_id = auth.uid() AND status = 'pending') WITH CHECK (user_id = auth.uid() AND status = 'pending');
CREATE POLICY "port_reviews_admin_all" ON public.port_reviews FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER port_reviews_updated_at BEFORE UPDATE ON public.port_reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- REVIEW RATINGS
CREATE TABLE public.review_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES public.port_reviews(id) ON DELETE CASCADE,
  criterion_id UUID NOT NULL REFERENCES public.rating_criteria(id) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (review_id, criterion_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_ratings TO authenticated;
GRANT SELECT ON public.review_ratings TO anon;
GRANT ALL ON public.review_ratings TO service_role;
ALTER TABLE public.review_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "review_ratings_published_read" ON public.review_ratings FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.port_reviews r WHERE r.id = review_id AND r.status = 'published')
);
CREATE POLICY "review_ratings_own_read" ON public.review_ratings FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.port_reviews r WHERE r.id = review_id AND r.user_id = auth.uid())
);
CREATE POLICY "review_ratings_own_write" ON public.review_ratings FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.port_reviews r WHERE r.id = review_id AND r.user_id = auth.uid() AND r.status = 'pending')
);
CREATE POLICY "review_ratings_admin_all" ON public.review_ratings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- REPORTS
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  message TEXT,
  status public.report_status NOT NULL DEFAULT 'new',
  handled_by UUID REFERENCES auth.users ON DELETE SET NULL,
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reports_target_type_check CHECK (target_type IN ('port','route','departure','review','schedule'))
);
GRANT SELECT, INSERT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports_own_read" ON public.reports FOR SELECT TO authenticated USING (reporter_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "reports_own_insert" ON public.reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid() AND status = 'new');
CREATE POLICY "reports_admin_all" ON public.reports FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER reports_updated_at BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- MODERATION LOG
CREATE TABLE public.moderation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  old_value JSONB,
  new_value JSONB,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.moderation_log TO authenticated;
GRANT ALL ON public.moderation_log TO service_role;
ALTER TABLE public.moderation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "moderation_log_admin_read" ON public.moderation_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- =========================
-- DEMO DATA
-- =========================
INSERT INTO public.ports (slug,name,country_code,country_name,city,latitude,longitude,label_anchor,label_offset_x,label_offset_y,facilities,info_source,is_demo) VALUES
('marseille','Marseille','FR','France','Marseille',43.3403,5.3576,'left',-14,-18,'{"priere":"non renseigné","proprete":"non renseigné","salle_attente":"oui","douane":"oui","sanitaires":"oui","parking":"oui","acces":"non renseigné","transports":"métro et tramway","restauration":"oui","pmr":"oui"}','Données de démonstration',true),
('sete','Sète','FR','France','Sète',43.4000,3.6970,'left',-14,18,'{"priere":"non renseigné","proprete":"non renseigné","salle_attente":"oui","douane":"oui","sanitaires":"oui","parking":"oui","acces":"non renseigné","transports":"gare à proximité","restauration":"limité","pmr":"non renseigné"}','Données de démonstration',true),
('barcelone','Barcelone','ES','Espagne','Barcelone',41.3550,2.1650,'left',-14,0,'{}','Données de démonstration',true),
('valence','Valence','ES','Espagne','Valence',39.4450,-0.3170,'left',-14,0,'{}','Données de démonstration',true),
('alicante','Alicante','ES','Espagne','Alicante',38.3320,-0.4890,'left',-14,0,'{}','Données de démonstration',true),
('almeria','Almería','ES','Espagne','Almería',36.8300,-2.4700,'left',-14,0,'{}','Données de démonstration',true),
('alger','Alger','DZ','Algérie','Alger',36.7800,3.0670,'bottom',0,16,'{"priere":"oui","proprete":"non renseigné","salle_attente":"oui","douane":"oui","sanitaires":"oui","parking":"oui","acces":"non renseigné","transports":"taxis et bus","restauration":"oui","pmr":"non renseigné"}','Données de démonstration',true),
('oran','Oran','DZ','Algérie','Oran',35.7100,-0.6300,'bottom',0,16,'{"priere":"oui","salle_attente":"oui","douane":"oui","sanitaires":"oui","parking":"oui"}','Données de démonstration',true),
('bejaia','Béjaïa','DZ','Algérie','Béjaïa',36.7550,5.0800,'bottom',0,16,'{"priere":"oui","douane":"oui"}','Données de démonstration',true),
('skikda','Skikda','DZ','Algérie','Skikda',36.8800,6.9100,'bottom',0,16,'{"priere":"oui","douane":"oui"}','Données de démonstration',true),
('annaba','Annaba','DZ','Algérie','Annaba',36.9100,7.7700,'bottom',0,16,'{"priere":"oui","douane":"oui"}','Données de démonstration',true);

INSERT INTO public.companies (slug,name,description,website_url,is_demo) VALUES
('algerie-ferries','Algérie Ferries','Compagnie nationale algérienne de transport maritime de voyageurs.','https://www.algerieferries.dz',true),
('corsica-linea','Corsica Linea','Compagnie française opérant des traversées vers l''Algérie depuis Marseille.','https://www.corsicalinea.com',true),
('balearia','Baleària','Compagnie espagnole opérant depuis le sud de l''Espagne.','https://www.balearia.com',true),
('trasmediterranea','Trasmediterranea','Compagnie espagnole de traversées méditerranéennes.','https://www.trasmediterranea.es',true);

INSERT INTO public.vessels (slug,name,company_id,vessel_type,description,is_demo)
SELECT v.slug, v.name, c.id, v.vessel_type, v.description, true
FROM (VALUES
 ('tariq-ibn-ziyad','Tariq Ibn Ziyad','algerie-ferries','Car-ferry','Navire mixte passagers et véhicules.'),
 ('djurdjura','Djurdjura','algerie-ferries','Car-ferry','Navire mixte passagers et véhicules.'),
 ('el-djazair-ii','El Djazaïr II','algerie-ferries','Car-ferry','Navire mixte passagers et véhicules.'),
 ('badji-mokhtar-iii','Badji Mokhtar III','algerie-ferries','Car-ferry','Navire mixte passagers et véhicules.'),
 ('danielle-casanova','Danielle Casanova','corsica-linea','Car-ferry','Navire mixte passagers et véhicules.'),
 ('a-nepita','A Nepita','corsica-linea','Car-ferry','Navire mixte passagers et véhicules.'),
 ('hypatia-de-alejandria','Hypatia de Alejandría','balearia','Ferry rapide','Navire rapide passagers et véhicules.')
) AS v(slug,name,company_slug,vessel_type,description)
JOIN public.companies c ON c.slug = v.company_slug;

INSERT INTO public.routes (slug,departure_port_id,arrival_port_id,typical_duration_minutes,is_demo)
SELECT r.slug, dp.id, ap.id, r.duration, true
FROM (VALUES
 ('marseille-alger','marseille','alger',1200),
 ('marseille-bejaia','marseille','bejaia',1320),
 ('marseille-skikda','marseille','skikda',1440),
 ('marseille-oran','marseille','oran',1440),
 ('marseille-annaba','marseille','annaba',1560),
 ('sete-oran','sete','oran',1560),
 ('sete-alger','sete','alger',1440),
 ('sete-bejaia','sete','bejaia',1560),
 ('barcelone-alger','barcelone','alger',720),
 ('valence-alger','valence','alger',840),
 ('alicante-oran','alicante','oran',720),
 ('alicante-alger','alicante','alger',840),
 ('almeria-oran','almeria','oran',480),
 ('almeria-alger','almeria','alger',600)
) AS r(slug,dep,arr,duration)
JOIN public.ports dp ON dp.slug = r.dep
JOIN public.ports ap ON ap.slug = r.arr;

INSERT INTO public.route_operators (route_id,company_id)
SELECT rt.id, c.id
FROM (VALUES
 ('marseille-alger','algerie-ferries'),
 ('marseille-alger','corsica-linea'),
 ('marseille-bejaia','corsica-linea'),
 ('marseille-skikda','corsica-linea'),
 ('marseille-oran','algerie-ferries'),
 ('marseille-annaba','algerie-ferries'),
 ('sete-oran','algerie-ferries'),
 ('sete-alger','algerie-ferries'),
 ('sete-bejaia','algerie-ferries'),
 ('barcelone-alger','algerie-ferries'),
 ('valence-alger','trasmediterranea'),
 ('alicante-oran','algerie-ferries'),
 ('alicante-oran','balearia'),
 ('alicante-alger','algerie-ferries'),
 ('almeria-oran','balearia'),
 ('almeria-alger','trasmediterranea')
) AS ro(route_slug,company_slug)
JOIN public.routes rt ON rt.slug = ro.route_slug
JOIN public.companies c ON c.slug = ro.company_slug;

INSERT INTO public.schedules (route_id,company_id,default_vessel_id,departure_time,duration_minutes,weekdays,valid_from,valid_to,source_name,reliability,is_demo)
SELECT rt.id, c.id, v.id, s.dep_time::time, s.duration, s.weekdays::smallint[], CURRENT_DATE - 30, CURRENT_DATE + 180, 'Données de démonstration', 'to_verify'::public.reliability_status, true
FROM (VALUES
 ('marseille-alger','algerie-ferries','tariq-ibn-ziyad','18:00',1200,'{1,4}'),
 ('marseille-alger','corsica-linea','danielle-casanova','19:00',1200,'{2,6}'),
 ('marseille-bejaia','corsica-linea','a-nepita','17:00',1320,'{3}'),
 ('marseille-skikda','corsica-linea','a-nepita','16:00',1440,'{5}'),
 ('sete-oran','algerie-ferries','djurdjura','12:00',1560,'{2,5}'),
 ('sete-alger','algerie-ferries','el-djazair-ii','13:00',1440,'{7}'),
 ('alicante-oran','balearia','hypatia-de-alejandria','23:00',720,'{1,3,6}'),
 ('almeria-oran','balearia','hypatia-de-alejandria','22:00',480,'{2,4,7}'),
 ('barcelone-alger','algerie-ferries','badji-mokhtar-iii','20:00',720,'{4}')
) AS s(route_slug,company_slug,vessel_slug,dep_time,duration,weekdays)
JOIN public.routes rt ON rt.slug = s.route_slug
JOIN public.companies c ON c.slug = s.company_slug
LEFT JOIN public.vessels v ON v.slug = s.vessel_slug;

-- Départs de démonstration générés à partir des calendriers, sur les 60 prochains jours
INSERT INTO public.departures (route_id,company_id,vessel_id,schedule_id,departure_at,arrival_at,duration_minutes,status,source_name,reliability,is_demo)
SELECT s.route_id, s.company_id, s.default_vessel_id, s.id,
       (d::date + s.departure_time) AT TIME ZONE 'UTC',
       ((d::date + s.departure_time) AT TIME ZONE 'UTC') + make_interval(mins => s.duration_minutes),
       s.duration_minutes, 'scheduled', 'Données de démonstration', 'to_verify', true
FROM public.schedules s
CROSS JOIN generate_series(CURRENT_DATE, CURRENT_DATE + 60, interval '1 day') AS d
WHERE EXTRACT(ISODOW FROM d)::smallint = ANY (s.weekdays);

INSERT INTO public.rating_criteria (slug,label,sort_order) VALUES
('priere','Lieu de prière',1),
('proprete','Propreté',2),
('salle_attente','Salle d''attente',3),
('douane','Douane',4),
('sanitaires','Sanitaires',5),
('parking','Parking',6),
('acces','Accès',7),
('restauration','Restauration',8);