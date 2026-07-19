"use client";

import { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import { cohortsApi, CohortDTO, ParticipantDTO } from "@/lib/cohorts-api";
import { programsApi, ProgramDTO } from "@/lib/programs-api";
import { invitationsApi } from "@/lib/invitations-api";

const C = {
  navy: "var(--xa-navy)", orange: "var(--xa-primary)", indigo: "#4A5573",
  bg: "var(--xa-bg)", card: "#fff", border: "#E6DED0", muted: "var(--xa-muted)",
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
      style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth, maxHeight: "88vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)" }}>
        {children}
      </div>
    </div>,
    document.body
  );
}



// ── Enroll Modal ─────────────────────────────────────────────────────
function EnrollModal({ programs, defaultProgramId, onClose, onDone }: {
  programs: ProgramDTO[];
  defaultProgramId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [selProgId, setSelProgId] = useState(defaultProgramId || programs[0]?.id || "");
  const [selCohortId, setSelCohortId] = useState("");
  const [cohorts, setCohorts] = useState<CohortDTO[]>([]);
  const [loadingCohorts, setLoadingCohorts] = useState(false);
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

  useEffect(() => {
    if (!selProg) {
      setCohorts([]);
      setSelCohortId("");
      return;
    }
    setLoadingCohorts(true);
    cohortsApi.list(selProg.org_id, selProg.id).then(res => {
      const list = res.data ?? [];
      setCohorts(list);
      setSelCohortId(list.length > 0 ? list[0].id : "");
    }).catch(() => {
      setCohorts([]);
      setSelCohortId("");
    }).finally(() => {
      setLoadingCohorts(false);
    });
  }, [selProgId, selProg]);

  async function submit() {
    if (!selProg) { setErr("Select a program"); return; }
    // Cohort is optional for a single manual invite (falls back to the
    // program's auto-managed "Unassigned" cohort — see invitations
    // service) but CSV bulk-enroll hits a cohort-scoped endpoint
    // (POST /cohorts/:id/enroll/csv) with no program-only equivalent, so a
    // real cohort is still required for that path specifically.
    if (method === "csv" && !selCohortId) { setErr("Select a cohort for CSV import. If none exist, please create one in Cohort Management first."); return; }
    setErr("");
    setSaving(true);
    try {
      if (method === "csv" && csvFile) {
        // NOTE: unlike the single-invite path below (invitationsApi.send's
        // `variant`), CSV bulk-enroll has no backend support for attaching
        // the "participant_retail" custom role — enrollCSVService only ever
        // sets the base `role` column. A CSV-imported "Retailer" batch is
        // enrolled as a plain participant today (not restricted like a real
        // Participant Retailer would be) until that's built server-side.
        const res = await cohortsApi.enrollCSV(
          selCohortId,
          csvFile,
          enrollRole === "participant_retailer" ? "participant" : enrollRole,
        );
        setCsvResult({ enrolled: res.data?.success_count ?? 0, failed: res.data?.failed_count ?? 0 });
        onDone();
      } else {
        if (!email.trim()) { setErr("Email is required"); setSaving(false); return; }
        if (!name.trim()) { setErr("Participant name is required"); setSaving(false); return; }
        await invitationsApi.send({
          email: email.trim(),
          role: enrollRole === "participant_retailer" ? "participant" : enrollRole,
          variant: enrollRole === "participant_retailer" ? "participant_retail" : undefined,
          program_id: selProg.id,
          org_id: selProg.org_id,
          cohort_id: selCohortId || undefined,
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
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>
            SELECT COHORT{method === "manual" ? " (OPTIONAL)" : ""}
          </div>
          <select
            value={selCohortId}
            onChange={e => setSelCohortId(e.target.value)}
            disabled={loadingCohorts || cohorts.length === 0}
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: C.navy, outline: "none", background: loadingCohorts || cohorts.length === 0 ? "rgba(24, 40, 72,0.04)" : "#fff" }}
          >
            {loadingCohorts ? (
              <option value="">Loading cohorts...</option>
            ) : cohorts.length === 0 ? (
              <option value="">No cohorts available</option>
            ) : (
              <>
                {method === "manual" && <option value="">No specific cohort — enroll to program</option>}
                {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </>
            )}
          </select>
          {cohorts.length === 0 && !loadingCohorts && selProgId && (
            <div style={{ fontSize: 10, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
              {method === "csv"
                ? <>CSV import needs a cohort — create one from <strong>Cohort Management</strong> first.</>
                : <>No cohorts yet — the participant will be enrolled directly to the program.</>}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>ENROLL METHOD</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(["manual", "csv"] as const).map((m, i) => (
              <div key={m} onClick={() => setMethod(m)} style={{
                padding: 12, borderRadius: 10, cursor: "pointer",
                border: `1.5px solid ${method === m ? C.navy : C.border}`,
                background: method === m ? "rgba(24, 40, 72,0.04)" : "#fff",
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
                background: enrollRole === r.key ? "rgba(74, 85, 115,0.06)" : "#fff",
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

        {err && <div style={{ fontSize: 12, color: C.orange, padding: "8px 12px", background: "rgba(200, 168, 96,0.06)", borderRadius: 8 }}>{err}</div>}
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

// ── Program filter control ─────────────────────────────────────────
// Below the threshold, the existing pill row reads fine at a glance. Above
// it, rendering one pill per program turns into a wall of small buttons
// (the reported bug — orgs with 40-50+ programs), so we swap to a searchable
// dropdown instead. Same selection state either way — presentation-only.
const PROGRAM_PILL_THRESHOLD = 8;

function ProgramFilterDropdown({ programs, selectedId, onSelect, countFor, totalCount, totalLabel = "All Programs" }: {
  programs: ProgramDTO[];
  selectedId: string | null;
  onSelect: (id: string | null) => void; // null = "All Programs"
  countFor: (progId: string) => number;
  totalCount: number;
  totalLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const isAllSelected = selectedId === null;
  const selected = programs.find(p => p.id === selectedId) ?? null;
  const filtered = programs.filter(p => p.title.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const el = document.getElementById("program-filter-dropdown-root");
      if (el && !el.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const triggerLabel = isAllSelected ? totalLabel : (selected?.title.split("–")[0].trim() ?? totalLabel);
  const triggerColor = isAllSelected ? C.navy : (selected ? progColor(selected) : C.navy);
  const triggerCount = isAllSelected ? totalCount : (selected ? countFor(selected.id) : 0);

  return (
    <div id="program-filter-dropdown-root" style={{ position: "relative", width: 280, fontFamily: "Poppins, sans-serif" }}>
      <button
        onClick={() => { setOpen(o => !o); setQuery(""); }}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: `1.5px solid ${open ? triggerColor : C.border}`, borderRadius: 10, background: "#fff", cursor: "pointer", fontFamily: "Poppins, sans-serif" }}
      >
        {!isAllSelected && <div style={{ width: 8, height: 8, borderRadius: "50%", background: triggerColor, flexShrink: 0 }} />}
        <span style={{ flex: 1, textAlign: "left", fontSize: 12, fontWeight: 700, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{triggerLabel}</span>
        <span style={{ fontSize: 10, background: `${triggerColor}18`, color: triggerColor, borderRadius: 99, padding: "1px 7px", fontWeight: 700, flexShrink: 0 }}>{triggerCount}</span>
        <span style={{ fontSize: 9, color: C.muted, flexShrink: 0, transform: open ? "rotate(180deg)" : "none" }}>▼</span>
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, width: "100%", minWidth: 300, background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 8px 32px rgba(24,40,72,0.14)", zIndex: 400, overflow: "hidden" }}>
          <div style={{ padding: 10, borderBottom: `1px solid ${C.border}` }}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search programs…"
              style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "Poppins, sans-serif", color: C.navy, outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", border: "none", borderBottom: `1px solid ${C.bg}`, background: isAllSelected ? `${C.navy}0d` : "#fff", cursor: "pointer", textAlign: "left", fontFamily: "Poppins, sans-serif" }}
            >
              <span style={{ flex: 1, fontSize: 12, fontWeight: isAllSelected ? 700 : 500, color: C.navy }}>{totalLabel}</span>
              <span style={{ fontSize: 10, background: isAllSelected ? `${C.navy}22` : C.bg, color: isAllSelected ? C.navy : C.muted, borderRadius: 99, padding: "1px 7px", fontWeight: 700 }}>{totalCount}</span>
            </button>
            {filtered.length === 0 && (
              <div style={{ padding: "14px 12px", fontSize: 11, color: C.muted, textAlign: "center" }}>No programs match &ldquo;{query}&rdquo;.</div>
            )}
            {filtered.map((p) => {
              const active = selectedId === p.id;
              const col = progColor(p);
              const count = countFor(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p.id); setOpen(false); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", border: "none", borderBottom: `1px solid ${C.bg}`, background: active ? `${col}0d` : "#fff", cursor: "pointer", textAlign: "left", fontFamily: "Poppins, sans-serif" }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: col, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: active ? 700 : 500, color: active ? col : C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</span>
                  <span style={{ fontSize: 10, background: active ? `${col}22` : C.bg, color: active ? col : C.muted, borderRadius: 99, padding: "1px 7px", fontWeight: 700, flexShrink: 0 }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
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

      {/* Program selector — small counts keep the pill row (quick at-a-glance
          switching); above PROGRAM_PILL_THRESHOLD swap to a searchable
          dropdown so orgs with 40-50 programs get a scannable list instead
          of a wall of tiny buttons. */}
      {!loading && programs.length > 0 && (
        programs.length > PROGRAM_PILL_THRESHOLD ? (
          <ProgramFilterDropdown
            programs={programs}
            selectedId={isAll ? null : (activeProg?.id ?? null)}
            onSelect={(id) => setSelProgId(id ?? ALL_ID)}
            countFor={(progId) => participantsForProg(progId).length}
            totalCount={programs.reduce((sum, p) => sum + participantsForProg(p.id).length, 0)}
          />
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setSelProgId(ALL_ID)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", border: `1.5px solid ${isAll ? C.navy : C.border}`, borderRadius: 10, background: isAll ? "rgba(24, 40, 72,0.05)" : "#fff", cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>
              <span style={{ fontSize: 12, fontWeight: isAll ? 700 : 400, color: isAll ? C.navy : C.muted, whiteSpace: "nowrap" }}>All Programs</span>
              <span style={{ fontSize: 10, background: isAll ? "rgba(24, 40, 72,0.1)" : C.bg, color: isAll ? C.navy : C.muted, borderRadius: 99, padding: "1px 7px", fontWeight: 700 }}>
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
        )
      )}

      {!loading && programs.length === 0 && (
        <div style={{ padding: 48, textAlign: "center", color: C.muted, fontSize: 13, background: "#fff", borderRadius: 12, border: `1px solid ${C.border}` }}>
          No programs found. Create a program first.
        </div>
      )}

      {/* Participant table */}
      {!loading && (isAll || activeProg) && (
        <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)", border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", background: "#F9FAFB", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.navy }}>All Participants</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {isAll ? "Everyone across all programs, all cohorts, including those not yet assigned" : `Everyone in ${activeProg?.title}, across all cohorts, including those not yet assigned`}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, background: "rgba(24, 40, 72,0.06)", color: C.navy, borderRadius: 99, padding: "3px 12px", fontWeight: 700 }}>{progParticipants.length} total</span>
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
                      <td style={{ padding: "11px 16px", minWidth: 130 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ flex: 1, height: 5, background: "#EFE9DC", borderRadius: 99 }}><div style={{ height: "100%", width: `${p.completion_percent}%`, background: cc, borderRadius: 99 }} /></div><span style={{ fontSize: 11, fontWeight: 700, color: C.navy, minWidth: 30 }}>{p.completion_percent}%</span></div></td>
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
