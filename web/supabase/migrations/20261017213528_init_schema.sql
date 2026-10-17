-- Ported from PRODUCT-PLAN.md §5.1 (SQLite) to Postgres.
create table nodes (
  node_id text primary key,                -- "pipe-01", "buoy-01"
  type text not null check (type in ('pipe','buoy')),
  label text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  fw_version text
);

create table readings (
  id bigint generated always as identity primary key,
  node_id text not null references nodes(node_id),
  ts timestamptz not null default now(),   -- hub receive time
  seq int, uptime_ms bigint, rssi int,
  probe text not null check (probe in ('main','shallow','deep')),
  sense_mv real, r_cell_ohm real,
  ec_mscm real, ec25_mscm real, temp_c real,
  na_mgl real,
  level text not null check (level in ('ok','warn','crit','fault')),
  fault text,
  flow_lpm real, total_l real
);
create index idx_readings_node_ts on readings (node_id, probe, ts desc);

create table events (
  id bigint generated always as identity primary key,
  node_id text not null references nodes(node_id),
  ts timestamptz not null default now(),
  kind text not null check (kind in ('level_change','early_warning','fault','fault_clear','online','offline')),
  probe text, from_level text, to_level text,
  na_mgl real, message text
);

create table calibration_points (
  id bigint generated always as identity primary key,
  node_id text not null references nodes(node_id),
  probe text not null,
  ts timestamptz not null default now(),
  known_g_per_l real not null,             -- NaCl standard
  sense_mv real, r_cell_ohm real, ec25_mscm real, temp_c real
);

create table calibration_fits (
  node_id text not null references nodes(node_id),
  probe text not null,
  ts timestamptz not null default now(),
  k_cm1 real not null, r2 real,
  primary key (node_id, probe, ts)
);

-- Dashboard reads with the anon key; writes go through server routes using the service-role key (bypasses RLS).
alter table nodes enable row level security;
alter table readings enable row level security;
alter table events enable row level security;
alter table calibration_points enable row level security;
alter table calibration_fits enable row level security;

create policy "public read" on nodes for select using (true);
create policy "public read" on readings for select using (true);
create policy "public read" on events for select using (true);
create policy "public read" on calibration_points for select using (true);
create policy "public read" on calibration_fits for select using (true);

alter publication supabase_realtime add table readings, events;
