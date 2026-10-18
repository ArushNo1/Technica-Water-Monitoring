#!/usr/bin/env node
// Fake devices: POSTs to /api/readings exactly like the ESP32s (PRODUCT-PLAN §8).
// Usage: node tools/sim.mjs [--url http://localhost:3000] <scenario> [scenario...]
// Default is pipe_cups. Several scenarios can run at once if they drive different nodes.
import assert from "node:assert/strict";

const K = 2.0; // default cell constant, cm^-1
const R_REF = 1000; // reference resistor, ohms
const noise = (x, pct = 0.03) => x * (1 + (Math.random() * 2 - 1) * pct);

// Work §3 backwards from a target sodium so every field agrees with the firmware math.
function probe(naTarget, tempC = 25) {
  const ec25Target = naTarget / 197; // mS/cm
  const rTarget = (1000 * K) / (ec25Target * (1 + 0.02 * (tempC - 25)));
  const senseMv = Math.round((3300 * rTarget) / (R_REF + rTarget));
  // Then forward again from the rounded ADC reading, like the device does.
  const v = senseMv / 1000;
  const r = (R_REF * v) / (3.3 - v);
  const ec = (1000 * K) / r;
  const ec25 = ec / (1 + 0.02 * (tempC - 25));
  const na = 197 * ec25;
  const fault = v < 0.1 || v > 3.2 ? "cell_range" : null;
  return {
    sense_mv: senseMv,
    r_cell_ohm: +r.toFixed(1),
    ec_mscm: +ec.toFixed(3),
    ec25_mscm: +ec25.toFixed(3),
    temp_c: +tempC.toFixed(1),
    na_mgl: fault ? null : Math.round(na),
    level: fault ? "fault" : na < 200 ? "ok" : na < 600 ? "warn" : "crit",
    fault,
  };
}

const tempFault = () => ({ sense_mv: null, r_cell_ohm: null, ec_mscm: null, ec25_mscm: null, temp_c: -127, na_mgl: null, level: "fault", fault: "temp_probe" });

// Plan §3 sanity value: K=2.0, R=1000 Ω at 25 °C → ~394 mg/L (warn).
assert.ok(Math.abs(probe(394).r_cell_ohm - 1000) < 5);
assert.equal(probe(394).level, "warn");
assert.equal(probe(40).level, "ok");
assert.equal(probe(714).level, "crit");

// Each scenario maps seconds since start to the probe data to send, or null to stay silent.
const SCENARIOS = {
  pipe_cups: {
    node: "pipe-01", type: "pipe",
    at: (t) => {
      const cups = [40, 300, 714, 10000]; // RAIN, POND, WELL, SEA; 10 s each
      return { main: probe(noise(cups[Math.floor(t / 10) % cups.length]), noise(27, 0.01)) };
    },
  },
  buoy_dry_season: {
    node: "buoy-01", type: "buoy",
    at: (t) => {
      const p = t % 120; // deep climbs 100 → 800 over 90 s; shallow turns warn near the end
      return {
        shallow: probe(noise(80 + 200 * (p / 120) ** 3), 24.6),
        deep: probe(noise(100 + 700 * Math.min(1, p / 90)), 24.1),
      };
    },
  },
  buoy_demo: {
    node: "buoy-01", type: "buoy",
    at: (t) => ({
      shallow: probe(noise(110), 24.6),
      deep: probe(noise(t % 40 < 20 ? 120 : 900), 24.1), // "salt water added" every other 20 s
    }),
  },
  fault: {
    node: "pipe-01", type: "pipe",
    at: (t) => ({ main: t % 30 < 20 ? probe(noise(150), 27) : tempFault() }),
  },
  offline: {
    node: "pipe-01", type: "pipe",
    at: (t) => (t % 30 < 15 ? { main: probe(noise(150), 27) } : null), // 15 s on, 15 s silent
  },
};

const args = process.argv.slice(2);
const urlIdx = args.indexOf("--url");
const base = (urlIdx >= 0 ? args.splice(urlIdx, 2)[1] : process.env.SIM_URL) || "http://localhost:3000";
const names = args.length ? args : ["pipe_cups"]; // buoy is cut (IMPLEMENTATION-PLAN §2); its scenarios stay for reference
for (const n of names) if (!SCENARIOS[n]) {
  console.error(`unknown scenario "${n}". Choose from: ${Object.keys(SCENARIOS).join(", ")}`);
  process.exit(1);
}
const nodes = names.map((n) => SCENARIOS[n].node);
if (new Set(nodes).size < nodes.length) {
  console.error("two scenarios drive the same node; pick one pipe and one buoy scenario");
  process.exit(1);
}

const start = Date.now();
console.log(`simulating ${names.join(" + ")} → ${base}/api/readings (Ctrl+C to stop)`);

for (const name of names) {
  const { node, type, at } = SCENARIOS[name];
  let seq = 0;
  const tick = async () => {
    const t = (Date.now() - start) / 1000;
    const probes = at(t);
    if (!probes) {
      console.log(`${t.toFixed(0).padStart(4)}s ${node.padEnd(8)} (silent)`);
    } else {
      const body = {
        node_id: node, type, fw: "sim", seq: ++seq, uptime_ms: Date.now() - start,
        rssi: Math.round(-50 - Math.random() * 15),
        ...(type === "pipe" ? { probe: probes.main } : probes),
      };
      const summary = Object.entries(probes).map(([k, p]) => `${k}=${p.na_mgl ?? p.fault} ${p.level}`).join("  ");
      try {
        const res = await fetch(`${base}/api/readings`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const err = res.ok ? "" : ` ← ${res.status} ${await res.text()}`;
        console.log(`${t.toFixed(0).padStart(4)}s ${node.padEnd(8)} ${summary}${err}`);
      } catch (e) {
        // Like the firmware: a failed POST never stops the loop.
        console.log(`${t.toFixed(0).padStart(4)}s ${node.padEnd(8)} ${summary} ← ${e.cause?.code ?? e.message}`);
      }
    }
    setTimeout(tick, 2000);
  };
  tick();
}
