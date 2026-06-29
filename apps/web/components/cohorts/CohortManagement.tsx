"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cohortsApi, CohortDTO, ParticipantDTO, CohortStatsDTO } from "@/lib/cohorts-api";
import { invitationsApi } from "@/lib/invitations-api";
import { programsApi, ProgramDTO } from "@/lib/programs-api";

// ── helpers ────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function avatarColor(name: string) {
  const colors = ["#1C2551", "#6B73BF", "#EF4E24", "#22c55e", "#f59e0b", "#0ea5e9"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[h];
}

const RISK_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  low:    { bg: "rgba(34,197,94,0.1)",   color: "#22c55e", border: "rgba(34,197,94,0.3)" },
  medium: { bg: "rgba(245,158,11,0.1)",  color: "#f59e0b", border: "rgba(245,158,11,0.3)" },
  high:   { bg: "rgba(239,78,36,0.1)",   color: "#EF4E24", border: "rgba(239,78,36,0.3)" },
};

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  enrolled:  { bg: "rgba(107,115,191,0.1)", color: "#6B73BF", border: "rgba(107,115,191,0.3)" },
  active:    { bg: "rgba(28,37,81,0.08)",   color: "#1C2551", border: "#EAECF4" },
  completed: { bg: "rgba(34,197,94,0.1)",   color: "#22c55e", border: "rgba(34,197,94,0.3)" },
  on_hold:   { bg: "rgba(245,158,11,0.1)",  color: "#f59e0b", border: "rgba(245,158,11,0.3)" },
  withdrawn: { bg: "rgba(139,144,167,0.1)", color: "#8b90a7", border: "#EAECF4" },
};

const ENROLLMENT_STATUSES = ["enrolled", "active", "completed", "on_hold", "withdrawn"] as const;
type EnrollmentStatus = typeof ENROLLMENT_STATUSES[number];

// ── Overlay wrapper ────────────────────────────────────────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(28,37,81,0.45)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, fontFamily: "Poppins, sans-serif",
      }}
    >
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440,
        overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)",
      }}>
        {children}
      </div>
    </div>
  );
}

// ── Cohort Stats Panel ─────────────────────────────────────────────
function CohortStats({ cohortId }: { cohortId: string }) {
  const [stats, setStats] = useState<CohortStatsDTO | null>(null);

  useEffect(() => {
    let cancelled = false;
    cohortsApi.stats(cohortId)
      .then((res) => { if (!cancelled) setStats(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [cohortId]);

  if (!stats) return null;

  const items = [
    { label: "Enrolled",     value: stats.total_enrolled,    color: "#1C2551" },
    { label: "Active",       value: stats.active,             color: "#6B73BF" },
    { label: "Completed",    value: stats.completed,          color: "#22c55e" },
    { label: "On Hold",      value: stats.on_hold,            color: "#f59e0b" },
    { label: "Withdrawn",    value: stats.withdrawn,          color: "#8b90a7" },
    { label: "At Risk",      value: stats.at_risk_count,      color: "#EF4E24" },
    { label: "Avg Progress", value: `${stats.avg_completion}%`, color: "#0ea5e9" },
  ];

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "4px 0" }}>
      {items.map((item) => (
        <div key={item.label} style={{
          padding: "8px 14px", borderRadius: 10,
          background: "#FAFBFD", border: "1px solid #EAECF4",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 72,
        }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: item.color }}>{item.value}</span>
          <span style={{ fontSize: 10, color: "#8b90a7", fontWeight: 600, letterSpacing: 0.3, textAlign: "center" }}>
            {item.label.toUpperCase()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Enrollment Status Dropdown ─────────────────────────────────────
function StatusDropdown({ cohortId, enrollId, currentStatus, onUpdated }: {
  cohortId: string;
  enrollId: string;
  currentStatus: string;
  onUpdated: (enrollId: string, newStatus: string) => void;
}) {
  const [open, setOpen]   = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleSelect(status: EnrollmentStatus) {
    if (status === currentStatus) { setOpen(false); return; }
    setSaving(true); setOpen(false);
    try {
      await cohortsApi.updateEnrollment(cohortId, enrollId, { status });
      onUpdated(enrollId, status);
    } finally {
      setSaving(false);
    }
  }

  const ss = STATUS_STYLE[currentStatus] ?? STATUS_STYLE.enrolled;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => !saving && setOpen(!open)}
        style={{
          background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`,
          borderRadius: 6, padding: "4px 8px 4px 10px", fontSize: 11, fontWeight: 600,
          cursor: saving ? "default" : "pointer", fontFamily: "Poppins, sans-serif",
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        {saving ? "…" : currentStatus.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase())}
        {!saving && <span style={{ fontSize: 9 }}>▾</span>}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 100,
          background: "#fff", border: "1px solid #EAECF4", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(28,37,81,0.14)", overflow: "hidden", minWidth: 130,
        }}>
          {ENROLLMENT_STATUSES.map((s) => {
            const sss = STATUS_STYLE[s] ?? STATUS_STYLE.enrolled;
            return (
              <button
                key={s}
                onClick={() => handleSelect(s)}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "8px 12px", fontSize: 12, cursor: "pointer",
                  fontFamily: "Poppins, sans-serif",
                  fontWeight: s === currentStatus ? 700 : 400,
                  color: s === currentStatus ? sss.color : "#1C2551",
                  background: s === currentStatus ? sss.bg : "transparent",
                  border: "none",
                }}
              >
                {s.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase())}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Bulk CSV Modal ─────────────────────────────────────────────────
interface CSVRow { email: string; role: string; error?: string }

function BulkCSVModal({ cohortId, cohortName, onClose, onDone }: {
  cohortId: string;
  cohortName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [rows, setRows]     = useState<CSVRow[]>([]);
  const [state, setState]   = useState<"idle" | "preview" | "uploading" | "done">("idle");
  const [result, setResult] = useState<{ enrolled: number; skipped: number; failed: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function parseCSV(text: string) {
    const lines = text.trim().split(/\r?\n/);
    const parsed: CSVRow[] = [];
    for (const line of lines) {
      const [rawEmail, rawRole] = line.split(",").map((s) => s.trim().replace(/^"|"$/g, "").toLowerCase());
      if (!rawEmail || rawEmail === "email") continue;
      const role = ["participant", "faculty"].includes(rawRole) ? rawRole : "participant";
      const error = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? undefined : "Invalid email";
      parsed.push({ email: rawEmail, role, error });
    }
    setRows(parsed);
    setState("preview");
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => parseCSV(e.target?.result as string);
    reader.readAsText(file);
  }

  async function handleUpload() {
    const valid = rows.filter((r) => !r.error);
    if (valid.length === 0) return;
    setState("uploading");
    try {
      let enrolled = 0, skipped = 0, failed = 0;
      await Promise.all(valid.map(async (r) => {
        try {
          const res = await invitationsApi.send({ email: r.email, role: r.role, cohort_id: cohortId });
          const body = res.data as { message?: string };
          if (body?.message?.includes("enrolled directly")) enrolled++;
          else skipped++;
        } catch {
          failed++;
        }
      }));
      setResult({ enrolled, skipped, failed });
      setState("done");
      onDone();
    } catch {
      setState("preview");
    }
  }

  if (state === "done" && result) {
    return (
      <Overlay onClose={onClose}>
        <div style={{ padding: "40px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>Upload Complete</div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", margin: "16px 0" }}>
            {[
              { label: "Enrolled", value: result.enrolled, color: "#22c55e" },
              { label: "Invites Sent", value: result.skipped, color: "#6B73BF" },
              { label: "Failed", value: result.failed, color: "#EF4E24" },
            ].map((x) => (
              <div key={x.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: x.color }}>{x.value}</div>
                <div style={{ fontSize: 11, color: "#8b90a7" }}>{x.label}</div>
              </div>
            ))}
          </div>
          <button onClick={onClose} style={{
            padding: "9px 28px", background: "#1C2551", border: "none", borderRadius: 8,
            cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif",
          }}>Done</button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "18px 24px", borderBottom: "1px solid #EAECF4" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1C2551" }}>Bulk Enroll via CSV</div>
        <div style={{ fontSize: 12, color: "#8b90a7", marginTop: 3 }}>
          Cohort: <strong style={{ color: "#1C2551" }}>{cohortName}</strong>
        </div>
      </div>

      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        {state === "idle" && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => document.getElementById("csv-upload-input")?.click()}
              style={{
                border: `2px dashed ${dragOver ? "#1C2551" : "#EAECF4"}`,
                borderRadius: 10, padding: "32px 20px",
                background: dragOver ? "rgba(28,37,81,0.03)" : "#FAFBFD",
                textAlign: "center", cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1C2551" }}>Drop CSV file here</div>
              <div style={{ fontSize: 12, color: "#8b90a7", marginTop: 4 }}>or click to browse</div>
              <input id="csv-upload-input" type="file" accept=".csv,text/csv" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
            <div style={{
              padding: "10px 14px", background: "rgba(28,37,81,0.04)",
              borderRadius: 8, border: "1px solid #EAECF4", fontSize: 12, color: "#8b90a7", lineHeight: 1.7,
            }}>
              <strong style={{ color: "#1C2551" }}>CSV format:</strong><br />
              <code style={{ fontSize: 11 }}>email,role</code><br />
              <code style={{ fontSize: 11 }}>alice@company.com,participant</code><br />
              Role must be <code>participant</code> or <code>faculty</code>.
            </div>
          </>
        )}

        {state === "preview" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1C2551" }}>
                {rows.filter((r) => !r.error).length} valid · {rows.filter((r) => r.error).length} invalid
              </div>
              <button onClick={() => { setRows([]); setState("idle"); }} style={{ ...cancelBtn, padding: "5px 12px", fontSize: 11 }}>
                Change File
              </button>
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #EAECF4", borderRadius: 8 }}>
              {rows.map((r, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", borderBottom: i < rows.length - 1 ? "1px solid #F4F5F8" : "none",
                  background: r.error ? "rgba(239,78,36,0.04)" : "transparent",
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: r.error ? "#EF4E24" : "#1C2551", fontWeight: 500 }}>{r.email}</div>
                    {r.error && <div style={{ fontSize: 11, color: "#EF4E24" }}>{r.error}</div>}
                  </div>
                  <span style={{
                    fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 600,
                    background: r.role === "faculty" ? "rgba(107,115,191,0.1)" : "rgba(28,37,81,0.06)",
                    color: r.role === "faculty" ? "#6B73BF" : "#1C2551",
                    border: `1px solid ${r.role === "faculty" ? "rgba(107,115,191,0.3)" : "#EAECF4"}`,
                  }}>{r.role}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {state === "uploading" && (
          <div style={{ padding: "24px 0", textAlign: "center", fontSize: 13, color: "#8b90a7" }}>
            Enrolling participants…
          </div>
        )}
      </div>

      <div style={{ padding: "14px 24px", borderTop: "1px solid #EAECF4", display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={cancelBtn}>Cancel</button>
        {state === "preview" && (
          <button
            onClick={handleUpload}
            disabled={rows.filter((r) => !r.error).length === 0}
            style={{
              padding: "9px 24px",
              background: rows.filter((r) => !r.error).length === 0 ? "#D0D3E0" : "#EF4E24",
              border: "none", borderRadius: 8,
              cursor: rows.filter((r) => !r.error).length === 0 ? "default" : "pointer",
              fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif",
            }}
          >
            Enroll {rows.filter((r) => !r.error).length} Users
          </button>
        )}
      </div>
    </Overlay>
  );
}

// ── Enroll Modal ───────────────────────────────────────────────────
type InviteState = "idle" | "sending" | "sent_invite" | "enrolled_directly";

function EnrollModal({ cohortId, cohortName, onClose, onEnrolled }: {
  cohortId: string;
  cohortName: string;
  onClose: () => void;
  onEnrolled: () => void;
}) {
  const [email, setEmail]   = useState("");
  const [role, setRole]     = useState("participant");
  const [state, setState]   = useState<InviteState>("idle");
  const [error, setError]   = useState("");
  const [sentEmail, setSentEmail] = useState("");

  async function handleSubmit() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError("Email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setError("Enter a valid email address"); return; }
    setState("sending"); setError("");
    try {
      const res = await invitationsApi.send({ email: trimmed, role, cohort_id: cohortId });
      const body = res.data as { message?: string };
      if (body?.message?.includes("enrolled directly")) {
        setState("enrolled_directly"); onEnrolled();
      } else {
        setSentEmail(trimmed); setState("sent_invite");
      }
    } catch (e: unknown) {
      setState("idle");
      setError((e as Error).message || "Failed to send invite");
    }
  }

  if (state === "sent_invite") {
    return (
      <Overlay onClose={onClose}>
        <div style={{ padding: "40px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📧</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>Invite Sent!</div>
          <div style={{ fontSize: 13, color: "#8b90a7", lineHeight: 1.6, marginBottom: 24 }}>
            Sent to <strong style={{ color: "#1C2551" }}>{sentEmail}</strong>.<br />
            They'll join <strong style={{ color: "#1C2551" }}>{cohortName}</strong> once they accept.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={() => { setEmail(""); setState("idle"); setSentEmail(""); }} style={{ ...cancelBtn, border: "1px solid #EAECF4" }}>
              Invite Another
            </button>
            <button onClick={onClose} style={{ padding: "9px 24px", background: "#1C2551", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif" }}>
              Done
            </button>
          </div>
        </div>
      </Overlay>
    );
  }

  if (state === "enrolled_directly") {
    return (
      <Overlay onClose={onClose}>
        <div style={{ padding: "40px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>Enrolled!</div>
          <div style={{ fontSize: 13, color: "#8b90a7", lineHeight: 1.6, marginBottom: 24 }}>
            This user already had an account and was enrolled directly.
          </div>
          <button onClick={onClose} style={{ padding: "9px 24px", background: "#22c55e", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif" }}>
            Done
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "18px 24px", borderBottom: "1px solid #EAECF4" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1C2551" }}>Enroll Member</div>
        <div style={{ fontSize: 12, color: "#8b90a7", marginTop: 3 }}>Adding to: <strong style={{ color: "#1C2551" }}>{cohortName}</strong></div>
      </div>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={lbl}>EMAIL ADDRESS *</label>
          <input autoFocus style={inp} type="email" placeholder="participant@company.com"
            value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }} />
        </div>
        <div>
          <label style={lbl}>ROLE</label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["participant", "faculty"] as const).map((r) => (
              <button key={r} onClick={() => setRole(r)} style={{
                flex: 1, padding: "9px", cursor: "pointer",
                border: `1.5px solid ${role === r ? "#1C2551" : "#EAECF4"}`,
                borderRadius: 8, background: role === r ? "#1C2551" : "#fff",
                color: role === r ? "#fff" : "#8b90a7",
                fontSize: 12, fontWeight: role === r ? 700 : 400, fontFamily: "Poppins, sans-serif", textTransform: "capitalize",
              }}>{r}</button>
            ))}
          </div>
        </div>
        <div style={{ padding: "10px 14px", background: "rgba(28,37,81,0.04)", borderRadius: 8, border: "1px solid #EAECF4", fontSize: 12, color: "#8b90a7", lineHeight: 1.6 }}>
          ◎ Already registered → enrolled immediately. Otherwise an invite link valid for <strong>48 hours</strong> is sent.
        </div>
        {error && (
          <div style={{ padding: "10px 14px", background: "rgba(239,78,36,0.06)", borderRadius: 8, border: "1px solid rgba(239,78,36,0.2)", fontSize: 12, color: "#EF4E24" }}>
            {error}
          </div>
        )}
      </div>
      <div style={{ padding: "14px 24px", borderTop: "1px solid #EAECF4", display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={cancelBtn}>Cancel</button>
        <button onClick={handleSubmit} disabled={state === "sending"} style={{
          padding: "9px 24px", background: state === "sending" ? "#D0D3E0" : "#EF4E24",
          border: "none", borderRadius: 8, cursor: state === "sending" ? "default" : "pointer",
          fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif",
        }}>{state === "sending" ? "Sending…" : "Send Invite"}</button>
      </div>
    </Overlay>
  );
}

// ── Create Cohort Modal ────────────────────────────────────────────
function CreateCohortModal({ orgId, onClose, onCreated }: {
  orgId: string;
  onClose: () => void;
  onCreated: (c: CohortDTO) => void;
}) {
  const [programs, setPrograms]     = useState<ProgramDTO[]>([]);
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [name, setName]             = useState("");
  const [startDate, setStartDate]   = useState("");
  const [endDate, setEndDate]       = useState("");
  const [maxSeats, setMaxSeats]     = useState(50);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");

  useEffect(() => {
    programsApi.list(orgId)
      .then((res) => {
        const all = res.data ?? [];
        const published = all.filter((p) => p.status !== "archived");
        setPrograms(published.length > 0 ? published : all);
      })
      .catch(() => setPrograms([]))
      .finally(() => setLoadingPrograms(false));
  }, [orgId]);

  function handleSelectProgram(p: ProgramDTO) {
    setSelectedProgramId(p.id);
    if (!name) setName(`${p.title} – Batch 1`);
  }

  async function handleSubmit() {
    if (!selectedProgramId) { setError("Please select a program"); return; }
    if (!name.trim()) { setError("Cohort name is required"); return; }
    setSaving(true); setError("");
    try {
      const res = await cohortsApi.create(orgId, {
        program_id: selectedProgramId, name,
        start_date: startDate || undefined, end_date: endDate || undefined, max_seats: maxSeats,
      });
      onCreated(res.data); onClose();
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to create cohort");
    } finally {
      setSaving(false);
    }
  }

  const selectedProgram = programs.find((p) => p.id === selectedProgramId);

  return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "18px 24px", borderBottom: "1px solid #EAECF4" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1C2551" }}>New Cohort</div>
        <div style={{ fontSize: 12, color: "#8b90a7", marginTop: 3 }}>Select a program, then configure the cohort details.</div>
      </div>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, maxHeight: "65vh", overflowY: "auto" }}>
        <div>
          <label style={lbl}>SELECT PROGRAM *</label>
          {loadingPrograms ? (
            <div style={{ fontSize: 12, color: "#8b90a7", padding: "12px 0" }}>Loading programs…</div>
          ) : programs.length === 0 ? (
            <div style={{ padding: "14px", background: "rgba(239,78,36,0.05)", borderRadius: 8, border: "1px solid rgba(239,78,36,0.15)", fontSize: 12, color: "#EF4E24" }}>
              No programs found. Create a program first.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {programs.map((p) => {
                const isSel = selectedProgramId === p.id;
                return (
                  <div key={p.id} onClick={() => handleSelectProgram(p)} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                    border: `1.5px solid ${isSel ? p.color : "#EAECF4"}`, background: isSel ? `${p.color}08` : "#fff",
                  }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1C2551", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2 }}>{p.phase_count} phases · {p.duration_weeks}w</div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
                      background: p.status === "draft" ? "rgba(139,144,167,0.1)" : "rgba(34,197,94,0.1)",
                      color: p.status === "draft" ? "#8b90a7" : "#22c55e",
                      border: `1px solid ${p.status === "draft" ? "#EAECF4" : "rgba(34,197,94,0.3)"}`,
                    }}>{p.status.toUpperCase()}</span>
                    {isSel && (
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: p.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, flexShrink: 0 }}>✓</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selectedProgramId && (
          <>
            <div>
              <label style={lbl}>COHORT NAME *</label>
              <input autoFocus style={inp} placeholder="e.g. Batch 8 – Mumbai" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={lbl}>START DATE</label>
                <input type="date" style={inp} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>END DATE</label>
                <input type="date" style={inp} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div>
              <label style={lbl}>MAX SEATS</label>
              <input type="number" style={inp} value={maxSeats} min={1} max={500} onChange={(e) => setMaxSeats(Number(e.target.value))} />
            </div>
          </>
        )}

        {error && (
          <div style={{ padding: "10px 14px", background: "rgba(239,78,36,0.06)", borderRadius: 8, border: "1px solid rgba(239,78,36,0.2)", fontSize: 12, color: "#EF4E24" }}>
            {error}
          </div>
        )}
      </div>
      <div style={{ padding: "14px 24px", borderTop: "1px solid #EAECF4", display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
        {selectedProgram ? (
          <div style={{ fontSize: 11, color: "#8b90a7" }}>Program: <strong style={{ color: "#1C2551" }}>{selectedProgram.title}</strong></div>
        ) : <div />}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={cancelBtn}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !selectedProgramId || !name.trim()} style={{
            padding: "9px 24px", background: saving || !selectedProgramId || !name.trim() ? "#D0D3E0" : "#1C2551",
            border: "none", borderRadius: 8, cursor: saving || !selectedProgramId || !name.trim() ? "default" : "pointer",
            fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif",
          }}>{saving ? "Creating…" : "Create Cohort"}</button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Main Component ─────────────────────────────────────────────────
export default function CohortManagement({ orgId }: { orgId: string }) {
  const [cohorts, setCohorts]           = useState<CohortDTO[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ParticipantDTO[]>([]);
  const [loadingCohorts, setLoadingCohorts]       = useState(true);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [showEnrollModal, setShowEnrollModal]     = useState(false);
  const [showCreateModal, setShowCreateModal]     = useState(false);
  const [showBulkModal, setShowBulkModal]         = useState(false);
  const [nudgingId, setNudgingId]       = useState<string | null>(null);
  const [nudgedIds, setNudgedIds]       = useState<Set<string>>(new Set());

  const selectedCohort = cohorts.find((c) => c.id === selectedCohortId) ?? null;

  const loadCohorts = useCallback(async () => {
    setLoadingCohorts(true);
    try {
      const res = await cohortsApi.list(orgId);
      const list = res.data ?? [];
      setCohorts(list);
      if (list.length > 0 && !selectedCohortId) setSelectedCohortId(list[0].id);
    } finally {
      setLoadingCohorts(false);
    }
  }, [orgId, selectedCohortId]);

  const loadParticipants = useCallback(async (cohortId: string) => {
    setLoadingParticipants(true);
    try {
      const res = await cohortsApi.listParticipants(cohortId);
      setParticipants(res.data ?? []);
    } finally {
      setLoadingParticipants(false);
    }
  }, []);

  useEffect(() => { loadCohorts(); }, [loadCohorts]);
  useEffect(() => { if (selectedCohortId) loadParticipants(selectedCohortId); }, [selectedCohortId, loadParticipants]);

  function handleStatusUpdated(enrollId: string, newStatus: string) {
    setParticipants((prev) =>
      prev.map((p) => p.enrollment_id === enrollId ? { ...p, status: newStatus } : p)
    );
  }

  async function handleNudge(enrollId: string) {
    if (!selectedCohortId) return;
    setNudgingId(enrollId);
    try {
      await cohortsApi.nudge(selectedCohortId, enrollId);
      setNudgedIds((prev) => new Set([...prev, enrollId]));
    } finally {
      setNudgingId(null);
    }
  }

  if (!orgId) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "#8b90a7", fontSize: 14 }}>
        Your account is not linked to an organization.
      </div>
    );
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, fontFamily: "Poppins, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1C2551", margin: 0 }}>Cohort Management</h2>
          <div style={{ fontSize: 13, color: "#8b90a7", marginTop: 4 }}>
            {cohorts.length} cohort{cohorts.length !== 1 ? "s" : ""}
            {selectedCohort ? ` · ${selectedCohort.enrolled_count}/${selectedCohort.max_seats} seats` : ""}
          </div>
        </div>
        <button
          onClick={() => setShowBulkModal(true)}
          style={{
            padding: "9px 18px", border: "1px solid #EAECF4", borderRadius: 9,
            background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600,
            color: "#1C2551", fontFamily: "Poppins, sans-serif",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          📂 Import CSV
        </button>
      </div>

      {/* Stats for selected cohort */}
      {selectedCohortId && <CohortStats cohortId={selectedCohortId} />}

      {/* Cohort pills + enroll button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {loadingCohorts ? (
            <div style={{ fontSize: 12, color: "#8b90a7" }}>Loading cohorts…</div>
          ) : cohorts.length === 0 ? (
            <div style={{ fontSize: 13, color: "#8b90a7" }}>No cohorts yet.</div>
          ) : (
            cohorts.map((c) => (
              <button key={c.id} onClick={() => setSelectedCohortId(c.id)} style={{
                padding: "7px 16px", borderRadius: 20, cursor: "pointer",
                border: `1.5px solid ${c.id === selectedCohortId ? "#1C2551" : "#EAECF4"}`,
                background: c.id === selectedCohortId ? "#1C2551" : "#fff",
                color: c.id === selectedCohortId ? "#fff" : "#8b90a7",
                fontSize: 12, fontWeight: c.id === selectedCohortId ? 700 : 400, fontFamily: "Poppins, sans-serif",
              }}>
                {c.name}
                <span style={{ marginLeft: 6, fontSize: 10, color: c.id === selectedCohortId ? "rgba(255,255,255,0.7)" : "#8b90a7" }}>
                  {c.enrolled_count}/{c.max_seats}
                </span>
              </button>
            ))
          )}
          <button onClick={() => setShowCreateModal(true)} style={{
            padding: "7px 14px", borderRadius: 20, cursor: "pointer",
            border: "1.5px dashed #EAECF4", background: "none",
            color: "#8b90a7", fontSize: 12, fontFamily: "Poppins, sans-serif",
          }}>+ New Cohort</button>
        </div>
        {selectedCohort && (
          <button onClick={() => setShowEnrollModal(true)} style={{
            padding: "9px 20px", border: "none", borderRadius: 9,
            background: "#EF4E24", cursor: "pointer",
            fontSize: 12, fontWeight: 700, color: "#fff",
            fontFamily: "Poppins, sans-serif", display: "flex", alignItems: "center", gap: 8,
          }}>
            + Enroll into{" "}
            <span style={{ background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "1px 8px", fontSize: 11 }}>
              {selectedCohort.name}
            </span>
          </button>
        )}
      </div>

      {/* Participant table */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #EAECF4", overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "2.5fr 1.4fr 1fr 2fr 1fr 1.4fr 1.4fr",
          padding: "12px 20px", borderBottom: "1px solid #EAECF4", background: "#FAFBFD",
        }}>
          {["Participant", "Department", "Enrolled", "Completion", "Risk", "Status", "Actions"].map((h) => (
            <div key={h} style={{ fontSize: 11, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.4 }}>{h}</div>
          ))}
        </div>

        {loadingParticipants ? (
          <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "#8b90a7" }}>Loading participants…</div>
        ) : !selectedCohortId ? (
          <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "#8b90a7" }}>Select a cohort above to view participants.</div>
        ) : participants.length === 0 ? (
          <EmptyParticipants onEnroll={() => setShowEnrollModal(true)} />
        ) : (
          participants.map((p, i) => {
            const risk = RISK_STYLE[p.risk_level] ?? RISK_STYLE.low;
            const isNudging = nudgingId === p.enrollment_id;
            const wasNudged = nudgedIds.has(p.enrollment_id);

            return (
              <div
                key={p.enrollment_id}
                style={{
                  display: "grid", gridTemplateColumns: "2.5fr 1.4fr 1fr 2fr 1fr 1.4fr 1.4fr",
                  padding: "14px 20px", alignItems: "center",
                  borderBottom: i < participants.length - 1 ? "1px solid #F4F5F8" : "none",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFD")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {/* Participant */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                    background: avatarColor(p.name), display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff",
                  }}>
                    {p.avatar_url
                      ? <img src={p.avatar_url} alt={p.name} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
                      : initials(p.name)}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1C2551" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#8b90a7" }}>{p.email}</div>
                  </div>
                </div>

                {/* Department */}
                <div style={{ fontSize: 13, color: "#8b90a7" }}>{p.department ?? "—"}</div>

                {/* Enrolled date */}
                <div style={{ fontSize: 13, color: "#8b90a7" }}>
                  {new Date(p.enrolled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>

                {/* Completion bar */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, height: 6, background: "#EAECF4", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${p.completion_percent}%`,
                      background: p.completion_percent >= 70 ? "#22c55e" : p.completion_percent >= 40 ? "#f59e0b" : "#EF4E24",
                      borderRadius: 99, transition: "width 0.3s ease",
                    }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1C2551", minWidth: 32 }}>{p.completion_percent}%</span>
                </div>

                {/* Risk */}
                <div>
                  <span style={{
                    background: risk.bg, color: risk.color, border: `1px solid ${risk.border}`,
                    borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700, textTransform: "capitalize",
                  }}>
                    {p.risk_level.charAt(0).toUpperCase() + p.risk_level.slice(1)}
                  </span>
                </div>

                {/* Status dropdown */}
                {selectedCohortId && (
                  <StatusDropdown
                    cohortId={selectedCohortId}
                    enrollId={p.enrollment_id}
                    currentStatus={p.status}
                    onUpdated={handleStatusUpdated}
                  />
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={actionBtn}>View</button>
                  <button
                    onClick={() => handleNudge(p.enrollment_id)}
                    disabled={isNudging || wasNudged}
                    style={{
                      ...actionBtn,
                      background: wasNudged ? "rgba(34,197,94,0.08)" : actionBtn.background,
                      color: wasNudged ? "#22c55e" : actionBtn.color,
                      border: wasNudged ? "1px solid rgba(34,197,94,0.3)" : actionBtn.border,
                      cursor: isNudging || wasNudged ? "default" : "pointer",
                    }}
                  >
                    {isNudging ? "…" : wasNudged ? "✓" : "Nudge"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modals */}
      {showEnrollModal && selectedCohortId && (
        <EnrollModal
          cohortId={selectedCohortId}
          cohortName={selectedCohort?.name ?? ""}
          onClose={() => setShowEnrollModal(false)}
          onEnrolled={() => loadParticipants(selectedCohortId)}
        />
      )}
      {showBulkModal && selectedCohortId && (
        <BulkCSVModal
          cohortId={selectedCohortId}
          cohortName={selectedCohort?.name ?? ""}
          onClose={() => setShowBulkModal(false)}
          onDone={() => loadParticipants(selectedCohortId)}
        />
      )}
      {showCreateModal && (
        <CreateCohortModal
          orgId={orgId}
          onClose={() => setShowCreateModal(false)}
          onCreated={(c) => {
            setCohorts((prev) => [c, ...prev]);
            setSelectedCohortId(c.id);
          }}
        />
      )}
    </div>
  );
}

function EmptyParticipants({ onEnroll }: { onEnroll: () => void }) {
  return (
    <div style={{ padding: 48, textAlign: "center", color: "#8b90a7" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⬡</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#1C2551", marginBottom: 6 }}>No participants yet</div>
      <div style={{ fontSize: 13, marginBottom: 20 }}>Enroll participants to track their progress here.</div>
      <button onClick={onEnroll} style={{
        padding: "9px 22px", background: "#EF4E24", border: "none", borderRadius: 9,
        cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif",
      }}>+ Enroll Participants</button>
    </div>
  );
}

// ── Shared micro-styles ────────────────────────────────────────────
const lbl: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#8b90a7",
  letterSpacing: 0.5, display: "block", marginBottom: 6,
};

const inp: React.CSSProperties = {
  width: "100%", border: "1px solid #EAECF4", borderRadius: 8,
  padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif",
  color: "#1C2551", boxSizing: "border-box", outline: "none",
};

const cancelBtn: React.CSSProperties = {
  padding: "9px 20px", background: "#fff", border: "1px solid #EAECF4",
  borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
  color: "#1C2551", fontFamily: "Poppins, sans-serif",
};

const actionBtn: React.CSSProperties = {
  padding: "5px 12px", background: "#fff", border: "1px solid #EAECF4",
  borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600,
  color: "#1C2551", fontFamily: "Poppins, sans-serif",
};
