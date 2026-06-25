"use client";

import { useState, useEffect, useCallback } from "react";
import { cohortsApi, CohortDTO, ParticipantDTO } from "@/lib/cohorts-api";
import { invitationsApi, InvitationDTO } from "@/lib/invitations-api";
import { programsApi, ProgramDTO } from "@/lib/programs-api";

// ── helpers ────────────────────────────────────────────────────────
function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
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
  "at risk": { bg: "rgba(239,78,36,0.1)",   color: "#EF4E24", border: "rgba(239,78,36,0.3)" },
};

function statusLabel(p: ParticipantDTO) {
  if (p.risk_level === "high") return "At Risk";
  const map: Record<string, string> = {
    enrolled: "Enrolled", active: "Active", completed: "Completed",
    on_hold: "On Hold", withdrawn: "Withdrawn",
  };
  return map[p.status] ?? p.status;
}

function statusKey(p: ParticipantDTO) {
  if (p.risk_level === "high") return "at risk";
  return p.status;
}

// ── Enroll / Invite Modal ─────────────────────────────────────────
type InviteState = "idle" | "sending" | "sent_invite" | "enrolled_directly";

function EnrollModal({ cohortId, cohortName, onClose, onEnrolled }: {
  cohortId: string;
  cohortName: string;
  onClose: () => void;
  onEnrolled: () => void;
}) {
  const [email, setEmail]     = useState("");
  const [role, setRole]       = useState("participant");
  const [state, setState]     = useState<InviteState>("idle");
  const [error, setError]     = useState("");
  const [sentEmail, setSentEmail] = useState("");

  async function handleSubmit() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError("Email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setError("Enter a valid email address"); return; }

    setState("sending");
    setError("");
    try {
      const res = await invitationsApi.send({ email: trimmed, role, cohort_id: cohortId });
      const body = res.data as { message?: string };
      if (body?.message?.includes("enrolled directly")) {
        setState("enrolled_directly");
        onEnrolled();
      } else {
        setSentEmail(trimmed);
        setState("sent_invite");
      }
    } catch (e: unknown) {
      setState("idle");
      setError((e as Error).message || "Failed to send invite");
    }
  }

  // ── Success states ────────────────────────────────────────────
  if (state === "sent_invite") {
    return (
      <Overlay onClose={onClose}>
        <div style={{ padding: "40px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📧</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>Invite Sent!</div>
          <div style={{ fontSize: 13, color: "#8b90a7", lineHeight: 1.6, marginBottom: 24 }}>
            An invitation email has been sent to<br />
            <strong style={{ color: "#1C2551" }}>{sentEmail}</strong>.<br />
            They'll be enrolled in <strong style={{ color: "#1C2551" }}>{cohortName}</strong> once they accept.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={() => { setEmail(""); setRole("participant"); setState("idle"); setSentEmail(""); }}
              style={{ ...cancelBtn, border: "1px solid #EAECF4" }}>Invite Another</button>
            <button onClick={onClose} style={{
              padding: "9px 24px", background: "#1C2551", border: "none", borderRadius: 8,
              cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif",
            }}>Done</button>
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
            This user already had an account in your organization<br />and has been enrolled directly.
          </div>
          <button onClick={onClose} style={{
            padding: "9px 24px", background: "#22c55e", border: "none", borderRadius: 8,
            cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif",
          }}>Done</button>
        </div>
      </Overlay>
    );
  }

  // ── Main form ─────────────────────────────────────────────────
  return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "18px 24px", borderBottom: "1px solid #EAECF4" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1C2551" }}>Enroll Member</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
          <span style={{ fontSize: 11, color: "#8b90a7" }}>Adding to cohort:</span>
          <span style={{
            fontSize: 11, fontWeight: 700, color: "#fff", background: "#1C2551",
            borderRadius: 20, padding: "2px 10px",
          }}>{cohortName}</span>
        </div>
        <div style={{ fontSize: 12, color: "#8b90a7", marginTop: 6 }}>
          Enter their email. If they're not registered yet, we'll send them an invite link.
        </div>
      </div>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={lbl}>EMAIL ADDRESS *</label>
          <input
            autoFocus style={inp} type="email"
            placeholder="e.g. participant@company.com"
            value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          />
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
                fontSize: 12, fontWeight: role === r ? 700 : 400, fontFamily: "Poppins, sans-serif",
                textTransform: "capitalize",
              }}>{r}</button>
            ))}
          </div>
        </div>

        {/* Info box */}
        <div style={{
          padding: "10px 14px", background: "rgba(28,37,81,0.04)",
          borderRadius: 8, border: "1px solid #EAECF4", fontSize: 12, color: "#8b90a7", lineHeight: 1.6,
        }}>
          ◎ If the email is already registered in your org, the user will be enrolled immediately.
          Otherwise an invite link valid for <strong>48 hours</strong> will be emailed to them.
        </div>

        {error && (
          <div style={{
            padding: "10px 14px", background: "rgba(239,78,36,0.06)",
            borderRadius: 8, border: "1px solid rgba(239,78,36,0.2)",
            fontSize: 12, color: "#EF4E24",
          }}>{error}</div>
        )}
      </div>
      <div style={{
        padding: "14px 24px", borderTop: "1px solid #EAECF4",
        display: "flex", gap: 10, justifyContent: "flex-end",
      }}>
        <button onClick={onClose} style={cancelBtn}>Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={state === "sending"}
          style={{
            padding: "9px 24px",
            background: state === "sending" ? "#D0D3E0" : "#EF4E24",
            border: "none", borderRadius: 8,
            cursor: state === "sending" ? "default" : "pointer",
            fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif",
          }}
        >{state === "sending" ? "Sending…" : "Send Invite"}</button>
      </div>
    </Overlay>
  );
}

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

  // Fetch published programs for this org on open
  useEffect(() => {
    programsApi.list(orgId)
      .then((res) => {
        // Only show programs that are published (active/upcoming/delivered)
        const published = (res.data ?? []).filter((p) => p.status !== "draft" && p.status !== "archived");
        setPrograms(published);
        // Also include drafts if no published ones exist yet
        if (published.length === 0) setPrograms(res.data ?? []);
      })
      .catch(() => setPrograms([]))
      .finally(() => setLoadingPrograms(false));
  }, [orgId]);

  // Auto-generate cohort name when program is selected
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
        program_id: selectedProgramId,
        name,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        max_seats: maxSeats,
      });
      onCreated(res.data);
      onClose();
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
        <div style={{ fontSize: 12, color: "#8b90a7", marginTop: 3 }}>
          Select a program, then configure the cohort details.
        </div>
      </div>

      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, maxHeight: "65vh", overflowY: "auto" }}>

        {/* Program selector */}
        <div>
          <label style={lbl}>SELECT PROGRAM *</label>
          {loadingPrograms ? (
            <div style={{ fontSize: 12, color: "#8b90a7", padding: "12px 0" }}>Loading programs…</div>
          ) : programs.length === 0 ? (
            <div style={{
              padding: "14px", background: "rgba(239,78,36,0.05)", borderRadius: 8,
              border: "1px solid rgba(239,78,36,0.15)", fontSize: 12, color: "#EF4E24",
            }}>
              No programs found in this organization. Create and publish a program first.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {programs.map((p) => {
                const isSelected = selectedProgramId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectProgram(p)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                      border: `1.5px solid ${isSelected ? p.color : "#EAECF4"}`,
                      background: isSelected ? `${p.color}08` : "#fff",
                      transition: "border-color 0.15s",
                    }}
                  >
                    {/* Color dot */}
                    <div style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: p.color, flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: "#1C2551",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2 }}>
                        {p.phase_count} phases · {p.duration_weeks} weeks
                      </div>
                    </div>
                    <div style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                      padding: "3px 8px", borderRadius: 20,
                      background: p.status === "draft" ? "rgba(139,144,167,0.1)" : "rgba(34,197,94,0.1)",
                      color: p.status === "draft" ? "#8b90a7" : "#22c55e",
                      border: `1px solid ${p.status === "draft" ? "#EAECF4" : "rgba(34,197,94,0.3)"}`,
                      flexShrink: 0,
                    }}>{p.status.toUpperCase()}</div>
                    {isSelected && (
                      <div style={{
                        width: 20, height: 20, borderRadius: "50%", background: p.color,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: 11, flexShrink: 0,
                      }}>✓</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Rest of the form — only show once a program is selected */}
        {selectedProgramId && (
          <>
            <div>
              <label style={lbl}>COHORT NAME *</label>
              <input
                autoFocus
                style={inp}
                placeholder="e.g. Batch 8 – Mumbai"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 4 }}>
                This is the batch/group name participants will see.
              </div>
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
              <input
                type="number" style={inp} value={maxSeats} min={1} max={500}
                onChange={(e) => setMaxSeats(Number(e.target.value))}
              />
            </div>
          </>
        )}

        {error && (
          <div style={{
            padding: "10px 14px", background: "rgba(239,78,36,0.06)",
            borderRadius: 8, border: "1px solid rgba(239,78,36,0.2)",
            fontSize: 12, color: "#EF4E24",
          }}>{error}</div>
        )}
      </div>

      <div style={{
        padding: "14px 24px", borderTop: "1px solid #EAECF4",
        display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center",
      }}>
        {selectedProgram ? (
          <div style={{ fontSize: 11, color: "#8b90a7" }}>
            Program: <strong style={{ color: "#1C2551" }}>{selectedProgram.title}</strong>
          </div>
        ) : <div />}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={cancelBtn}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={saving || !selectedProgramId || !name.trim()}
            style={{
              padding: "9px 24px",
              background: saving || !selectedProgramId || !name.trim() ? "#D0D3E0" : "#1C2551",
              border: "none", borderRadius: 8,
              cursor: saving || !selectedProgramId || !name.trim() ? "default" : "pointer",
              fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif",
            }}
          >{saving ? "Creating…" : "Create Cohort"}</button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Main Component ────────────────────────────────────────────────
export default function CohortManagement({ orgId }: { orgId: string }) {
  const [cohorts, setCohorts] = useState<CohortDTO[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ParticipantDTO[]>([]);
  const [loadingCohorts, setLoadingCohorts] = useState(true);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [nudgingId, setNudgingId] = useState<string | null>(null);
  const [nudgedIds, setNudgedIds] = useState<Set<string>>(new Set());

  const selectedCohort = cohorts.find((c) => c.id === selectedCohortId) ?? null;

  const loadCohorts = useCallback(async () => {
    setLoadingCohorts(true);
    try {
      const res = await cohortsApi.list(orgId);
      const list = res.data ?? [];
      setCohorts(list);
      if (list.length > 0 && !selectedCohortId) {
        setSelectedCohortId(list[0].id);
      }
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

  useEffect(() => {
    if (selectedCohortId) loadParticipants(selectedCohortId);
  }, [selectedCohortId, loadParticipants]);

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
      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1C2551", margin: 0 }}>Cohort Management</h2>
          <div style={{ fontSize: 13, color: "#8b90a7", marginTop: 4 }}>
            {cohorts.length} cohort{cohorts.length !== 1 ? "s" : ""}
            {selectedCohort ? ` · ${selectedCohort.enrolled_count} enrolled` : ""}
          </div>
        </div>
        <button
          onClick={() => {/* CSV import placeholder */}}
          style={{
            padding: "9px 18px", border: "1px solid #EAECF4", borderRadius: 9,
            background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600,
            color: "#1C2551", fontFamily: "Poppins, sans-serif",
          }}
        >Import CSV</button>
      </div>

      {/* ── Cohort selector + enroll button ──────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        {/* Pills */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {loadingCohorts ? (
            <div style={{ fontSize: 12, color: "#8b90a7" }}>Loading cohorts…</div>
          ) : cohorts.length === 0 ? (
            <div style={{ fontSize: 13, color: "#8b90a7" }}>No cohorts yet.</div>
          ) : (
            cohorts.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCohortId(c.id)}
                style={{
                  padding: "7px 16px", borderRadius: 20, cursor: "pointer",
                  border: `1.5px solid ${c.id === selectedCohortId ? "#1C2551" : "#EAECF4"}`,
                  background: c.id === selectedCohortId ? "#1C2551" : "#fff",
                  color: c.id === selectedCohortId ? "#fff" : "#8b90a7",
                  fontSize: 12, fontWeight: c.id === selectedCohortId ? 700 : 400,
                  fontFamily: "Poppins, sans-serif",
                }}
              >
                {c.name}
                <span style={{
                  marginLeft: 6, fontSize: 10,
                  color: c.id === selectedCohortId ? "rgba(255,255,255,0.7)" : "#8b90a7",
                }}>
                  {c.enrolled_count}/{c.max_seats}
                </span>
              </button>
            ))
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: "7px 14px", borderRadius: 20, cursor: "pointer",
              border: "1.5px dashed #EAECF4", background: "none",
              color: "#8b90a7", fontSize: 12, fontFamily: "Poppins, sans-serif",
            }}
          >+ New Cohort</button>
        </div>

        {/* Enroll button — only shown when a cohort is selected, labeled with cohort name */}
        {selectedCohort && (
          <button
            onClick={() => setShowEnrollModal(true)}
            style={{
              padding: "9px 20px", border: "none", borderRadius: 9,
              background: "#EF4E24", cursor: "pointer",
              fontSize: 12, fontWeight: 700, color: "#fff",
              fontFamily: "Poppins, sans-serif", display: "flex", alignItems: "center", gap: 8,
            }}
          >
            + Enroll into <span style={{
              background: "rgba(255,255,255,0.2)", borderRadius: 20,
              padding: "1px 8px", fontSize: 11,
            }}>{selectedCohort.name}</span>
          </button>
        )}
      </div>

      {/* ── Participant table ────────────────────────────────── */}
      <div style={{
        background: "#fff", borderRadius: 14, border: "1px solid #EAECF4",
        overflow: "hidden",
      }}>
        {/* Table header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "2.5fr 1.4fr 1fr 2fr 1fr 1.2fr 1.4fr",
          padding: "12px 20px",
          borderBottom: "1px solid #EAECF4",
          background: "#FAFBFD",
        }}>
          {["Participant", "Department", "Enrolled", "Completion", "Risk", "Status", "Actions"].map((h) => (
            <div key={h} style={{ fontSize: 11, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.4 }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {loadingParticipants ? (
          <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "#8b90a7" }}>
            Loading participants…
          </div>
        ) : !selectedCohortId ? (
          <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "#8b90a7" }}>
            Select a cohort above to view participants.
          </div>
        ) : participants.length === 0 ? (
          <EmptyParticipants onEnroll={() => setShowEnrollModal(true)} />
        ) : (
          participants.map((p, i) => {
            const risk = RISK_STYLE[p.risk_level] ?? RISK_STYLE.low;
            const sk = statusKey(p);
            const ss = STATUS_STYLE[sk] ?? STATUS_STYLE.active;
            const isNudging = nudgingId === p.enrollment_id;
            const wasNudged = nudgedIds.has(p.enrollment_id);

            return (
              <div
                key={p.enrollment_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2.5fr 1.4fr 1fr 2fr 1fr 1.2fr 1.4fr",
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
                    alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700, color: "#fff",
                  }}>
                    {p.avatar_url
                      ? <img src={p.avatar_url} alt={p.name} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
                      : initials(p.name)
                    }
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1C2551" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#8b90a7" }}>{p.email}</div>
                  </div>
                </div>

                {/* Department */}
                <div style={{ fontSize: 13, color: "#8b90a7" }}>
                  {p.department ?? "—"}
                </div>

                {/* Enrolled date */}
                <div style={{ fontSize: 13, color: "#8b90a7" }}>
                  {new Date(p.enrolled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>

                {/* Completion bar */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    flex: 1, height: 6, background: "#EAECF4", borderRadius: 99, overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%",
                      width: `${p.completion_percent}%`,
                      background: p.completion_percent >= 70 ? "#22c55e"
                        : p.completion_percent >= 40 ? "#f59e0b" : "#EF4E24",
                      borderRadius: 99, transition: "width 0.3s ease",
                    }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1C2551", minWidth: 32 }}>
                    {p.completion_percent}%
                  </span>
                </div>

                {/* Risk */}
                <div>
                  <span style={{
                    background: risk.bg, color: risk.color, border: `1px solid ${risk.border}`,
                    borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700,
                    textTransform: "capitalize",
                  }}>
                    {p.risk_level.charAt(0).toUpperCase() + p.risk_level.slice(1)}
                  </span>
                </div>

                {/* Status */}
                <div>
                  <span style={{
                    background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`,
                    borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600,
                  }}>
                    {statusLabel(p)}
                  </span>
                </div>

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
                    {isNudging ? "…" : wasNudged ? "✓ Sent" : "Nudge"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────── */}
      {showEnrollModal && selectedCohortId && (
        <EnrollModal
          cohortId={selectedCohortId}
          cohortName={selectedCohort?.name ?? ""}
          onClose={() => setShowEnrollModal(false)}
          onEnrolled={() => loadParticipants(selectedCohortId)}
        />
      )}
      {showCreateModal && (
        <CreateCohortModal
          orgId={orgId}
          onClose={() => setShowCreateModal(false)}
          onCreated={(c) => {
            setCohorts((prev) => [c, ...prev]);
            setSelectedCohortId(c.id);
            setShowCreateModal(false);
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
