#!/usr/bin/env node
// End-to-end smoke test against a running server (local or deployed). Posts as a throwaway
// node, checks every route and page, then deletes that node's rows from Supabase.
// Usage: node tools/smoke.mjs [--url http://localhost:3000]     (or: cd web && npm run smoke)
// Cleanup reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY from the env or web/.env.local.
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const urlIdx = args.indexOf("--url");
const BASE = (urlIdx >= 0 ? args[urlIdx + 1] : process.env.SMOKE_URL) || "http://localhost:3000";
const ID = `smoke-${Date.now().toString(36)}`;

const envFile = new URL("../web/.env.local", import.meta.url);
const env = { ...process.env };
if (existsSync(envFile))
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2];
  }

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${ok || !detail ? "" : `  →  ${detail}`}`);
  if (!ok) failures++;
};
const get = (path) => fetch(BASE + path, { cache: "no-store" });
const post = (path, body) =>
  fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const json = async (res) => res.json().catch(() => null);
const pipe = (probe, extra = {}) => ({ node_id: ID, type: "pipe", fw: "smoke", seq: 1, uptime_ms: 1000, rssi: -60, probe, ...extra });

async function run() {
  console.log(`smoke test → ${BASE} as ${ID}\n`);

  // Dev servers compile each route on first hit (can take >10 s on WSL), which would make the
  // node look offline mid-test. Touch every route once with a dummy id before the timed checks.
  const dummy = `${ID}-warmup`;
  await Promise.all([
    get(`/api/nodes/${dummy}`), get("/api/nodes"), get(`/api/nodes/${dummy}/readings`), get(`/api/nodes/${dummy}/events`),
    get("/api/events?limit=1"), get(`/api/export.csv?node_id=${dummy}`), get(`/api/nodes/${dummy}/calibration`), get("/api/health"),
    post("/api/readings", "warmup"), post(`/api/nodes/${dummy}/calibration/points`, {}), post(`/api/nodes/${dummy}/calibration/fit`, {}),
  ]);

  console.log("config");
  const cfg = await json(await get("/api/config"));
  check("GET /api/config has thresholds", cfg?.na_warn === 200 && cfg?.na_crit === 600 && cfg?.offline_after_s === 10, JSON.stringify(cfg));

  console.log("ingest");
  let res = await post("/api/readings", pipe({ sense_mv: 2800, r_cell_ohm: 5600, ec_mscm: 0.5, ec25_mscm: 0.5, temp_c: 25, na_mgl: 99, level: "ok", fault: null }, { flow_lpm: 3.2, total_l: 1.5 }));
  const body = await json(res);
  check("ok reading → 200 {ok, ts}", res.status === 200 && body?.ok === true && typeof body.ts === "number", `${res.status} ${JSON.stringify(body)}`);
  res = await post("/api/readings", pipe({ na_mgl: 714, temp_c: 25, level: "warn" }, { seq: 2 }));
  check("crit reading (device says warn, server recomputes) → 200", res.status === 200, String(res.status));
  res = await post("/api/readings", pipe({ temp_c: null, na_mgl: null, level: "fault", fault: "temp_probe" }, { seq: 3 }));
  check("fault reading → 200", res.status === 200, String(res.status));

  for (const [name, payload] of [
    ["invalid JSON → 400", "not json"],
    ["missing node_id → 400", { type: "pipe", probe: { na_mgl: 1 } }],
    ["string na_mgl → 400", pipe({ na_mgl: "high" })],
    ["no na_mgl and no fault → 400", pipe({ temp_c: 25 })],
    ["wrong type for existing node → 400", { node_id: ID, type: "buoy", shallow: { na_mgl: 1 }, deep: { na_mgl: 1 } }],
  ]) {
    res = await post("/api/readings", payload);
    const b = await json(res);
    check(name, res.status === 400 && b?.ok === false && typeof b.error === "string", `${res.status} ${JSON.stringify(b)}`);
  }

  console.log("reads");
  const node = await json(await get(`/api/nodes/${ID}`));
  check("GET /api/nodes/{id}: online, status fault", node?.online === true && node?.status === "fault", JSON.stringify({ online: node?.online, status: node?.status }));
  check("latest.main is the fault reading", node?.latest?.main?.fault === "temp_probe");
  const all = await json(await get("/api/nodes"));
  check("GET /api/nodes lists the node", Array.isArray(all) && all.some((n) => n.node_id === ID));
  check("unknown node → 404", (await get(`/api/nodes/${ID}-nope`)).status === 404);

  const rows = await json(await get(`/api/nodes/${ID}/readings`));
  check("readings oldest→newest: ok, crit, fault", JSON.stringify(rows?.map((r) => r.level)) === '["ok","crit","fault"]', JSON.stringify(rows?.map((r) => r.level)));
  check("first reading kept flow fields", rows?.[0]?.flow_lpm === 3.2 && rows?.[0]?.total_l === 1.5);
  check("readings ?limit=1 → newest only", (await json(await get(`/api/nodes/${ID}/readings?limit=1`)))?.[0]?.level === "fault");
  check("readings ?since=garbage → 400", (await get(`/api/nodes/${ID}/readings?since=abc`)).status === 400);

  const evs = await json(await get(`/api/nodes/${ID}/events`));
  const kinds = evs?.map((e) => `${e.kind}${e.from_level ? `:${e.from_level}>${e.to_level}` : ""}`) ?? [];
  check("events: online, level_change ok>crit, fault crit>fault", ["online", "level_change:ok>crit", "fault:crit>fault"].every((k) => kinds.includes(k)), JSON.stringify(kinds));
  check("GET /api/events works", Array.isArray(await json(await get("/api/events?limit=5"))));

  const csv = await (await get(`/api/export.csv?node_id=${ID}`)).text();
  const lines = csv.trim().split("\n");
  check("export.csv: header + 3 rows", lines[0] === "ts_iso,node_id,probe,temp_c,ec25_mscm,na_mgl,level,fault" && lines.length === 4, `${lines.length} lines`);

  console.log("calibration");
  for (const c of [0.5, 1, 2.5]) {
    res = await post(`/api/nodes/${ID}/calibration/points`, { probe: "main", known_g_per_l: c, r_cell_ohm: (2.5 * 1000) / (2 * c), temp_c: 25 });
    check(`point ${c} g/L → 200`, res.status === 200, String(res.status));
  }
  check("point without r_cell_ohm → 400", (await post(`/api/nodes/${ID}/calibration/points`, { probe: "main", known_g_per_l: 1 })).status === 400);
  check("point for unknown node → 404", (await post(`/api/nodes/${ID}-nope/calibration/points`, { probe: "main", known_g_per_l: 1, r_cell_ohm: 1000 })).status === 404);
  const fit = await json(await post(`/api/nodes/${ID}/calibration/fit`, { probe: "main" }));
  // Columns are Postgres `real` (~7 significant digits), hence 1e-4 tolerances.
  check("fit recovers K = 2.5, R² = 1", Math.abs(fit?.k_cm1 - 2.5) < 1e-4 && Math.abs(fit?.r2 - 1) < 1e-4 && fit?.n === 3, JSON.stringify(fit));
  await new Promise((r) => setTimeout(r, 1100)); // so the validation point is strictly after the fit
  await post(`/api/nodes/${ID}/calibration/points`, { probe: "main", known_g_per_l: 1.8, r_cell_ohm: (2.5 * 1000) / 3.6, temp_c: 25 });
  const cal = await json(await get(`/api/nodes/${ID}/calibration`));
  check("calibration: 3 in fit + 1 validation", cal?.points?.filter((p) => p.in_fit).length === 3 && cal?.points?.filter((p) => !p.in_fit).length === 1);
  const val = cal?.validation?.find((v) => !v.in_fit);
  check("validation cup predicted at 1.8 g/L", val && Math.abs(val.predicted_g_per_l - 1.8) < 1e-4, JSON.stringify(val));
  check("fit with < 2 points → 400", (await post(`/api/nodes/${ID}/calibration/fit`, { probe: "deep" })).status === 400);

  console.log("offline → online (waits 11 s)");
  await new Promise((r) => setTimeout(r, 11_000));
  const stale = await json(await get(`/api/nodes/${ID}`));
  check("node reads offline after 10 s of silence", stale?.online === false && stale?.status === "offline", JSON.stringify({ online: stale?.online, status: stale?.status }));
  await post("/api/readings", pipe({ na_mgl: 50, temp_c: 25 }, { seq: 4 }));
  const evs2 = (await json(await get(`/api/nodes/${ID}/events?limit=3`)))?.map((e) => e.kind) ?? [];
  check("return writes offline + online events", evs2.includes("offline") && evs2.includes("online"), JSON.stringify(evs2));

  console.log("health + pages");
  const health = await json(await get("/api/health"));
  check("GET /api/health ok", health?.ok === true && typeof health.db_rows === "number", JSON.stringify(health));
  for (const [path, status] of [["/", 200], ["/readings", 200], [`/node/${ID}`, 200], [`/node/${ID}/calibration`, 200], [`/node/${ID}-nope`, 404]]) {
    check(`page ${path} → ${status}`, (await get(path)).status === status);
  }
}

async function cleanup() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.log(`\n! no Supabase credentials found; delete node "${ID}" by hand`);
    return;
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  // Children first: every table references nodes.node_id.
  for (const t of ["readings", "events", "calibration_points", "calibration_fits", "nodes"]) {
    const r = await fetch(`${url}/rest/v1/${t}?node_id=eq.${ID}`, { method: "DELETE", headers });
    if (!r.ok) console.log(`! cleanup of ${t} failed: ${r.status} ${await r.text()}`);
  }
  console.log(`\ncleaned up ${ID}`);
}

try {
  await run();
} catch (e) {
  failures++;
  console.log(`  ✗ crashed: ${e.cause?.code ?? e.message}`);
} finally {
  await cleanup();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
