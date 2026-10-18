import { NextResponse } from "next/server";
import { db } from "@/lib/supabaseAdmin";
import { fail } from "@/lib/hub";

// Wipes readings and events. Only when SALTLINE_DEV=1 (never set it in production).
export async function POST() {
  if (process.env.SALTLINE_DEV !== "1") return fail(403, "dev routes disabled");
  const [r, e] = await Promise.all([db.from("readings").delete().gte("id", 0), db.from("events").delete().gte("id", 0)]);
  if (r.error) throw r.error;
  if (e.error) throw e.error;
  return NextResponse.json({ ok: true });
}
