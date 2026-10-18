import { NextResponse } from "next/server";
import { db } from "@/lib/supabaseAdmin";
import { fail, limitParam, msParam, paged } from "@/lib/hub";

export const dynamic = "force-dynamic";

// Time series, oldest to newest: the newest `limit` rows after `since`.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const sp = new URL(req.url).searchParams;
  const since = msParam(sp.get("since"));
  if (since === false) return fail(400, "since must be unix ms");
  const probe = sp.get("probe");

  const rows = await paged((from, to) => {
    let q = db.from("readings").select("*").eq("node_id", params.id);
    if (probe) q = q.eq("probe", probe);
    if (since) q = q.gte("ts", since);
    return q.order("ts", { ascending: false }).order("id", { ascending: false }).range(from, to);
  }, limitParam(sp.get("limit"), 1000, 20000));

  return NextResponse.json(rows.reverse());
}
