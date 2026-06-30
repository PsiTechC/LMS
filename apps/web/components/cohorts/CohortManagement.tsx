"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  cohortsApi, CohortDTO, ParticipantDTO, PoolParticipantDTO, ParticipantInput,
} from "@/lib/cohorts-api";
import { programsApi, ProgramDTO } from "@/lib/programs-api";

// ── Design tokens ───────────────────────────────────────────────────
const C = {
  navy: "#1C2551", orange: "#EF4E24", indigo: "#6B73BF",
  bg: "#F5F7FB", card: "#fff", border: "#EAECF4", muted: "#8b90a7",
};
const S = {
  primBtn: { padding: "9px 20px", background: C.orange, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif" } as React.CSSProperties,
  secBtn: { padding: "8px 16px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.navy, fontFamily: "Poppins, sans-serif" } as React.CSSProperties,
  navyBtn: { padding: "8px 16px", background: C.navy, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif" } as React.CSSProperties,
};

function initials(n: string) { return n.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join(""); }
function avatarBg(n: string) {
  const cols = [C.navy, C.indigo, C.orange, "#22c55e", "#f59e0b", "#0ea5e9"];
  let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % cols.length;
  return cols[h];
}

// ── Overlay ─────────────────────────────────────────────────────────
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

// ── Participant card (shared between pool and cohort lanes) ──────────
interface CardData { user_id: string; name: string; email: string; department?: string | null; enrollment_id?: string; }

function ParticipantCard({ p, dragging, onDragStart }: { p: CardData; dragging: boolean; onDragStart: () => void }) {
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
        background: dragging ? `${C.indigo}10` : C.card,
        border: `1px solid ${dragging ? C.indigo : C.border}`,
        borderRadius: 8, cursor: "grab", userSelect: "none",
        opacity: dragging ? 0.55 : 1, transition: "opacity 0.12s",
      }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: avatarBg(p.name), color: "#fff", fontWeight: 700, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {initials(p.name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
        {p.department && <div style={{ fontSize: 10, color: C.muted }}>{p.department}</div>}
      </div>
    </div>
  );
}

// ── Drop lane ────────────────────────────────────────────────────────
function DropLane({ label, color, count, maxSeats, children, onDrop, highlight }: {
  label: string; color?: string; count: number; maxSeats?: number;
  children: React.ReactNode; onDrop: () => void; highlight: boolean;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop(); }}
      style={{
        minWidth: 220, width: 220, flexShrink: 0,
        background: over || highlight ? `${C.indigo}08` : C.bg,
        border: `1.5px dashed ${over ? C.indigo : highlight ? `${C.indigo}50` : C.border}`,
        borderRadius: 12, display: "flex", flexDirection: "column", transition: "all 0.12s",
      }}>
      {/* Lane header */}
      <div style={{ padding: "10px 12px 8px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {color && <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />}
          <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
          <div style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>
            {count}{maxSeats ? `/${maxSeats}` : ""}
          </div>
        </div>
      </div>
      {/* Cards */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6, minHeight: 80 }}>
        {children}
        {over && (
          <div style={{ borderRadius: 8, border: `2px dashed ${C.indigo}`, height: 38, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.indigo, fontWeight: 600 }}>Drop here</div>
        )}
      </div>
    </div>
  );
}

// ── Create Cohort Modal ──────────────────────────────────────────────
function CreateCohortModal({ orgId, programs, onClose, onCreated }: {
  orgId: string; programs: ProgramDTO[]; onClose: () => void; onCreated: (c: CohortDTO) => void;
}) {
  const [selProgId, setSelProgId] = useState(programs[0]?.id ?? "");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [maxSeats, setMaxSeats] = useState(50);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

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
      </div>
      <div style={{ padding: "16px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>PROGRAM *</div>
          {programs.map(p => (
            <div key={p.id} onClick={() => { setSelProgId(p.id); if (!name) setName(`${p.title} – Batch 1`); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, cursor: "pointer", border: `1.5px solid ${selProgId === p.id ? p.color : C.border}`, background: selProgId === p.id ? `${p.color}10` : "#fff", marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.navy }}>{p.title}</div>
              {selProgId === p.id && <span style={{ color: p.color }}>✓</span>}
            </div>
          ))}
        </div>
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
        {err && <div style={{ fontSize: 12, color: C.orange, padding: "8px 12px", background: "rgba(239,78,36,0.06)", borderRadius: 8 }}>{err}</div>}
      </div>
      <div style={{ padding: "12px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
        <button onClick={onClose} style={S.secBtn}>Cancel</button>
        <button onClick={submit} disabled={saving || !selProgId || !name.trim()} style={{ ...S.navyBtn, opacity: saving || !selProgId || !name.trim() ? 0.5 : 1 }}>
          {saving ? "Creating…" : "Create Cohort"}
        </button>
      </div>
    </Overlay>
  );
}

// ── Enroll Modal (manual name+email) ────────────────────────────────
function EnrollModal({ cohortId, cohortName, onClose, onDone }: { cohortId: string; cohortName: string; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<ParticipantInput[]>([{ name: "", email: "", department: "" }]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ enrolled: number; already_in: number; failed: number } | null>(null);
  const [err, setErr] = useState("");

  function update(i: number, field: keyof ParticipantInput, val: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  async function submit() {
    const valid = rows.filter(r => r.name.trim() && r.email.trim());
    if (!valid.length) { setErr("Add at least one participant with name and email"); return; }
    setSaving(true); setErr("");
    try {
      const res = await cohortsApi.enrollByEmail(cohortId, valid);
      setResult(res.data); onDone();
    } catch (e: unknown) { setErr((e as Error).message || "Failed"); }
    finally { setSaving(false); }
  }

  if (result) return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "40px 28px", textAlign: "center" }}>
        <div style={{ fontSize: 30, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 16 }}>Enrolled</div>
        <div style={{ display: "flex", gap: 20, justifyContent: "center", marginBottom: 24 }}>
          {[["Enrolled", result.enrolled, "#22c55e"], ["Already in", result.already_in, C.indigo], ["Failed", result.failed, C.orange]].map(([l, v, col]) => (
            <div key={String(l)} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: String(col) }}>{v}</div>
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
        <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>Invite Participants</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>→ <strong style={{ color: C.navy }}>{cohortName}</strong></div>
      </div>
      <div style={{ padding: "16px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
            {(["name", "email", "department"] as const).map(field => (
              <div key={field}>
                {i === 0 && <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 4 }}>{field.toUpperCase()}{field !== "department" ? " *" : ""}</div>}
                <input type={field === "email" ? "email" : "text"} value={row[field] ?? ""} onChange={e => update(i, field, e.target.value)}
                  placeholder={field === "name" ? "Full name" : field === "email" ? "email@co.com" : "Dept"}
                  style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "Poppins, sans-serif", color: C.navy, boxSizing: "border-box", outline: "none" }} />
              </div>
            ))}
            <button onClick={() => { if (rows.length > 1) setRows(prev => prev.filter((_, idx) => idx !== i)); }}
              style={{ ...S.secBtn, color: rows.length === 1 ? C.border : "#ef4444", padding: "8px 10px" }}>✕</button>
          </div>
        ))}
        <button onClick={() => setRows(prev => [...prev, { name: "", email: "", department: "" }])}
          style={{ fontSize: 12, color: C.navy, background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "Poppins, sans-serif", fontWeight: 600 }}>+ Add row</button>
        {err && <div style={{ fontSize: 12, color: C.orange, padding: "8px 12px", background: "rgba(239,78,36,0.06)", borderRadius: 8 }}>{err}</div>}
      </div>
      <div style={{ padding: "12px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
        <button onClick={onClose} style={S.secBtn}>Cancel</button>
        <button onClick={submit} disabled={saving} style={{ ...S.primBtn, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Inviting…" : "Invite"}
        </button>
      </div>
    </Overlay>
  );
}

// ── Random Distribute Confirm Modal ─────────────────────────────────
function DistributeModal({ programId, cohorts, onClose, onDone }: {
  programId: string; cohorts: CohortDTO[]; onClose: () => void; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ distributed: number; per_cohort: number } | null>(null);

  async function run() {
    setBusy(true);
    try {
      const res = await cohortsApi.randomDistribute(programId);
      setResult(res.data); onDone();
    } finally { setBusy(false); }
  }

  if (result) return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "40px 28px", textAlign: "center" }}>
        <div style={{ fontSize: 30, marginBottom: 12 }}>🎲</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Distributed!</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
          <b style={{ color: C.navy, fontSize: 20 }}>{result.distributed}</b> participants shuffled across <b style={{ color: C.navy }}>{cohorts.length}</b> cohorts (~{result.per_cohort} each)
        </div>
        <button onClick={onClose} style={S.primBtn}>Done</button>
      </div>
    </Overlay>
  );

  return (
    <Overlay onClose={onClose} maxWidth={400}>
      <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>🎲 Random Distribute</div>
      </div>
      <div style={{ padding: "16px 24px" }}>
        <div style={{ fontSize: 13, color: C.navy, marginBottom: 12, lineHeight: 1.6 }}>
          All enrolled participants in this program will be <strong>randomly shuffled</strong> and evenly distributed across these {cohorts.length} cohorts:
        </div>
        {cohorts.map(c => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: C.bg, marginBottom: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.navy }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>{c.name}</div>
            <div style={{ fontSize: 10, color: C.muted, marginLeft: "auto" }}>{c.enrolled_count} enrolled</div>
          </div>
        ))}
        <div style={{ marginTop: 14, fontSize: 11, color: C.orange, background: "rgba(239,78,36,0.06)", borderRadius: 8, padding: "8px 12px" }}>
          Current cohort assignments will be reset before redistributing.
        </div>
      </div>
      <div style={{ padding: "12px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
        <button onClick={onClose} style={S.secBtn}>Cancel</button>
        <button onClick={run} disabled={busy} style={{ ...S.primBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Shuffling…" : "Shuffle & Assign"}
        </button>
      </div>
    </Overlay>
  );
}

// ── Main Component ───────────────────────────────────────────────────
export default function CohortManagement({ orgId }: { orgId: string }) {
  const [programs, setPrograms]       = useState<ProgramDTO[]>([]);
  const [selProgId, setSelProgId]     = useState<string | null>(null);
  const [cohorts, setCohorts]         = useState<CohortDTO[]>([]);
  const [participants, setParticipants] = useState<Record<string, ParticipantDTO[]>>({}); // cohortId → list
  const [pool, setPool]               = useState<PoolParticipantDTO[]>([]);
  const [loading, setLoading]         = useState(false);
  const [showCreate, setShowCreate]   = useState(false);
  const [enrollFor, setEnrollFor]     = useState<CohortDTO | null>(null);
  const [showDistribute, setShowDistribute] = useState(false);

  // Drag state
  const dragging = useRef<{ userId: string; fromCohortId: string | null } | null>(null);
  const [draggingId, setDraggingId]   = useState<string | null>(null);

  const selProg = programs.find(p => p.id === selProgId) ?? null;

  // Load programs once
  useEffect(() => {
    if (!orgId) return;
    programsApi.list(orgId).then(r => {
      const list = (r.data ?? []).filter(p => p.status !== "archived");
      setPrograms(list);
      if (list.length > 0) setSelProgId(list[0].id);
    }).catch(() => {});
  }, [orgId]);

  const loadBoard = useCallback(async (programId: string) => {
    setLoading(true);
    setCohorts([]); setParticipants({}); setPool([]);
    try {
      const cohortRes = await cohortsApi.list(orgId, programId).catch(() => ({ data: [] as CohortDTO[] }));
      const cList = (cohortRes as { data: CohortDTO[] }).data ?? [];
      setCohorts(cList);

      // Load participants for all cohorts + pool in parallel — all errors suppressed
      const results = await Promise.allSettled([
        cohortsApi.pool(programId, orgId),
        ...cList.map(c => cohortsApi.listParticipants(c.id)),
      ]);

      const poolResult = results[0];
      setPool(poolResult.status === "fulfilled" ? (poolResult.value as { data: PoolParticipantDTO[] }).data ?? [] : []);

      const map: Record<string, ParticipantDTO[]> = {};
      cList.forEach((c, i) => {
        const r = results[i + 1];
        map[c.id] = r?.status === "fulfilled" ? (r.value as { data: ParticipantDTO[] }).data ?? [] : [];
      });
      setParticipants(map);
    } catch (_err) {
      // swallow — board shows empty state on error
    } finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { if (selProgId) loadBoard(selProgId); }, [selProgId, loadBoard]);

  async function handleDrop(toCohortId: string | null) {
    if (!dragging.current || !selProgId) return;
    const { userId, fromCohortId } = dragging.current;
    dragging.current = null;
    setDraggingId(null);

    if (fromCohortId === toCohortId) return; // no-op

    // Optimistic UI update
    const mover = pool.find(p => p.user_id === userId) ??
      Object.values(participants).flat().find(p => p.user_id === userId);

    if (toCohortId) {
      // Moving INTO a cohort
      await cohortsApi.transfer(toCohortId, { user_id: userId, from_cohort_id: fromCohortId ?? undefined });
    } else {
      // Moving to pool — withdraw from cohort
      if (fromCohortId) {
        const enr = (participants[fromCohortId] ?? []).find(p => p.user_id === userId);
        if (enr) await cohortsApi.updateEnrollment(fromCohortId, enr.enrollment_id, { status: "withdrawn" });
      }
    }
    // Reload
    loadBoard(selProgId);
  }

  if (!orgId) return <div style={{ padding: 48, textAlign: "center", color: C.muted, fontSize: 14, fontFamily: "Poppins, sans-serif" }}>No organization linked.</div>;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif", height: "100%" }}>

      {/* Program selector tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {programs.map(p => (
          <button key={p.id} onClick={() => setSelProgId(p.id)} style={{
            padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontFamily: "Poppins, sans-serif",
            border: `1.5px solid ${p.id === selProgId ? p.color : C.border}`,
            background: p.id === selProgId ? `${p.color}12` : "#fff",
            color: p.id === selProgId ? p.color : C.muted,
            fontWeight: p.id === selProgId ? 700 : 400,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.color, display: "inline-block", marginRight: 6 }} />
            {p.title}
          </button>
        ))}
        {programs.length === 0 && <div style={{ fontSize: 12, color: C.muted }}>No programs — create one first.</div>}
      </div>

      {/* Toolbar */}
      {selProg && (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {cohorts.length >= 2 && (
            <button onClick={() => setShowDistribute(true)} style={S.secBtn}>🎲 Random Distribute</button>
          )}
          <button onClick={() => setShowCreate(true)} style={S.navyBtn}>+ New Cohort</button>
        </div>
      )}

      {/* Kanban board */}
      {loading ? (
        <div style={{ padding: 48, textAlign: "center", fontSize: 13, color: C.muted }}>Loading…</div>
      ) : selProg ? (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12, alignItems: "flex-start" }}>

          {/* Pool lane */}
          <DropLane
            label="Invited Participants"
            count={pool.length}
            onDrop={() => handleDrop(null)}
            highlight={false}
          >
            {pool.length === 0
              ? <div style={{ fontSize: 11, color: C.muted, textAlign: "center", padding: "12px 0" }}>All assigned to cohorts</div>
              : pool.map(p => (
                <ParticipantCard key={p.user_id} p={p} dragging={draggingId === p.user_id}
                  onDragStart={() => { dragging.current = { userId: p.user_id, fromCohortId: null }; setDraggingId(p.user_id); }} />
              ))
            }
            {/* Invite into pool button */}
            <button onClick={() => setEnrollFor({ id: cohorts[0]?.id ?? "", name: "pool", enrolled_count: 0, max_seats: 0, program_id: selProgId!, org_id: orgId, is_active: true, created_at: "" })}
              style={{ marginTop: 4, fontSize: 11, color: C.indigo, background: "none", border: "none", cursor: "pointer", fontFamily: "Poppins, sans-serif", fontWeight: 600, textAlign: "left" }}>
              + Invite new participant
            </button>
          </DropLane>

          {/* Divider */}
          <div style={{ width: 1, background: C.border, alignSelf: "stretch", flexShrink: 0 }} />

          {/* Cohort lanes */}
          {cohorts.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 32px", background: C.bg, borderRadius: 12, border: `1px dashed ${C.border}`, minWidth: 240 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>No cohorts yet for this program.</div>
                <button onClick={() => setShowCreate(true)} style={S.navyBtn}>+ New Cohort</button>
              </div>
            </div>
          ) : cohorts.map(c => {
            const parts = participants[c.id] ?? [];
            const activeParts = parts.filter(p => p.status !== "withdrawn");
            return (
              <DropLane
                key={c.id}
                label={c.name}
                count={activeParts.length}
                maxSeats={c.max_seats}
                onDrop={() => handleDrop(c.id)}
                highlight={draggingId !== null}
              >
                {activeParts.map(p => (
                  <ParticipantCard key={p.user_id} p={{ user_id: p.user_id, name: p.name, email: p.email, department: p.department, enrollment_id: p.enrollment_id }}
                    dragging={draggingId === p.user_id}
                    onDragStart={() => { dragging.current = { userId: p.user_id, fromCohortId: c.id }; setDraggingId(p.user_id); }} />
                ))}
                {activeParts.length === 0 && (
                  <div style={{ fontSize: 11, color: C.muted, textAlign: "center", padding: "12px 0" }}>Drop participants here</div>
                )}
                <button onClick={() => setEnrollFor(c)}
                  style={{ marginTop: 4, fontSize: 11, color: C.indigo, background: "none", border: "none", cursor: "pointer", fontFamily: "Poppins, sans-serif", fontWeight: 600, textAlign: "left" }}>
                  + Invite into cohort
                </button>
              </DropLane>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: 48, textAlign: "center", fontSize: 13, color: C.muted }}>Select a program above.</div>
      )}

      {/* Modals */}
      {showCreate && selProg && (
        <CreateCohortModal
          orgId={orgId}
          programs={programs}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); if (selProgId) loadBoard(selProgId); }}
        />
      )}
      {enrollFor && (
        <EnrollModal
          cohortId={enrollFor.id}
          cohortName={enrollFor.name}
          onClose={() => setEnrollFor(null)}
          onDone={() => { setEnrollFor(null); if (selProgId) loadBoard(selProgId); }}
        />
      )}
      {showDistribute && selProgId && (
        <DistributeModal
          programId={selProgId}
          cohorts={cohorts}
          onClose={() => setShowDistribute(false)}
          onDone={() => { setShowDistribute(false); loadBoard(selProgId); }}
        />
      )}
    </div>
  );
}
