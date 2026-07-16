// Extracted from app/dashboard/coach/page.tsx so it can be reused inside the
// faculty-side "Coach Workspace" section (FacultyCoaching) for a dual-role
// faculty+coach user, without duplicating this screen's logic.
"use client";

import { useState } from "react";
import type { CoachSessionDTO, CoachingEngagementDTO } from "@/lib/coach-api";
import {
  ff, NAVY, ORANGE, COACH, GREEN, BORDER, MUTED, TRACK,
  pct, progressColor, initials, engagementLabel, nextSessionLabel, ENG_FILTERS,
  Card, Pill, EmptyRow, StatMini,
} from "./coachShared";

export default function CoachEngagements({ engagements, sessions, loading, onNavigate }: {
  engagements: CoachingEngagementDTO[];
  sessions: CoachSessionDTO[];
  loading: boolean;
  onNavigate: (id: string) => void;
}) {
  const [filter, setFilter] = useState<string>("All");
  const filtered = engagements.filter((e) => {
    switch (filter) {
      case "Individual (1:1)": return e.assignment_type === "individual";
      case "Group":            return e.assignment_type === "group";
      case "Active":           return e.status === "active";
      case "Scheduled":        return e.status === "scheduled";
      case "Completed":        return e.status === "completed";
      default:                 return true;
    }
  });

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filter tabs */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ENG_FILTERS.map((f) => {
            const active = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)}
                style={{ ...ff, padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: active ? 700 : 500,
                  border: `1px solid ${active ? COACH : BORDER}`, background: active ? COACH : "#fff",
                  color: active ? "#fff" : MUTED, cursor: "pointer" }}>
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <EmptyRow text="Loading…" />
      ) : filtered.length === 0 ? (
        <Card><EmptyRow text="No engagements match this filter." /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {filtered.map((e) => {
            const p = pct(e.completed_sessions, e.total_sessions);
            const label = engagementLabel(e);
            const isGroup = e.assignment_type === "group";
            const next = nextSessionLabel(e.id, sessions);
            const statusColor = e.status === "active" ? GREEN : e.status === "scheduled" ? ORANGE : e.status === "completed" ? COACH : MUTED;
            return (
              <Card key={e.id} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Header: avatar + name + status/type */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 40, height: 40, minWidth: 40, borderRadius: 99, background: `${COACH}1a`, color: COACH, display: "flex", alignItems: "center", justifyContent: "center", ...ff, fontSize: 12, fontWeight: 700 }}>
                    {initials(label)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...ff, fontSize: 14, fontWeight: 700, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
                    <div style={{ ...ff, fontSize: 11, color: MUTED, marginTop: 1 }}>{isGroup ? `${e.participants.length} participants` : (e.cohort_name || "1:1 Coaching")}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <Pill text={e.status.toUpperCase()} color={statusColor} />
                    <Pill text={isGroup ? "GROUP" : "1:1"} color={isGroup ? COACH : NAVY} />
                  </div>
                </div>

                {/* Program */}
                <div style={{ ...ff, fontSize: 12, color: MUTED }}>{e.program_title}</div>

                {/* Progress */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ ...ff, fontSize: 11, fontWeight: 600, color: MUTED }}>Progress</span>
                    <span style={{ ...ff, fontSize: 12, fontWeight: 800, color: progressColor(p) }}>{p}%</span>
                  </div>
                  <div style={{ height: 6, background: TRACK, borderRadius: 99 }}>
                    <div style={{ height: 6, width: `${p}%`, background: progressColor(p), borderRadius: 99 }} />
                  </div>
                </div>

                {/* Stat row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <StatMini label="Sessions" value={`${e.completed_sessions}/${e.total_sessions}`} />
                  <StatMini label={isGroup ? "Participants" : "Goals"} value={String(isGroup ? e.participants.length : e.goals.length)} />
                  <StatMini label="Assigned by" value={initials(e.assigned_by_name || "—")} />
                </div>

                {/* Next session */}
                <div style={{ ...ff, fontSize: 12, color: MUTED }}>
                  Next: <span style={{ color: NAVY, fontWeight: 600 }}>{next || "—"}</span>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => onNavigate("coach-notes")}
                    style={{ ...ff, flex: 1, background: "#fff", border: `1px solid ${BORDER}`, color: NAVY, borderRadius: 8, padding: "9px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Notes
                  </button>
                  <button onClick={() => onNavigate("coach-calendar")}
                    style={{ ...ff, flex: 1, background: COACH, border: "none", color: "#fff", borderRadius: 8, padding: "9px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Schedule
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
