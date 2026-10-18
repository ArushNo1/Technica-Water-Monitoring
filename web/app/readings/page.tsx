import ReadingsTable from "@/components/ReadingsTable";
import { supabase } from "@/lib/supabase";
import type { Level, Reading } from "@/lib/types";

export const dynamic = "force-dynamic";

const LEVELS: Record<string, Level> = { ok: "green", warn: "yellow", crit: "red" };
const uS = (mS: number | null) => (mS == null ? null : Math.round(mS * 1000));

export default async function Page() {
  const { data, error } = await supabase
    .from("readings")
    .select("*, nodes(type)")
    .order("ts", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  // Valve was cut from v1 (PRODUCT-PLAN §1), so state is just OPEN or FAULT.
  const readings: Reading[] = data.map((r) => ({
    id: r.id,
    site_id: "demo",
    node_id: r.node_id,
    kind: r.nodes.type,
    pos: r.probe,
    ts: r.ts,
    ec_raw_uS: uS(r.ec_mscm),
    temp_c: r.temp_c,
    ec25_uS: uS(r.ec25_mscm),
    na_mgL: r.na_mgl,
    level: LEVELS[r.level] ?? null,
    state: r.level === "fault" ? "FAULT" : "OPEN",
    valve: null,
    fault: r.fault,
  }));

  return <ReadingsTable readings={readings} siteName="Saltline · demo site" />;
}
