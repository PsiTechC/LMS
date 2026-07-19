"use client";

import { useEffect, useRef, useState } from "react";
import { MyEnrollmentDTO } from "@/lib/cohorts-api";

const NAVY = "var(--xa-navy)";
const ORANGE = "var(--xa-primary)";
const INDIGO = "var(--xa-muted)";
const GREEN = "#22c55e";
const MUTED = "var(--xa-muted)";
const BORDER = "#E6DED0";

interface Props {
  enrollments: MyEnrollmentDTO[];
  active: MyEnrollmentDTO | null;
  onSelect: (enrollment: MyEnrollmentDTO) => void;
}

// Header dropdown that lets a participant switch between the PROGRAMS they are
// enrolled in (not cohorts). Mirrors the elev8 reference ProgramSwitcherDropdown.
export default function ProgramSwitcher({ enrollments, active, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // De-dupe to one entry per program (a participant may sit in multiple cohorts
  // of the same program; program-switching is what matters here — cohorts come
  // later). Keep the most recently enrolled row per program.
  const programs = dedupeByProgram(enrollments);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!active) return null;

  const statusColor = statusColorFor(active.program_status);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button onClick={() => setOpen((o) => !o)} style={triggerStyle}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, display: "inline-block", flexShrink: 0 }} />
        <span style={triggerLabel}>
          {active.program_title} · {active.completion_percent}% complete
        </span>
        <span style={{ fontSize: 9, color: MUTED }}>▼</span>
      </button>

      {open && (
        <div style={menuStyle}>
          <div style={menuHeaderStyle}>MY ENROLLED PROGRAMS</div>
          {programs.map((p) => {
            const selected = p.program_id === active.program_id;
            const color = p.program_color || ORANGE;
            return (
              <button
                key={p.program_id}
                onClick={() => { onSelect(p); setOpen(false); }}
                style={{ ...rowStyle, background: selected ? "rgba(200, 168, 96,0.04)" : "#fff" }}
              >
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.program_title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <div style={{ height: 4, width: 60, background: "#EFE9DC", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: `${clamp(p.completion_percent)}%`, background: color, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 10, color, fontWeight: 700 }}>{p.completion_percent}%</span>
                  </div>
                </div>
                {selected && <span style={{ color: ORANGE, fontSize: 14 }}>✓</span>}
                <span style={statusPill(p.program_status)}>{titleCase(p.program_status)}</span>
              </button>
            );
          })}
          {programs.length === 0 && (
            <div style={{ padding: "16px 14px", fontSize: 12, color: MUTED }}>Not enrolled in any program yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

function dedupeByProgram(enrollments: MyEnrollmentDTO[]): MyEnrollmentDTO[] {
  const byProgram = new Map<string, MyEnrollmentDTO>();
  for (const e of enrollments) {
    const existing = byProgram.get(e.program_id);
    if (!existing || new Date(e.enrolled_at) > new Date(existing.enrolled_at)) {
      byProgram.set(e.program_id, e);
    }
  }
  return Array.from(byProgram.values());
}

function statusColorFor(status: string): string {
  const s = status.toLowerCase();
  if (s === "completed") return INDIGO;
  if (s === "active" || s === "published") return GREEN;
  return ORANGE;
}

function statusPill(status: string): React.CSSProperties {
  const s = status.toLowerCase();
  const completed = s === "completed";
  return {
    fontSize: 10,
    background: completed ? "rgba(74, 85, 115,0.12)" : "rgba(34,197,94,0.1)",
    color: completed ? INDIGO : GREEN,
    borderRadius: 10,
    padding: "2px 8px",
    fontWeight: 700,
    flexShrink: 0,
  };
}

function titleCase(v: string) { return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function clamp(v: number) { return Math.max(0, Math.min(100, v)); }

const triggerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
  cursor: "pointer", padding: "2px 0", fontFamily: "Poppins, sans-serif",
};
const triggerLabel: React.CSSProperties = {
  fontSize: 12, color: MUTED, fontWeight: 500, maxWidth: 320,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const menuStyle: React.CSSProperties = {
  position: "absolute", top: "calc(100% + 6px)", left: 0, background: "#fff",
  borderRadius: 12, boxShadow: "0 8px 32px rgba(24, 40, 72,0.14)", border: `1px solid ${BORDER}`,
  minWidth: 320, zIndex: 300, overflow: "hidden",
};
const menuHeaderStyle: React.CSSProperties = {
  padding: "10px 14px", fontSize: 10, fontWeight: 700, color: MUTED,
  letterSpacing: 0.5, borderBottom: `1px solid ${BORDER}`,
};
const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", width: "100%",
  border: "none", cursor: "pointer", fontFamily: "Poppins, sans-serif", borderBottom: "1px solid var(--xa-bg)",
};
