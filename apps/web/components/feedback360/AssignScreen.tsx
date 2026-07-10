"use client";

import { useState, useEffect, useCallback } from "react";
import {
  feedback360ManageApi,
  AssignableParticipant,
  CycleParticipant,
  ProgramOption,
  CohortOption,
} from "@/lib/feedback360-manage-api";
import {
  C, ff, cardBox, microLabel, inputStyle, btnPrimary, btnSecondary, btnDisabled,
  pill, statusColor, fmtDate,
} from "./styles";

const ENROLL_STATUSES = ["", "enrolled", "invited", "completed"];

// Assign step + per-participant tracking for a locked/active cycle.
export default function AssignScreen({
  orgId,
  onBack,
}: {
  orgId?: string;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"assign" | "tracking">("assign");

  // Filters
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [programId, setProgramId] = useState("");
  const [cohortId, setCohortId] = useState("");
  const [enrollStatus, setEnrollStatus] = useState("");
  const [search, setSearch] = useState("");

  // Assignable list
  const [rows, setRows] = useState<AssignableParticipant[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Tracking list
  const [participants, setParticipants] = useState<CycleParticipant[]>([]);
  const [trackLoading, setTrackLoading] = useState(false);
  const [remindingId, setRemindingId] = useState<string>("");

  const selectedProgram = programs.find((p) => p.id === programId);
  const showCohort = !!selectedProgram?.has_cohorts;

  // ── Load filter options ─────────────────────────────────────────
  useEffect(() => {
    feedback360ManageApi.programs(orgId).then((r) => setPrograms(r.data ?? [])).catch(() => {});
  }, [orgId]);

  useEffect(() => {
    setCohortId("");
    if (programId && showCohort) {
      feedback360ManageApi.cohorts(programId, orgId).then((r) => setCohorts(r.data ?? [])).catch(() => {});
    } else {
      setCohorts([]);
    }
  }, [programId, showCohort, orgId]);

  // ── Load assignable ─────────────────────────────────────────────
  const loadAssignable = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await feedback360ManageApi.assignable(orgId, {
        program_id: programId, cohort_id: cohortId, enrollment_status: enrollStatus, search,
      });
      setRows(r.data ?? []);
      setSelected(new Set());
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [orgId, programId, cohortId, enrollStatus, search]);

  useEffect(() => { if (tab === "assign") loadAssignable(); }, [tab, loadAssignable]);

  // ── Load tracking ───────────────────────────────────────────────
  const loadTracking = useCallback(async () => {
    setTrackLoading(true);
    try {
      const r = await feedback360ManageApi.participants(orgId);
      setParticipants(r.data ?? []);
    } catch (e) { setErr((e as Error).message); }
    finally { setTrackLoading(false); }
  }, [orgId]);

  useEffect(() => { if (tab === "tracking") loadTracking(); }, [tab, loadTracking]);

  // ── Selection ───────────────────────────────────────────────────
  const selectable = rows.filter((r) => !r.already_in_cycle);
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.user_id));

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectable.map((r) => r.user_id)));
  }

  // ── Assign ──────────────────────────────────────────────────────
  async function assign(selectAll: boolean) {
    setAssigning(true); setErr(""); setMsg("");
    try {
      const body = selectAll
        ? { select_all: true, program_id: programId, cohort_id: cohortId, enrollment_status: enrollStatus, search }
        : { user_ids: Array.from(selected) };
      const r = await feedback360ManageApi.assign(orgId, body);
      setMsg(`Assigned & invited ${r.data.assigned} participant${r.data.assigned === 1 ? "" : "s"}.`);
      await loadAssignable();
    } catch (e) { setErr((e as Error).message); }
    finally { setAssigning(false); }
  }

  // ── Remind ──────────────────────────────────────────────────────
  async function remindOne(pid: string) {
    setRemindingId(pid); setMsg(""); setErr("");
    try {
      await feedback360ManageApi.remind(orgId, { participant_ids: [pid] });
      setMsg("Reminder sent.");
      await loadTracking();
    } catch (e) { setErr((e as Error).message); }
    finally { setRemindingId(""); }
  }
  async function remindAll() {
    setMsg(""); setErr("");
    try {
      const r = await feedback360ManageApi.remind(orgId, { all: true });
      setMsg(`Reminded ${r.data.reminded} participant${r.data.reminded === 1 ? "" : "s"}.`);
      await loadTracking();
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div style={{ ...ff, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <button onClick={onBack} style={{ ...ff, background: "transparent", border: "none", color: C.muted, fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 4 }}>
            ← Back to 360° overview
          </button>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.navy }}>Assign participants</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <TabBtn active={tab === "assign"} onClick={() => setTab("assign")}>Assign</TabBtn>
          <TabBtn active={tab === "tracking"} onClick={() => setTab("tracking")}>Tracking</TabBtn>
        </div>
      </div>

      {msg && <div style={banner.ok}>{msg}</div>}
      {err && <div style={banner.err}>{err}</div>}

      {tab === "assign" ? (
        <>
          {/* Filter bar */}
          <div style={{ ...cardBox, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ minWidth: 180 }}>
              <div style={microLabel}>Program</div>
              <select style={{ ...inputStyle }} value={programId} onChange={(e) => setProgramId(e.target.value)}>
                <option value="">All programs</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {showCohort && (
              <div style={{ minWidth: 160 }}>
                <div style={microLabel}>Cohort</div>
                <select style={{ ...inputStyle }} value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
                  <option value="">All cohorts</option>
                  {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ minWidth: 150 }}>
              <div style={microLabel}>Enrollment Status</div>
              <select style={{ ...inputStyle }} value={enrollStatus} onChange={(e) => setEnrollStatus(e.target.value)}>
                {ENROLL_STATUSES.map((s) => <option key={s} value={s}>{s === "" ? "Any" : s}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={microLabel}>Search</div>
              <input style={inputStyle} placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          {/* Action bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: C.muted }}>
              {loading ? "Loading…" : `${rows.length} participant${rows.length === 1 ? "" : "s"} · ${selectable.length} assignable · ${selected.size} selected`}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={{ ...btnSecondary, ...(selectable.length === 0 || assigning ? btnDisabled : {}) }}
                disabled={selectable.length === 0 || assigning}
                onClick={() => assign(true)}
              >Assign all ({selectable.length})</button>
              <button
                style={{ ...btnPrimary, ...(selected.size === 0 || assigning ? btnDisabled : {}) }}
                disabled={selected.size === 0 || assigning}
                onClick={() => assign(false)}
              >{assigning ? "Assigning…" : `Assign & invite selected (${selected.size})`}</button>
            </div>
          </div>

          {/* Table */}
          <div style={{ ...cardBox, padding: 0, overflow: "hidden" }}>
            <div style={tableHeader}>
              <div style={{ width: 36, textAlign: "center" }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </div>
              <div style={{ flex: 2 }}>Participant</div>
              <div style={{ flex: 2 }}>Program / Cohort</div>
              <div style={{ flex: 1 }}>Status</div>
            </div>
            {loading ? (
              <div style={emptyRow}>Loading participants…</div>
            ) : rows.length === 0 ? (
              <div style={emptyRow}>No participants match these filters.</div>
            ) : rows.map((r) => (
              <div key={r.user_id} style={{ ...tableRow, opacity: r.already_in_cycle ? 0.55 : 1 }}>
                <div style={{ width: 36, textAlign: "center" }}>
                  {r.already_in_cycle
                    ? <span title="Already in this cycle" style={{ color: C.green }}>✓</span>
                    : <input type="checkbox" checked={selected.has(r.user_id)} onChange={() => toggle(r.user_id)} />}
                </div>
                <div style={{ flex: 2, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{r.email}</div>
                </div>
                <div style={{ flex: 2, fontSize: 12, color: C.navy, minWidth: 0 }}>
                  {r.program_name ?? "—"}{r.cohort_name ? ` · ${r.cohort_name}` : ""}
                </div>
                <div style={{ flex: 1 }}>
                  {r.already_in_cycle
                    ? <span style={pill(C.green)}>in cycle</span>
                    : <span style={pill(C.muted)}>{r.status}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        // ── Tracking tab ─────────────────────────────────────────
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: C.muted }}>
              {trackLoading ? "Loading…" : `${participants.length} assigned · ${participants.filter((p) => p.status === "completed").length} completed`}
            </div>
            <button
              style={{ ...btnSecondary, ...(participants.length === 0 ? btnDisabled : {}) }}
              disabled={participants.length === 0}
              onClick={remindAll}
            >Remind all pending</button>
          </div>

          <div style={{ ...cardBox, padding: 0, overflow: "hidden" }}>
            <div style={tableHeader}>
              <div style={{ flex: 2 }}>Participant</div>
              <div style={{ flex: 2 }}>Program / Cohort</div>
              <div style={{ flex: 1 }}>Status</div>
              <div style={{ flex: 1 }}>Invited</div>
              <div style={{ width: 90 }}></div>
            </div>
            {trackLoading ? (
              <div style={emptyRow}>Loading…</div>
            ) : participants.length === 0 ? (
              <div style={emptyRow}>No participants assigned yet. Use the Assign tab to add some.</div>
            ) : participants.map((p) => (
              <div key={p.id} style={tableRow}>
                <div style={{ flex: 2, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{p.email}</div>
                </div>
                <div style={{ flex: 2, fontSize: 12, color: C.navy }}>
                  {p.program_name ?? "—"}{p.cohort_name ? ` · ${p.cohort_name}` : ""}
                </div>
                <div style={{ flex: 1 }}><span style={pill(statusColor(p.status))}>{p.status.replace("_", " ")}</span></div>
                <div style={{ flex: 1, fontSize: 12, color: C.muted }}>{fmtDate(p.invited_at)}</div>
                <div style={{ width: 90 }}>
                  {p.status !== "completed" && (
                    <button
                      style={{ ...btnSecondary, padding: "5px 10px", ...(remindingId === p.id ? btnDisabled : {}) }}
                      disabled={remindingId === p.id}
                      onClick={() => remindOne(p.id)}
                    >{remindingId === p.id ? "…" : "Remind"}</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      ...ff, fontSize: 12, borderRadius: 8, padding: "7px 16px", cursor: "pointer",
      background: active ? C.navy : "#fff", color: active ? "#fff" : C.muted,
      border: `1px solid ${active ? C.navy : C.border}`, fontWeight: active ? 700 : 500,
    }}>{children}</button>
  );
}

const tableHeader: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
  background: C.page, fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase",
};
const tableRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
  borderTop: `1px solid ${C.border}`, fontSize: 13,
};
const emptyRow: React.CSSProperties = {
  padding: 32, textAlign: "center", color: C.muted, fontSize: 13, borderTop: `1px solid ${C.border}`,
};
const banner = {
  ok: { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#16a34a" } as React.CSSProperties,
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ef4444" } as React.CSSProperties,
};
