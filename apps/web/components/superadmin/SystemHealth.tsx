"use client";

import { useState, useEffect, useCallback } from "react";
import {
  systemHealthApi, HealthOverviewDTO, EndpointMetricDTO, TrendPointDTO, ServiceStatus,
} from "@/lib/system-health-api";

// ── Slate / Admin design tokens (FRONTEND_CLAUDE.md) ────────────────────────
const C = {
  navy:   "#1C2551",
  slate:  "#334155",
  slateL: "#64748b",
  orange: "#EF4E24",
  page:   "#F5F7FB",
  card:   "#FFFFFF",
  alt:    "#F0F1F7",
  border: "#EAECF4",
  muted:  "#8b90a7",
  green:  "#22c55e",
  amber:  "#f59e0b",
  danger: "#ef4444",
  indigo: "#6B73BF",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

const STATUS_META: Record<ServiceStatus | "info", { color: string; label: string }> = {
  healthy:        { color: C.green,  label: "Operational" },
  degraded:       { color: C.amber,  label: "Degraded" },
  unhealthy:      { color: C.danger, label: "Down" },
  not_configured: { color: C.muted,  label: "Not Configured" },
  info:           { color: C.indigo, label: "Info" },
};

const SERVICE_LABELS: Record<string, string> = {
  backend_api:        "Backend API",
  database:           "PostgreSQL Database",
  redis:              "Redis Cache",
  s3:                 "Object Storage (S3)",
  video_conferencing: "Video Conferencing",
};

const TREND_WINDOW_MINS = 24 * 60;

export default function SystemHealth() {
  const [overview, setOverview]   = useState<HealthOverviewDTO | null>(null);
  const [trend, setTrend]         = useState<TrendPointDTO[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointMetricDTO[]>([]);
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState("");
  const [refreshedAt, setRefreshedAt] = useState("");
  const [drawerOpen, setDrawerOpen]   = useState(false);

  const load = useCallback(() => {
    setErr("");
    Promise.all([
      systemHealthApi.overview(),
      systemHealthApi.trend(TREND_WINDOW_MINS),
      systemHealthApi.endpoints(60, 100),
    ])
      .then(([o, t, e]) => {
        setOverview(o.data);
        setTrend(t.data ?? []);
        setEndpoints(e.data ?? []);
        setRefreshedAt(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !overview) {
    return <div style={{ ...ff, padding: 24, color: C.muted, fontSize: 13 }}>Loading system health…</div>;
  }

  const overall = overview ? STATUS_META[overview.status] : STATUS_META.info;

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusDot color={overall.color} pulse={overview?.status === "healthy"} big />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.navy }}>System {overall.label}</div>
            {refreshedAt && <div style={{ fontSize: 11, color: C.muted }}>Updated {refreshedAt} · auto-refreshes every 30s</div>}
          </div>
        </div>
        <button onClick={load} style={btn.ghost}>Refresh</button>
      </div>

      {err && <div style={banner.err}>{err}</div>}

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <SummaryCard
          label="Uptime (process)"
          value={overview ? fmtUptime(overview.uptime_seconds) : "—"}
          color={C.navy}
        />
        <SummaryCard
          label="Avg Latency"
          value={overview ? `${overview.avg_latency_ms.toFixed(1)} ms` : "—"}
          color={C.indigo}
          sub={overview ? `max: ${overview.max_latency_ms.toFixed(0)} ms` : undefined}
          action="View endpoint details"
          onAction={() => setDrawerOpen(true)}
        />
        <SummaryCard
          label="Error Rate"
          value={overview ? `${(overview.error_rate * 100).toFixed(2)}%` : "—"}
          color={overview && overview.error_rate > 0 ? C.danger : C.green}
          sub={overview ? `${overview.error_count} of ${overview.total_requests} were 5xx` : undefined}
        />
        <SummaryCard
          label={`Requests (last ${overview?.window_mins ?? 60}m)`}
          value={overview?.total_requests?.toLocaleString() ?? "—"}
          color={C.slate}
        />
      </div>

      {/* Service status + latency trend */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 1fr) 1.3fr", gap: 16 }}>
        {/* Service status */}
        <div style={card.plain}>
          <SectionTitle>Service Status</SectionTitle>
          <div>
            {overview?.services.map((s, i) => {
              const meta = STATUS_META[s.status] ?? STATUS_META.info;
              const last = i === overview.services.length - 1;
              return (
                <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 2px", borderBottom: last ? "none" : `1px solid ${C.border}` }}>
                  <StatusDot color={meta.color} pulse={s.status === "healthy"} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{SERVICE_LABELS[s.name] ?? s.name}</div>
                    {s.detail && <div style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 240 }} title={s.detail}>{s.detail}</div>}
                  </div>
                  {s.latency_ms !== undefined && s.latency_ms > 0 && (s.status === "healthy" || s.status === "degraded") && (
                    <span style={{ fontSize: 11, color: C.slateL, whiteSpace: "nowrap" }}>{s.latency_ms} ms</span>
                  )}
                  <span style={pill(meta.color)}>{meta.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Latency trend */}
        <div style={card.plain}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
            <SectionTitle noMargin>Latency Trend (last 24h)</SectionTitle>
            <span style={{ fontSize: 11, color: C.muted }}>avg latency · 5-min buckets</span>
          </div>
          <TrendChart points={trend} />
        </div>
      </div>

      {/* Storage — honest not-available */}
      <div style={card.plain}>
        <SectionTitle>Storage Utilization</SectionTitle>
        <div style={notAvail}>
          Object-storage utilization is <strong>not yet available</strong>. S3 upload integration
          does not exist yet (uploads are currently stored in PostgreSQL), so there is no
          storage-usage metric to display. This panel becomes real once S3 is connected.
        </div>
      </div>

      {drawerOpen && (
        <EndpointDrawer
          endpoints={endpoints}
          dbPool={overview?.db_pool}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

// ── Latency trend bar chart ──────────────────────────────────────────────────

function TrendChart({ points }: { points: TrendPointDTO[] }) {
  const H = 120;
  if (points.length === 0) {
    return (
      <div style={{ ...notAvail, marginTop: 10 }}>
        Collecting metrics — the historical trend appears as data accumulates. There is no
        backfill, so the chart starts from when monitoring was first deployed.
      </div>
    );
  }

  const maxLat = Math.max(1, ...points.map((p) => p.avg_latency_ms));
  const first = points[0], last = points[points.length - 1];
  const mid = points[Math.floor(points.length / 2)];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: H, marginTop: 8 }}>
        {points.map((p) => {
          const h = Math.max(3, (p.avg_latency_ms / maxLat) * H);
          const color = p.error_rate > 0 ? C.amber : C.indigo;
          return (
            <div
              key={p.bucket}
              title={`${fmtClock(p.bucket)} · ${p.avg_latency_ms.toFixed(1)} ms · ${p.request_count} req${p.error_count ? ` · ${p.error_count} err` : ""}`}
              style={{ flex: 1, minWidth: 2, height: h, background: color, borderRadius: 2, opacity: 0.85 }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: C.muted }}>
        <span>{fmtClock(first.bucket)}</span>
        {points.length > 2 && <span>{fmtClock(mid.bucket)}</span>}
        <span>{fmtClock(last.bucket)}</span>
      </div>
    </div>
  );
}

// ── Endpoint detail drawer (right slide-in) ──────────────────────────────────

function EndpointDrawer({ endpoints, dbPool, onClose }: {
  endpoints: EndpointMetricDTO[];
  dbPool?: HealthOverviewDTO["db_pool"];
  onClose: () => void;
}) {
  const maxLat = Math.max(1, ...endpoints.map((e) => e.avg_latency_ms));
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.35)", zIndex: 2000, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ ...ff, width: "min(720px, 92vw)", height: "100%", background: C.card, boxShadow: "-8px 0 40px rgba(28,37,81,0.14)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ position: "sticky", top: 0, background: C.card, borderBottom: `1px solid ${C.border}`, padding: "16px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>Endpoint Details</div>
            <div style={{ fontSize: 11, color: C.muted }}>Per-endpoint latency & errors · last 60m</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: C.muted, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* DB connection pool (real) */}
          {dbPool && (
            <div>
              <SectionTitle>Database Connection Pool</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <UtilBar label="In Use"     value={dbPool.in_use}           max={dbPool.max_open} color={C.orange} />
                <UtilBar label="Idle"       value={dbPool.idle}             max={dbPool.max_open} color={C.indigo} />
                <UtilBar label="Open / Max" value={dbPool.open_connections} max={dbPool.max_open} color={C.slate} />
                <div style={{ display: "flex", gap: 22 }}>
                  <MiniStat label="Max Open" value={dbPool.max_open} />
                  <MiniStat label="Wait Count" value={dbPool.wait_count} />
                  <MiniStat label="Wait Time" value={`${dbPool.wait_duration_ms} ms`} />
                </div>
              </div>
            </div>
          )}

          {/* Per-endpoint list (real) */}
          <div>
            <SectionTitle>Latency by Endpoint</SectionTitle>
            {endpoints.length === 0 ? (
              <div style={notAvail}>No request metrics recorded yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {endpoints.map((e) => (
                  <div key={`${e.method} ${e.route}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 230, flexShrink: 0, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      <span style={{ ...methodPill, background: `${C.slate}18`, color: C.slate }}>{e.method}</span>
                      <span style={{ fontFamily: "monospace" as const, color: C.navy }}>{e.route}</span>
                    </div>
                    <div style={{ flex: 1, height: 16, background: C.alt, borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.max(2, (e.avg_latency_ms / maxLat) * 100)}%`, background: e.error_rate > 0 ? C.amber : C.indigo, borderRadius: 99 }} />
                    </div>
                    <div style={{ width: 128, flexShrink: 0, textAlign: "right", fontSize: 11, color: C.slateL, whiteSpace: "nowrap" }}>
                      {e.avg_latency_ms.toFixed(1)} ms · {e.request_count} req
                      {e.error_count > 0 && <span style={{ color: C.danger }}> · {e.error_count} err</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ color, pulse, big }: { color: string; pulse?: boolean; big?: boolean }) {
  const d = big ? 14 : 11;
  return (
    <span style={{ position: "relative", display: "inline-flex", width: d, height: d, flexShrink: 0 }}>
      {pulse && <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, opacity: 0.3 }} />}
      <span style={{ position: "relative", width: d, height: d, borderRadius: "50%", background: color }} />
    </span>
  );
}

function SummaryCard({ label, value, color, sub, action, onAction }: {
  label: string; value: string; color: string; sub?: string;
  action?: string; onAction?: () => void;
}) {
  return (
    <div style={{ ...card.plain, padding: 20, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: C.muted, minHeight: 14 }}>{sub ?? ""}</div>
      {action && (
        <button onClick={onAction} style={{ ...ff, background: "none", border: "none", padding: 0, marginTop: 2, cursor: "pointer", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: C.orange, textTransform: "uppercase", textAlign: "left" }}>
          {action} →
        </button>
      )}
    </div>
  );
}

function UtilBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
        <span style={{ color: C.slateL, fontWeight: 500 }}>{label}</span>
        <span style={{ color: C.navy, fontWeight: 600 }}>{value} / {max}</span>
      </div>
      <div style={{ height: 8, background: C.alt, borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99 }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{value}</div>
    </div>
  );
}

function SectionTitle({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: noMargin ? 0 : 14 }}>{children}</div>;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const pill = (color: string): React.CSSProperties => ({
  display: "inline-block", background: `${color}18`, color,
  fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 10px", whiteSpace: "nowrap",
});

const methodPill: React.CSSProperties = {
  display: "inline-block", fontSize: 9, fontWeight: 700, borderRadius: 4, padding: "2px 6px", marginRight: 8,
};

const card = {
  plain: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", padding: 20 } as React.CSSProperties,
};

const btn = {
  ghost: { ...ff, padding: "8px 16px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.navy } as React.CSSProperties,
};

const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.danger } as React.CSSProperties,
};

const notAvail: React.CSSProperties = {
  background: C.alt, border: `1px dashed ${C.border}`, borderRadius: 8,
  padding: "12px 14px", fontSize: 12, color: C.slateL, lineHeight: 1.6,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
