import type { Level, NodeState, Reading } from "./types";

const base = new Date("2026-10-17T16:00:00-04:00").getTime();

type Row = [number, string, Reading["kind"], Reading["pos"], number, number, NodeState, Reading["valve"], string | null];

// [secondsAgo, node, kind, pos, ec_raw_uS, temp_c, state, valve, fault]
const rows: Row[] = [
  [0, "pipe-01", "pipe", "main", 3860, 28.0, "CLOSED", "closed", null],
  [14, "buoy-01", "buoy", "deep", 2410, 24.1, "OPEN", null, null],
  [14, "buoy-01", "buoy", "shallow", 320, 24.6, "OPEN", null, null],
  [31, "pipe-01", "pipe", "main", 2950, 27.8, "CLOSED", "closed", null],
  [52, "pipe-01", "pipe", "main", 1780, 27.5, "OPEN", "open", null],
  [66, "buoy-01", "buoy", "deep", 1290, 24.0, "OPEN", null, null],
  [66, "buoy-01", "buoy", "shallow", 300, 24.5, "OPEN", null, null],
  [90, "pipe-01", "pipe", "main", NaN, 27.4, "FAULT", "closed", "ec_nan"],
  [121, "pipe-01", "pipe", "main", 890, 27.2, "OPEN", "open", null],
  [158, "buoy-01", "buoy", "deep", 610, 23.9, "OPEN", null, null],
  [158, "buoy-01", "buoy", "shallow", 290, 24.4, "OPEN", null, null],
  [190, "pipe-01", "pipe", "main", 220, 27.0, "OPEN", "open", null],
];

const ec25 = (ec: number, t: number) => ec / (1 + 0.02 * (t - 25));
const toLevel = (na: number | null): Level | null =>
  na == null ? null : na < 200 ? "green" : na <= 600 ? "yellow" : "red";

export const sampleReadings: Reading[] = rows.map(([s, node_id, kind, pos, raw, temp_c, state, valve, fault], i) => {
  const e = Number.isFinite(raw) ? ec25(raw, temp_c) : null;
  const na = e == null ? null : Math.round(0.197 * e); // ~197 mg/L Na per mS/cm
  return {
    id: i,
    site_id: "demo",
    node_id,
    kind,
    pos,
    ts: new Date(base - s * 1000).toISOString(),
    ec_raw_uS: Number.isFinite(raw) ? raw : null,
    temp_c,
    ec25_uS: e == null ? null : Math.round(e),
    na_mgL: na,
    level: toLevel(na),
    state,
    valve,
    fault,
  };
});
