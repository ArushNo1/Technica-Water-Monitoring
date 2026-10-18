import { db } from "@/lib/supabaseAdmin";
import { fail, msParam, paged } from "@/lib/hub";

export const dynamic = "force-dynamic";

const COLS = ["ts", "node_id", "probe", "temp_c", "ec25_mscm", "na_mgl", "level", "fault"];

const esc = (v: unknown) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const since = msParam(sp.get("since"));
  const until = msParam(sp.get("until"));
  if (since === false || until === false) return fail(400, "since/until must be unix ms");
  const nodeId = sp.get("node_id");
  const probe = sp.get("probe");

  // shortcut: capped at 100k rows (~11 h of all three probes); add streaming if exports get bigger.
  const rows = await paged((from, to) => {
    let q = db.from("readings").select(COLS.join(","));
    if (nodeId) q = q.eq("node_id", nodeId);
    if (probe) q = q.eq("probe", probe);
    if (since) q = q.gte("ts", since);
    if (until) q = q.lt("ts", until);
    return q.order("ts").order("id").range(from, to);
  }, 100_000);

  const header = ["ts_iso", ...COLS.slice(1)].join(",");
  const body = rows.map((r: any) => COLS.map((c) => esc(r[c])).join(","));
  return new Response([header, ...body].join("\n"), {
    headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="saltline-readings.csv"' },
  });
}
