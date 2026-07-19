"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  complianceApi, CompletionGate, AttendanceRegisterRow, AuditLogEntry
} from "@/lib/compliance-api";
import { programsApi, ProgramDTO } from "@/lib/programs-api";
import { cohortsApi, CohortDTO } from "@/lib/cohorts-api";

// Fetch a protected CSV endpoint and trigger a browser file download
async function downloadCsv(url: string, filename: string) {
  const token = typeof window !== "undefined" ? localStorage.getItem("xa_token") : null;
  try {
    const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    if (!res.ok) { alert("Export failed — make sure the API server is running."); return; }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    alert("Export failed — make sure the API server is running.");
  }
}

// ── Tokens ────────────────────────────────────────────────────────
const NAVY   = "var(--xa-navy)";
const ORANGE = "var(--xa-primary)";
const INDIGO = "#4A5573";
const BG     = "var(--xa-bg)";
const BORDER = "#E6DED0";
const MUTED  = "var(--xa-muted)";
const GREEN  = "#22c55e";
const WARN   = "#f59e0b";
const DANGER = "#ef4444";

// ── Tabs ──────────────────────────────────────────────────────────
const TABS = [
  { id: "gates",     label: "Completion Gates" },
  { id: "attendance",label: "Attendance Register" },
  { id: "audit",     label: "Audit Log" },
];

// ── Main component ────────────────────────────────────────────────
export default function PMCompliance({ orgId }: { orgId: string }) {
  const [tab,      setTab]      = useState("gates");
  const [programs, setPrograms] = useState<ProgramDTO[]>([]);
  const [cohorts,  setCohorts]  = useState<CohortDTO[]>([]);
  const [selProg,  setSelProg]  = useState("");
  const [selCohort,setSelCohort] = useState("");

  useEffect(() => {
    programsApi.list(orgId).then(r => {
      const list = r.data ?? [];
      setPrograms(list);
      if (list.length) setSelProg(list[0].id);
    }).catch(() => {});
    cohortsApi.list(orgId).then(r => {
      const list = r.data ?? [];
      setCohorts(list);
      if (list.length) setSelCohort(list[0].id);
    }).catch(() => {});
  }, [orgId]);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins,sans-serif" }}>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: tab === t.id ? 700 : 400,
              cursor: "pointer", fontFamily: "Poppins,sans-serif",
              border: `1px solid ${tab === t.id ? NAVY : BORDER}`,
              background: tab === t.id ? NAVY : "#fff",
              color: tab === t.id ? "#fff" : MUTED,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "gates"      && <CompletionGatesTab orgId={orgId} programs={programs} selProg={selProg} setSelProg={setSelProg} />}
      {tab === "attendance" && <AttendanceTab cohorts={cohorts} selCohort={selCohort} setSelCohort={setSelCohort} />}
      {tab === "audit"      && <AuditTab      orgId={orgId} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB 1 — Completion Gates
// ══════════════════════════════════════════════════════════════════
function CompletionGatesTab({ orgId, programs, selProg, setSelProg }: {
  orgId: string; programs: ProgramDTO[]; selProg: string; setSelProg: (v: string) => void;
}) {
  const [gates,   setGates]   = useState<CompletionGate[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding,  setAdding]  = useState(false);
  const [form,    setForm]    = useState({ activity_id: "", prereq_activity_id: "", escalation_email: "", escalation_days: 3 });
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    if (!selProg) return;
    setLoading(true);
    try {
      const r = await complianceApi.listGates(selProg);
      setGates(r.data ?? []);
    } catch { setGates([]); } finally { setLoading(false); }
  }, [selProg]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!form.activity_id.trim() || !form.prereq_activity_id.trim()) return;
    setSaving(true);
    try {
      const r = await complianceApi.upsertGate(orgId, { program_id: selProg, ...form });
      if (r.data) { setGates(prev => { const exists = prev.find(g => g.activity_id === r.data!.activity_id); return exists ? prev.map(g => g.activity_id === r.data!.activity_id ? r.data! : g) : [...prev, r.data!]; }); }
      setAdding(false);
      setForm({ activity_id: "", prereq_activity_id: "", escalation_email: "", escalation_days: 3 });
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try {
      await complianceApi.deleteGate(id);
      setGates(prev => prev.filter(g => g.id !== id));
    } catch { /* ignore */ }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <InfoBanner
        icon="🔒"
        title="Completion Gate Enforcement"
        body="Lock activities behind prerequisites. A participant cannot start the locked activity until the prerequisite is 100% complete. You can also configure escalation emails to notify PMs when a learner is blocked for too long."
      />

      {/* Program selector + Add button */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <SelectorLabel>PROGRAM</SelectorLabel>
        <Select value={selProg} onChange={setSelProg} options={programs.map(p => ({ value: p.id, label: p.title }))} placeholder="Select program" />
        <div style={{ flex: 1 }} />
        <button onClick={() => setAdding(true)} style={btnPrimary}>+ Add Gate</button>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ ...card, background: `${ORANGE}04`, border: `1px solid ${ORANGE}20` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 14 }}>New Completion Gate</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="ACTIVITY ID (locked until prereq done)">
              <input value={form.activity_id} onChange={e => setForm(f => ({ ...f, activity_id: e.target.value }))}
                placeholder="UUID of the activity to lock" style={inputStyle} />
            </Field>
            <Field label="PREREQUISITE ACTIVITY ID">
              <input value={form.prereq_activity_id} onChange={e => setForm(f => ({ ...f, prereq_activity_id: e.target.value }))}
                placeholder="UUID of the activity that must be completed first" style={inputStyle} />
            </Field>
            <Field label="ESCALATION EMAIL">
              <input type="email" value={form.escalation_email} onChange={e => setForm(f => ({ ...f, escalation_email: e.target.value }))}
                placeholder="pm@organisation.com" style={inputStyle} />
            </Field>
            <Field label="ESCALATION AFTER (days blocked)">
              <input type="number" min={1} max={30} value={form.escalation_days} onChange={e => setForm(f => ({ ...f, escalation_days: parseInt(e.target.value) || 3 }))}
                style={inputStyle} />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={handleSave} disabled={saving || !form.activity_id || !form.prereq_activity_id}
              style={{ ...btnPrimary, opacity: (!form.activity_id || !form.prereq_activity_id) ? 0.4 : 1 }}>
              {saving ? "Saving…" : "Save Gate"}
            </button>
            <button onClick={() => setAdding(false)} style={btnSecondary}>Cancel</button>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: MUTED }}>
            Tip: Find activity UUIDs in Program Design → open program → copy activity IDs from the URL or API.
          </div>
        </div>
      )}

      {/* Gates table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "13px 20px", borderBottom: `1px solid ${BORDER}`, fontSize: 13, fontWeight: 700, color: NAVY }}>
          Configured Gates {selProg && `— ${programs.find(p => p.id === selProg)?.title ?? ""}`}
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: MUTED, fontSize: 12 }}>Loading…</div>
        ) : gates.length === 0 ? (
          <EmptyRow text="No completion gates configured for this program." />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: BG }}>
                {["LOCKED ACTIVITY", "PREREQUISITE ACTIVITY", "ESCALATION EMAIL", "ESCALATE AFTER", ""].map(h => (
                  <th key={h || "actions"} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gates.map(g => (
                <tr key={g.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                  <td style={tdStyle}><code style={{ fontSize: 11, color: INDIGO }}>{g.activity_id.slice(0, 8)}…</code></td>
                  <td style={tdStyle}><code style={{ fontSize: 11, color: INDIGO }}>{g.prereq_activity_id.slice(0, 8)}…</code></td>
                  <td style={tdStyle}><span style={{ fontSize: 12, color: NAVY }}>{g.escalation_email || "—"}</span></td>
                  <td style={tdStyle}><span style={{ fontSize: 12, color: NAVY }}>{g.escalation_days}d</span></td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <button onClick={() => handleDelete(g.id)}
                      style={{ background: "#ef444412", color: DANGER, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "Poppins,sans-serif" }}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Future note */}
      <FutureNote text="Lock icon on the participant activity list (blocking UI) requires a participant-side update — scheduled for next sprint." />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB 2 — Attendance Register
// ══════════════════════════════════════════════════════════════════
function AttendanceTab({ cohorts, selCohort, setSelCohort }: {
  cohorts: CohortDTO[]; selCohort: string; setSelCohort: (v: string) => void;
}) {
  const [rows,    setRows]    = useState<AttendanceRegisterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState<"all" | "present" | "absent" | "late">("all");
  const [search,  setSearch]  = useState("");

  const load = useCallback(async () => {
    if (!selCohort) return;
    setLoading(true);
    try {
      const r = await complianceApi.getAttendanceRegister(selCohort);
      setRows(r.data?.rows ?? []);
    } catch { setRows([]); } finally { setLoading(false); }
  }, [selCohort]);

  useEffect(() => { load(); }, [load]);

  function handleExportClick() {
    downloadCsv(complianceApi.attendanceCsvUrl(selCohort), "attendance_register.csv");
  }

  const filtered = rows.filter(r => {
    if (filter !== "all" && r.status !== filter) return false;
    if (search && !r.learner_name.toLowerCase().includes(search.toLowerCase()) &&
        !r.learner_email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total:   rows.length,
    present: rows.filter(r => r.status === "present").length,
    absent:  rows.filter(r => r.status === "absent").length,
    late:    rows.filter(r => r.status === "late").length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <InfoBanner
        icon="📋"
        title="Attendance Compliance Register"
        body="Exportable per-learner session attendance for regulatory and organisational tracking. Export triggers a GDPR acknowledgement."
      />

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <SelectorLabel>COHORT</SelectorLabel>
        <Select value={selCohort} onChange={setSelCohort} options={cohorts.map(c => ({ value: c.id, label: c.name }))} placeholder="Select cohort" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…" style={{ ...inputStyle, width: 220 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "present", "absent", "late"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: filter === f ? 700 : 400, cursor: "pointer", fontFamily: "Poppins,sans-serif", border: `1px solid ${filter === f ? NAVY : BORDER}`, background: filter === f ? NAVY : "#fff", color: filter === f ? "#fff" : MUTED }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={handleExportClick} style={{ ...btnPrimary, background: ORANGE }}>
          ↓ Export CSV
        </button>
      </div>

      {/* Stats strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <StatPill label="Total Records" value={stats.total} color={NAVY} />
        <StatPill label="Present" value={stats.present} color={GREEN} />
        <StatPill label="Absent" value={stats.absent} color={DANGER} />
        <StatPill label="Late" value={stats.late} color={WARN} />
      </div>

      {/* Table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "13px 20px", borderBottom: `1px solid ${BORDER}`, fontSize: 13, fontWeight: 700, color: NAVY }}>
          Session Attendance Register
          <span style={{ fontSize: 11, fontWeight: 400, color: MUTED, marginLeft: 8 }}>{filtered.length} records</span>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: MUTED, fontSize: 12 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyRow text="No attendance records found. Session attendance data is recorded when sessions are marked as complete." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
              <thead>
                <tr style={{ background: BG }}>
                  {["LEARNER", "EMAIL", "SESSION", "DATE", "STATUS", "DURATION"].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const sc = r.status === "present" ? GREEN : r.status === "late" ? WARN : DANGER;
                  return (
                    <tr key={i} style={{ borderTop: `1px solid ${BORDER}` }}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{r.learner_name}</td>
                      <td style={{ ...tdStyle, color: MUTED }}>{r.learner_email}</td>
                      <td style={tdStyle}>{r.session_title}</td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{new Date(r.session_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                      <td style={tdStyle}>
                        <span style={{ background: `${sc}14`, color: sc, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px" }}>
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={tdStyle}>{r.duration_mins} min</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB 3 — Audit Log
// ══════════════════════════════════════════════════════════════════
function AuditTab({ orgId }: { orgId: string }) {
  const [logs,    setLogs]    = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const LIMIT = 25;

  // Filters
  const [fUser,     setFUser]     = useState("");
  const [fResource, setFResource] = useState("");
  const [fAction,   setFAction]   = useState("");
  const [fFrom,     setFFrom]     = useState("");
  const [fTo,       setFTo]       = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await complianceApi.listAuditLogs({
        org_id: orgId, user_id: fUser, resource: fResource, action: fAction,
        date_from: fFrom, date_to: fTo, page, limit: LIMIT,
      });
      setLogs(r.data ?? []);
      setTotal((r as any).meta?.total ?? (r.data ?? []).length);
    } catch { setLogs([]); } finally { setLoading(false); }
  }, [orgId, fUser, fResource, fAction, fFrom, fTo, page]);

  useEffect(() => { load(); }, [load]);

  function handleExportClick() {
    downloadCsv(complianceApi.auditCsvUrl(orgId, { user_id: fUser, resource: fResource, date_from: fFrom, date_to: fTo }), "audit_logs.csv");
  }

  const RESOURCES = ["", "programs", "cohorts", "sessions", "submissions", "users", "assessments"];
  const ACTIONS   = ["", "create", "update", "delete", "submit", "grade", "login", "export"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <InfoBanner
        icon="📜"
        title="Participant Action Audit Log"
        body="Timestamped record of all participant actions, submissions, and communications. Filter and export for compliance reporting."
      />

      {/* Filter row */}
      <div style={{ ...card, padding: "14px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
          <Field label="USER ID / NAME">
            <input value={fUser} onChange={e => { setFUser(e.target.value); setPage(1); }}
              placeholder="Filter by user…" style={inputStyle} />
          </Field>
          <Field label="RESOURCE">
            <select value={fResource} onChange={e => { setFResource(e.target.value); setPage(1); }} style={inputStyle}>
              {RESOURCES.map(r => <option key={r} value={r}>{r || "All resources"}</option>)}
            </select>
          </Field>
          <Field label="ACTION">
            <select value={fAction} onChange={e => { setFAction(e.target.value); setPage(1); }} style={inputStyle}>
              {ACTIONS.map(a => <option key={a} value={a}>{a || "All actions"}</option>)}
            </select>
          </Field>
          <Field label="FROM DATE">
            <input type="date" value={fFrom} onChange={e => { setFFrom(e.target.value); setPage(1); }} style={inputStyle} />
          </Field>
          <Field label="TO DATE">
            <input type="date" value={fTo} onChange={e => { setFTo(e.target.value); setPage(1); }} style={inputStyle} />
          </Field>
          <div style={{ display: "flex", gap: 8, paddingBottom: 1 }}>
            <button onClick={() => { setFUser(""); setFResource(""); setFAction(""); setFFrom(""); setFTo(""); setPage(1); }} style={btnSecondary}>Clear</button>
            <button onClick={handleExportClick} style={{ ...btnPrimary, background: ORANGE }}>↓ CSV</button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "13px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>
            Audit Log <span style={{ fontSize: 11, fontWeight: 400, color: MUTED }}>— {total} total entries</span>
          </div>
          <div style={{ fontSize: 11, color: MUTED }}>Page {page} of {Math.max(1, Math.ceil(total / LIMIT))}</div>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: MUTED, fontSize: 12 }}>Loading…</div>
        ) : logs.length === 0 ? (
          <EmptyRow text="No audit log entries match your filters." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
              <thead>
                <tr style={{ background: BG }}>
                  {["TIMESTAMP", "USER", "ACTION", "RESOURCE", "RESOURCE ID", "IP"].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map(l => {
                  const actionColor = l.action === "delete" ? DANGER : l.action === "create" ? GREEN : l.action.includes("export") ? WARN : INDIGO;
                  return (
                    <tr key={l.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap", fontSize: 11, color: MUTED }}>
                        {new Date(l.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{l.user_name || "—"}</div>
                        <div style={{ fontSize: 10, color: MUTED }}>{l.user_id.slice(0, 8)}…</div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ background: `${actionColor}14`, color: actionColor, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px" }}>
                          {l.action.toUpperCase()}
                        </span>
                      </td>
                      <td style={tdStyle}><span style={{ fontSize: 12, color: NAVY }}>{l.resource}</span></td>
                      <td style={tdStyle}><code style={{ fontSize: 11, color: MUTED }}>{l.resource_id.slice(0, 12)}…</code></td>
                      <td style={{ ...tdStyle, fontSize: 11, color: MUTED }}>{l.ip_address || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > LIMIT && (
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8, alignItems: "center" }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              style={{ ...btnSecondary, opacity: page <= 1 ? 0.4 : 1 }}>← Prev</button>
            <span style={{ fontSize: 12, color: MUTED }}>Page {page}</span>
            <button disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(p => p + 1)}
              style={{ ...btnSecondary, opacity: page >= Math.ceil(total / LIMIT) ? 0.4 : 1 }}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Shared sub-components
// ══════════════════════════════════════════════════════════════════

function InfoBanner({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{ background: `${INDIGO}08`, border: `1px solid ${INDIGO}20`, borderRadius: 10, padding: "14px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{title}</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 3, lineHeight: 1.6 }}>{body}</div>
      </div>
    </div>
  );
}

function FutureNote({ text }: { text: string }) {
  return (
    <div style={{ background: `${ORANGE}06`, border: `1px dashed ${ORANGE}30`, borderRadius: 10, padding: "12px 16px", display: "flex", gap: 10, alignItems: "center" }}>
      <span style={{ color: ORANGE, fontSize: 14 }}>◈</span>
      <span style={{ fontSize: 11, color: MUTED }}><strong style={{ color: ORANGE }}>Coming soon:</strong> {text}</span>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ ...card, textAlign: "center", padding: "14px 16px" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{ padding: "32px 24px", textAlign: "center", fontSize: 12, color: MUTED }}>
      {text}
    </div>
  );
}

function SelectorLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{children}</div>;
}

function Select({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, minWidth: 240 }}>
      {!value && <option value="">{placeholder ?? "Select…"}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5 }}>{label}</div>
      {children}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`,
  boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)", padding: 20,
};
const btnPrimary: React.CSSProperties = {
  background: NAVY, color: "#fff", border: "none", borderRadius: 8,
  padding: "9px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins,sans-serif",
};
const btnSecondary: React.CSSProperties = {
  background: "#fff", color: NAVY, border: `1px solid ${BORDER}`, borderRadius: 8,
  padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins,sans-serif",
};
const inputStyle: React.CSSProperties = {
  border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px",
  fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY,
  width: "100%", boxSizing: "border-box", outline: "none", background: "#fff",
};
const thStyle: React.CSSProperties = {
  padding: "9px 16px", textAlign: "left" as const,
  fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, whiteSpace: "nowrap" as const,
};
const tdStyle: React.CSSProperties = {
  padding: "11px 16px", fontSize: 13, color: NAVY,
};
