import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { db } from "@/lib/supabaseAdmin";
import { earlyWarning, fail, levelOf, loadNodes } from "@/lib/hub";

const NUM_FIELDS = ["sense_mv", "r_cell_ohm", "ec_mscm", "ec25_mscm", "temp_c", "na_mgl"] as const;
const badNum = (v: unknown) => v != null && !(typeof v === "number" && Number.isFinite(v));

// Device → hub, every 2 s (PRODUCT-PLAN §6.1). Pipe sends `probe`; buoy sends `shallow` + `deep`.
export async function POST(req: Request) {
  let b: any;
  try {
    b = await req.json();
  } catch {
    return fail(400, "invalid JSON");
  }
  if (typeof b?.node_id !== "string" || !/^[\w-]{1,64}$/.test(b.node_id)) return fail(400, "node_id required");
  if (b.type !== "pipe" && b.type !== "buoy") return fail(400, "type must be pipe or buoy");
  for (const f of ["seq", "uptime_ms", "rssi", "flow_lpm", "total_l"]) if (badNum(b[f])) return fail(400, `${f} must be a number`);

  const probes: Record<string, any> = b.type === "pipe" ? { main: b.probe } : { shallow: b.shallow, deep: b.deep };
  const ts = new Date().toISOString();
  const rows: Record<string, any>[] = [];
  for (const [probe, p] of Object.entries(probes)) {
    if (typeof p !== "object" || p === null) return fail(400, `${probe}: probe object required`);
    for (const f of NUM_FIELDS) if (badNum(p[f])) return fail(400, `${probe}.${f} must be a number`);
    if (p.fault != null && (typeof p.fault !== "string" || p.fault.length > 64)) return fail(400, `${probe}.fault must be a string`);
    const fault = p.fault || null;
    const level = levelOf(p.na_mgl ?? null, fault);
    if (!level) return fail(400, `${probe}.na_mgl required unless fault is set`);
    if (p.level && p.level !== level) console.warn(`${b.node_id}/${probe}: device level ${p.level}, hub level ${level}`);
    rows.push({
      node_id: b.node_id, ts, probe, level, fault,
      seq: b.seq, uptime_ms: b.uptime_ms, rssi: b.rssi,
      ...Object.fromEntries(NUM_FIELDS.map((f) => [f, p[f] ?? null])),
      flow_lpm: b.type === "pipe" ? b.flow_lpm ?? null : null,
      total_l: b.type === "pipe" ? b.total_l ?? null : null,
    });
  }

  const [prev] = await loadNodes(b.node_id);
  if (prev && prev.type !== b.type) return fail(400, `${b.node_id} is registered as a ${prev.type}`);

  const node = await db.from("nodes").upsert({ node_id: b.node_id, type: b.type, fw_version: b.fw ?? null, last_seen: ts });
  if (node.error) throw node.error;

  const events: Record<string, unknown>[] = [];
  if (!prev?.online) {
    // shortcut: offline events are written late, when the node comes back; a node still down has none yet.
    if (prev) {
      const wentOffline = new Date(Date.parse(prev.last_seen) + config.offline_after_s * 1000).toISOString();
      events.push({ node_id: b.node_id, ts: wentOffline, kind: "offline" });
    }
    events.push({ node_id: b.node_id, ts, kind: "online" });
  }
  for (const r of rows) {
    const from = prev?.latest[r.probe]?.level;
    if (!from || from === r.level) continue;
    const kind = r.level === "fault" ? "fault" : from === "fault" ? "fault_clear" : "level_change";
    events.push({ node_id: b.node_id, ts, kind, probe: r.probe, from_level: from, to_level: r.level, na_mgl: r.na_mgl, message: r.fault });
  }
  const next = Object.fromEntries(rows.map((r) => [r.probe, r]));
  if (b.type === "buoy" && earlyWarning(next) && !earlyWarning(prev?.latest ?? {})) {
    events.push({ node_id: b.node_id, ts, kind: "early_warning", probe: "deep", na_mgl: next.deep.na_mgl, message: "Deep probe is salty while shallow is still fresh" });
  }

  const [ins, ev] = await Promise.all([
    db.from("readings").insert(rows),
    events.length ? db.from("events").insert(events) : { error: null },
  ]);
  if (ins.error) throw ins.error;
  if (ev.error) throw ev.error;

  return NextResponse.json({ ok: true, ts: Date.parse(ts) });
}
