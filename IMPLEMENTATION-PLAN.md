# Saltline: Full Gameplan (all remaining work)

Written 2026-10-17 ~23:50 ET. Deadline: submission ~10:30 ET Sunday 2026-10-18 (~10h40m left).
Audience: Fable, who turns this into an implementation plan for subagents. Items are tagged FACT, ASSUMED, or UNCONFIRMED. Do not treat ASSUMED/UNCONFIRMED as fact; resolve them in the order listed in section 4.
Reference docs: Saltline Build Plan artifact (https://claude.ai/artifact/EFwfCbfF4UXURCeBqg38hX) and the Saltline PDD (sensing formulas, levels, data model).

---

## 1. Goal and definition of done

Saltline estimates sodium (mg/L) in water with two stainless screws, shows the level locally, and reports it to a website. Demo is a table only: no poster, no slides.

Done when, at the demo table:
1. Pour a RAIN cup (fresh/tap water) through the device: LED off, LCD shows `ok`, website green, reading well under 200 mg/L.
2. Pour a WELL cup (~714 mg/L Na, about 1.8 g NaCl per liter): LCD shows `CRIT`, LED solid, website red.
3. The same reading appears on the website within ~4 s of the pour.
4. Fault demo: unplug the thermistor -> LCD `FAULT temp_probe`, LED fast double-blink, website shows the fault and an event.
5. A calibration chart (known vs. measured, fit line, K) and one validation row exist as proof the sensor was built and calibrated, not bought.
6. A backup video of one clean run.
7. Devpost submitted.

Levels (Na mg/L): green/ok < 200, yellow/warn 200-600, red/crit >= 600.

Demo cup recipes (NaCl per liter of water; Na = 39.3% of NaCl; 1 g/L NaCl ~ 2 mS/cm):
- RAIN: plain tap water (reads whatever it reads, label it honestly).
- POND (optional): ~0.76 g/L NaCl -> ~300 mg/L Na (warn).
- WELL: ~1.8 g/L NaCl -> ~714 mg/L Na (crit).

---

## 2. Current state

FACT
- Device in scope: one **pipe module**. Buoy is cut. (buoy rows and `shallow`/`deep` probes exist in the schema; ignore them.)
- Parts on one breadboard, **nothing wired**: ESP32 boards, one thermistor, an I2C LCD 1602, one plain RED LED, one servo. No ADS1115, no RGB LED, no OLED, no DS18B20.
- Firmware: none written.
- Website: TS + React + Tailwind + Supabase (cloud) + Vercel, GoDaddy domain. Supabase tables for Saltline exist (schema in section 6). Next.js API routes exist and use the Supabase secret key. Realtime is enabled on `readings` and `events`.
- Pi: internet-connected, being re-imaged. SSH for Claude Code soon. Not on the critical path.
- 3D prints: none done. Housing design: undecided.
- Circuit mockup: in progress (Nish).
- No poster, no slides.

PEOPLE
| Who | Doing |
|---|---|
| Arush | All code: firmware, integration. Wires the bench breadboard. |
| Nish | Circuit mockup, then wiring/soldering. |
| Sameer | Physical construction (housing). |
| Rishi | Devpost drafting, photos, video. |

THERMISTOR (the unknown part)
- Looks like a small black dot, ~2-3 mm. UNCONFIRMED type, resistance and beta. Likely a bead NTC (10 kΩ is the common kit value), ASSUMED 10 kΩ NTC, beta 3950 until measured.
- It is **not waterproof**. A bare bead in water shorts its own reading and leaks current into the conductivity cell. It must be sealed (heat-shrink + epoxy or hot glue) and its leads insulated before it touches water, or it must sit out of the water against the housing wall.
- Fallback if it's unusable: fixed `T = 25 C`, entered by serial, label the displayed temperature "manual". Compensation then only holds when cups are near room temperature.

---

## 3. Architecture

PRIMARY PATH:
```
ESP32 --HTTPS POST JSON--> Next.js API on Vercel --(secret key)--> Supabase --> website (realtime, publishable key)
 (phone hotspot, 2.4 GHz)
```
- The ESP32 joins a phone hotspot with internet. Venue Wi-Fi only if it allows it.
- The existing API route owns validation, level, events and the nodes upsert. Do not rebuild that on the Pi.
- ESP32 HTTPS via `WiFiClientSecure`; `setInsecure()` is acceptable for the hackathon. The TLS handshake takes ~1-2 s, so post every 3 s, send from a task/timer so a slow POST never blocks measurement. The offline threshold stays 10 s.
- If the API needs a device token, keep it in `config.h`, never in git, and rotate after the event.

OPTIONAL (only if everything else is done): Pi relay with a SQLite store-and-forward queue, so readings survive an internet drop.

The Pi's other jobs: dev box for Claude Code subagents, optionally hosts `tools/sim.py`. A Pi failure must never block the demo.

---

## 4. Inputs to resolve first (23:50-00:15)

1. Electrodes in hand? Need two stainless screws or other stainless pieces (not plain steel or brass), ~10 mm apart. Stores are closed, so use what exists. Also a 1 kΩ resistor and a 10 kΩ (or one near the thermistor's room-temp resistance).
2. A gram scale, table salt, jars, a ruler, a reference thermometer (a phone is not a thermometer).
3. Thermistor characterization (section 7, workstream B step 2). 
4. LCD I2C address via an I2C scanner (0x27 or 0x3F).
5. Existing API contract: **subagent task 1** is to read the repo and write `docs/API.md` (routes, methods, bodies, auth, what each writes). Firmware follows it exactly.
6. Print vs. improvise housing (Sameer). Default: build the improvised flow cell as the guaranteed path; start a print only if the printer is free anyway.

---

## 5. Pin map

Single node, ESP32-WROOM-32, 3.3 V logic.
| GPIO | Function |
|---|---|
| 25 | Drive A -> 1 kΩ -> sense node -> electrode A |
| 26 | Drive B -> electrode B (opposite phase to 25) |
| 34 | Sense node (ADC1, input only) |
| 35 | Thermistor divider midpoint (ADC1, input only): 3V3 -> fixed R -> GPIO35 -> thermistor -> GND |
| 21 / 22 | I2C SDA / SCL -> LCD1602 backpack |
| 16 | Red LED through 220 Ω to GND |
| 18 | Servo signal (stretch only) |
| 3V3 / GND / VIN | Shared; LCD backpack and servo on 5 V (VIN) |

Rules: ADC1 only (ADC2 breaks with Wi-Fi on); `analogReadMilliVolts()` at 11 dB; median of 20; the ADC is inaccurate near 0 V and 3.3 V. Test the servo separately before wiring it in; it may brown out the ESP32 (power it from its own 5 V if so). LCD backpack on 5 V: if the I2C lines are flaky, remove the backpack pull-up jumpers or use a level shifter.

---

## 6. Data model (Supabase, final)

Tables: `nodes`, `readings`, `events`, `calibration_points`, `calibration_fits`; view `latest_readings`. RLS: publishable key = SELECT only; secret key = full, used only by Next.js API routes. Realtime on `readings`, `events`. Computed by the API at read time: online (last_seen within 10 s), node status, thresholds (200/600 in `lib/config.ts`).

Firmware payload fields map 1:1 to `readings`: `node_id`, `seq`, `uptime_ms`, `rssi`, `probe` = `"main"`, `sense_mv`, `r_cell_ohm`, `ec_mscm`, `ec25_mscm`, `temp_c`, `na_mgl`, `level` (`ok|warn|crit|fault`), `fault` (null or e.g. `"temp_probe"`), optional `flow_lpm`, `total_l`. `ts` is the server receive time. `calibration_points`: `node_id`, `probe`, `known_g_per_l`, `sense_mv`, `r_cell_ohm` (required, the fit uses it), `ec25_mscm`, `temp_c`. `calibration_fits`: `node_id`, `probe`, `k_cm1`, `r2`.
Adapt to the real schema. Migrations are additive only.

---

## 7. Workstreams

### A. Hardware bring-up (Arush + Nish)
1. Wire the bench per section 5 on a breadboard. No soldering yet.
2. Electrodes: two stainless screws ~10 mm apart, ~8 mm in the water, in a cup. 1 kΩ reference resistor.
3. Done when: tap water, then each added pinch of salt, gives a monotonic rise with no upward creep over 30 s.

### B. Firmware (Arush; PlatformIO, Arduino framework)
Modules: `measure_math.h` (pure math, no Arduino calls, laptop-testable), `measure.cpp`, `temp.cpp`, `level.h`, `display.cpp` (LCD), `indicator.cpp` (LED), `net.cpp` (Wi-Fi + HTTPS POST), `calib.cpp` (serial commands, NVS), `config.h`.

Step 1: bare cell
- AC drive: toggle GPIO25/26 opposite about every 0.5 ms; read once per direction and average.
- `V` = median of 20 samples (volts). `R_cell = 1000*V/(3.3-V)`. `EC = K/R_cell` (S/cm; x1000 for mS/cm). K default 2.0.
- Print `mv`, `R_cell`, `ec` over serial.

Step 2: thermistor characterization (5 minutes, do it now)
- Multimeter: measure the bare part's resistance at room temp (expect ~10 kΩ if it's a 10k NTC). Pinch it in warm fingers: resistance should drop (NTC). If it rises or doesn't change, it isn't an NTC; use the fixed-25 C fallback.
- No multimeter: wire the divider on GPIO35 and print `R_th = R_fixed*V/(3.3-V)` over serial.
- If `R_th` isn't near 10 kΩ at room temp, swap the fixed resistor for one close to that value.
- Beta: measure R at two temperatures (room ~25 C and ice water ~0 C, or room and body-warm) and compute `B = ln(R1/R2) / (1/T1 - 1/T2)` with T in kelvin. Otherwise use B = 3950 and accept an error of a few degrees.
- Seal the bead (heat-shrink + epoxy/hot glue; insulate the leads) before it sees water.
- Store `r0`, `beta`, `r_fixed` in NVS; serial `temp r0 <ohms> beta <b> rfixed <ohms>`.

Step 3: math (identical to PDD section 3)
- `R_th = R_fixed*V/(3.3-V)`; `1/T = 1/298.15 + (1/B)*ln(R_th/R0)`; T in C = T_K - 273.15.
- `EC25 = EC_T / (1 + 0.02*(T-25))`. `Na_mgL = 197*EC25_mScm`.
- Level: `<200 ok`, `200-600 warn`, `>=600 crit`.
- Fault if temp outside -10..80 C (open/shorted thermistor) or sense < 0.10 V or > 3.20 V. Reason strings: `temp_probe`, `cell_range`.
- Unit-test the pure math on a laptop against the sanity case: K=2.0, R_cell=1000 -> ~394 mg/L.

Step 4: outputs
- LCD 1602 (16x2): line 1 `Na 714 mg/L`; line 2 `25.3C  CRIT` (trimmed to 16 chars); fault: line 1 `FAULT`, line 2 the reason; `WiFi?` while POSTs fail.
- Red LED patterns: ok = off, warn = slow blink (1 Hz), crit = solid, fault = fast double-blink.
- If someone finds a green or yellow LED, add it on GPIO17 (needs a pin-map update).

Step 5: network
- Wi-Fi connect (non-blocking reconnect), JSON build, HTTPS POST every 3 s, payload per `docs/API.md`. Local display keeps working if the POST fails.

Step 6: calibration
- Serial commands: `cal <g_per_L>` records one point (posts it to the API), `cal fit` stores K in NVS, `cal reset` restores 2.0.
- Done when: fitted K stored and survives a reboot.

### C. API and website (subagents; Arush reviews)
1. Read the repo; write `docs/API.md` with the exact existing contract. Do not change an existing route's contract without telling Arush.
2. Fill gaps only: events (`level_change`, `fault`, `fault_clear`, `online`, `offline`) if nobody writes them; calibration points and fit routes if missing.
3. `tools/sim.py` posts scenarios to the real API (RAIN, POND, WELL, fault, offline).
4. Views: live card (big Na number, level color, temp, EC25, last updated, online/offline), history chart (log y-axis 10-20000 with the three bands), event log, calibration chart + validation table, CSV export. Realtime updates. Show "estimate" wherever sodium appears.
5. Done when: `sim.py` data appears within ~2 s and a calibration fit renders as a chart.

### D. Housing (Sameer)
- Default guaranteed path: improvised flow cell. Two screws through the wall of a short rigid tube or cut bottle, ~10 mm apart, ~8 mm into the flow, epoxied; funnel above, catch tub below; thermistor sealed and mounted in the water path or against the wall; electronics in a dry box above the tray.
- Optional: printed cylinder from the Build Plan (Ø100x140, 3/4" PVC sockets) only if a print can start by ~00:30.
- Done when: it leaks nothing during 5 consecutive pours with the electronics dry.

### E. Evidence and Devpost (Rishi + Arush)
Capture as you go: build photos, wiring, calibration jars; the calibration plot (known vs. measured, fit line, K); one validation cup not used in the fit; before/after temperature compensation if time; a cost table; a schematic photo. Devpost states honestly what is bought (ESP32, thermistor, display, servo) and what is built (electrodes and flow cell, AC drive and measurement, math, calibration, firmware, API integration, website).
Limitations to state: sodium is an estimate from a table-salt calibration; 200/600 are design choices, not medical thresholds; screws foul over months; conductivity measures all dissolved salts.

### F. Stretch (only if everything else is verified)
Servo as a flap/valve diverting red water, or a gauge needle. Not on the critical path.

---

## 8. Timeline (ET, Sat -> Sun)

| Time | What | Gate |
|---|---|---|
| 23:50-00:15 | Resolve section 4: electrodes/resistors, thermistor test, LCD scan; pin map to Nish and Sameer; housing default chosen. Subagent starts `docs/API.md` | Inputs locked |
| 00:15-01:15 | Wire bench; bare cell reads on serial; thermistor reading on serial. Subagents in parallel: API gaps, `sim.py`, website views | Monotonic reading with salt; temp sane |
| 01:15-02:00 | LCD + LED + HTTPS POST to the Vercel API; uncalibrated (K=2.0) is fine | **02:00: device live on the website end to end** |
| 02:00-03:00 | Calibration (3 standards ~0.5/1.0/2.5 g/L + 1 validation cup), K stored; fault test (unplug thermistor); freeze firmware | **03:00: calibrated + firmware frozen** |
| 03:00-07:00 | Sleep in shifts. Nish solders/perfboards the electronics; Sameer builds housing; Rishi captures evidence | Housing ready to receive electronics |
| 07:00-08:30 | Integrate; leak test with plain water first; recalibrate (update K if it shifted); power-cycle test | Sealed device reads correctly |
| 08:30-09:30 | Demo rehearsal x5, timed; reset routine; backup video | Clean run recorded |
| 09:30-10:30 | Devpost final; submission verified; buffer | Submitted |

Cut line if behind: keep (1) measurement + calibration, (2) LCD + LED, (3) website live. Drop servo, then history polish, then the Pi relay.

---

## 9. Risks and fallbacks

- **No electrodes or resistor.** Use any stainless metal on hand. Do not use plain steel or brass. If no 1 kΩ, use any nearby value and put its measured resistance in `config.h`.
- **Readings creep upward.** Polarization: verify the AC toggle, and that the cell is energized only while sampling.
- **Garbage readings.** Check ADC1 pins, common ground, and that the sense node sits between the resistor and electrode A.
- **Thermistor unusable or unsealed.** Seal it; else fixed-25 C fallback labeled "manual".
- **HTTPS slows the loop.** Post every 3 s from a separate task; never block the sensor read.
- **API needs a device token Arush doesn't have.** Read `docs/API.md`; ask Nish.
- **LCD blank or garbled.** Backpack on 5 V, correct address, contrast pot.
- **Servo brownout.** Separate 5 V, or skip it.
- **Venue Wi-Fi blocks devices.** Phone hotspot; credentials for a second hotspot in firmware.
- **Everything breaks.** Run on `sim.py` data plus bench readings; the calibration chart and backup video carry the submission.

---

## 10. Rules for subagents

- No secrets in git. Secret and device keys only in `.env` / `config.h` (gitignored).
- Adapt to the existing Supabase schema and Next.js routes; migrations additive only.
- Formulas and levels exactly as in section 7B; do not "improve" thresholds.
- Firmware math is pure and unit-tested on a laptop before flashing.
- Do not build cut items: buoy, valve logic, LoRa, accounts, multi-site, Pi relay (unless told).