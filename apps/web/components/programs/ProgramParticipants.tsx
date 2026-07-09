"use client";

import { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import { cohortsApi, CohortDTO, ParticipantDTO } from "@/lib/cohorts-api";
import { programsApi, ProgramDTO } from "@/lib/programs-api";
import { invitationsApi } from "@/lib/invitations-api";

const C = {
  navy: "#1C2551", orange: "#EF4E24", indigo: "#6B73BF",
  bg: "#F5F7FB", card: "#fff", border: "#EAECF4", muted: "#8b90a7",
  green: "#22c55e", amber: "#f59e0b", red: "#ef4444",
};
const S = {
  primBtn: { padding: "9px 20px", background: C.orange, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif", display: "flex", alignItems: "center", gap: 6 } as React.CSSProperties,
  secBtn: { padding: "8px 16px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.navy, fontFamily: "Poppins, sans-serif" } as React.CSSProperties,
};

// Sentinel id for the "All Programs" aggregate selection (not a real program).
const ALL_ID = "__all__";

function initials(n: string) {
  return n.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}
function riskColor(r: string) {
  return r === "high" ? C.red : r === "medium" ? C.amber : C.green;
}
function riskLabel(r: string) {
  return r.charAt(0).toUpperCase() + r.slice(1);
}
function enrollmentStatusColor(s: string) {
  switch (s) {
    case "invited":   return C.amber;
    case "on_hold":   return C.muted;
    case "withdrawn": return C.red;
    case "completed": return C.green;
    default:          return C.navy;
  }
}
function enrollmentStatusLabel(s: string) {
  if (s === "on_hold") return "On Hold";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function progColor(p: ProgramDTO): string {
  const colors = [C.orange, C.navy, C.indigo, C.green, C.amber, "#0891B2"];
  let h = 0;
  for (let i = 0; i < p.title.length; i++) h = (h * 31 + p.title.charCodeAt(i)) % colors.length;
  return p.color || colors[h];
}

function Badge({ label, color = C.orange }: { label: string; color?: string }) {
  return (
    <span style={{ background: `${color}14`, color, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px" }}>
      {label}
    </span>
  );
}

function Overlay({ children, onClose, maxWidth = 460 }: { children: React.ReactNode; onClose: () => void; maxWidth?: number }) {
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth, maxHeight: "88vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        {children}
      </div>
    </div>,
    document.body
  );
}

async function ensureUnassignedCohortId(orgId: string, programId: string): Promise<string> {
  try {
    const list = (await cohortsApi.list(orgId, programId)).data ?? [];
    const existing = list.find(c => c.name === "Unassigned");
    if (existing) return existing.id;
    const created = await cohortsApi.create(orgId, { program_id: programId, name: "Unassigned", max_seats: 500 });
    return created.data?.id ?? "";
  } catch { return ""; }
}

// ── Enroll Modal ─────────────────────────────────────────────────────
function EnrollModal({ programs, defaultProgramId, onClose, onDone }: {
  programs: ProgramDTO[];
  defaultProgramId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [selProgId, setSelProgId] = useState(defaultProgramId || programs[0]?.id || "");
  const [method, setMethod] = useState<"manual" | "csv">("manual");
  const [enrollRole, setEnrollRole] = useState<"participant" | "participant_retailer">("participant");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [saving, setSaving] = useState(false);
  const [invited, setInvited] = useState(false);
  const [err, setErr] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvResult, setCsvResult] = useState<{ enrolled: number; failed: number } | null>(null);

  const selProg = programs.find(p => p.id === selProgId);

  async function submit() {
    if (!selProg) { setErr("Select a program"); return; }
    setErr("");
    setSaving(true);
    try {
      const cid = await ensureUnassignedCohortId(selProg.org_id, selProg.id);
      if (method === "csv" && csvFile) {
        if (!cid) { setErr("Could not prepare enrollment for this program"); setSaving(false); return; }
        const res = await cohortsApi.enrollCSV(cid, csvFile, enrollRole);
        setCsvResult({ enrolled: res.data?.success_count ?? 0, failed: res.data?.failed_count ?? 0 });
        onDone();
      } else {
        if (!email.trim()) { setErr("Email is required"); setSaving(false); return; }
        if (!name.trim()) { setErr("Participant name is required"); setSaving(false); return; }
        await invitationsApi.send({
          email: email.trim(),
          role: enrollRole,
          program_id: selProg.id,
          org_id: selProg.org_id,
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
          They&rsquo;ll receive a link to set up their account and join the program.
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
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>SELECT PROGRAM</div>
          <select
            value={selProgId}
            onChange={e => setSelProgId(e.target.value)}
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: C.navy, outline: "none" }}
          >
            {programs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
            Participants enroll into the program first. Assign them to a cohort / session later from <strong style={{ color: C.navy }}>Cohort Management</strong>.
          </div>
        </div>

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

        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>ENROLL AS</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {([
              { key: "participant", title: "Participant", sub: "Full learning workspace" },
              { key: "participant_retailer", title: "Participant Retailer", sub: "Assessments · 360° · Coaching only" },
            ] as const).map(r => (
              <div key={r.key} onClick={() => setEnrollRole(r.key)} style={{
                padding: 12, borderRadius: 10, cursor: "pointer",
                border: `1.5px solid ${enrollRole === r.key ? C.indigo : C.border}`,
                background: enrollRole === r.key ? "rgba(107,115,191,0.06)" : "#fff",
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: enrollRole === r.key ? C.indigo : C.muted, marginBottom: 3 }}>{r.title}</div>
                <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4 }}>{r.sub}</div>
              </div>
            ))}
          </div>
          {method === "csv" && (
            <div style={{ fontSize: 10, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>
              Applies to everyone in this CSV. To mix roles, run separate imports.
            </div>
          )}
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
              The participant will receive an invite email. They only need to set a password — name and department are locked as you&rsquo;ve set them.
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

// ── Main: program-scoped participant list ────────────────────────────
export default function ProgramParticipants({ orgId }: { orgId: string }) {
  const [programs, setPrograms] = useState<ProgramDTO[]>([]);
  const [selProgId, setSelProgId] = useState<string | null>(null);
  const [cohorts, setCohorts] = useState<CohortDTO[]>([]);
  const [allParticipants, setAllParticipants] = useState<Record<string, ParticipantDTO[]>>({});
  const [loading, setLoading] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);

  useEffect(() => {
    programsApi.list(orgId).then(r => {
      const list = (r.data ?? []).filter(p => p.status !== "archived");
      setPrograms(list);
    }).catch(() => {});
  }, [orgId]);

  const loadAll = useCallback(async () => {
    if (programs.length === 0) return;
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

  useEffect(() => { void Promise.resolve().then(loadAll); }, [loadAll]);

  function participantsForProg(progId: string): (ParticipantDTO & { cohortName: string; programTitle: string })[] {
    const seen = new Set<string>();
    const out: (ParticipantDTO & { cohortName: string; programTitle: string })[] = [];
    const prog = programs.find(p => p.id === progId);
    const progCohorts = cohorts.filter(c => c.program_id === progId);
    for (const c of progCohorts) {
      for (const p of allParticipants[c.id] ?? []) {
        if (p.status === "withdrawn") continue;
        if (seen.has(p.user_id)) continue;
        seen.add(p.user_id);
        out.push({ ...p, cohortName: c.name === "Unassigned" ? "Unassigned" : c.name, programTitle: prog?.title ?? "" });
      }
    }
    return out;
  }

  const isAll = selProgId === null || selProgId === ALL_ID;
  const activeProg = (!isAll ? programs.find(p => p.id === selProgId) : null) ?? null;
  const progParticipants = isAll
    ? programs.flatMap(p => participantsForProg(p.id))
    : (activeProg ? participantsForProg(activeProg.id) : []);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif" }}>
      {loading && <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: C.muted }}>Loading participants...</div>}

      {/* Program selector pills */}
      {!loading && programs.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setSelProgId(ALL_ID)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", border: `1.5px solid ${isAll ? C.navy : C.border}`, borderRadius: 10, background: isAll ? "rgba(28,37,81,0.05)" : "#fff", cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>
            <span style={{ fontSize: 12, fontWeight: isAll ? 700 : 400, color: isAll ? C.navy : C.muted, whiteSpace: "nowrap" }}>All Programs</span>
            <span style={{ fontSize: 10, background: isAll ? "rgba(28,37,81,0.1)" : C.bg, color: isAll ? C.navy : C.muted, borderRadius: 99, padding: "1px 7px", fontWeight: 700 }}>
              {programs.reduce((sum, p) => sum + participantsForProg(p.id).length, 0)}
            </span>
          </button>
          {programs.map((p) => {
            const active = !isAll && activeProg?.id === p.id;
            const col = progColor(p);
            const count = participantsForProg(p.id).length;
            return (
              <button key={p.id} onClick={() => setSelProgId(p.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", border: `1.5px solid ${active ? col : C.border}`, borderRadius: 10, background: active ? `${col}0d` : "#fff", cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: col, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: active ? 700 : 400, color: active ? col : C.muted, whiteSpace: "nowrap" }}>{p.title.split("–")[0].trim()}</span>
                <span style={{ fontSize: 10, background: active ? `${col}22` : C.bg, color: active ? col : C.muted, borderRadius: 99, padding: "1px 7px", fontWeight: 700 }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {!loading && programs.length === 0 && (
        <div style={{ padding: 48, textAlign: "center", color: C.muted, fontSize: 13, background: "#fff", borderRadius: 12, border: `1px solid ${C.border}` }}>
          No programs found. Create a program first.
        </div>
      )}

      {/* Participant table */}
      {!loading && (isAll || activeProg) && (
        <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", background: "#F9FAFB", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.navy }}>All Participants</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {isAll ? "Everyone across all programs, all cohorts, including those not yet assigned" : `Everyone in ${activeProg?.title}, across all cohorts, including those not yet assigned`}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, background: "rgba(28,37,81,0.06)", color: C.navy, borderRadius: 99, padding: "3px 12px", fontWeight: 700 }}>{progParticipants.length} total</span>
              <button onClick={() => setShowEnroll(true)} style={S.primBtn}>+ Enroll Participants</button>
            </div>
          </div>
          {progParticipants.length === 0 ? (
            <div style={{ padding: "32px 18px", textAlign: "center", color: C.muted, fontSize: 13 }}>No participants enrolled yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead><tr style={{ background: C.bg }}>{[...(isAll ? ["Program"] : []), "Participant", "Type", "Dept", "Cohort", "Status", "Enrolled", "Progress", "Risk"].map(h => <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                <tbody>{progParticipants.map((p, i) => {
                  const cc = p.completion_percent >= 60 ? C.green : p.completion_percent >= 30 ? C.amber : C.orange;
                  const isRetailer = p.role === "participant_retailer";
                  const isUnassigned = p.cohortName === "Unassigned";
                  return (
                    <tr key={`${p.programTitle}-${p.user_id ?? i}`} style={{ borderTop: `1px solid ${C.bg}` }}>
                      {isAll && <td style={{ padding: "11px 16px", fontSize: 11, color: C.navy, fontWeight: 600, whiteSpace: "nowrap" }}>{p.programTitle}</td>}
                      <td style={{ padding: "11px 16px" }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 30, height: 30, borderRadius: "50%", background: C.navy, color: "#fff", fontWeight: 700, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(p.name)}</div><span style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>{p.name}</span></div></td>
                      <td style={{ padding: "11px 16px" }}><Badge label={isRetailer ? "Retailer" : "Participant"} color={isRetailer ? C.indigo : C.orange} /></td>
                      <td style={{ padding: "11px 16px", fontSize: 11, color: C.muted }}>{p.department || "—"}</td>
                      <td style={{ padding: "11px 16px", fontSize: 11, color: isUnassigned ? C.orange : C.navy, fontWeight: isUnassigned ? 700 : 400 }}>{p.cohortName}</td>
                      <td style={{ padding: "11px 16px" }}><Badge label={enrollmentStatusLabel(p.status)} color={enrollmentStatusColor(p.status)} /></td>
                      <td style={{ padding: "11px 16px", fontSize: 11, color: C.muted }}>{p.enrolled_at ? new Date(p.enrolled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</td>
                      <td style={{ padding: "11px 16px", minWidth: 130 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ flex: 1, height: 5, background: "#F0F1F7", borderRadius: 99 }}><div style={{ height: "100%", width: `${p.completion_percent}%`, background: cc, borderRadius: 99 }} /></div><span style={{ fontSize: 11, fontWeight: 700, color: C.navy, minWidth: 30 }}>{p.completion_percent}%</span></div></td>
                      <td style={{ padding: "11px 16px" }}><Badge label={riskLabel(p.risk_level)} color={riskColor(p.risk_level)} /></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showEnroll && programs.length > 0 && (
        <EnrollModal
          programs={programs}
          defaultProgramId={activeProg?.id}
          onClose={() => setShowEnroll(false)}
          onDone={() => { setShowEnroll(false); loadAll(); }}
        />
      )}
    </div>
  );
}
