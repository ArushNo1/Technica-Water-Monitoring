# Saltline: Product Design Doc (Software + API)

Status: v1, 2026-10-17. Hackathon: Technica 2026. Source of truth for hardware: the Saltline Build Plan artifact (https://claude.ai/artifact/EFwfCbfF4UXURCeBqg38hX).
This doc defines everything on the software side: firmware behavior, hub, API, dashboard, data formats. Items tagged [PROPOSED] are decisions the build plan does not make. Change them freely, but change them in one place and tell the team.

---

## 0. TL;DR

Saltline measures sodium in water with two stainless screws. Two device types report to one hub. The hub stores readings and serves a live dashboard.

- **Pipe module** (deliverable 1): printed cylinder, 3/4" PVC through it, one conductivity cell + temp probe + OLED + RGB LED. Measures every liter that passes.
- **Buoy** (deliverable 2): float with a shallow probe (6 cm under the surface) and a deep probe on a tether. Catches the salt layer rising from below. Beacon LED.
- **Hub**: Raspberry Pi running its own Wi-Fi hotspot (`saltline-hub`) and a Flask web server. Stores readings, serves dashboard, exports CSV.
- **Levels** (sodium, mg/L): green < 200, yellow 200–600, red > 600.
- **Pitch line:** "See the salt before you drink it."

The finished product at demo time: pour a cup through the pipe module and the OLED/LED update within ~2 s and the same reading appears on the dashboard. Add salt water under the buoy and the deep probe goes amber while the shallow probe stays green.

---

## 1. Superseded decisions (do NOT build these)

Earlier chat versions of the project differed from the build plan. The build plan wins.

| Earlier idea | Status |
|---|---|
| Solenoid valve auto-shutoff, MOSFET, fail-open/fail-closed state machine | **Cut.** A servo valve diverting red water is a stretch goal on the pipe module only. No OPEN/CLOSED/FAULT valve state in v1. |
| ADS1115 external ADC, autoranging resistor ladder | **Cut.** Single fixed 1 kΩ reference, ESP32 ADC1 on GPIO34/35. |
| Public global salinity API, USGS overlay, multi-site map, accounts | **Cut.** One local hub, a handful of nodes. |
| FastAPI + React + Vite (earlier stack suggestion) | **Replaced** by Flask on the Pi (see §5). Dashboard stack is [PROPOSED] in §7. |
| Pressure / water-level sensor | **Cut.** The buoy rides the water level mechanically; no level data is reported. |
| Cloud hosting | **Cut.** Hub is local. Phone hotspot is the backup network. |

---

## 2. System architecture

```
Pipe module (ESP32) ──Wi-Fi, JSON POST every 2 s──┐
                                                   ├──► Hub (Raspberry Pi, Flask + SQLite) ──► Dashboard (laptop/phone browser)
Buoy (ESP32) ─────────Wi-Fi, JSON POST every 2 s──┘                                     └──► CSV export
```

- Transport: plain HTTP POST of JSON. No MQTT, no websockets, no auth (local network demo).
- Hub network: Pi creates hotspot `saltline-hub`. Devices and the laptop/phone join it. Reason: hackathon Wi-Fi often blocks device-to-device traffic. Backup: a phone hotspot with the same credentials. [PROPOSED] Pi fixed at `192.168.4.1`, also reachable as `saltline.local`; firmware stores the hub URL in a config constant and falls back to the second address.
- Time: ESP32s have no RTC. Devices send `seq` and `uptime_ms`; **the hub assigns the timestamp on receipt.**
- Local-first: each device shows its result locally (OLED / beacon) even if the hub is unreachable. A failed POST never blocks measurement or display.

---

## 3. Measurement pipeline (firmware and simulator must implement identically)

Every 2 s, per cell:

1. **Drive AC.** Toggle the two drive pins in opposite directions about every 0.5 ms (never DC; DC polarizes the screws). Read once per direction and average the two.
2. **Read sense pin.** `analogReadMilliVolts()` on ADC1 (GPIO34 / GPIO35), 11 dB attenuation. Take the **median of 20** samples. Convert to volts `V`.
3. **Cell resistance:** `R_cell = 1000 * V / (3.3 - V)` (ohms, 1 kΩ reference).
4. **Conductivity at temp:** `EC_T = K / R_cell` (S/cm; ×1000 for mS/cm). `K` = cell constant in cm⁻¹, default **2.0**, overwritten by calibration.
5. **Temperature compensation:** `EC25 = EC_T / (1 + 0.02 * (T - 25))`, `T` in °C from DS18B20.
6. **Sodium estimate:** `Na_mgL = 197 * EC25_mScm` (table-salt assumption; Na is 39.3% of NaCl by mass; 1 g/L NaCl ≈ 2 mS/cm).
7. **Level:** `Na < 200 → ok`, `200 ≤ Na < 600 → warn`, `Na ≥ 600 → crit`.

Sanity check values: K=2.0, R_cell=1000 Ω → 2.0 mS/cm at 25 °C → ~394 mg/L (warn). Demo target values: RAIN ≈ 40 mg/L (ok), WELL ≈ 714 mg/L (crit).

**Measure one cell at a time** on the buoy. Set the idle cell's drive pins to INPUT, or current leaks through the water between cells.

**Faults** (set `fault` field, device keeps running, display shows `FAULT`):
- DS18B20 returns -127 °C or 85 °C (disconnected / not converted) or no device on bus.
- Sense voltage < 0.10 V or > 3.20 V (ADC inaccurate at the rails, probe shorted/open).
- Wi-Fi/hub unreachable is NOT a sensor fault; it is a `link` state shown on the device only.

**Calibration** (done live; part of the pitch):
- Three standards (~0.5, 1.0, 2.5 g/L NaCl, made from one level teaspoon ≈ 5.7 g in 1 L then diluted). Record `V`/`R_cell` for each. Fit a straight line of conductivity vs. known concentration; the slope fixes `K`.
- `K` is stored on the ESP32 (NVS / Preferences) per cell (`k_pipe`, `k_buoy_shallow`, `k_buoy_deep`).
- Calibration points are also posted to the hub (§6) so the dashboard can draw the calibration chart and validation table for the poster.
- [PROPOSED] Device calibration trigger: serial command `cal <known_g_per_L>` records one point; `cal fit` fits and stores `K`; `cal reset` restores 2.0. No on-device UI needed.

---

## 4. Device specs

### 4.1 Pipe module (`type: "pipe"`)
- MCU: ESP32-WROOM-32. 
- Pins: GPIO25 drive A (via 1 kΩ → sense node → electrode A), GPIO26 drive B, GPIO34 sense (ADC1), GPIO4 DS18B20 (4.7 kΩ pull-up to 3V3), GPIO21/22 OLED SDA/SCL (SSD1306 128×64), GPIO16/17/18 RGB LED (R/G/B, 220 Ω each, common cathode), GPIO27 optional YF-S201 flow signal via 10k/20k divider.
- OLED content (refresh every reading): `SALTLINE PIPE-01`, Na mg/L (large), EC25 mS/cm, temp °C, status/ link indicator. Boot screen shows `booting…`.
- RGB LED: green/yellow/red by level. [PROPOSED] Blinking white while joining Wi-Fi, solid magenta on `FAULT`.
- Optional flow: `flow_lpm`, `total_l` fields included only if the sensor is fitted (pulse counting via interrupt).
- Stretch: servo valve that diverts red water. If built, firmware adds `valve: "open"|"diverting"` to the payload. Not in v1.

### 4.2 Buoy (`type: "buoy"`)
- Same MCU. Two cells: shallow (hull bottom electrodes) and deep (capsule on tether, ~1 m in field, **15 cm in demo**).
- Pins: GPIO25/26 shallow drive A (via 1 kΩ)/B, GPIO34 shallow sense; GPIO27/14 deep drive A/B (down one twisted pair of the Cat5 tether), GPIO35 deep sense (resistor lives in the buoy, not the capsule); GPIO4 shared 1-Wire bus with **two** DS18B20 (identify each by ROM address; shallow vs deep assignment stored in config); GPIO13 WS2812B 8-LED stick (or RGB LED on GPIO16/17/18).
- Power: USB power bank, ~120 mA with Wi-Fi on. Keep Wi-Fi on (some banks cut off under ~50 mA). 
- **Beacon rule:**
  - Boot / joining Wi-Fi: blink white.
  - If shallow level is `ok` and deep level is `warn` or `crit` → **amber** (early warning: salt is coming from below). Status `early_warning`.
  - Otherwise → color of the worse of the two levels (green/yellow/red).
  - [PROPOSED] Magenta on fault.
- No OLED on the buoy.

---

## 5. Hub

- Hardware: Raspberry Pi (team has a basic Pi kit). OS: Raspberry Pi OS. Runs: hotspot (hostapd/dnsmasq or NetworkManager AP mode), Flask app, SQLite.
- Backend: **Python 3 + Flask**, single process, `flask run --host 0.0.0.0 --port 80` (or 8000 with port forward). [PROPOSED] SQLite file `saltline.db`, no ORM needed. Autostart with a systemd unit so the hub comes up on power-on with zero typing.
- Static dashboard files served by the same Flask app. No CORS needed.
- Also runs the **fake-data simulator** (§8) so the dashboard can be built and demoed with no hardware.

### 5.1 Data model (SQLite) [PROPOSED]

```sql
CREATE TABLE nodes (
  node_id TEXT PRIMARY KEY,          -- "pipe-01", "buoy-01"
  type TEXT NOT NULL,                -- "pipe" | "buoy"
  label TEXT,                        -- display name
  first_seen INTEGER, last_seen INTEGER,
  fw_version TEXT
);

CREATE TABLE readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL,
  ts INTEGER NOT NULL,               -- hub receive time, unix ms
  seq INTEGER, uptime_ms INTEGER, rssi INTEGER,
  probe TEXT NOT NULL,               -- "main" (pipe) | "shallow" | "deep" (buoy)
  sense_mv REAL, r_cell_ohm REAL,
  ec_mscm REAL, ec25_mscm REAL, temp_c REAL,
  na_mgl REAL,
  level TEXT NOT NULL,               -- "ok" | "warn" | "crit" | "fault"
  fault TEXT,                        -- null or reason string
  flow_lpm REAL, total_l REAL        -- pipe only, optional
);
CREATE INDEX idx_readings_node_ts ON readings(node_id, probe, ts);

CREATE TABLE events (                -- level transitions and device events
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL, ts INTEGER NOT NULL,
  kind TEXT NOT NULL,                -- "level_change" | "early_warning" | "fault" | "fault_clear" | "online" | "offline"
  probe TEXT, from_level TEXT, to_level TEXT,
  na_mgl REAL, message TEXT
);

CREATE TABLE calibration_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL, probe TEXT NOT NULL,
  ts INTEGER NOT NULL,
  known_g_per_l REAL NOT NULL,       -- NaCl standard
  sense_mv REAL, r_cell_ohm REAL, ec25_mscm REAL, temp_c REAL
);

CREATE TABLE calibration_fits (
  node_id TEXT NOT NULL, probe TEXT NOT NULL, ts INTEGER NOT NULL,
  k_cm1 REAL NOT NULL, r2 REAL, PRIMARY KEY (node_id, probe, ts)
);
```

A buoy POST writes two `readings` rows (shallow + deep). Hub computes node-level `status` on read (see 6.2).

### 5.2 Hub-side logic
- On every POST: validate, store, update `nodes.last_seen`, compare against the previous level for that (node, probe) and write an `events` row on change. Write `early_warning` when buoy shallow is `ok` and deep is not.
- **Offline detection:** a node with no reading for **10 s** is `offline` (write one `offline` event, one `online` on return). Evaluate lazily on request plus a 2 s background tick.
- **Thresholds live in one config** (`config.py` / `GET /api/config`): `na_warn=200`, `na_crit=600`, `offline_after_s=10`. Dashboard reads them; it never hard-codes them. The hub recomputes `level` from `na_mgl` and ignores the device's `level` if they disagree (log a warning).
- Trust the device for the numbers; the hub does not recompute sodium except in the calibration fit endpoint.
- Retention: keep everything. At 2 s per probe, a day is ~43k rows per probe, fine for SQLite.

---

## 6. API (all JSON unless noted; base path `/api`)

### 6.1 Device → hub

**`POST /api/readings`** — one call every 2 s per device.

Pipe payload:
```json
{
  "node_id": "pipe-01", "type": "pipe", "fw": "0.1.0",
  "seq": 1042, "uptime_ms": 2084000, "rssi": -58,
  "probe": {
    "sense_mv": 1650, "r_cell_ohm": 1000.0,
    "ec_mscm": 2.04, "ec25_mscm": 1.95, "temp_c": 27.5,
    "na_mgl": 384, "level": "warn", "fault": null
  },
  "flow_lpm": 3.2, "total_l": 18.4
}
```

Buoy payload:
```json
{
  "node_id": "buoy-01", "type": "buoy", "fw": "0.1.0",
  "seq": 311, "uptime_ms": 622000, "rssi": -61,
  "shallow": { "sense_mv": 2210, "r_cell_ohm": 2090.0, "ec_mscm": 0.96, "ec25_mscm": 0.94, "temp_c": 24.8, "na_mgl": 185, "level": "ok",   "fault": null },
  "deep":    { "sense_mv": 1200, "r_cell_ohm":  570.0, "ec_mscm": 3.51, "ec25_mscm": 3.45, "temp_c": 24.1, "na_mgl": 680, "level": "crit", "fault": null }
}
```
Response `200 {"ok":true,"ts":<hub_ms>}`. Bad payload: `400 {"ok":false,"error":"..."}`. Firmware ignores the response body except for success/failure and never retries more than once per cycle. Unknown `node_id`s are auto-registered. `flow_lpm`/`total_l` optional.

### 6.2 Dashboard → hub (read)

| Route | Returns |
|---|---|
| `GET /api/config` | `{na_warn, na_crit, offline_after_s, poll_ms}` |
| `GET /api/nodes` | List of nodes with `node_id, type, label, online, last_seen, status, latest` (latest reading per probe). One call drives the Live page. |
| `GET /api/nodes/{id}` | One node, same shape, plus `fw`, `rssi`, `first_seen`. |
| `GET /api/nodes/{id}/readings?probe=&since=<ms>&limit=` | Time series, oldest to newest. `probe` optional (all probes if omitted). `limit` default 1000, max 20000. |
| `GET /api/nodes/{id}/events?limit=` | Event log, newest first. |
| `GET /api/events?limit=` | Events across all nodes. |
| `GET /api/export.csv?node_id=&probe=&since=&until=` | CSV download of readings: `ts_iso, node_id, probe, temp_c, ec25_mscm, na_mgl, level, fault`. |
| `GET /api/nodes/{id}/calibration` | Calibration points, latest fit(s), and per-point predicted vs. known for the validation table. |
| `GET /api/health` | `{ok, uptime_s, db_rows, nodes_online}` |

**Node `status` (computed by hub):**
- pipe: `offline` | `fault` | `ok` | `warn` | `crit` (from its single probe)
- buoy: `offline` | `fault` | `early_warning` (shallow ok, deep warn/crit) | else worst of shallow/deep (`ok`/`warn`/`crit`)

### 6.3 Calibration and dev routes
- `POST /api/nodes/{id}/calibration/points` `{probe, known_g_per_l, sense_mv, r_cell_ohm, ec25_mscm, temp_c}`. Device (or a human using curl) posts each standard as it is measured.
- `POST /api/nodes/{id}/calibration/fit` `{probe}`. Hub does a least-squares line of measured EC25 vs. known conductivity (`known_g_per_l * 2.0` mS/cm) and returns/stores `{k_cm1, r2}`. Operator then enters that K on the device via serial. (Hub does not push K to devices in v1.)
- `POST /api/dev/inject` `{node_id, type, scenario}` starts a simulated scenario for demos and UI testing (see §8). Disabled unless `SALTLINE_DEV=1`.
- `POST /api/dev/reset` wipes readings/events. Same guard.

---

## 7. Dashboard (served by the hub)

[PROPOSED] Single-page web app, no login, mobile-first (judges will scan the QR on their phones). Stack: either one static `index.html` + vanilla JS + Chart.js, or React + Vite + Recharts built to static files and served by Flask. Pick the one the builder can finish fastest. Poll every 2 s (`poll_ms`). No websockets.

**Pages / views**
1. **Live** (default, what the QR code opens):
   - One card per node: label, type, online dot, big sodium number (mg/L), unit, level color, temp, EC25, "updated Ns ago".
   - Pipe card: optional flow and total liters.
   - Buoy card: two stacked readings (SHALLOW "drinking now" / DEEP "what's coming"), beacon color, and an **early warning** banner when status is `early_warning`.
   - Banner color/text follows the worst node: green/yellow/red/amber, same colors as the devices.
2. **Node detail** (`/node/{id}`):
   - Time-series chart of Na mg/L, **log y-axis from 10 to 20000**, with green/yellow/red bands drawn from `/api/config`. Buoy: two lines (shallow, deep).
   - Range selector: last 5 min / 1 h / all.
   - Event log under the chart (level changes, early warnings, faults, offline/online) with timestamps.
   - CSV download button (hits `/api/export.csv`).
3. **Calibration** (`/node/{id}/calibration`): scatter of known concentration vs. measured with the fit line, K and R², and a validation table (known vs. measured, % error). This view is screenshotted for the poster.
4. **About/legend** (small): level definitions (<200 / 200–600 / >600 mg/L), "estimate from table-salt calibration", link to limitations.

**UI requirements**
- Colors: ok `#2E8B57`, warn `#C08A0C`, crit `#C8322B`, early warning amber `#D45E2A`, offline gray. (Match the build plan palette; sea-green accent `#1E7A6C`.)
- Never show a stale number as live: if a node is offline, gray it out and show last-seen time.
- A sodium value is always displayed with its unit and "estimate" somewhere on the page.
- Light + dark theme optional.

---

## 8. Simulator (build first; unblocks everyone)

`tools/sim.py` POSTs to `/api/readings` exactly like a device, so firmware, backend, and dashboard can be developed in parallel.

Scenarios:
- `pipe_cups`: step through RAIN (~40 mg/L), POND [PROPOSED ~300, yellow], WELL (~714, red), SEA [PROPOSED ~10000+, red]; hold each ~10 s with small noise (±3%).
- `buoy_dry_season`: shallow stays ~50–150 (ok) while deep ramps 100 → 700+; expect `early_warning` event when deep crosses 200, shallow turns warn later.
- `buoy_demo`: shallow flat ok; deep jumps ok → crit when "salt water is added".
- `fault`: sensor drops out (`fault: "temp_probe"`), then recovers.
- `offline`: stop posting for 15 s.

The simulator must use the formulas in §3 so simulated Na values are consistent with sense_mv/EC fields.

---

## 9. Firmware structure [PROPOSED]

PlatformIO, Arduino framework, ESP32. One project, two build targets selected by compile flag (`NODE_PIPE`, `NODE_BUOY`).

```
firmware/
  platformio.ini
  src/
    main.cpp            // setup/loop, 2 s measurement tick
    config.h            // node_id, hub URLs, SSID/pass, K defaults, thresholds, pin map per target
    measure.cpp/.h      // AC drive, ADC median, R_cell, EC, EC25, Na  (pure math in measure_math.h)
    measure_math.h      // no Arduino calls; unit-testable on a laptop with g++
    temp.cpp/.h         // DS18B20 1-Wire (one or two sensors)
    level.h             // Na -> ok/warn/crit; buoy early-warning rule
    display_oled.cpp    // pipe only
    indicator.cpp       // RGB LED (pipe) / WS2812 beacon (buoy)
    net.cpp             // Wi-Fi connect/reconnect, JSON build, HTTP POST
    calib.cpp           // serial cal commands, NVS storage of K
```

Behavior:
- Boot: init, show `booting…`, blink white, join `saltline-hub` (fallback creds second). 
- Loop every 2 s: measure → compute → update local display/indicator → POST. Wi-Fi reconnect is non-blocking and never stalls measurement.
- Log each reading to serial in a plain line format (`na=384 ec25=1.95 t=27.5 mv=1650 level=warn`).
- `measure_math.h` is shared with the simulator's formulas; add a laptop-side test that checks the §3 sanity values.

---

## 10. Repo layout [PROPOSED]

```
saltline/
  firmware/       // PlatformIO project (§9)
  hub/            // Flask app, schema.sql, config.py, systemd unit, hotspot setup notes
  web/            // dashboard source (or hub/static if vanilla)
  tools/          // sim.py, calibration fit script, csv helpers
  docs/           // this file, build plan link, wiring photos, calibration results
```

---

## 11. Acceptance tests (definition of done)

1. `sim.py pipe_cups` → dashboard shows green, yellow, red in sequence; event log records each change; no hardware needed.
2. Real pipe module: pour RAIN → green (~40 mg/L) on OLED, LED, and dashboard within ~2–4 s. Pour WELL → red (~714).
3. Real buoy: layered water with deep probe in salt layer → beacon amber, dashboard shows `early_warning`, shallow stays green.
4. Hub restart does not lose history; both devices reconnect on their own within 30 s.
5. Unplug DS18B20 → device shows `FAULT`, dashboard shows fault event, no crash.
6. Unplug hub/Wi-Fi → devices keep updating OLED/beacon; dashboard shows them offline after 10 s; data resumes when the hub returns.
7. CSV export opens in a spreadsheet and contains the demo run.
8. Calibration page shows 3+ standard points, a fitted K, and a validation table.
9. QR code on the poster opens the Live page from a phone on the hub network.

---

## 12. Build order

1. Contract + simulator + hub skeleton (`POST /api/readings`, `GET /api/nodes`, SQLite). Unblocks dashboard and firmware.
2. Dashboard Live page against the simulator.
3. Firmware pure math + sensor read on a single cell (pipe) with serial output.
4. Firmware Wi-Fi POST to the hub; OLED + LED.
5. Calibration flow (serial commands, hub fit endpoint, calibration page).
6. Buoy firmware (two cells, beacon rule) and buoy views.
7. Node detail chart, events, CSV export.
8. Hub autostart + hotspot, power-cycle and offline tests.
9. Stretch (only if everything above works): flow sensor fields, servo valve diverting red water.

Cut line if time runs out: keep 1–4, 5 (at least one fitted K and the calibration chart), 6. Drop detail polish before dropping the buoy.

---

## 13. What we do not claim

- Conductivity measures all dissolved salts; sodium is an estimate from a table-salt calibration. Reasonable where NaCl dominates (seawater intrusion).
- 200 and 600 mg/L are design choices (200 ≈ where people start to taste sodium). They are not medical thresholds.
- Wi-Fi doesn't travel up a steel well casing; a field version needs a wired box at the wellhead or LoRa.
- Screws foul over months; field use needs rinsing and weekly recalibration.
- ESP32 ADC is inaccurate near 0 V and 3.3 V; that's why we calibrate against real standards.
- No "HIPAA", "certified", or "drinking-water safe" language anywhere in the product or pitch.

---

## 14. Open items [PROPOSED defaults in brackets]

- Node IDs and labels [`pipe-01`, `buoy-01`].
- POND and SEA demo cup concentrations [POND ~300 mg/L, SEA >10,000].
- Dashboard framework [vanilla + Chart.js unless someone prefers React].
- Hub IP/hostname [`192.168.4.1` / `saltline.local`].
- Whether the ESP32 pushes calibration points to the hub automatically, or an operator curls them [operator, v1].
- Who owns what [firmware + integration: Arush; hub/API: Nish; dashboard: Rishi (with Claude Code); hardware/calibration: Sameer], adjust to the actual plan.