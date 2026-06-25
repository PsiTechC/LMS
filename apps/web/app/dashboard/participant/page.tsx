"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/layout/DashboardShell";
import { useAuth } from "@/lib/auth-context";
import { cohortsApi, MyEnrollmentDTO } from "@/lib/cohorts-api";
import { programsApi, ProgramDetailDTO } from "@/lib/programs-api";

const PAGE_TITLES: Record<string, string> = {
  "dashboard":    "My Journey",
  "prework":      "Pre-Work & Learning",
  "sessions":     "Live Sessions",
  "assessments":  "Assessments",
  "feedback360":  "360° Feedback",
  "coaching":     "Coaching",
  "capstone":     "Capstone",
  "leaderboard":  "Leaderboard",
  "surveys":      "Surveys",
};

export default function ParticipantPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activePage, setActivePage] = useState("dashboard");

  const [enrollments, setEnrollments]       = useState<MyEnrollmentDTO[]>([]);
  const [activeEnrollment, setActiveEnrollment] = useState<MyEnrollmentDTO | null>(null);
  const [program, setProgram]               = useState<ProgramDetailDTO | null>(null);
  const [loadingData, setLoadingData]       = useState(true);

  useEffect(() => {
    if (!loading && (!user || user.role !== "participant")) {
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

  const loadProgram = useCallback(async (enrollment: MyEnrollmentDTO) => {
    setProgram(null);
    try {
      const res = await programsApi.get(enrollment.program_id);
      setProgram(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    if (activeEnrollment) loadProgram(activeEnrollment);
  }, [activeEnrollment, loadProgram]);

  if (loading || !user) return null;

  const title = PAGE_TITLES[activePage] ?? activePage;

  return (
    <DashboardShell activePage={activePage} title={title} onNavigate={setActivePage}>
      {activePage === "dashboard"
        ? <JourneyDashboard
            enrollments={enrollments}
            activeEnrollment={activeEnrollment}
            program={program}
            loadingData={loadingData}
            onSelectEnrollment={setActiveEnrollment}
          />
        : <ComingSoon title={title} color="#EF4E24" icon="🚀" />
      }
    </DashboardShell>
  );
}

// ── Journey Dashboard ─────────────────────────────────────────────
function JourneyDashboard({
  enrollments, activeEnrollment, program, loadingData, onSelectEnrollment,
}: {
  enrollments: MyEnrollmentDTO[];
  activeEnrollment: MyEnrollmentDTO | null;
  program: ProgramDetailDTO | null;
  loadingData: boolean;
  onSelectEnrollment: (e: MyEnrollmentDTO) => void;
}) {
  const ff = { fontFamily: "Poppins, sans-serif" };

  if (loadingData) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#8b90a7", fontSize: 13, ...ff }}>
        Loading your journey…
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
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎓</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>
            Not enrolled yet
          </div>
          <div style={{ fontSize: 13, color: "#8b90a7", lineHeight: 1.6 }}>
            Your Program Manager will send you an invite link.<br />
            Check your email and click the link to enroll.
          </div>
        </div>
      </div>
    );
  }

  const e = activeEnrollment;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, ...ff }}>

      {/* Enrollment selector — shown only if enrolled in multiple cohorts */}
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
          {/* Hero card */}
          <div style={{
            background: e.program_color,
            borderRadius: 16, padding: "28px 32px",
            display: "flex", justifyContent: "space-between", alignItems: "flex-end",
            flexWrap: "wrap", gap: 20,
          }}>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", letterSpacing: 1, marginBottom: 6 }}>
                {e.cohort_name.toUpperCase()}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
                {e.program_title}
              </div>
              {e.program_description && (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", maxWidth: 480, lineHeight: 1.5 }}>
                  {e.program_description}
                </div>
              )}
              <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
                <Pill label={`${e.program_duration_weeks} weeks`} icon="📅" />
                <Pill label={`${e.completion_percent}% complete`} icon="✦" />
                <Pill label={e.status} icon="●" />
              </div>
            </div>
            {/* Progress ring */}
            <div style={{ textAlign: "center" }}>
              <ProgressRing pct={e.completion_percent} color="#fff" />
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 6 }}>
                OVERALL PROGRESS
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
            <StatCard label="Program Status" value={e.program_status} color="#22c55e" />
            <StatCard label="Cohort" value={e.cohort_name} color={e.program_color} />
            <StatCard label="Risk Level" value={e.risk_level} color={e.risk_level === "high" ? "#ef4444" : e.risk_level === "medium" ? "#f59e0b" : "#22c55e"} />
            <StatCard label="Enrolled" value={new Date(e.enrolled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} color="#6B73BF" />
          </div>

          {/* Program phases timeline */}
          {program ? (
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #EAECF4", overflow: "hidden" }}>
              <div style={{ padding: "18px 24px", borderBottom: "1px solid #EAECF4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1C2551" }}>Program Phases</div>
                <div style={{ fontSize: 12, color: "#8b90a7" }}>{program.phases?.length ?? 0} phases · {program.activity_count} activities</div>
              </div>
              <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
                {(program.phases ?? []).map((phase, idx) => (
                  <PhaseRow key={phase.id} phase={phase} index={idx} programColor={e.program_color} />
                ))}
                {(program.phases ?? []).length === 0 && (
                  <div style={{ fontSize: 13, color: "#8b90a7", textAlign: "center", padding: "20px 0" }}>
                    Program content is being prepared. Check back soon.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{
              background: "#fff", borderRadius: 16, border: "1px solid #EAECF4",
              padding: 40, textAlign: "center", fontSize: 13, color: "#8b90a7",
            }}>Loading program details…</div>
          )}
        </>
      )}
    </div>
  );
}

// ── Phase row ─────────────────────────────────────────────────────
function PhaseRow({ phase, index, programColor }: {
  phase: import("@/lib/programs-api").PhaseDTO;
  index: number;
  programColor: string;
}) {
  const [open, setOpen] = useState(index === 0);
  const ff = { fontFamily: "Poppins, sans-serif" };

  const ACTIVITY_ICONS: Record<string, string> = {
    content: "📄", assessment: "📝", survey: "📊",
    feedback_360: "🔄", coaching: "🤝", capstone: "🏆",
    discussion: "💬",
  };

  return (
    <div style={{ border: `1.5px solid ${phase.color || programColor}22`, borderRadius: 12, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 14,
          padding: "14px 18px", background: "none", border: "none", cursor: "pointer",
          textAlign: "left", ...ff,
        }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: phase.color || programColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 12, fontWeight: 700,
        }}>
          {index + 1}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1C2551" }}>{phase.title}</div>
          {phase.week_label && (
            <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2 }}>{phase.week_label}</div>
          )}
        </div>
        <div style={{ fontSize: 11, color: "#8b90a7", flexShrink: 0 }}>
          {(phase.activities ?? []).length} activities
        </div>
        <div style={{ fontSize: 12, color: "#8b90a7", marginLeft: 4 }}>{open ? "▲" : "▼"}</div>
      </button>

      {open && (
        <div style={{ padding: "0 18px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {(phase.activities ?? []).map((act) => (
            <div key={act.id} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 14px", background: "#F8F9FC", borderRadius: 8,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                background: `${phase.color || programColor}18`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
              }}>
                {ACTIVITY_ICONS[act.type] ?? "◈"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#1C2551", ...ff }}>
                  {act.title}
                </div>
                <div style={{ fontSize: 10, color: "#8b90a7", marginTop: 2 }}>
                  {act.type.replace("_", " ")} · {act.duration_mins} min
                  {act.is_mandatory && " · Required"}
                </div>
              </div>
              <div style={{
                fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
                background: "rgba(139,144,167,0.1)", color: "#8b90a7", flexShrink: 0,
              }}>Upcoming</div>
            </div>
          ))}
          {(phase.activities ?? []).length === 0 && (
            <div style={{ fontSize: 12, color: "#8b90a7", padding: "8px 0" }}>No activities yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared small components ───────────────────────────────────────
function Pill({ label, icon }: { label: string; icon: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5,
      background: "rgba(255,255,255,0.2)", borderRadius: 20,
      padding: "4px 12px", fontSize: 11, color: "#fff", fontFamily: "Poppins, sans-serif",
    }}>
      <span>{icon}</span><span>{label}</span>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: "1px solid #EAECF4",
      padding: "16px 20px", fontFamily: "Poppins, sans-serif",
    }}>
      <div style={{ fontSize: 10, color: "#8b90a7", letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{
        fontSize: 14, fontWeight: 700, color,
        textTransform: "capitalize",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{value}</div>
    </div>
  );
}

function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const r = 28, c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width={72} height={72} viewBox="0 0 72 72">
      <circle cx={36} cy={36} r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={6} />
      <circle
        cx={36} cy={36} r={r} fill="none"
        stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${c - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 36 36)"
      />
      <text x={36} y={41} textAnchor="middle" fontSize={13} fontWeight={700} fill={color} fontFamily="Poppins,sans-serif">
        {pct}%
      </text>
    </svg>
  );
}

function ComingSoon({ title, color, icon }: { title: string; color: string; icon: string }) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{
        background: "#fff", borderRadius: 16, border: "1px solid #EAECF4",
        padding: 64, display: "flex", flexDirection: "column",
        alignItems: "center", textAlign: "center", fontFamily: "Poppins, sans-serif",
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: "#8b90a7", maxWidth: 340, lineHeight: 1.6 }}>
          This section is being built. Check back soon.
        </div>
        <div style={{
          marginTop: 24, background: `${color}10`, border: `1px solid ${color}30`,
          color, borderRadius: 20, padding: "6px 18px",
          fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
        }}>Coming Soon</div>
      </div>
    </div>
  );
}
