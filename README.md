# Saltline

**See the salt before you drink it.**
Technica 2026 · hardware track

You can't taste salt in your water until it's already bad. Saltline measures salinity with two stainless screws, using a low-cost ESP32 conductivity sensor that streams live readings to a dashboard.

## Deliverables
- **Pipe module**: a 3D-printed housing that 3/4" PVC slides into. It measures every liter flowing through a pump spout, tank line, or irrigation pipe.
- **Well buoy**: a float with a shallow probe and a deep tethered probe. It catches the denser salt layer rising from below before it reaches the drinking layer.

Levels: 🟢 <200 mg/L Na · 🟡 200–600 · 🔴 >600

## How it works
1. The ESP32 drives an alternating current between two stainless electrodes. Alternating it prevents polarization.
2. The voltage across a 1 kΩ reference resistor gives the water's resistance, and from that its conductivity (EC).
3. A temperature compensation step corrects EC to 25 °C: `EC25 = EC / (1 + 0.02·(T − 25))`
4. Sodium is estimated as `Na (mg/L) ≈ 197 × EC25 (mS/cm)`, using a 3-point table-salt calibration.
5. The device POSTs JSON every 2 s to the backend, and the dashboard shows live data, levels, and events.

## Repo layout