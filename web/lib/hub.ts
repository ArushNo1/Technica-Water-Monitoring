import { NextResponse } from "next/server";
import { db } from "./supabaseAdmin";
import { isOnline, nodeStatus, predictGPerL } from "./rules";

export * from "./rules";

export const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

// Nodes with computed online/status and latest reading per probe. Optionally one node.
export async function loadNodes(id?: string) {
  let nq = db.from("nodes").select("*").order("node_id");
  let lq = db.from("latest_readings").select("*");
  if (id) {
    nq = nq.eq("node_id", id);
    lq = lq.eq("node_id", id);
  }
  const [n, l] = await Promise.all([nq, lq]);
  if (n.error) throw n.error;
  if (l.error) throw l.error;
  return n.data.map((node) => {
    const latest: Record<string, any> = Object.fromEntries(l.data.filter((r) => r.node_id === node.node_id).map((r) => [r.probe, r]));
    const online = isOnline(node.last_seen);
    return {
      node_id: node.node_id as string,
      type: node.type as "pipe" | "buoy",
      label: node.label,
      online,
      last_seen: node.last_seen as string,
      status: nodeStatus(online, latest),
      latest,
      fw: node.fw_version,
      first_seen: node.first_seen,
      rssi: Object.values(latest)[0]?.rssi ?? null,
    };
  });
}

// PostgREST caps responses at 1000 rows, so fetch larger results in pages.
export async function paged<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  limit: number,
) {
  const out: T[] = [];
  for (let from = 0; from < limit; from += 1000) {
    const to = Math.min(from + 1000, limit) - 1;
    const { data, error } = await page(from, to);
    if (error) throw error;
    out.push(...data!);
    if (data!.length < to - from + 1) break;
  }
  return out;
}

// Points (flagged in_fit if recorded before the latest fit for their probe), latest fit per probe,
// and a validation row per point predicted with that fit.
export async function loadCalibration(id: string) {
  const [pts, fits] = await Promise.all([
    db.from("calibration_points").select("*").eq("node_id", id).order("ts"),
    db.from("calibration_fits").select("*").eq("node_id", id).order("ts", { ascending: false }),
  ]);
  if (pts.error) throw pts.error;
  if (fits.error) throw fits.error;

  const latest: Record<string, (typeof fits.data)[number]> = {};
  for (const f of fits.data) latest[f.probe] ??= f;

  const points = pts.data.map((p) => ({
    ...p,
    in_fit: !!latest[p.probe] && Date.parse(p.ts) <= Date.parse(latest[p.probe].ts),
  }));
  const validation = points
    .filter((p) => latest[p.probe] && p.r_cell_ohm)
    .map((p) => {
      const predicted = predictGPerL(p, latest[p.probe].k_cm1);
      return {
        point_id: p.id,
        probe: p.probe,
        in_fit: p.in_fit,
        known_g_per_l: p.known_g_per_l,
        predicted_g_per_l: predicted,
        pct_error: (100 * (predicted - p.known_g_per_l)) / p.known_g_per_l,
      };
    });
  return { points, fits: latest, validation };
}
