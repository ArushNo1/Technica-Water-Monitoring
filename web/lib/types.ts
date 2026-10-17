export type Level = "green" | "yellow" | "red";
export type NodeState = "OPEN" | "CLOSED" | "FAULT";

// One row per probe, matching POST /api/readings
export interface Reading {
  id: number;
  site_id: string;
  node_id: string;
  kind: "pipe" | "buoy";
  pos: "main" | "shallow" | "deep";
  ts: string; // ISO 8601
  ec_raw_uS: number | null;
  temp_c: number | null;
  ec25_uS: number | null;
  na_mgL: number | null;
  level: Level | null;
  state: NodeState;
  valve: "open" | "closed" | null;
  fault: string | null;
}
