import { NextResponse } from "next/server";
import { db } from "@/lib/supabaseAdmin";
import { fail } from "@/lib/hub";

const PROBES = ["main", "shallow", "deep"];
const NUM_FIELDS = ["sense_mv", "r_cell_ohm", "ec25_mscm", "temp_c"] as const;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => null);
  if (!PROBES.includes(b?.probe)) return fail(400, "probe must be main, shallow or deep");
  if (!(typeof b.known_g_per_l === "number" && b.known_g_per_l > 0)) return fail(400, "known_g_per_l must be > 0");
  for (const f of NUM_FIELDS)
    if (b[f] != null && !(typeof b[f] === "number" && Number.isFinite(b[f]))) return fail(400, `${f} must be a number`);
  if (!(b.r_cell_ohm > 0)) return fail(400, "r_cell_ohm must be > 0 (the fit needs it)");

  const { data, error } = await db
    .from("calibration_points")
    .insert({
      node_id: params.id,
      probe: b.probe,
      known_g_per_l: b.known_g_per_l,
      ...Object.fromEntries(NUM_FIELDS.map((f) => [f, b[f] ?? null])),
    })
    .select()
    .single();
  if (error?.code === "23503") return fail(404, "unknown node");
  if (error) throw error;
  return NextResponse.json({ ok: true, point: data });
}
