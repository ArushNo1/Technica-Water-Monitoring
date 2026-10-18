-- Demo data (same rows the UI used to hardcode). Raw EC in µS/cm, converted to mS/cm.
insert into nodes (node_id, type, label) values
  ('pipe-01', 'pipe', 'Pipe module'),
  ('buoy-01', 'buoy', 'Buoy')
on conflict do nothing;

insert into readings (node_id, ts, probe, ec_mscm, ec25_mscm, temp_c, na_mgl, level, fault)
select node, now() - secs * interval '1 second', probe,
       ec / 1000, ec25 / 1000, t,
       round(197 * ec25 / 1000), 
       case when fault is not null then 'fault'
            when 197 * ec25 / 1000 < 200 then 'ok'
            when 197 * ec25 / 1000 < 600 then 'warn' else 'crit' end,
       fault
from (
  select *, ec / (1 + 0.02 * (t - 25)) as ec25
  from (values
    (0,   'pipe-01', 'main',    3860, 28.0, null),
    (14,  'buoy-01', 'deep',    2410, 24.1, null),
    (14,  'buoy-01', 'shallow',  320, 24.6, null),
    (31,  'pipe-01', 'main',    2950, 27.8, null),
    (52,  'pipe-01', 'main',    1780, 27.5, null),
    (66,  'buoy-01', 'deep',    1290, 24.0, null),
    (66,  'buoy-01', 'shallow',  300, 24.5, null),
    (90,  'pipe-01', 'main',    null, 27.4, 'ec_nan'),
    (121, 'pipe-01', 'main',     890, 27.2, null),
    (158, 'buoy-01', 'deep',     610, 23.9, null),
    (158, 'buoy-01', 'shallow',  290, 24.4, null),
    (190, 'pipe-01', 'main',     220, 27.0, null)
  ) as v(secs, node, probe, ec, t, fault)
) s;
