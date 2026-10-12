-- =============================================================================
-- Batogo — Correctif ponctuel des horaires déjà enregistrés (fuseaux horaires)
-- =============================================================================
--
-- POURQUOI
--   Jusqu'ici, le back-office (import Excel et « Générer les départs ») enregistrait
--   les heures saisies comme si elles étaient en heure UTC. Exemple : un départ de
--   Marseille saisi « 19:00 » était enregistré 19:00 UTC, donc affiché 21:00 à Paris
--   en été. Le nouveau code enregistre correctement l'heure locale du port.
--   Ce script recale les départs DÉJÀ présents en base pour qu'ils s'affichent à
--   l'heure qui avait été saisie.
--
-- AVANT DE L'EXÉCUTER
--   1. Faites une sauvegarde de la table « departures » (ou testez d'abord sur une copie).
--   2. Faites relire ce script par une personne à l'aise avec la base de données.
--   3. Exécutez-le UNE SEULE FOIS, après la mise en ligne du nouveau code.
--      (Une protection empêche une deuxième exécution.)
--
-- COMMENT L'EXÉCUTER
--   Dans l'éditeur SQL de votre base (Lovable Cloud / Supabase), ou en demandant à
--   Lovable d'exécuter ce script tel quel.
--
-- CE QUE FAIT LE SCRIPT
--   - Heure de départ : l'heure enregistrée est relue comme heure locale du port de départ.
--   - Départs importés depuis Excel : l'heure d'arrivée est relue comme heure locale du
--     port d'arrivée, et la durée est recalculée.
--   - Autres départs (générés depuis un calendrier) : la durée est conservée et l'arrivée
--     est recalculée à partir du nouveau départ.
-- =============================================================================

begin;

-- Protection contre une double exécution.
create table if not exists public.maintenance_log (
  key text primary key,
  applied_at timestamptz not null default now()
);
alter table public.maintenance_log enable row level security;

do $$
begin
  if exists (select 1 from public.maintenance_log where key = 'tz_fix_2026_10') then
    raise exception 'Correctif déjà appliqué : rien à faire.';
  end if;
end $$;

-- Fuseau horaire de chaque pays (identique à src/lib/ferry/time.ts).
create temporary table batogo_country_tz (country_code text primary key, tz text not null) on commit drop;
insert into batogo_country_tz values
  ('DZ', 'Africa/Algiers'), ('FR', 'Europe/Paris'), ('ES', 'Europe/Madrid'), ('IT', 'Europe/Rome'),
  ('PT', 'Europe/Lisbon'), ('MT', 'Europe/Malta'), ('GR', 'Europe/Athens'), ('TR', 'Europe/Istanbul'),
  ('TN', 'Africa/Tunis'), ('MA', 'Africa/Casablanca'), ('BE', 'Europe/Brussels'), ('DE', 'Europe/Berlin'),
  ('NL', 'Europe/Amsterdam'), ('GB', 'Europe/London');

with zones as (
  select
    d.id,
    coalesce(tz_from.tz, 'Europe/Paris') as from_tz,
    coalesce(tz_to.tz, 'Europe/Paris') as to_tz,
    -- « heure murale » enregistrée (ce qui avait été saisi)
    (d.departure_at at time zone 'UTC') as wall_departure,
    (d.arrival_at at time zone 'UTC') as wall_arrival,
    d.duration_minutes,
    coalesce(d.source_name, '') like 'Import Excel%' as from_excel
  from public.departures d
  join public.routes r on r.id = d.route_id
  join public.ports p_from on p_from.id = r.departure_port_id
  join public.ports p_to on p_to.id = r.arrival_port_id
  left join batogo_country_tz tz_from on tz_from.country_code = upper(trim(p_from.country_code))
  left join batogo_country_tz tz_to on tz_to.country_code = upper(trim(p_to.country_code))
),
fixed as (
  select
    id,
    (wall_departure at time zone from_tz) as new_departure,
    case
      when from_excel and wall_arrival is not null then (wall_arrival at time zone to_tz)
      when duration_minutes is not null then (wall_departure at time zone from_tz) + make_interval(mins => duration_minutes)
      else null
    end as new_arrival
  from zones
)
update public.departures d
set
  departure_at = f.new_departure,
  arrival_at = coalesce(f.new_arrival, d.arrival_at),
  duration_minutes = case
    when f.new_arrival is not null then round(extract(epoch from (f.new_arrival - f.new_departure)) / 60)::int
    else d.duration_minutes
  end
from fixed f
where d.id = f.id;

insert into public.maintenance_log (key) values ('tz_fix_2026_10');

commit;

-- Vérification conseillée après exécution : quelques départs de Marseille doivent
-- maintenant s'afficher sur le site à l'heure exacte du fichier Excel d'origine.
