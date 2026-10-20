-- Batogo : mémorisation des événements physiques issus du suivi AIS.
alter table public.vessel_positions
  add column if not exists atd_at timestamptz,
  add column if not exists ata_at timestamptz,
  add column if not exists last_port_id uuid references public.ports(id);

create index if not exists vessel_positions_last_port_id_idx
  on public.vessel_positions(last_port_id);