"use client";

import { useState } from "react";
import { useWidth } from "./useWidth";

export type Pt = { t: number; v: number | null; fault: string | null };

const M = { l: 52, r: 12, t: 26, b: 30 };
const Y_MIN = 10, Y_MAX = 20000; // log axis per PRODUCT-PLAN §7

const lg = Math.log10;
const time = (t: number, secs: boolean) =>
  new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(secs ? { second: "2-digit" } : {}) });

// Sodium over time on a log scale, with the ok / warn / crit bands behind it.
export default function HistoryChart({ points, x0, x1, warn, crit, gapMs }: { points: Pt[]; x0: number; x1: number; warn: number; crit: number; gapMs: number }) {
  const [hover, setHover] = useState<Pt | null>(null);
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = W < 500 ? 240 : 300;
  const sy = (v: number) => {
    const c = Math.min(Y_MAX, Math.max(Y_MIN, v));
    return M.t + (H - M.t - M.b) * (1 - (lg(c) - lg(Y_MIN)) / (lg(Y_MAX) - lg(Y_MIN)));
  };
  const xTicks = W < 500 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  const span = Math.max(1, x1 - x0);
  const sx = (t: number) => M.l + ((W - M.l - M.r) * (t - x0)) / span;
  const secs = span <= 10 * 60e3;

  // Break the line at faults (null sodium) and offline gaps instead of bridging them.
  let d = "";
  let pen = false;
  let prevT = -Infinity;
  for (const p of points) {
    if (p.t - prevT > gapMs) pen = false;
    prevT = p.t;
    if (p.v == null) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${sx(p.t).toFixed(1)},${sy(p.v).toFixed(1)}`;
    pen = true;
  }
  const last = [...points].reverse().find((p) => p.v != null);

  const bands = [
    { from: Y_MIN, to: warn, fill: "fill-ok/10", text: "fill-ok", label: "Safe" },
    { from: warn, to: crit, fill: "fill-warn/10", text: "fill-warn", label: "Elevated" },
    { from: crit, to: Y_MAX, fill: "fill-bad/10", text: "fill-bad", label: "Unsafe" },
  ];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = x0 + (((e.clientX - r.left) / r.width) * W - M.l) * (span / (W - M.l - M.r));
    let best: Pt | null = null;
    for (const p of points) if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    setHover(best);
  };

  return (
    <div ref={ref} className="relative">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block touch-none select-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="Sodium over time, log scale">
        {bands.map((b) => (
          <g key={b.label}>
            <rect x={M.l} width={W - M.l - M.r} y={sy(b.to)} height={sy(b.from) - sy(b.to)} className={b.fill} />
            <text x={W - M.r - 8} y={(sy(b.from) + sy(b.to)) / 2 + 4} textAnchor="end" className={`${b.text} text-[12px] font-semibold`}>{b.label}</text>
          </g>
        ))}
        {[10, 100, warn, crit, 10000].map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} className="stroke-line" strokeWidth={1} />
            <text x={M.l - 8} y={sy(v) + 4} textAnchor="end" className="fill-muted font-mono text-[11px]">{v.toLocaleString()}</text>
          </g>
        ))}
        <text x={M.l} y={14} className="fill-muted text-[11px]">Na mg/L (estimate), log scale</text>
        {xTicks.map((f) => (
          <text key={f} x={sx(x0 + f * span)} y={H - 8} textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"} className="fill-muted font-mono text-[11px]">{time(x0 + f * span, secs)}</text>
        ))}

        <path d={d} fill="none" className="stroke-ink" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.filter((p) => p.fault).map((p) => (
          <circle key={p.t} cx={sx(p.t)} cy={H - M.b - 4} r={3} className="fill-muted" />
        ))}
        {last && <circle cx={sx(last.t)} cy={sy(last.v!)} r={4} className="fill-ink stroke-white" strokeWidth={2} />}

        {hover && (
          <g pointerEvents="none">
            <line x1={sx(hover.t)} x2={sx(hover.t)} y1={M.t} y2={H - M.b} className="stroke-muted" strokeWidth={1} strokeDasharray="3 3" />
            {hover.v != null && <circle cx={sx(hover.t)} cy={sy(hover.v)} r={5} className="fill-ink stroke-white" strokeWidth={2} />}
          </g>
        )}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-sm"
          style={{ left: `${(sx(hover.t) / W) * 100}%`, transform: `translateX(${sx(hover.t) > W / 2 ? "-110%" : "10%"})` }}
        >
          <div className="font-mono text-muted">{time(hover.t, true)}</div>
          <div className="font-semibold text-ink">{hover.v == null ? `FAULT ${hover.fault ?? ""}` : `${Math.round(hover.v).toLocaleString()} mg/L`}</div>
        </div>
      )}
      <p className="mt-1 text-xs text-muted">Gray dots on the baseline mark sensor faults. Gaps in the line are faults or missing data.</p>
    </div>
  );
}
