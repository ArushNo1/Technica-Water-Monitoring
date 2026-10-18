# Saltline API

The exact contract of the Next.js routes in `web/app/api/`. Firmware and `tools/sim.mjs` follow this.
Base URL: `http://localhost:3000` in dev, the Vercel/GoDaddy domain in production. All bodies are JSON.

- **Auth: none.** Any client that can reach the URL can post. (A device token is planned, not built.)
- **Timestamps:** the server sets `ts` when it receives a POST. Devices never send a time. Query params `since`/`until` are unix **milliseconds**; response timestamps are ISO 8601 strings.
- **Thresholds** (`web/lib/config.ts`): ok `< 200`, warn `200–<600`, crit `>= 600` mg/L Na. A node is offline if nothing has arrived for 10 s.
- **Errors:** bad input → `400 {"ok":false,"error":"<reason>"}`; unknown node → `404` same shape; database failure → `500` (body is not JSON).

---

## Device → server

### `POST /api/readings`

Send one every 3 s. Pipe module payload:

```json
{
  "node_id": "pipe-01",
  "type": "pipe",
  "fw": "0.1.0",
  "seq": 1042,
  "uptime_ms": 2084000,
  "rssi": -58,
  "probe": {
    "sense_mv": 1650,
    "r_cell_ohm": 1000.0,
    "ec_mscm": 2.04,
    "ec25_mscm": 1.95,
    "temp_c": 27.5,
    "na_mgl": 384,
    "level": "warn",
    "fault": null
  },
  "flow_lpm": 3.2,
  "total_l": 18.4
}
```

Fault payload (a thermistor that reads outside −10..80 °C, or a sense voltage outside 0.10–3.20 V):

```json
{ "node_id": "pipe-01", "type": "pipe", "seq": 1043, "uptime_ms": 2087000, "rssi": -58,
  "probe": { "sense_mv": 1650, "r_cell_ohm": 1000.0, "temp_c": null, "na_mgl": null, "level": "fault", "fault": "temp_probe" } }
```

| Field | Rule |
|---|---|
| `node_id` | Required. 1–64 chars from `A-Z a-z 0-9 _ -`. Unknown IDs are registered automatically on the first POST. |
| `type` | Required. `"pipe"` (or `"buoy"`, which is cut). It must match the type the node first registered with, otherwise 400. |
| `fw` | Optional string, stored as `nodes.fw_version`. |
| `seq`, `rssi` | Optional **integers** or null. A decimal value causes a 500. |
| `uptime_ms` | Optional integer or null. |
| `flow_lpm`, `total_l` | Optional numbers or null. Stored for pipes only. |
| `probe` | Required for a pipe. Stored with `probe = "main"`. |
| `probe.sense_mv`, `r_cell_ohm`, `ec_mscm`, `ec25_mscm`, `temp_c` | Optional numbers or null. They are stored, not checked against each other. |
| `probe.na_mgl` | Number. Required unless `fault` is set. |
| `probe.fault` | Null, or a reason string of up to 64 chars. Use `"temp_probe"` or `"cell_range"`. |
| `probe.level` | Optional. **The server recomputes the level** from `na_mgl`/`fault` and stores its own value. If they disagree, it logs a warning in the server console. |

Response: `200 {"ok":true,"ts":<server unix ms>}`. Treat any non-2xx as failure. Don't retry more than once per cycle, and never let a failed POST block measurement or the display.

Each POST also does the following:
- Upserts `nodes` (sets `last_seen`, `fw_version`).
- Inserts one `readings` row.
- Writes `events`:
  - `online` on a node's first POST, or when it returns after more than 10 s of silence. In the second case it also writes an `offline` event backdated to `last_seen + 10 s`. (A node that is still silent has no offline event yet; its status reads `offline` anyway.)
  - `level_change` when the level differs from the previous reading (e.g. ok → crit).
  - `fault` when a reading goes into fault, and `fault_clear` when it comes out of fault.

ESP32 notes: use HTTPS with `WiFiClientSecure` + `setInsecure()`. The TLS handshake takes 1–2 s, so POST from a separate task.

---

## Calibration

The node must already exist (it must have sent at least one reading), or these return 404.

### `POST /api/nodes/{id}/calibration/points`

```json
{ "probe": "main", "known_g_per_l": 1.0, "sense_mv": 1650, "r_cell_ohm": 1000.0, "ec25_mscm": 1.95, "temp_c": 24.8 }
```

- `probe`: `"main"` | `"shallow"` | `"deep"`.
- `known_g_per_l`: required, > 0. This is the NaCl concentration of the standard.
- `r_cell_ohm`: required, > 0. The fit uses it.
- Other fields are optional numbers.

Response: `{"ok":true,"point":{...stored row...}}`.

### `POST /api/nodes/{id}/calibration/fit`

```json
{ "probe": "main" }
```

Fits the cell constant K from **all** stored points for that probe (at least 2), stores it in `calibration_fits`, and returns:

```json
{ "ok": true, "k_cm1": 2.37, "r2": 0.998, "n": 3 }
```

Model (a line through the origin, matching the firmware's `EC = K / R`):
`known_g_per_l * 2.0 = K * 1000 / (r_cell_ohm * (1 + 0.02 * (temp_c - 25)))`, in mS/cm. A null `temp_c` counts as 25 °C.

The server does not push K to the device. The firmware's `cal fit` can call this route and save the returned `k_cm1` in NVS.

**Validation cup:** post its point *after* running the fit and do not refit. It then shows in the validation table without affecting K. If you refit, it becomes part of the fit.

### `GET /api/nodes/{id}/calibration`

```json
{
  "points": [ { "id": 1, "probe": "main", "known_g_per_l": 0.5, "r_cell_ohm": 2370, "temp_c": 25, "in_fit": true, "...": "..." } ],
  "fits": { "main": { "k_cm1": 2.37, "r2": 0.998, "ts": "..." } },
  "validation": [ { "point_id": 1, "probe": "main", "in_fit": true, "known_g_per_l": 0.5, "predicted_g_per_l": 0.49, "pct_error": -2.0 } ]
}
```

- `fits` holds the latest fit per probe.
- `validation` has one row per point that has a fit for its probe, predicted using that fit.
- `in_fit` is true when the point was recorded before the latest fit for its probe (so it shaped K). False means it was added after the fit: a validation cup.

---

## Website pages

| Page | What it shows |
|---|---|
| `/` | Live cards, polling `/api/nodes` every 2 s |
| `/node/{id}` | Sodium history (log scale with bands; 5 min / 1 h / all), event log, CSV download |
| `/node/{id}/calibration` | Calibration chart, K, R², validation table (polls every 3 s) |
| `/readings` | The raw readings table |

## Website reads

| Route | Returns |
|---|---|
| `GET /api/config` | `{"na_warn":200,"na_crit":600,"offline_after_s":10,"poll_ms":2000}` |
| `GET /api/nodes` | Array of nodes (shape below) |
| `GET /api/nodes/{id}` | One node (same shape), or 404 |
| `GET /api/nodes/{id}/readings?probe=&since=&limit=` | Raw `readings` rows, **oldest → newest**: the newest `limit` rows at or after `since`. `limit` defaults to 1000, max 20000. |
| `GET /api/nodes/{id}/events?limit=` | `events` rows for that node, newest first. `limit` defaults to 100, max 1000. |
| `GET /api/events?limit=` | Events for all nodes, newest first |
| `GET /api/export.csv?node_id=&probe=&since=&until=` | CSV download, oldest first, max 100k rows. Columns: `ts_iso,node_id,probe,temp_c,ec25_mscm,na_mgl,level,fault` |
| `GET /api/health` | `{"ok":true,"uptime_s":45,"db_rows":1234,"nodes_online":1}`. `uptime_s` is the age of one serverless instance. |

Node shape:

```json
{
  "node_id": "pipe-01",
  "type": "pipe",
  "label": "Pipe module",
  "online": true,
  "last_seen": "2026-10-18T04:10:40.392+00:00",
  "status": "crit",
  "latest": { "main": { "...latest readings row..." } },
  "fw": "0.1.0",
  "first_seen": "2026-10-17T21:40:00+00:00",
  "rssi": -58
}
```

`status` is one of:
- `offline`: nothing for 10 s.
- `fault`: any probe is faulted.
- `early_warning`: buoy only.
- Otherwise the worst probe level: `ok` | `warn` | `crit`.

---

## Dev

### `POST /api/dev/reset`

Deletes all readings and events (nodes and calibration data stay). It only works when the server has `SALTLINE_DEV=1` in its env; otherwise it returns 403. Never set that in production.

### Simulator

```
node tools/sim.mjs [--url <base>] [scenario...]   # or: cd web && npm run sim -- [scenario...]
```

Scenarios: `pipe_cups` (the default; RAIN 40 → POND 300 → WELL 714 → SEA 10000 mg/L, 10 s each), `fault`, `offline`. The `buoy_*` scenarios are left over from the cut buoy.

---

## Testing

From `web/`:

| Command | What it checks | Needs |
|---|---|---|
| `npm test` | Unit tests for `lib/rules.ts`: level thresholds (199.9/200/599.9/600), node status, offline after 10 s, the K fit and prediction, query param parsing | Nothing (no database) |
| `npm run smoke` | Every route and page end to end against a running server, as a throwaway `smoke-*` node it deletes afterward. Takes ~20 s (it waits 11 s to test offline → online). | A running server + `web/.env.local` (for cleanup) |
| `npm run smoke -- --url https://<deployed-site>` | The same checks against production | `.env.local` pointing at the same Supabase project |
| `npx tsc --noEmit` | Types | Nothing |

Both test commands exit non-zero on failure. Run `npm run smoke` after every deploy and before the demo.
