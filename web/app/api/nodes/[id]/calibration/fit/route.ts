import { NextResponse } from "next/server";
import { db } from "@/lib/supabaseAdmin";
import { fail, fitK } from "@/lib/hub";

// Fits K from all points for this probe and stores it. The operator then enters K on the device.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => null);
  if (typeof b?.probe !== "string") return fail(400, "probe required");

  const { data: pts, error } = await db
    .from("calibration_points")
    .select("known_g_per_l, r_cell_ohm, temp_c")
    .eq("node_id", params.id)
    .eq("probe", b.probe)
    .not("r_cell_ohm", "is", null);
  if (error) throw error;
  if (pts.length < 2) return fail(400, `need at least 2 points, have ${pts.length}`);

  const fit = fitK(pts);
  const ins = await db.from("calibration_fits").insert({ node_id: params.id, probe: b.probe, ...fit });
  if (ins.error) throw ins.error;
  return NextResponse.json({ ok: true, ...fit, n: pts.length });
}
