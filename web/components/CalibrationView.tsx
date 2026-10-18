"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { loadCalibration } from "@/lib/hub";
import CalibrationChart, { conductanceMs } from "./CalibrationChart";

type Cal = Awaited<ReturnType<typeof loadCalibration>>;

// Calibration proof for the demo: known standards vs. measured, the fitted K, and a validation table.
export default function CalibrationView({ id, label }: { id: string; label: string }) {
  const [cal, setCal] = useState<Cal | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/nodes/${id}/calibration`, { cache: "no-store" });
        if (res.ok && alive) setCal(await res.json());
      } catch {
        // Keep the last data; the next poll retries.
      }
    };
    load();
    const t = setInterval(load, 3000); // calibration happens live at the table, so keep it fresh
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  const probes = cal ? [...new Set(cal.points.map((p) => p.probe))] : [];

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <nav className="text-sm font-medium text-muted">
        <Link href={`/node/${id}`} className="underline-offset-4 hover:text-coral hover:underline">← {label} history</Link>
      </nav>
      <header className="mt-4">
        <p className="font-mono text-xs text-muted">{id}</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Calibration</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Each point is a salt standard we mixed by weight and measured with our own electrodes. The line is the fitted cell
          constant K. Hollow points were measured after the fit, so they test it rather than shape it.
        </p>
      </header>

      {cal == null && <p className="mt-10 text-center text-muted">Loading…</p>}
      {cal && !probes.length && (
        <p className="mt-6 rounded-xl border border-line bg-white/85 px-4 py-10 text-center text-sm text-muted">
          No calibration points yet. On the device, run <code className="font-mono">cal &lt;g_per_L&gt;</code> for each standard, then{" "}
          <code className="font-mono">cal fit</code>.
        </p>
      )}

      {cal &&
        probes.map((probe) => {
          const fit = cal.fits[probe];
          const pts = cal.points.filter((p) => p.probe === probe && p.r_cell_ohm);
          const rows = cal.validation.filter((v) => v.probe === probe);
          return (
            <section key={probe} className="mt-6">
              {probes.length > 1 && <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">{probe} probe</h2>}
              <div className="mt-2 grid grid-cols-3 overflow-hidden rounded-xl border border-line bg-white/80 shadow-sm">
                <Stat label="Cell constant K" value={fit ? `${fit.k_cm1.toFixed(3)} cm⁻¹` : "not fitted"} />
                <Stat label="R²" value={fit?.r2 != null ? fit.r2.toFixed(4) : "—"} className="border-l" />
                <Stat label="Points in fit" value={`${pts.filter((p) => p.in_fit).length} of ${pts.length}`} className="border-l" />
              </div>

              <div className="mt-4 rounded-xl border border-line bg-white/85 p-4 shadow-sm">
                <CalibrationChart points={pts} k={fit?.k_cm1 ?? null} />
              </div>

              <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-white/85 shadow-sm">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="whitespace-nowrap bg-[#f5fcfa] text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                      <th className="px-4 py-3">Standard</th>
                      <th className="px-4 py-3 text-right">Known g/L</th>
                      <th className="px-4 py-3 text-right">R cell Ω</th>
                      <th className="px-4 py-3 text-right">Conductance mS</th>
                      <th className="px-4 py-3 text-right">Predicted g/L</th>
                      <th className="px-4 py-3 text-right">Error</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-[13px]">
                    {pts.map((p) => {
                      const v = rows.find((r) => r.point_id === p.id);
                      return (
                        <tr key={p.id} className="border-t border-line/60">
                          <td className="px-4 py-2.5 font-sans">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${p.in_fit ? "bg-ink/10 text-ink" : "bg-coral/15 text-coral"}`}>
                              {p.in_fit ? "fit" : "validation"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">{p.known_g_per_l.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right">{Math.round(p.r_cell_ohm).toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right">{conductanceMs(p).toFixed(3)}</td>
                          <td className="px-4 py-2.5 text-right">{v ? v.predicted_g_per_l.toFixed(2) : "—"}</td>
                          <td className="px-4 py-2.5 text-right">{v ? `${v.pct_error >= 0 ? "+" : ""}${v.pct_error.toFixed(1)}%` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

      <p className="mt-6 text-xs text-muted">
        Model: known conductivity (g/L × 2.0 mS/cm) = K × conductance, temperature-corrected to 25 °C. Sodium shown elsewhere is
        197 × EC25 mg/L, an estimate that assumes the dissolved salt is table salt.
      </p>
    </main>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`border-line px-4 py-3 sm:px-5 sm:py-4 ${className}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold sm:text-2xl">{value}</div>
    </div>
  );
}
