"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cohortsApi, CohortDTO, ParticipantInput, GroupDTO } from "@/lib/cohorts-api";
import { analyticsApi, ParticipantProgress } from "@/lib/analytics-api";
import { programsApi, ProgramDTO } from "@/lib/programs-api";

// ── Design tokens ──────────────────────────────────────────────────
const C = {
  navy: "#1C2551", orange: "#EF4E24", indigo: "#6B73BF",
  bg: "#F5F7FB", card: "#fff", border: "#EAECF4", muted: "#8b90a7",
};

const S = {
  primBtn: { padding: "9px 20px", background: C.orange, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif" } as React.CSSProperties,
  secBtn:  { padding: "8px 16px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.navy, fontFamily: "Poppins, sans-serif" } as React.CSSProperties,
  iconBtn: { padding: "5px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", fontSize: 11, color: C.navy, fontFamily: "Poppins, sans-serif", fontWeight: 600 } as React.CSSProperties,
};

const RISK_COLOR: Record<string, string> = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444" };
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  enrolled:  { bg: "rgba(28,37,81,0.08)",    color: C.navy },
  invited:   { bg: "rgba(139,144,167,0.1)",  color: C.muted },
  active:    { bg: "rgba(107,115,191,0.12)", color: C.indigo },
  completed: { bg: "rgba(34,197,94,0.12)",   color: "#22c55e" },
  withdrawn: { bg: "rgba(139,144,167,0.1)",  color: C.muted },
  on_hold:   { bg: "rgba(245,158,11,0.12)",  color: "#f59e0b" },
};

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function initials(n: string) {
  return n.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}
function avatarBg(n: string) {
  const colors = [C.navy, C.indigo, C.orange, "#22c55e", "#f59e0b", "#0ea5e9"];
  let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % colors.length;
  return colors[h];
}

// ── Overlay ────────────────────────────────────────────────────────
function Overlay({ children, onClose, maxWidth = 480 }: { children: React.ReactNode; onClose: () => void; maxWidth?: number }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth, maxHeight: "88vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        {children}
      </div>
    </div>
  );
}

// ── New Cohort Modal ───────────────────────────────────────────────
function NewCohortModal({ orgId, onClose, onCreated }: { orgId: string; onClose: () => void; onCreated: (c: CohortDTO) => void }) {
  const [programs, setPrograms] = useState<ProgramDTO[]>([]);
  const [selProgId, setSelProgId] = useState("");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [maxSeats, setMaxSeats] = useState(50);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    programsApi.list(orgId).then(r => setPrograms((r.data ?? []).filter(p => p.status !== "archived"))).catch(() => {});
  }, [orgId]);

  async function submit() {
    if (!selProgId) { setErr("Select a program"); return; }
    if (!name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr("");
    try {
      const res = await cohortsApi.create(orgId, { program_id: selProgId, name, start_date: startDate || undefined, end_date: endDate || undefined, max_seats: maxSeats });
      onCreated(res.data);
    } catch (e: unknown) { setErr((e as Error).message || "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>New Cohort</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Select a program and configure this cohort.</div>
      </div>
      <div style={{ padding: "16px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>PROGRAM *</div>
          {programs.length === 0
            ? <div style={{ fontSize: 12, color: C.orange }}>No active programs. Create a program first.</div>
            : programs.map(p => (
              <div key={p.id} onClick={() => { setSelProgId(p.id); if (!name) setName(`${p.title} – Batch 1`); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, cursor: "pointer", border: `1.5px solid ${selProgId === p.id ? p.color : C.border}`, background: selProgId === p.id ? `${p.color}10` : "#fff", marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.navy }}>{p.title}</div>
                {selProgId === p.id && <span style={{ color: p.color, fontWeight: 700 }}>✓</span>}
              </div>
            ))
          }
        </div>
        {selProgId && <>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>COHORT NAME *</div>
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: C.navy, boxSizing: "border-box", outline: "none" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>START DATE</div>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: C.navy, boxSizing: "border-box", outline: "none" }} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>END DATE</div>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: C.navy, boxSizing: "border-box", outline: "none" }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>MAX SEATS</div>
            <input type="number" min={1} max={500} value={maxSeats} onChange={e => setMaxSeats(Number(e.target.value))}
              style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: C.navy, boxSizing: "border-box", outline: "none" }} />
          </div>
        </>}
        {err && <div style={{ fontSize: 12, color: C.orange, padding: "8px 12px", background: "rgba(239,78,36,0.06)", borderRadius: 8 }}>{err}</div>}
      </div>
      <div style={{ padding: "12px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
        <button onClick={onClose} style={S.secBtn}>Cancel</button>
        <button onClick={submit} disabled={saving || !selProgId || !name.trim()} style={{ ...S.primBtn, background: C.navy, opacity: saving || !selProgId || !name.trim() ? 0.5 : 1 }}>
          {saving ? "Creating…" : "Create Cohort"}
        </button>
      </div>
    </Overlay>
  );
}

// ── Enroll Participants Modal ───────────────────────────────────────
function EnrollModal({ cohortId, cohortName, onClose, onDone }: { cohortId: string; cohortName: string; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<ParticipantInput[]>([{ name: "", email: "", department: "" }]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ enrolled: number; already_in: number; failed: number } | null>(null);
  const [err, setErr] = useState("");

  function update(i: number, field: keyof ParticipantInput, val: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }
  function addRow() { setRows(prev => [...prev, { name: "", email: "", department: "" }]); }
  function removeRow(i: number) { if (rows.length > 1) setRows(prev => prev.filter((_, idx) => idx !== i)); }

  async function submit() {
    const valid = rows.filter(r => r.name.trim() && r.email.trim());
    if (!valid.length) { setErr("Add at least one participant with name and email"); return; }
    setSaving(true); setErr("");
    try {
      const res = await cohortsApi.enrollByEmail(cohortId, valid);
      setResult(res.data);
      onDone();
    } catch (e: unknown) { setErr((e as Error).message || "Failed"); }
    finally { setSaving(false); }
  }

  if (result) return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "40px 28px", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 16 }}>Enrollment Complete</div>
        <div style={{ display: "flex", gap: 20, justifyContent: "center", marginBottom: 24 }}>
          {[["Enrolled", result.enrolled, "#22c55e"], ["Already in", result.already_in, C.indigo], ["Failed", result.failed, C.orange]].map(([l, v, col]) => (
            <div key={String(l)} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: String(col) }}>{v}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{l}</div>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={S.primBtn}>Done</button>
      </div>
    </Overlay>
  );

  return (
    <Overlay onClose={onClose} maxWidth={560}>
      <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>+ Enroll Participants</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Cohort: <strong style={{ color: C.navy }}>{cohortName}</strong></div>
      </div>
      <div style={{ padding: "16px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
            {(["name", "email", "department"] as const).map(field => (
              <div key={field}>
                {i === 0 && <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 4 }}>{field.toUpperCase()}{field !== "department" ? " *" : ""}</div>}
                <input
                  type={field === "email" ? "email" : "text"}
                  value={row[field] ?? ""}
                  onChange={e => update(i, field, e.target.value)}
                  placeholder={field === "name" ? "Full name" : field === "email" ? "email@co.com" : "Dept (optional)"}
                  style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "Poppins, sans-serif", color: C.navy, boxSizing: "border-box", outline: "none" }}
                />
              </div>
            ))}
            <button onClick={() => removeRow(i)} style={{ ...S.iconBtn, color: rows.length === 1 ? C.border : "#ef4444", cursor: rows.length === 1 ? "default" : "pointer", padding: "8px 10px" }}>✕</button>
          </div>
        ))}
        <button onClick={addRow} style={{ fontSize: 12, color: C.navy, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "4px 0", fontFamily: "Poppins, sans-serif", fontWeight: 600 }}>+ Add another</button>
        {err && <div style={{ fontSize: 12, color: C.orange, padding: "8px 12px", background: "rgba(239,78,36,0.06)", borderRadius: 8 }}>{err}</div>}
      </div>
      <div style={{ padding: "12px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
        <button onClick={onClose} style={S.secBtn}>Cancel</button>
        <button onClick={submit} disabled={saving} style={{ ...S.primBtn, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Enrolling…" : `Enroll ${rows.filter(r => r.name && r.email).length || ""} Participant${rows.filter(r => r.name && r.email).length === 1 ? "" : "s"}`}
        </button>
      </div>
    </Overlay>
  );
}

// ── CSV Import Modal ───────────────────────────────────────────────
function CSVModal({ cohortId, cohortName, onClose, onDone }: { cohortId: string; cohortName: string; onClose: () => void; onDone: () => void }) {
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success_count: number; failed_count: number; errors: { email: string; reason: string }[] } | null>(null);

  async function upload(f: File) {
    setFile(f); setUploading(true);
    try {
      const res = await cohortsApi.enrollCSV(cohortId, f);
      setResult(res.data);
      onDone();
    } finally { setUploading(false); }
  }

  if (result) return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "40px 28px", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 16 }}>Import Complete</div>
        <div style={{ display: "flex", gap: 20, justifyContent: "center", marginBottom: result.errors.length ? 16 : 24 }}>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 26, fontWeight: 800, color: "#22c55e" }}>{result.success_count}</div><div style={{ fontSize: 11, color: C.muted }}>Enrolled</div></div>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 26, fontWeight: 800, color: C.orange }}>{result.failed_count}</div><div style={{ fontSize: 11, color: C.muted }}>Failed</div></div>
        </div>
        {result.errors.length > 0 && (
          <div style={{ textAlign: "left", maxHeight: 140, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 16, fontSize: 11, color: C.muted }}>
            {result.errors.map((e, i) => (
              <div key={i} style={{ padding: "6px 12px", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ color: C.navy, fontWeight: 600 }}>{e.email || "—"}</span> — {e.reason}
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} style={S.primBtn}>Done</button>
      </div>
    </Overlay>
  );

  return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>Import CSV</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Cohort: <strong style={{ color: C.navy }}>{cohortName}</strong></div>
      </div>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
          onClick={() => document.getElementById("csv-upload")?.click()}
          style={{ border: `2px dashed ${drag ? C.navy : C.border}`, borderRadius: 10, padding: "32px 20px", textAlign: "center", cursor: "pointer", background: drag ? "rgba(28,37,81,0.03)" : C.bg, transition: "all 0.15s" }}
        >
          {uploading
            ? <div style={{ fontSize: 13, color: C.muted }}>Uploading {file?.name}…</div>
            : <>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>Drop CSV here or click to browse</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Required columns: name, email. Optional: department, seniority, function, location.</div>
            </>
          }
          <input id="csv-upload" type="file" accept=".csv" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </div>
      </div>
      <div style={{ padding: "12px 24px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
        <button onClick={onClose} style={S.secBtn}>Cancel</button>
      </div>
    </Overlay>
  );
}

// ── Actions dropdown on each row ───────────────────────────────────
function RowActions({ enrollment_status, onWithdraw }: { enrollment_status: string; onWithdraw: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{ ...S.iconBtn, width: 28, height: 28, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⋮</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 100 }} />
          <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 200, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 32px rgba(28,37,81,0.14)", minWidth: 170, overflow: "hidden" }}>
            {[
              { label: "View Profile", action: () => {} },
              { label: "Resend Welcome Email", action: () => {} },
              ...(enrollment_status !== "withdrawn" ? [{ label: "Withdraw", action: onWithdraw, danger: true }] : []),
            ].map(({ label, action, danger }) => (
              <button key={label} onClick={() => { setOpen(false); action(); }}
                style={{ display: "block", width: "100%", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: danger ? "#dc2626" : C.navy, textAlign: "left", fontFamily: "Poppins, sans-serif", fontWeight: 500 }}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────
export default function CohortManagement({ orgId }: { orgId: string }) {
  const [cohorts, setCohorts]     = useState<CohortDTO[]>([]);
  const [selId, setSelId]         = useState<string | null>(null);
  const [tab, setTab]             = useState<"participants" | "groups">("participants");
  const [participants, setParticipants] = useState<ParticipantProgress[]>([]);
  const [groups, setGroups]       = useState<GroupDTO[]>([]);
  const [loadingC, setLoadingC]   = useState(true);
  const [loadingP, setLoadingP]   = useState(false);
  const [loadingG, setLoadingG]   = useState(false);
  const [showCreate, setShowCreate]   = useState(false);
  const [showEnroll, setShowEnroll]   = useState(false);
  const [showCSV, setShowCSV]         = useState(false);
  const [showMakeGroups, setShowMakeGroups] = useState(false);

  const selCohort = cohorts.find(c => c.id === selId) ?? null;

  const loadCohorts = useCallback(async (keepSelection = false) => {
    setLoadingC(true);
    try {
      const res = await cohortsApi.list(orgId);
      const list = res.data ?? [];
      setCohorts(list);
      if (list.length > 0) {
        setSelId(prev => {
          if (!keepSelection || !prev) return list[0].id;
          return list.find(c => c.id === prev) ? prev : list[0].id;
        });
      }
    } finally { setLoadingC(false); }
  }, [orgId]);

  const loadParticipants = useCallback(async (cohortId: string) => {
    setLoadingP(true);
    setParticipants([]);
    try {
      const res = await analyticsApi.cohortProgress(cohortId);
      setParticipants(res.data?.participants ?? []);
    } finally { setLoadingP(false); }
  }, []);

  const loadGroups = useCallback(async (cohortId: string) => {
    setLoadingG(true);
    setGroups([]);
    try {
      const res = await cohortsApi.listGroups(cohortId);
      setGroups(res.data ?? []);
    } finally { setLoadingG(false); }
  }, []);

  useEffect(() => { loadCohorts(false); }, [loadCohorts]);
  useEffect(() => {
    if (!selId) return;
    loadParticipants(selId);
    loadGroups(selId);
  }, [selId, loadParticipants, loadGroups]);

  async function handleWithdraw(userId: string) {
    // find enrollment from the participants list via userId — update its status
    if (!selId) return;
    // We need the enrollmentId — fetch participants list from cohorts endpoint
    try {
      const res = await cohortsApi.listParticipants(selId);
      const match = (res.data ?? []).find(p => p.user_id === userId);
      if (!match) return;
      await cohortsApi.updateEnrollment(selId, match.enrollment_id, { status: "withdrawn" });
      loadParticipants(selId);
    } catch { /* ignore */ }
  }

  if (!orgId) return (
    <div style={{ padding: 48, textAlign: "center", color: C.muted, fontSize: 14, fontFamily: "Poppins, sans-serif" }}>
      Your account is not linked to an organization.
    </div>
  );

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif" }}>

      {/* Cohort pill selector */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {loadingC
          ? <span style={{ fontSize: 12, color: C.muted }}>Loading cohorts…</span>
          : cohorts.map(c => (
            <button key={c.id} onClick={() => setSelId(c.id)} style={{
              padding: "7px 16px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontFamily: "Poppins, sans-serif",
              border: `1.5px solid ${c.id === selId ? C.navy : C.border}`,
              background: c.id === selId ? C.navy : "#fff",
              color: c.id === selId ? "#fff" : C.muted,
              fontWeight: c.id === selId ? 700 : 400,
            }}>
              {c.name} <span style={{ fontSize: 10, opacity: 0.65 }}>{c.enrolled_count}/{c.max_seats}</span>
            </button>
          ))
        }
        <button onClick={() => setShowCreate(true)} style={{ padding: "7px 14px", borderRadius: 20, cursor: "pointer", border: `1px solid ${C.border}`, background: "#fff", color: C.navy, fontSize: 12, fontFamily: "Poppins, sans-serif" }}>
          + New Cohort
        </button>
      </div>

      {/* Tab bar + action bar */}
      {selCohort && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {(["participants", "groups"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: "Poppins, sans-serif",
                border: `1px solid ${tab === t ? C.navy : C.border}`,
                background: tab === t ? C.navy : "#fff",
                color: tab === t ? "#fff" : C.muted,
                fontWeight: tab === t ? 700 : 400,
              }}>
                {t === "participants" ? "Participants" : "Groups"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {tab === "participants" && <>
              <button onClick={() => setShowCSV(true)} style={S.secBtn}>Import CSV</button>
              <button onClick={() => setShowEnroll(true)} style={S.primBtn}>+ Enroll Participants</button>
            </>}
            {tab === "groups" && (
              groups.length > 0
                ? <button onClick={() => setShowMakeGroups(true)} style={S.secBtn}>Re-shuffle Groups</button>
                : <button onClick={() => setShowMakeGroups(true)} style={S.primBtn}>Create Groups</button>
            )}
          </div>
        </div>
      )}

      {/* Participant table */}
      <div style={{ display: tab === "participants" ? "block" : "none" }}>
      <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.bg }}>
              {["Participant", "Department", "Enrolled", "Completion", "Risk", "Status", ""].map(h => (
                <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5, fontFamily: "Poppins, sans-serif", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingP ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", fontSize: 13, color: C.muted }}>Loading participants…</td></tr>
            ) : participants.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 52, textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>No participants yet in this cohort.</div>
                  <button onClick={() => setShowEnroll(true)} style={S.primBtn}>+ Enroll Participants</button>
                </td>
              </tr>
            ) : participants.map(p => {
              const riskColor = RISK_COLOR[p.risk_level] ?? "#22c55e";
              const ss = STATUS_STYLE[p.enrollment_status] ?? STATUS_STYLE.enrolled;
              const pct = Math.round(p.completion_percent);
              return (
                <tr key={p.user_id}
                  style={{ borderTop: `1px solid ${C.border}` }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#FAFBFD")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  {/* Participant */}
                  <td style={{ padding: "11px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: avatarBg(p.name), color: "#fff", fontWeight: 700, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {initials(p.name)}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>{p.email}</div>
                      </div>
                    </div>
                  </td>
                  {/* Department */}
                  <td style={{ padding: "11px 16px", fontSize: 12, color: C.muted }}>{p.department || "—"}</td>
                  {/* Enrolled date */}
                  <td style={{ padding: "11px 16px", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{p.enrolled_at ? fmt(p.enrolled_at) : "—"}</td>
                  {/* Completion */}
                  <td style={{ padding: "11px 16px", minWidth: 120 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: "#F0F1F7", borderRadius: 99 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? "#22c55e" : C.orange, borderRadius: 99 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.navy, minWidth: 32 }}>{pct}%</span>
                    </div>
                  </td>
                  {/* Risk */}
                  <td style={{ padding: "11px 16px" }}>
                    <span style={{ background: `${riskColor}14`, color: riskColor, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px" }}>
                      {p.risk_level.charAt(0).toUpperCase() + p.risk_level.slice(1)}
                    </span>
                  </td>
                  {/* Status */}
                  <td style={{ padding: "11px 16px" }}>
                    <span style={{ background: ss.bg, color: ss.color, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px", textDecoration: p.enrollment_status === "withdrawn" ? "line-through" : "none" }}>
                      {p.enrollment_status.charAt(0).toUpperCase() + p.enrollment_status.slice(1).replace("_", " ")}
                    </span>
                  </td>
                  {/* Actions */}
                  <td style={{ padding: "11px 16px" }}>
                    <RowActions enrollment_status={p.enrollment_status} onWithdraw={() => handleWithdraw(p.user_id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>

      {/* Groups tab */}
      {tab === "groups" && (
        <div>
          {loadingG ? (
            <div style={{ padding: 48, textAlign: "center", fontSize: 13, color: C.muted }}>Loading groups…</div>
          ) : groups.length === 0 ? (
            <div style={{ padding: 52, textAlign: "center", background: "#fff", borderRadius: 12, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>⬡</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.navy, marginBottom: 4 }}>No groups yet</div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Create groups to split cohort participants into Coaching Circles, Peer Triads, or ALS Teams.</div>
              <button onClick={() => setShowMakeGroups(true)} style={S.primBtn}>Create Groups</button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {groups.map(g => (
                <div key={g.id} style={{ background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{g.name}</div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{g.members.length} member{g.members.length !== 1 ? "s" : ""} · {g.group_type.replace("_", " ")}</div>
                    </div>
                    <button onClick={async () => {
                      if (!selId) return;
                      await cohortsApi.deleteGroup(selId, g.id);
                      loadGroups(selId);
                    }} style={{ ...S.iconBtn, color: "#ef4444", fontSize: 11 }}>Delete</button>
                  </div>
                  <div style={{ padding: "8px 0" }}>
                    {g.members.length === 0
                      ? <div style={{ padding: "12px 16px", fontSize: 12, color: C.muted }}>No members assigned</div>
                      : g.members.map(m => (
                        <div key={m.enrollment_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 16px" }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: avatarBg(m.name), color: "#fff", fontWeight: 700, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {initials(m.name)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                            <div style={{ fontSize: 10, color: C.muted }}>{m.department ?? m.email}</div>
                          </div>
                          <button onClick={async () => {
                            if (!selId) return;
                            await cohortsApi.moveMember(selId, { enrollment_id: m.enrollment_id, to_group_id: "" });
                            loadGroups(selId);
                          }} style={{ ...S.iconBtn, fontSize: 10, color: C.muted, padding: "3px 7px" }}>✕</button>
                        </div>
                      ))
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <NewCohortModal orgId={orgId} onClose={() => setShowCreate(false)}
          onCreated={c => { setCohorts(prev => [c, ...prev]); setSelId(c.id); setShowCreate(false); }} />
      )}
      {showEnroll && selCohort && (
        <EnrollModal cohortId={selId!} cohortName={selCohort.name}
          onClose={() => setShowEnroll(false)}
          onDone={() => { loadParticipants(selId!); loadCohorts(true); setShowEnroll(false); }} />
      )}
      {showCSV && selCohort && (
        <CSVModal cohortId={selId!} cohortName={selCohort.name}
          onClose={() => setShowCSV(false)}
          onDone={() => { loadParticipants(selId!); loadCohorts(true); }} />
      )}
      {showMakeGroups && selCohort && (
        <MakeGroupsModal
          cohortId={selId!}
          cohortName={selCohort.name}
          existingCount={groups.length}
          onClose={() => setShowMakeGroups(false)}
          onDone={() => { loadGroups(selId!); setShowMakeGroups(false); setTab("groups"); }}
        />
      )}
    </div>
  );
}

// ── Make Groups Modal ──────────────────────────────────────────────
function MakeGroupsModal({ cohortId, cohortName, existingCount, onClose, onDone }: {
  cohortId: string; cohortName: string; existingCount: number; onClose: () => void; onDone: () => void;
}) {
  const isReshuffle = existingCount > 0;
  const [count, setCount]       = useState(existingCount > 0 ? existingCount : 3);
  const [prefix, setPrefix]     = useState("");
  const [groupType, setGroupType] = useState("coaching_circle");
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");

  async function submit() {
    if (count < 2) { setErr("Minimum 2 groups"); return; }
    setSaving(true); setErr("");
    try {
      if (isReshuffle) {
        await cohortsApi.reshuffleGroups(cohortId, { count, name_prefix: prefix || undefined, group_type: groupType });
      } else {
        await cohortsApi.createGroups(cohortId, { count, name_prefix: prefix || undefined, group_type: groupType });
      }
      onDone();
    } catch (e: unknown) { setErr((e as Error).message || "Failed"); }
    finally { setSaving(false); }
  }

  const TYPE_LABELS: Record<string, string> = {
    coaching_circle: "Coaching Circles",
    peer_triad: "Peer Triads",
    als_team: "ALS Teams",
    custom: "Custom",
  };

  return (
    <Overlay onClose={onClose} maxWidth={400}>
      <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{isReshuffle ? "Re-shuffle Groups" : "Create Groups"}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{cohortName}</div>
        {isReshuffle && <div style={{ marginTop: 8, fontSize: 11, color: C.orange, background: "rgba(239,78,36,0.06)", borderRadius: 8, padding: "7px 10px" }}>
          This will delete all {existingCount} existing groups and re-assign everyone randomly.
        </div>}
      </div>
      <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>GROUP TYPE</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {Object.entries(TYPE_LABELS).map(([val, lbl]) => (
              <button key={val} onClick={() => setGroupType(val)} style={{
                padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: "Poppins, sans-serif",
                border: `1.5px solid ${groupType === val ? C.navy : C.border}`,
                background: groupType === val ? "rgba(28,37,81,0.05)" : "#fff",
                color: groupType === val ? C.navy : C.muted,
                fontWeight: groupType === val ? 700 : 400, textAlign: "left",
              }}>{lbl}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>NUMBER OF GROUPS *</div>
          <input type="number" min={2} max={50} value={count} onChange={e => setCount(Number(e.target.value))}
            style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: C.navy, boxSizing: "border-box", outline: "none" }} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>NAME PREFIX <span style={{ fontWeight: 400 }}>(optional)</span></div>
          <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder={`e.g. "Circle" → Circle 1, Circle 2…`}
            style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: C.navy, boxSizing: "border-box", outline: "none" }} />
        </div>
        {err && <div style={{ fontSize: 12, color: C.orange, padding: "8px 12px", background: "rgba(239,78,36,0.06)", borderRadius: 8 }}>{err}</div>}
      </div>
      <div style={{ padding: "12px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
        <button onClick={onClose} style={S.secBtn}>Cancel</button>
        <button onClick={submit} disabled={saving} style={{ ...S.primBtn, background: C.navy, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Working…" : isReshuffle ? "Re-shuffle" : `Create ${count} Groups`}
        </button>
      </div>
    </Overlay>
  );
}
