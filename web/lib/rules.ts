import { config } from "./config";

// Pure rules: no database or Next imports, so lib/rules.test.ts can run them directly.
export type DbLevel = "ok" | "warn" | "crit" | "fault";
type Latest = Record<string, { level: string } | undefined>;

export function levelOf(na: number | null, fault: string | null): DbLevel | null {
  if (fault) return "fault";
  if (na == null) return null;
  return na < config.na_warn ? "ok" : na < config.na_crit ? "warn" : "crit";
}

export const isOnline = (lastSeen: string) => Date.now() - Date.parse(lastSeen) <= config.offline_after_s * 1000;

export const earlyWarning = (l: Latest) =>
  l.shallow?.level === "ok" && (l.deep?.level === "warn" || l.deep?.level === "crit");

const RANK: Record<string, number> = { ok: 0, warn: 1, crit: 2 };

export function nodeStatus(online: boolean, latest: Latest) {
  if (!online) return "offline";
  const levels = Object.values(latest).map((r) => r!.level);
  if (levels.includes("fault")) return "fault";
  if (earlyWarning(latest)) return "early_warning";
  return levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "ok");
}

export const limitParam = (v: string | null, def: number, max: number) =>
  Math.min(Math.max(1, Math.floor(Number(v)) || def), max);

// `since`/`until` are unix ms. Returns ISO, null if absent, or false if invalid.
export function msParam(v: string | null): string | null | false {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? new Date(n).toISOString() : false;
}

// Cell-constant fit (PRODUCT-PLAN §3): known conductivity = K * 1000 / (R * tempcomp), in mS/cm.
// Fit through the origin because the device model EC = K/R has no offset.
export type CalPoint = { known_g_per_l: number; r_cell_ohm: number; temp_c: number | null };
const conductance = (p: CalPoint) => 1000 / (p.r_cell_ohm * (1 + 0.02 * ((p.temp_c ?? 25) - 25)));

export function fitK(points: CalPoint[]) {
  const xs = points.map(conductance);
  const ys = points.map((p) => p.known_g_per_l * 2.0); // 1 g/L NaCl ≈ 2 mS/cm
  const k = xs.reduce((s, x, i) => s + x * ys[i], 0) / xs.reduce((s, x) => s + x * x, 0);
  const mean = ys.reduce((s, y) => s + y, 0) / ys.length;
  const ssTot = ys.reduce((s, y) => s + (y - mean) ** 2, 0);
  const ssRes = ys.reduce((s, y, i) => s + (y - k * xs[i]) ** 2, 0);
  return { k_cm1: k, r2: ssTot ? 1 - ssRes / ssTot : null };
}

export const predictGPerL = (p: CalPoint, k: number) => (k * conductance(p)) / 2.0;
