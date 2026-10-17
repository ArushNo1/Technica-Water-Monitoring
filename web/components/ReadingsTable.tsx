"use client";

import { useMemo, useState } from "react";
import type { Level, Reading } from "@/lib/types";

type Filter = "all" | "pipe" | "buoy" | "alerts";

const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["pipe", "Pipe module"],
  ["buoy", "Buoy"],
  ["alerts", "Alerts"],
];

const fmtTime = (ts: string) =>
  new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
const fmtDate = (ts: string) =>
  new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const num = (v: number | null, d = 0) =>
  v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

function median(xs: (number | null)[]) {
  const a = xs.filter((x): x is number => x != null).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

const CSV_COLS: (keyof Reading)[] = [
  "ts", "site_id", "node_id", "kind", "pos", "ec_raw_uS", "temp_c",
  "ec25_uS", "na_mgL", "level", "state", "valve", "fault",
];

function toCSV(rows: Reading[]) {
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [CSV_COLS.join(","), ...rows.map((r) => CSV_COLS.map((c) => esc(r[c])).join(","))].join("\n");
}

const isAlert = (r: Reading) => r.level === "red" || r.state !== "OPEN" || !!r.fault;

export default function ReadingsTable({
  readings = [],
  siteName = "Demo site",
}: {
  readings?: Reading[];
  siteName?: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [desc, setDesc] = useState(true);

  const rows = useMemo(() => {
    let r = readings;
    if (filter === "pipe" || filter === "buoy") r = r.filter((x) => x.kind === filter);
    if (filter === "alerts") r = r.filter(isAlert);
    return [...r].sort((a, b) => (desc ? b.ts.localeCompare(a.ts) : a.ts.localeCompare(b.ts)));
  }, [readings, filter, desc]);

  const medianNa = median(readings.map((r) => r.na_mgL));
  const nodes = new Set(readings.map((r) => r.node_id)).size;
  const faults = readings.filter((r) => r.state === "FAULT").length;

  const download = () => {
    const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "saltline-readings.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-abyss bg-[radial-gradient(1200px_500px_at_85%_-10%,rgba(242,139,179,0.28),transparent_60%),radial-gradient(900px_500px_at_0%_0%,rgba(95,227,220,0.30),transparent_60%),radial-gradient(800px_500px_at_100%_110%,rgba(247,200,155,0.30),transparent_60%),linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.55)_38%,transparent_46%,transparent_55%,rgba(255,255,255,0.45)_60%,transparent_66%)] bg-fixed px-4 py-8 sm:px-8 lg:px-12">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-aqua">{siteName}</p>
          <h1 className="mb-2.5 mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">
            {readings.length}{" "}
            <span className="bg-gradient-to-r from-aqua via-seafoam to-coral bg-clip-text text-transparent">readings</span>
          </h1>
          <div className="h-1.5 w-56 rounded-full bg-gradient-to-r from-aqua via-sky to-coral" />
        </div>
        <button
          onClick={download}
          className="rounded-lg border border-[#b8923a] bg-gradient-to-br from-[#f6e3a1] via-gold to-[#c99a3e] px-4 py-2.5 text-sm font-semibold text-[#2a1d05] transition hover:brightness-110"
        >
          Download CSV
        </button>
      </header>

      {/* Stats */}
      <div className="mb-5 mt-7 grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-white/80 shadow-sm md:grid-cols-4">
        <Stat label="Readings" value={readings.length} accent="bg-aqua" className="" />
        <Stat label="Median sodium" value={medianNa == null ? "—" : `${num(medianNa)} mg/L`} accent="bg-peach" className="border-l" />
        <Stat label="Nodes reporting" value={nodes} accent="bg-sky" className="border-t md:border-l md:border-t-0" />
        <Stat label="Faults" value={faults} tone={faults ? "text-bad" : ""} accent="bg-coral" className="border-l border-t md:border-t-0" />
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={
              filter === k
                ? "rounded-full border border-transparent bg-gradient-to-r from-aqua to-seafoam px-3.5 py-1.5 text-sm font-semibold text-ink"
                : "rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-muted transition hover:border-coral hover:text-coral"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-line bg-white/85 shadow-sm [background-image:linear-gradient(90deg,#5fe3dc,#7aa7f0,#f28bb3,#f7c89b)] bg-[length:100%_2px] bg-no-repeat">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr className="bg-[#f5fcfa] text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              <Th>
                <button onClick={() => setDesc(!desc)} className="uppercase tracking-[0.12em] hover:text-aqua">
                  Local time {desc ? "↓" : "↑"}
                </button>
              </Th>
              <Th>Node</Th>
              <Th right>EC raw <Unit>µS/cm</Unit></Th>
              <Th right>Temp <Unit>°C</Unit></Th>
              <Th right>EC25 <Unit>µS/cm</Unit></Th>
              <Th>Sodium</Th>
              <Th>State</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`border-b border-line/60 transition last:border-0 hover:bg-seafoam/[0.06] ${r.state === "FAULT" ? "bg-bad/[0.07]" : ""}`}
              >
                <Td>
                  <div className="whitespace-nowrap font-mono text-[13px]" suppressHydrationWarning>{fmtTime(r.ts)}</div>
                  <Sub>{fmtDate(r.ts)}</Sub>
                </Td>
                <Td>
                  <div className="flex items-center gap-2 font-mono text-[13px]">
                    <span className={`h-2 w-2 rounded-full ${r.kind === "pipe" ? "bg-aqua" : "bg-coral"}`} />
                    {r.node_id}
                  </div>
                  <Sub>{r.kind} · {r.pos} probe</Sub>
                </Td>
                <Td right mono>{num(r.ec_raw_uS)}</Td>
                <Td right mono><span className="text-[#b8702f]">{num(r.temp_c, 1)}</span></Td>
                <Td right mono>{num(r.ec25_uS)}</Td>
                <Td><LevelCell level={r.level} na={r.na_mgL} /></Td>
                <Td>
                  <StateTag state={r.state} />
                  <Sub>{r.fault ? `fault: ${r.fault}` : r.valve ? `valve ${r.valve}` : "no valve"}</Sub>
                </Td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">
                  No readings yet. Start the simulator or power on a node.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Stat({ label, value, tone = "", accent, className }: { label: string; value: React.ReactNode; tone?: string; accent: string; className: string }) {
  return (
    <div className={`relative border-line px-5 py-4 ${className}`}>
      <div className={`absolute inset-x-0 top-0 h-0.5 opacity-80 ${accent}`} />
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`whitespace-nowrap border-b border-line px-4 py-3.5 ${right ? "text-right" : ""}`}>{children}</th>;
}

function Td({ children, right, mono }: { children: React.ReactNode; right?: boolean; mono?: boolean }) {
  return (
    <td className={`px-4 py-3 align-middle ${right ? "text-right" : ""} ${mono ? "font-mono text-[13px]" : ""}`}>
      {children}
    </td>
  );
}

const Sub = ({ children }: { children: React.ReactNode }) => <div className="mt-0.5 text-xs text-muted">{children}</div>;
const Unit = ({ children }: { children: React.ReactNode }) => (
  <span className="ml-0.5 font-normal normal-case tracking-normal opacity-80">{children}</span>
);

const LEVEL_STYLES: Record<Level, { bar: string; pill: string }> = {
  green: { bar: "bg-ok", pill: "bg-ok/15 text-ok" },
  yellow: { bar: "bg-warn", pill: "bg-warn/15 text-warn" },
  red: { bar: "bg-bad", pill: "bg-bad/15 text-bad" },
};

function LevelCell({ level, na }: { level: Level | null; na: number | null }) {
  if (!level || na == null) return <span className="text-xs text-muted">—</span>;
  const s = LEVEL_STYLES[level];
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1 w-16 overflow-hidden rounded-full bg-line">
        <div className={`h-full ${s.bar}`} style={{ width: `${Math.min(100, (na / 1000) * 100)}%` }} />
      </div>
      <span className="whitespace-nowrap font-mono text-[13px]">{num(na)} mg/L</span>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${s.pill}`}>{level}</span>
    </div>
  );
}

const STATE_STYLES = {
  OPEN: "text-aqua border-aqua/40",
  CLOSED: "text-coral border-coral/40",
  FAULT: "text-bad border-bad/50",
} as const;

function StateTag({ state }: { state: Reading["state"] }) {
  return (
    <span className={`rounded border px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider ${STATE_STYLES[state]}`}>
      {state}
    </span>
  );
}
