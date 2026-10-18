-- Latest reading per (node, probe); drives node status. Uses idx_readings_node_ts.
create view latest_readings with (security_invoker = true) as
select distinct on (node_id, probe) *
from readings
order by node_id, probe, ts desc, id desc;
