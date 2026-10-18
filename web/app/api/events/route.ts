import { NextResponse } from "next/server";
import { db } from "@/lib/supabaseAdmin";
import { limitParam } from "@/lib/hub";

export const dynamic = "force-dynamic";

// Newest first. Also serves /api/nodes/{id}/events, where `id` filters to one node.
export async function GET(req: Request, ctx?: { params?: { id?: string } }) {
  let q = db.from("events").select("*");
  if (ctx?.params?.id) q = q.eq("node_id", ctx.params.id);
  const { data, error } = await q
    .order("ts", { ascending: false })
    .order("id", { ascending: false })
    .limit(limitParam(new URL(req.url).searchParams.get("limit"), 100, 1000));
  if (error) throw error;
  return NextResponse.json(data);
}
