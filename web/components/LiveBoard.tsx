"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { config } from "@/lib/config";
import type { loadNodes } from "@/lib/hub";

type LiveNode = Awaited<ReturnType<typeof loadNodes>>[number];
type Probe = { na_mgl: number | null; level: string; fault: string | null; temp_c: number | null; ec25_mscm: number | null; flow_lpm: number | null; total_l: number | null };
type Tone = "ok" | "warn" | "crit" | "fault" | "early_warning" | "offline";

// Literal class names so Tailwind keeps them.
const TONES: Record<Tone, { text: string; dot: string; soft: string; label: string }> = {
  ok: { text: "text-ok", dot: "bg-ok", soft: "bg-ok/10 border-ok/30", label: "Safe" },
  warn: { text: "text-warn", dot: "bg-warn", soft: "bg-warn/10 border-warn/30", label: "Elevated" },
  crit: { text: "text-bad", dot: "bg-bad", soft: "bg-bad/10 border-bad/30", label: "Unsafe" },
  early_warning: { text: "text-early", dot: "bg-early", soft: "bg-early/10 border-early/30", label: "Early warning" },
  fault: { text: "text-muted", dot: "bg-muted", soft: "bg-muted/10 border-muted/30", label: "Sensor fault" },
  offline: { text: "text-offline", dot: "bg-offline", soft: "bg-offline/10 border-offline/30", label: "Offline" },
};

const BANNERS: Record<Tone, string> = {
  crit: "Unsafe sodium detected",
  early_warning: "Salt is rising under the buoy",
  warn: "Elevated sodium",
  fault: "A sensor needs attention",
  offline: "A device is offline",
  ok: "All water is below 200 mg/L",
};
const WORST: Tone[] = ["crit", "early_warning", "warn", "fault", "offline", "ok"];

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
};
const fmt = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export default function LiveBoard({ initial }: { initial: LiveNode[] }) {
  const [nodes, setNodes] = useState(initial);
  const [lastOk, setLastOk] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [skew, setSkew] = useState(0); // server clock minus this device's clock, from the Date header

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/nodes", { cache: "no-store" });
        if (!res.ok || !alive) return;
        const data = await res.json();
        const date = Date.parse(res.headers.get("date") ?? "");
        if (!alive) return;
        setNodes(data);
        setLastOk(Date.now());
        if (date) setSkew(date - Date.now());
      } catch {
        // Keep showing the last data; the link-down check below grays it out.
      }
    };
    const p = setInterval(poll, config.poll_ms);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(p);
      clearInterval(c);
    };
  }, []);

  // If this page can't reach the server, nothing it shows is live anymore.
  const linkDown = now - lastOk > config.offline_after_s * 1000;
  const view = linkDown ? nodes.map((n) => ({ ...n, online: false, status: "offline" })) : nodes;
  const worst = WORST.find((t) => view.some((n) => n.status === t)) ?? "ok";
  const serverNow = now + skew;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-aqua">Saltline · live</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">See the salt before you drink it.</h1>
        </div>
        <Link href="/readings" className="text-sm font-medium text-muted underline-offset-4 hover:text-coral hover:underline">
          All readings →
        </Link>
      </header>

      <div role="status" className={`mt-6 flex items-center gap-3 rounded-xl border px-4 py-3 ${TONES[worst].soft}`}>
        <span className={`h-3 w-3 shrink-0 rounded-full ${TONES[worst].dot} ${worst === "ok" ? "" : "animate-pulse"}`} />
        <span className={`font-semibold ${TONES[worst].text}`}>
          {linkDown ? "Connection lost, showing last known values" : view.length ? BANNERS[worst] : "Waiting for devices…"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {view.map((n) => (
          <NodeCard key={n.node_id} node={n} age={serverNow - Date.parse(n.last_seen)} />
        ))}
      </div>

      <footer className="mt-8 space-y-2 text-xs text-muted">
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Legend tone="ok">Safe &lt; {config.na_warn} mg/L</Legend>
          <Legend tone="warn">Elevated {config.na_warn}–{config.na_crit}</Legend>
          <Legend tone="crit">Unsafe &gt; {config.na_crit}</Legend>
          <Legend tone="early_warning">Early warning: salt below, fresh on top</Legend>
        </p>
        <p>Sodium is an estimate from conductivity, calibrated with table salt. Most accurate where salt water is the main source.</p>
      </footer>
    </main>
  );
}

function NodeCard({ node: n, age }: { node: LiveNode; age: number }) {
  const status = n.status as Tone;
  const latest = n.latest as Record<string, Probe | undefined>;
  const live = n.online;

  return (
    <section className={`rounded-xl border border-line bg-white/85 p-5 shadow-sm ${live ? "" : "opacity-70"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">
            <Link href={`/node/${n.node_id}`} className="underline-offset-4 hover:text-coral hover:underline">
              {n.label ?? (n.type === "pipe" ? "Pipe module" : "Buoy")} →
            </Link>
          </h2>
          <p className="font-mono text-xs text-muted">{n.node_id}</p>
        </div>
        <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${TONES[status].soft} ${TONES[status].text}`}>
          <span className={`h-2 w-2 rounded-full ${TONES[status].dot}`} />
          {n.type === "buoy" && live ? `Beacon · ${TONES[status].label}` : TONES[status].label}
        </span>
      </div>

      {status === "early_warning" && (
        <p className="mt-4 rounded-lg bg-early/10 px-3 py-2 text-sm font-medium text-early">
          Deep water is salty while the surface is still fresh. Salt is moving up.
        </p>
      )}

      {n.type === "pipe" ? (
        <Reading p={latest.main} live={live} />
      ) : (
        <div className="divide-y divide-line">
          <Reading p={latest.shallow} live={live} title="Shallow" hint="drinking now" />
          <Reading p={latest.deep} live={live} title="Deep" hint="what's coming" />
        </div>
      )}

      <p className="mt-3 text-xs text-muted" suppressHydrationWarning>
        {live ? `Updated ${ago(age)}` : `Last seen ${ago(age)} · ${new Date(n.last_seen).toLocaleTimeString()}`}
      </p>
    </section>
  );
}

function Reading({ p, live, title, hint }: { p?: Probe; live: boolean; title?: string; hint?: string }) {
  const tone: Tone = !live ? "offline" : !p ? "offline" : p.level === "fault" ? "fault" : (p.level as Tone);
  return (
    <div className="py-4">
      {title && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          {title} <span className="font-normal normal-case tracking-normal">· {hint}</span>
        </p>
      )}
      {p?.level === "fault" ? (
        <p className="mt-1 text-3xl font-extrabold text-muted">
          FAULT <span className="font-mono text-sm font-normal">{p.fault}</span>
        </p>
      ) : (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className={`text-5xl font-extrabold tabular-nums tracking-tight ${TONES[tone].text}`}>{fmt(p?.na_mgl)}</span>
          <span className="text-sm text-muted">mg/L sodium (est.)</span>
          {p && live && <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${TONES[tone].soft} ${TONES[tone].text}`}>{TONES[tone].label}</span>}
        </p>
      )}
      <p className="mt-1 font-mono text-xs text-muted">
        {fmt(p?.temp_c, 1)} °C · EC25 {fmt(p?.ec25_mscm, 2)} mS/cm
        {p?.flow_lpm != null && ` · ${fmt(p.flow_lpm, 1)} L/min · ${fmt(p.total_l, 1)} L total`}
      </p>
    </div>
  );
}

function Legend({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${TONES[tone].dot}`} />
      {children}
    </span>
  );
}
