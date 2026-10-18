"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { config } from "@/lib/config";
import HistoryChart, { type Pt } from "./HistoryChart";

type Event = { id: number; ts: string; kind: string; probe: string | null; from_level: string | null; to_level: string | null; na_mgl: number | null; message: string | null };

const RANGES = { "5m": 5 * 60e3, "1h": 3600e3, all: null } as const;
type Range = keyof typeof RANGES;

const KIND_STYLE: Record<string, string> = {
  level_change: "text-ink",
  fault: "text-bad",
  fault_clear: "text-ok",
  early_warning: "text-early",
  online: "text-ok",
  offline: "text-muted",
};

function describe(e: Event) {
  if (e.kind === "level_change") return `${e.from_level} → ${e.to_level}${e.na_mgl != null ? ` (${Math.round(e.na_mgl)} mg/L)` : ""}`;
  if (e.kind === "fault") return `Fault: ${e.message ?? "unknown"}`;
  if (e.kind === "fault_clear") return `Fault cleared${e.na_mgl != null ? ` (${Math.round(e.na_mgl)} mg/L)` : ""}`;
  if (e.kind === "early_warning") return e.message ?? "Early warning";
  return e.kind === "online" ? "Came online" : "Went offline";
}

export default function NodeDetail({ id, label }: { id: string; label: string }) {
  const [range, setRange] = useState<Range>("5m");
  const [points, setPoints] = useState<Pt[] | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let alive = true;
    const ms = RANGES[range];
    const load = async () => {
      const since = ms ? `&since=${Date.now() - ms}` : "";
      try {
        const [r, e] = await Promise.all([
          // shortcut: "all" refetches up to 20k rows every 10 s; fine for a one-day demo, page it if history grows.
          fetch(`/api/nodes/${id}/readings?limit=${ms ? 5000 : 20000}${since}`, { cache: "no-store" }),
          fetch(`/api/nodes/${id}/events?limit=50`, { cache: "no-store" }),
        ]);
        if (!r.ok || !e.ok) return;
        const [rows, evs] = await Promise.all([r.json(), e.json()]);
        if (!alive) return;
        setPoints(rows.map((x: any) => ({ t: Date.parse(x.ts), v: x.na_mgl, fault: x.fault })));
        setEvents(evs);
        setNow(Date.now());
      } catch {
        // Keep the last data; the next poll retries.
      }
    };
    load();
    const t = setInterval(load, ms ? config.poll_ms : 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, range]);

  const ms = RANGES[range];
  const x1 = now;
  const x0 = ms ? now - ms : points?.[0]?.t ?? now - 60e3;
  const since = ms ? `&since=${now - ms}` : "";

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <nav className="flex flex-wrap justify-between gap-3 text-sm font-medium text-muted">
        <Link href="/" className="underline-offset-4 hover:text-coral hover:underline">← Live</Link>
        <Link href={`/node/${id}/calibration`} className="underline-offset-4 hover:text-coral hover:underline">Calibration →</Link>
      </nav>
      <header className="mt-4">
        <p className="font-mono text-xs text-muted">{id}</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{label} history</h1>
      </header>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="group" aria-label="Time range">
          {(Object.keys(RANGES) as Range[]).map((k) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              aria-pressed={range === k}
              className={
                range === k
                  ? "rounded-full bg-gradient-to-r from-aqua to-seafoam px-3.5 py-1.5 text-sm font-semibold text-ink"
                  : "rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-muted hover:border-coral hover:text-coral"
              }
            >
              {k === "all" ? "All" : `Last ${k.replace("m", " min").replace("h", " h")}`}
            </button>
          ))}
        </div>
        <a
          href={`/api/export.csv?node_id=${id}${since}`}
          className="rounded-lg border border-[#b8923a] bg-gradient-to-br from-[#f6e3a1] via-gold to-[#c99a3e] px-4 py-2 text-sm font-semibold text-[#2a1d05] hover:brightness-110"
        >
          Download CSV
        </a>
      </div>

      <section className="mt-4 rounded-xl border border-line bg-white/85 p-4 shadow-sm">
        {points == null ? (
          <p className="py-24 text-center text-muted">Loading…</p>
        ) : points.length ? (
          <HistoryChart points={points} x0={x0} x1={x1} warn={config.na_warn} crit={config.na_crit} gapMs={config.offline_after_s * 1000} />
        ) : (
          <p className="py-24 text-center text-muted">No readings in this range. Start the device or run <code className="font-mono">npm run sim</code>.</p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">Event log</h2>
        <ol className="mt-2 divide-y divide-line rounded-xl border border-line bg-white/85 shadow-sm">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm">
              <span className="w-24 shrink-0 font-mono text-xs text-muted">{new Date(e.ts).toLocaleTimeString()}</span>
              <span className={`font-semibold ${KIND_STYLE[e.kind] ?? "text-ink"}`}>{e.kind.replace("_", " ")}</span>
              <span className="text-muted">{describe(e)}</span>
            </li>
          ))}
          {!events.length && <li className="px-4 py-6 text-center text-sm text-muted">No events yet.</li>}
        </ol>
      </section>
    </main>
  );
}
