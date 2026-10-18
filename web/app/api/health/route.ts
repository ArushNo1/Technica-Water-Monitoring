import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { db } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const cutoff = new Date(Date.now() - config.offline_after_s * 1000).toISOString();
  const [rows, online] = await Promise.all([
    db.from("readings").select("*", { count: "exact", head: true }),
    db.from("nodes").select("*", { count: "exact", head: true }).gte("last_seen", cutoff),
  ]);
  if (rows.error) throw rows.error;
  if (online.error) throw online.error;
  // uptime_s is this serverless instance's age, not the whole service's.
  return NextResponse.json({ ok: true, uptime_s: Math.round(process.uptime()), db_rows: rows.count, nodes_online: online.count });
}
