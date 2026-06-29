"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/layout/DashboardShell";
import { useAuth } from "@/lib/auth-context";
import { cohortsApi, MyEnrollmentDTO, ParticipantDTO } from "@/lib/cohorts-api";
import { programsApi, ProgramDetailDTO } from "@/lib/programs-api";

const PAGE_TITLES: Record<string, string> = {
  "fac-dashboard":   "Dashboard",
  "fac-cohorts":     "My Cohorts",
  "fac-sessions":    "My Sessions",
  "fac-content":     "Content Library",
  "fac-grading":     "Grading Queue",
  "fac-coaching":    "Coaching",
  "fac-discussions": "Discussions",
};

export default function FacultyPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activePage, setActivePage] = useState("fac-dashboard");

  const [enrollments, setEnrollments]           = useState<MyEnrollmentDTO[]>([]);
  const [activeEnrollment, setActiveEnrollment] = useState<MyEnrollmentDTO | null>(null);
  const [program, setProgram]                   = useState<ProgramDetailDTO | null>(null);
  const [participants, setParticipants]         = useState<ParticipantDTO[]>([]);
  const [loadingData, setLoadingData]           = useState(true);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  useEffect(() => {
    if (!loading && (!user || user.role !== "faculty")) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    cohortsApi.myEnrollments()
      .then((res) => {
        const list = res.data ?? [];
        setEnrollments(list);
        if (list.length > 0) setActiveEnrollment(list[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [user]);

  const loadCohortData = useCallback(async (enrollment: MyEnrollmentDTO) => {
    setProgram(null);
    setParticipants([]);
    setLoadingParticipants(true);
    try {
      const [progRes, partRes] = await Promise.all([
        programsApi.get(enrollment.program_id),
        cohortsApi.listParticipants(enrollment.cohort_id),
      ]);
      setProgram(progRes.data);
      setParticipants(partRes.data ?? []);
    } catch {}
    setLoadingParticipants(false);
  }, []);

  useEffect(() => {
    if (activeEnrollment) loadCohortData(activeEnrollment);
  }, [activeEnrollment, loadCohortData]);

  if (loading || !user) return null;

  const title = PAGE_TITLES[activePage] ?? activePage;

  return (
    <DashboardShell activePage={activePage} title={title} onNavigate={setActivePage}>
      {activePage === "fac-dashboard" || activePage === "fac-cohorts"
        ? <FacultyDashboard
            enrollments={enrollments}
            activeEnrollment={activeEnrollment}
            program={program}
            participants={participants}
            loadingData={loadingData}
            loadingParticipants={loadingParticipants}
            onSelectEnrollment={setActiveEnrollment}
          />
        : <ComingSoon title={title} />
      }
    </DashboardShell>
  );
}

// ── Faculty Dashboard ─────────────────────────────────────────────
function FacultyDashboard({
  enrollments, activeEnrollment, program, participants,
  loadingData, loadingParticipants, onSelectEnrollment,
}: {
  enrollments: MyEnrollmentDTO[];
  activeEnrollment: MyEnrollmentDTO | null;
  program: ProgramDetailDTO | null;
  participants: ParticipantDTO[];
  loadingData: boolean;
  loadingParticipants: boolean;
  onSelectEnrollment: (e: MyEnrollmentDTO) => void;
}) {
  const ff = { fontFamily: "Poppins, sans-serif" };

  if (loadingData) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#8b90a7", fontSize: 13, ...ff }}>
        Loading your cohorts…
      </div>
    );
  }

  if (enrollments.length === 0) {
    return (
      <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
        <div style={{
          background: "#fff", borderRadius: 16, border: "1px solid #EAECF4",
          padding: "48px 40px", textAlign: "center", maxWidth: 420, ...ff,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👩‍🏫</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>
            No cohorts assigned yet
          </div>
          <div style={{ fontSize: 13, color: "#8b90a7", lineHeight: 1.6 }}>
            Your Program Manager will invite you to a cohort.<br />
            Check your email for the invite link.
          </div>
        </div>
      </div>
    );
  }

  const e = activeEnrollment;
  const atRisk   = participants.filter((p) => p.risk_level === "high" || p.risk_level === "medium").length;
  const avgCompletion = participants.length
    ? Math.round(participants.reduce((s, p) => s + p.completion_percent, 0) / participants.length)
    : 0;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, ...ff }}>

      {/* Cohort selector pills */}
      {enrollments.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {enrollments.map((en) => (
            <button
              key={en.enrollment_id}
              onClick={() => onSelectEnrollment(en)}
              style={{
                padding: "6px 16px", borderRadius: 20, cursor: "pointer",
                border: `1.5px solid ${en.enrollment_id === e?.enrollment_id ? en.program_color : "#EAECF4"}`,
                background: en.enrollment_id === e?.enrollment_id ? en.program_color : "#fff",
                color: en.enrollment_id === e?.enrollment_id ? "#fff" : "#8b90a7",
                fontSize: 12, fontWeight: 600, fontFamily: "Poppins, sans-serif",
              }}
            >
              {en.cohort_name}
            </button>
          ))}
        </div>
      )}

      {e && (
        <>
          {/* Header banner */}
          <div style={{
            background: `linear-gradient(135deg, ${e.program_color}, ${e.program_color}cc)`,
            borderRadius: 16, padding: "24px 32px",
            display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", letterSpacing: 1, marginBottom: 4 }}>
                FACULTY · {e.cohort_name.toUpperCase()}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{e.program_title}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                {e.program_duration_weeks} weeks · {program?.phase_count ?? "—"} phases · {program?.activity_count ?? "—"} activities
              </div>
            </div>
            <div style={{
              background: "rgba(255,255,255,0.15)", borderRadius: 12, padding: "12px 20px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#fff" }}>{participants.length}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>ENROLLED</div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
            <StatCard icon="✦" label="Avg Completion" value={`${avgCompletion}%`} color="#6B73BF" />
            <StatCard icon="⚠" label="At Risk" value={String(atRisk)} color={atRisk > 0 ? "#ef4444" : "#22c55e"} />
            <StatCard icon="✓" label="Completed" value={String(participants.filter(p => p.completion_percent === 100).length)} color="#22c55e" />
            <StatCard icon="◉" label="Status" value={e.program_status} color={e.program_color} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Participant list */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #EAECF4", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #EAECF4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2551" }}>Participants</div>
                <div style={{ fontSize: 11, color: "#8b90a7" }}>{participants.length} enrolled</div>
              </div>
              {loadingParticipants ? (
                <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "#8b90a7" }}>Loading…</div>
              ) : participants.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "#8b90a7" }}>
                  No participants enrolled yet.
                </div>
              ) : (
                <div style={{ maxHeight: 360, overflowY: "auto" }}>
                  {participants
                    .filter(p => p.role === "participant")
                    .map((p) => {
                      const risk = p.risk_level === "high" ? "#ef4444" : p.risk_level === "medium" ? "#f59e0b" : "#22c55e";
                      return (
                        <div key={p.enrollment_id} style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "12px 20px", borderBottom: "1px solid #F5F7FB",
                        }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%",
                            background: e.program_color, color: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 700, flexShrink: 0,
                          }}>
                            {p.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 12, fontWeight: 600, color: "#1C2551",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>{p.name}</div>
                            <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{
                                height: 4, flex: 1, background: "#EAECF4", borderRadius: 4, overflow: "hidden",
                              }}>
                                <div style={{
                                  height: "100%", width: `${p.completion_percent}%`,
                                  background: e.program_color, borderRadius: 4,
                                }} />
                              </div>
                              <span style={{ fontSize: 10, color: "#8b90a7", flexShrink: 0 }}>
                                {p.completion_percent}%
                              </span>
                            </div>
                          </div>
                          <div style={{
                            width: 8, height: 8, borderRadius: "50%",
                            background: risk, flexShrink: 0,
                          }} title={`${p.risk_level} risk`} />
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Program structure */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #EAECF4", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #EAECF4" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2551" }}>Program Structure</div>
              </div>
              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10, maxHeight: 360, overflowY: "auto" }}>
                {program ? (program.phases ?? []).map((phase, idx) => (
                  <div key={phase.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "12px 14px", background: "#F8F9FC", borderRadius: 10,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                      background: phase.color || e.program_color,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 11, fontWeight: 700,
                    }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1C2551" }}>{phase.title}</div>
                      <div style={{ fontSize: 10, color: "#8b90a7", marginTop: 2 }}>
                        {phase.week_label} · {(phase.activities ?? []).length} activities
                      </div>
                    </div>
                  </div>
                )) : (
                  <div style={{ fontSize: 12, color: "#8b90a7", textAlign: "center", padding: "20px 0" }}>
                    Loading structure…
                  </div>
                )}
                {program && (program.phases ?? []).length === 0 && (
                  <div style={{ fontSize: 12, color: "#8b90a7", textAlign: "center", padding: "20px 0" }}>
                    No phases defined yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Small components ──────────────────────────────────────────────
function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: "1px solid #EAECF4",
      padding: "16px 20px", fontFamily: "Poppins, sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color }}>{icon}</span>
        <span style={{ fontSize: 10, color: "#8b90a7", letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</span>
      </div>
      <div style={{
        fontSize: 18, fontWeight: 700, color,
        textTransform: "capitalize",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{value}</div>
    </div>
  );
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{
        background: "#fff", borderRadius: 16, border: "1px solid #EAECF4",
        padding: 64, display: "flex", flexDirection: "column",
        alignItems: "center", textAlign: "center", fontFamily: "Poppins, sans-serif",
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: "#8b90a7", maxWidth: 340, lineHeight: 1.6 }}>
          This section is being built. Check back soon.
        </div>
        <div style={{
          marginTop: 24, background: "rgba(107,115,191,0.08)", border: "1px solid rgba(107,115,191,0.2)",
          color: "#6B73BF", borderRadius: 20, padding: "6px 18px",
          fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
        }}>Coming Soon</div>
      </div>
    </div>
  );
}
