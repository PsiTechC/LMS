"use client";

import { useState, useEffect, useCallback } from "react";
import {
  cohortsApi, CohortDTO, ParticipantDTO,
} from "@/lib/cohorts-api";
import { programsApi, ProgramDTO } from "@/lib/programs-api";
import { invitationsApi } from "@/lib/invitations-api";

// ── Design tokens ───────────────────────────────────────────────────
const C = {
  navy: "#1C2551", orange: "#EF4E24", indigo: "#6B73BF",
  bg: "#F5F7FB", card: "#fff", border: "#EAECF4", muted: "#8b90a7",
  green: "#22c55e", amber: "#f59e0b", red: "#ef4444",
};
const S = {
  primBtn: { padding: "9px 20px", background: C.orange, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif", display: "flex", alignItems: "center", gap: 6 } as React.CSSProperties,
  secBtn: { padding: "8px 16px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.navy, fontFamily: "Poppins, sans-serif" } as React.CSSProperties,
  iconBtn: { padding: "6px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", fontSize: 11, color: C.navy, fontFamily: "Poppins, sans-serif", fontWeight: 600 } as React.CSSProperties,
};

function initials(n: string) {
  return n.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}
function riskColor(r: string) {
  return r === "high" ? C.red : r === "medium" ? C.amber : C.green;
}
function riskLabel(r: string) {
  return r.charAt(0).toUpperCase() + r.slice(1);
}
function statusColor(s: string) {
  if (s === "invited")   return C.amber;
  if (s === "enrolled")  return "#0891B2";
  if (s === "completed") return C.green;
  if (s === "withdrawn") return C.muted;
  return C.muted;
}
function statusLabel(s: string) {
  if (s === "invited")   return "Invited";
  if (s === "enrolled")  return "Enrolled";
  if (s === "completed") return "Completed";
  if (s === "withdrawn") return "Withdrawn";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// get a stable color from a ProgramDTO
function progColor(p: ProgramDTO): string {
  const colors = [C.orange, C.navy, C.indigo, C.green, C.amber, "#0891B2"];
  let h = 0;
  for (let i = 0; i < p.title.length; i++) h = (h * 31 + p.title.charCodeAt(i)) % colors.length;
  return p.color || colors[h];
}

// ── Overlay ─────────────────────────────────────────────────────────
function Overlay({ children, onClose, maxWidth = 480 }: { children: React.ReactNode; onClose: () => void; maxWidth?: number }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className="xa-modal-overlay"
      style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins, sans-serif" }}>
      <div className="xa-modal-content" style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth, maxHeight: "88vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        {children}
      </div>
    </div>
  );
}

// ── Badge ────────────────────────────────────────────────────────────
function Badge({ label, color = C.orange }: { label: string; color?: string }) {
  return (
    <span style={{ background: `${color}14`, color, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px" }}>
      {label}
    </span>
  );
}

// ── Enroll Modal ─────────────────────────────────────────────────────
function EnrollModal({ programs, onClose, onDone }: {
  programs: ProgramDTO[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [selProgId, setSelProgId] = useState(programs[0]?.id ?? "");
  const [method, setMethod] = useState<"manual" | "csv">("manual");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [saving, setSaving] = useState(false);
  const [invited, setInvited] = useState(false);
  const [err, setErr] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvResult, setCsvResult] = useState<{ enrolled: number; failed: number } | null>(null);
  const [cohorts, setCohorts] = useState<CohortDTO[]>([]);
  const [selCohortId, setSelCohortId] = useState("");

  const selProg = programs.find(p => p.id === selProgId);

  useEffect(() => {
    if (!selProgId || !selProg) return;
    const orgId = selProg.org_id;
    cohortsApi.list(orgId, selProgId).then(r => {
      const list = r.data ?? [];
      setCohorts(list);
      if (list.length > 0) setSelCohortId(list[0].id);
    }).catch(() => {});
  }, [selProgId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!selCohortId) { setErr("Select a program with at least one cohort"); return; }
    setErr("");
    setSaving(true);
    try {
      if (method === "csv" && csvFile) {
        const res = await cohortsApi.enrollCSV(selCohortId, csvFile);
        setCsvResult({ enrolled: res.data?.success_count ?? 0, failed: res.data?.failed_count ?? 0 });
        onDone();
      } else {
        if (!email.trim()) { setErr("Email is required"); setSaving(false); return; }
        if (!name.trim()) { setErr("Participant name is required"); setSaving(false); return; }
        await invitationsApi.send({
          email: email.trim(),
          role: "participant",
          cohort_id: selCohortId,
          name: name.trim(),
          department: department.trim(),
        });
        setInvited(true);
        onDone();
      }
    } catch (e: unknown) { setErr((e as Error).message || "Failed to send invite"); }
    finally { setSaving(false); }
  }

  if (invited) return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "40px 28px", textAlign: "center" }}>
        <div style={{ fontSize: 30, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Invitation Sent!</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 24, lineHeight: 1.6 }}>
          An invite email has been sent to <strong style={{ color: C.navy }}>{email}</strong>.<br />
          They'll receive a link to set up their account and join the cohort.
        </div>
        <button onClick={onClose} style={S.primBtn}>Done</button>
      </div>
    </Overlay>
  );

  if (csvResult) return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "40px 28px", textAlign: "center" }}>
        <div style={{ fontSize: 30, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 16 }}>CSV Import Complete</div>
        <div style={{ display: "flex", gap: 20, justifyContent: "center", marginBottom: 24 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.green }}>{csvResult.enrolled}</div>
            <div style={{ fontSize: 11, color: C.muted }}>Enrolled</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.orange }}>{csvResult.failed}</div>
            <div style={{ fontSize: 11, color: C.muted }}>Failed</div>
          </div>
        </div>
        <button onClick={onClose} style={S.primBtn}>Done</button>
      </div>
    </Overlay>
  );

  return (
    <Overlay onClose={onClose} maxWidth={460}>
      <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>Enroll Participants</div>
        <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: C.muted, fontFamily: "Poppins, sans-serif" }}>✕</button>
      </div>
      <div style={{ padding: "20px 22px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Program select */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>SELECT PROGRAM</div>
          <select
            value={selProgId}
            onChange={e => setSelProgId(e.target.value)}
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: C.navy, outline: "none" }}
          >
            {programs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          {cohorts.length > 1 && (
            <select
              value={selCohortId}
              onChange={e => setSelCohortId(e.target.value)}
              style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: C.navy, outline: "none", marginTop: 8 }}
            >
              {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        {/* Enroll method */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>ENROLL METHOD</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(["manual", "csv"] as const).map((m, i) => (
              <div key={m} onClick={() => setMethod(m)} style={{
                padding: 12, borderRadius: 10, cursor: "pointer",
                border: `1.5px solid ${method === m ? C.navy : C.border}`,
                background: method === m ? "rgba(28,37,81,0.04)" : "#fff",
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: method === m ? C.navy : C.muted, marginBottom: 3 }}>
                  {i === 0 ? "Manual Entry" : "Import CSV"}
                </div>
                <div style={{ fontSize: 10, color: C.muted }}>
                  {i === 0 ? "Add participants one by one" : "Bulk upload via spreadsheet"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {method === "manual" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>FULL NAME *</div>
              <input
                autoFocus
                value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Riya Sharma"
                style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: C.navy, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>DEPARTMENT</div>
              <input
                value={department} onChange={e => setDepartment(e.target.value)}
                placeholder="e.g. Operations"
                style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: C.navy, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>EMAIL ADDRESS *</div>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") submit(); }}
                placeholder="participant@organisation.com"
                style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: C.navy, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              The participant will receive an invite email. They only need to set a password — name and department are locked as you've set them.
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>CSV FILE</div>
            <input
              type="file" accept=".csv"
              onChange={e => setCsvFile(e.target.files?.[0] ?? null)}
              style={{ width: "100%", fontSize: 12, fontFamily: "Poppins, sans-serif" }}
            />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>CSV headers: name, email, department (optional)</div>
          </div>
        )}

        {err && <div style={{ fontSize: 12, color: C.orange, padding: "8px 12px", background: "rgba(239,78,36,0.06)", borderRadius: 8 }}>{err}</div>}
      </div>
      <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
        <button onClick={onClose} style={S.secBtn}>Cancel</button>
        <button onClick={submit} disabled={saving} style={{ ...S.primBtn, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Enrolling…" : "Enroll →"}
        </button>
      </div>
    </Overlay>
  );
}

// ── Nudge Modal ──────────────────────────────────────────────────────
function NudgeModal({ cohortId, participant, onClose }: {
  cohortId: string;
  participant: ParticipantDTO;
  onClose: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function send() {
    setSending(true);
    try {
      await cohortsApi.nudge(cohortId, participant.enrollment_id);
      setDone(true);
    } catch { /* ignore */ }
    finally { setSending(false); }
  }

  return (
    <Overlay onClose={onClose} maxWidth={400}>
      <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>Send Nudge</div>
      </div>
      <div style={{ padding: "20px 22px" }}>
        {done ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 30, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>Nudge sent to {participant.name}</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: C.navy, marginBottom: 8 }}>
              Send an AI-personalized nudge to <strong>{participant.name}</strong>?
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              Their current progress is <strong style={{ color: C.orange }}>{participant.completion_percent}%</strong> with risk level <strong style={{ color: riskColor(participant.risk_level) }}>{riskLabel(participant.risk_level)}</strong>.
            </div>
          </>
        )}
      </div>
      <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
        <button onClick={onClose} style={S.secBtn}>{done ? "Close" : "Cancel"}</button>
        {!done && (
          <button onClick={send} disabled={sending} style={{ ...S.primBtn, opacity: sending ? 0.6 : 1 }}>
            {sending ? "Sending…" : "Send Nudge"}
          </button>
        )}
      </div>
    </Overlay>
  );
}

// ── Main Component ───────────────────────────────────────────────────
export default function CohortManagement({ orgId }: { orgId: string }) {
  const [programs, setPrograms] = useState<ProgramDTO[]>([]);
  const [view, setView] = useState<"dashboard" | "list">("dashboard");
  const [selProgId, setSelProgId] = useState<string | null>(null);
  const [cohorts, setCohorts] = useState<CohortDTO[]>([]);
  const [allParticipants, setAllParticipants] = useState<Record<string, ParticipantDTO[]>>({});
  const [loading, setLoading] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [nudgeTarget, setNudgeTarget] = useState<{ cohortId: string; participant: ParticipantDTO } | null>(null);

  // Load all programs once
  useEffect(() => {
    if (!orgId) return;
    programsApi.list(orgId).then(r => {
      const list = (r.data ?? []).filter(p => p.status !== "archived");
      setPrograms(list);
    }).catch(() => {});
  }, [orgId]);

  // Load cohorts + participants for all programs
  const loadAll = useCallback(async () => {
    if (!orgId || programs.length === 0) return;
    setLoading(true);
    try {
      const allCohorts: CohortDTO[] = [];
      const partMap: Record<string, ParticipantDTO[]> = {};

      await Promise.allSettled(programs.map(async (prog) => {
        try {
          const res = await cohortsApi.list(orgId, prog.id);
          const list = res.data ?? [];
          allCohorts.push(...list);
          await Promise.allSettled(list.map(async (c) => {
            try {
              const pr = await cohortsApi.listParticipants(c.id);
              partMap[c.id] = pr.data ?? [];
            } catch { partMap[c.id] = []; }
          }));
        } catch { /* ignore */ }
      }));

      setCohorts(allCohorts);
      setAllParticipants(partMap);
    } finally { setLoading(false); }
  }, [orgId, programs]);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (!orgId) return <div style={{ padding: 48, textAlign: "center", color: C.muted, fontSize: 14, fontFamily: "Poppins, sans-serif" }}>No organization linked.</div>;

  // Derived stats for dashboard
  const activePrograms = programs.filter(p => p.status === "active");
  const scheduledPrograms = programs.filter(p => p.status === "upcoming" || p.status === "draft");
  const totalEnrolled = cohorts.reduce((a, c) => a + c.enrolled_count, 0);
  const allParticipantsList = Object.values(allParticipants).flat();
  const atRiskTotal = allParticipantsList.filter(p => p.risk_level === "high" || p.risk_level === "medium").length;
  const activeParticipants = allParticipantsList.filter(p => p.status !== "withdrawn");
  const avgCompletion = activeParticipants.length > 0
    ? Math.round(activeParticipants.reduce((a, p) => a + p.completion_percent, 0) / activeParticipants.length)
    : 0;

  // Group cohorts by program for dashboard cards
  function cohortsForProg(progId: string) {
    return cohorts.filter(c => c.program_id === progId);
  }
  function participantsForProg(progId: string) {
    return cohortsForProg(progId).flatMap(c => allParticipants[c.id] ?? []);
  }

  // Filter participants for the All Cohorts tab
  const displayPrograms = selProgId ? programs.filter(p => p.id === selProgId) : programs;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif", overflowY: "auto" }}>

      {/* Top bar: tabs + actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["dashboard", "list"] as const).map((v) => (
            <button key={v} onClick={() => { setView(v); setSelProgId(null); }} style={{
              padding: "7px 18px", border: `1px solid ${C.border}`, borderRadius: 8,
              background: view === v ? C.navy : "#fff", color: view === v ? "#fff" : C.muted,
              fontSize: 12, fontWeight: view === v ? 700 : 500, cursor: "pointer", fontFamily: "Poppins, sans-serif",
            }}>
              {v === "dashboard" ? "Dashboard" : "All Cohorts"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.secBtn}>Import CSV</button>
          <button onClick={() => setShowEnroll(true)} style={S.primBtn}>+ Enroll Participants</button>
        </div>
      </div>

      {loading && (
        <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: C.muted }}>Loading cohorts…</div>
      )}

      {/* ── DASHBOARD VIEW ── */}
      {!loading && view === "dashboard" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* AI Cohort Pulse banner */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "linear-gradient(135deg,#1C2551 0%,#2d3a7c 100%)", color: "#fff", borderRadius: 12, padding: "14px 20px" }}>
            <span style={{ fontSize: 16, marginTop: 2, flexShrink: 0 }}>✦</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>AI Cohort Pulse</div>
              <div style={{ fontSize: 12, opacity: 0.88, lineHeight: 1.6 }}>
                {atRiskTotal > 0
                  ? `${atRiskTotal} participants flagged at risk across active programs. ${totalEnrolled} total enrolled — ${avgCompletion}% average completion.`
                  : `All ${totalEnrolled} enrolled participants are on track. Average completion stands at ${avgCompletion}%.`}
              </div>
            </div>
          </div>

          {/* KPI stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            {[
              { label: "Active Programs",     value: activePrograms.length,  sub: `${scheduledPrograms.length} scheduled`,  color: C.navy,   icon: "▤" },
              { label: "Total Enrolled",      value: totalEnrolled,          sub: "Across all programs",                    color: C.orange, icon: "◇" },
              { label: "Avg Completion",      value: `${avgCompletion}%`,    sub: "Active programs only",                   color: C.green,  icon: "◈" },
              { label: "Participants At Risk",value: atRiskTotal,             sub: "Need immediate attention",               color: C.red,    icon: "✦" },
            ].map((s, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, padding: "16px 18px", boxShadow: "0 1px 4px rgba(28,37,81,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>{s.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{s.sub}</div>
                  </div>
                  <span style={{ fontSize: 22, opacity: 0.35, color: s.color }}>{s.icon}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Program cohort cards */}
          {programs.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: C.muted, fontSize: 13 }}>No programs found. Create a program first.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
              {programs.map((prog) => {
                const color = progColor(prog);
                const pts = participantsForProg(prog.id);
                const cList = cohortsForProg(prog.id);
                const enrolled = cList.reduce((a, c) => a + c.enrolled_count, 0);
                const totalSeats = cList.reduce((a, c) => a + c.max_seats, 0) || 0;
                const atRisk = pts.filter(p => p.risk_level === "high" || p.risk_level === "medium").length;
                const avgPct = pts.length > 0 ? Math.round(pts.reduce((a, p) => a + p.completion_percent, 0) / pts.length) : 0;
                const statusBg: Record<string, string> = {
                  active: "rgba(34,197,94,0.1)", upcoming: "rgba(245,158,11,0.1)",
                  draft: "rgba(139,144,167,0.1)", delivered: "rgba(107,115,191,0.1)",
                };
                const statusCol: Record<string, string> = {
                  active: C.green, upcoming: C.amber, draft: C.muted, delivered: C.indigo,
                };

                return (
                  <div key={prog.id}
                    onClick={() => { setSelProgId(prog.id); setView("list"); }}
                    className="xa-card"
                    style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${selProgId === prog.id ? color : C.border}`, boxShadow: "0 1px 4px rgba(28,37,81,0.06)", overflow: "hidden", cursor: "pointer" }}
                  >
                    {/* Card header */}
                    <div style={{ background: `${color}0d`, borderBottom: `1px solid ${color}20`, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 3 }}>{prog.title}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>
                          {prog.status === "active" ? "Active" : prog.status}
                          {prog.published_at ? ` · Started ${new Date(prog.published_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}
                        </div>
                      </div>
                      <span style={{ fontSize: 9, background: statusBg[prog.status] ?? "rgba(139,144,167,0.1)", color: statusCol[prog.status] ?? C.muted, borderRadius: 10, padding: "3px 9px", fontWeight: 700, flexShrink: 0 }}>
                        {prog.status.toUpperCase()}
                      </span>
                    </div>

                    {/* Card body */}
                    <div style={{ padding: "14px 18px" }}>
                      {/* Mini stats */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
                        {[
                          ["Enrolled", `${enrolled}${totalSeats > 0 ? `/${totalSeats}` : ""}`, color],
                          ["Phase", prog.phase_count > 0 ? `Phase ${Math.min(prog.phase_count, 3)}` : "—", C.navy],
                          ["Avg Progress", `${avgPct}%`, C.green],
                          ["At Risk", atRisk, atRisk > 0 ? C.red : C.green],
                        ].map(([k, v, col], j) => (
                          <div key={j} style={{ background: C.bg, borderRadius: 8, padding: "8px 10px" }}>
                            <div style={{ fontSize: 9, color: C.muted, marginBottom: 3 }}>{k}</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: String(col), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</div>
                          </div>
                        ))}
                      </div>

                      {/* Phase timeline */}
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: C.muted }}>Current Phase</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color }}>{prog.phase_count > 0 ? `Phase ${Math.min(prog.phase_count, 3)} of ${prog.phase_count}` : "—"}</span>
                        </div>
                        <div style={{ display: "flex", gap: 2 }}>
                          {Array.from({ length: Math.max(prog.phase_count, 3) }, (_, i) => {
                            const pct = i < Math.ceil(prog.phase_count * 0.6) ? 100 : i < prog.phase_count ? 45 : 0;
                            return (
                              <div key={i} style={{ flex: 1, height: 5, borderRadius: 2, background: pct === 100 ? color : pct > 0 ? `${color}60` : "#E0E3EF" }} />
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ fontSize: 10, color, fontWeight: 600, textAlign: "right", marginTop: 6 }}>View participants →</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── ALL COHORTS VIEW ── */}
      {!loading && view === "list" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Program filter pills */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => setSelProgId(null)}
              style={{ padding: "6px 14px", border: `1px solid ${C.border}`, borderRadius: 8, background: !selProgId ? C.navy : "#fff", color: !selProgId ? "#fff" : C.muted, fontSize: 11, fontWeight: !selProgId ? 700 : 400, cursor: "pointer", fontFamily: "Poppins, sans-serif" }}
            >All Programs</button>
            {programs.map(p => {
              const col = progColor(p);
              const active = selProgId === p.id;
              return (
                <button key={p.id} onClick={() => setSelProgId(p.id)} style={{
                  padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "Poppins, sans-serif",
                  border: `1.5px solid ${active ? col : C.border}`,
                  background: active ? `${col}0d` : "#fff",
                  color: active ? col : C.muted,
                  fontSize: 11, fontWeight: active ? 700 : 400,
                  maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {p.title.split("–")[0].trim()}
                </button>
              );
            })}
          </div>

          {/* Program groups */}
          {displayPrograms.map(prog => {
            const color = progColor(prog);
            const progCohorts = cohortsForProg(prog.id);
            const progParticipants = participantsForProg(prog.id).filter(p => p.status !== "withdrawn" && p.status !== "invited");
            const atRisk = progParticipants.filter(p => p.risk_level === "high" || p.risk_level === "medium").length;
            const avgPct = progParticipants.length > 0
              ? Math.round(progParticipants.reduce((a, p) => a + p.completion_percent, 0) / progParticipants.length)
              : 0;
            const firstCohortId = progCohorts[0]?.id ?? "";

            return (
              <div key={prog.id} style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", border: `1px solid ${C.border}`, padding: 0, overflow: "hidden" }}>
                {/* Cohort group header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: `${color}08`, borderBottom: `1px solid ${color}20` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{prog.title}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>
                        {progParticipants.length} participants · {prog.phase_count} phases
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color }}>{avgPct}% avg</span>
                    {atRisk > 0 && (
                      <span style={{ fontSize: 9, background: "rgba(239,68,68,0.1)", color: C.red, borderRadius: 10, padding: "3px 8px", fontWeight: 700 }}>{atRisk} AT RISK</span>
                    )}
                  </div>
                </div>

                {/* Participant table */}
                {progParticipants.length === 0 ? (
                  <div style={{ padding: "32px 18px", textAlign: "center", color: C.muted, fontSize: 13 }}>
                    No participants enrolled yet.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: C.bg }}>
                        {["Participant", "Department", "Enrolled", "Completion", "Risk", "Status", "Actions"].map(h => (
                          <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {progParticipants.map((p, i) => {
                        const completionColor = p.completion_percent >= 60 ? C.green : p.completion_percent >= 30 ? C.amber : C.orange;
                        const cohortId = progCohorts.find(c => (allParticipants[c.id] ?? []).some(pp => pp.user_id === p.user_id))?.id ?? firstCohortId;
                        return (
                          <tr key={p.enrollment_id ?? i} style={{ borderTop: `1px solid ${C.bg}` }}>
                            <td style={{ padding: "11px 16px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.navy, color: "#fff", fontWeight: 700, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  {initials(p.name)}
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>{p.name}</span>
                              </div>
                            </td>
                            <td style={{ padding: "11px 16px", fontSize: 11, color: C.muted }}>{p.department || "—"}</td>
                            <td style={{ padding: "11px 16px", fontSize: 11, color: C.muted }}>
                              {p.enrolled_at ? new Date(p.enrolled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                            </td>
                            <td style={{ padding: "11px 16px", minWidth: 130 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ flex: 1, height: 5, background: "#F0F1F7", borderRadius: 99 }}>
                                  <div style={{ height: "100%", width: `${p.completion_percent}%`, background: completionColor, borderRadius: 99 }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: C.navy, minWidth: 30 }}>{p.completion_percent}%</span>
                              </div>
                            </td>
                            <td style={{ padding: "11px 16px" }}>
                              <Badge label={riskLabel(p.risk_level)} color={riskColor(p.risk_level)} />
                            </td>
                            <td style={{ padding: "11px 16px" }}>
                              <Badge label={statusLabel(p.status)} color={statusColor(p.status)} />
                            </td>
                            <td style={{ padding: "11px 16px" }}>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button style={S.iconBtn}>View</button>
                                {p.risk_level !== "low" && (
                                  <button
                                    onClick={() => setNudgeTarget({ cohortId, participant: p })}
                                    style={{ ...S.iconBtn, color: C.orange, borderColor: "rgba(239,78,36,0.3)" }}
                                  >Nudge</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}

          {displayPrograms.length === 0 && (
            <div style={{ padding: 48, textAlign: "center", color: C.muted, fontSize: 13, background: "#fff", borderRadius: 12, border: `1px solid ${C.border}` }}>
              No programs found.
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showEnroll && programs.length > 0 && (
        <EnrollModal
          programs={programs}
          onClose={() => setShowEnroll(false)}
          onDone={() => { setShowEnroll(false); loadAll(); }}
        />
      )}
      {nudgeTarget && (
        <NudgeModal
          cohortId={nudgeTarget.cohortId}
          participant={nudgeTarget.participant}
          onClose={() => setNudgeTarget(null)}
        />
      )}
    </div>
  );
}
