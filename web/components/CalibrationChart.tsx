"use client";

import { useState } from "react";
import { useWidth } from "./useWidth";

export type CalPt = { id: number; known_g_per_l: number; r_cell_ohm: number; temp_c: number | null; in_fit: boolean };

const M = { l: 48, r: 16, t: 28, b: 46 };

// Temperature-compensated cell conductance in mS: the raw quantity the fit is done on (lib/hub.ts fitK).
export const conductanceMs = (p: CalPt) => 1000 / (p.r_cell_ohm * (1 + 0.02 * ((p.temp_c ?? 25) - 25)));

// Known NaCl concentration vs. measured conductance, with the fitted line G = 2·c / K through the origin.
export default function CalibrationChart({ points, k }: { points: CalPt[]; k: number | null }) {
  const [hover, setHover] = useState<CalPt | null>(null);
  const [ref, W] = useWidth<HTMLDivElement>(640);
  const H = Math.round(Math.min(360, W * 0.65));
  const xMax = Math.max(0.5, ...points.map((p) => p.known_g_per_l)) * 1.15;
  const yMax = Math.max(0.1, ...points.map(conductanceMs), k ? (2 * xMax) / k : 0) * 1.1;
  const sx = (x: number) => M.l + ((W - M.l - M.r) * x) / xMax;
  const sy = (y: number) => H - M.b - ((H - M.t - M.b) * y) / yMax;
  const ticks = (max: number) => (W < 500 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((f) => f * max);

  return (
    <div ref={ref} className="relative">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block select-none" role="img" aria-label="Calibration: known concentration vs measured conductance">
        {ticks(yMax).map((y) => (
          <g key={`y${y}`}>
            <line x1={M.l} x2={W - M.r} y1={sy(y)} y2={sy(y)} className="stroke-line" strokeWidth={1} />
            <text x={M.l - 8} y={sy(y) + 4} textAnchor="end" className="fill-muted font-mono text-[11px]">{y.toFixed(2)}</text>
          </g>
        ))}
        {ticks(xMax).map((x) => (
          <text key={`x${x}`} x={sx(x)} y={H - M.b + 18} textAnchor="middle" className="fill-muted font-mono text-[11px]">{x.toFixed(2)}</text>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 8} textAnchor="middle" className="fill-muted text-[12px]">Known NaCl (g/L)</text>
        <text x={M.l} y={14} className="fill-muted text-[12px]">Measured conductance at 25 °C (mS)</text>

        {k && <line x1={sx(0)} y1={sy(0)} x2={sx(xMax)} y2={sy((2 * xMax) / k)} className="stroke-aqua" strokeWidth={2} />}

        {points.map((p) => (
          <g key={p.id} onPointerEnter={() => setHover(p)} onPointerLeave={() => setHover(null)}>
            <circle cx={sx(p.known_g_per_l)} cy={sy(conductanceMs(p))} r={14} fill="transparent" />
            <circle
              cx={sx(p.known_g_per_l)}
              cy={sy(conductanceMs(p))}
              r={5}
              strokeWidth={2}
              className={p.in_fit ? "fill-ink stroke-white" : "fill-white stroke-coral"}
            />
          </g>
        ))}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-sm"
          style={{ left: `${(sx(hover.known_g_per_l) / W) * 100}%`, top: `${(sy(conductanceMs(hover)) / H) * 100}%`, transform: "translate(-50%, -120%)" }}
        >
          <div className="font-semibold text-ink">{hover.known_g_per_l} g/L {hover.in_fit ? "standard" : "validation"}</div>
          <div className="font-mono text-muted">{conductanceMs(hover).toFixed(3)} mS · R {Math.round(hover.r_cell_ohm)} Ω</div>
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ink" />Standard (used in fit)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-coral bg-white" />Validation (not in fit)</span>
        {k && <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-aqua" />Fit, K = {k.toFixed(3)} cm⁻¹</span>}
      </div>
    </div>
  );
}
