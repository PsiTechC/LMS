"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/layout/DashboardShell";
import { useAuth } from "@/lib/auth-context";

const PAGE_TITLES: Record<string, string> = {
  "dashboard":   "My Journey",
  "prework":     "Pre-Work & Learning",
  "sessions":    "Live Sessions",
  "assessments": "Assessments",
  "feedback360": "360° Feedback",
  "coaching":    "Coaching",
  "capstone":    "Capstone",
  "leaderboard": "Leaderboard",
  "surveys":     "Surveys",
};

const FEATURE_LISTS: Record<string, string[]> = {
  "My Journey":          ["Track your overall program progress", "View upcoming deadlines & milestones", "See your AI coach insights"],
  "Pre-Work & Learning": ["Watch videos & read articles", "Track reading progress", "Take notes & highlights"],
  "Live Sessions":       ["Join scheduled classroom sessions", "Access recordings after sessions", "Submit session reflections"],
  "Assessments":         ["Complete scored assessments", "View attempt history & feedback", "See passing criteria"],
  "360° Feedback":       ["Nominate raters from your network", "View aggregated feedback reports", "Track competency growth"],
  "Coaching":            ["Schedule 1:1 coaching sessions", "Review coaching notes & goals", "Track action items"],
  "Capstone":            ["Submit your capstone project", "Get faculty feedback", "View evaluation rubric"],
  "Leaderboard":         ["See your points & badges", "Compare progress with cohort peers", "Unlock achievements"],
  "Surveys":             ["Complete program surveys", "Give feedback on sessions", "Net Promoter Score"],
};

export default function ParticipantPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activePage, setActivePage] = useState("dashboard");

  useEffect(() => {
    if (!loading && (!user || user.role !== "participant")) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) return null;

  const title = PAGE_TITLES[activePage] ?? activePage;

  return (
    <DashboardShell activePage={activePage} title={title} onNavigate={setActivePage}>
      <div style={{ padding: 24 }}>
        <div style={s.card}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚀</div>
          <h2 style={s.heading}>{title}</h2>
          <p style={s.sub}>
            Your <strong>leadership journey</strong> starts here. The{" "}
            <strong>{title}</strong> section is being built for you.
          </p>
          <div style={s.badge}>Development in Progress</div>
          <div style={s.features}>
            {(FEATURE_LISTS[title] ?? ["Feature coming soon"]).map((f, i) => (
              <div key={i} style={s.featureRow}>
                <span style={{ color: "#EF4E24", flexShrink: 0 }}>✦</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: {
    background: "#fff", borderRadius: 16, border: "1px solid #EAECF4",
    padding: 64, display: "flex", flexDirection: "column",
    alignItems: "center", textAlign: "center",
  },
  heading: { fontSize: 22, fontWeight: 700, color: "#1C2551", marginBottom: 8 },
  sub:     { fontSize: 14, color: "#8b90a7", maxWidth: 360, lineHeight: 1.6 },
  badge:   {
    marginTop: 20, marginBottom: 28,
    background: "rgba(239,78,36,0.08)", border: "1px solid rgba(239,78,36,0.2)",
    color: "#EF4E24", borderRadius: 20, padding: "6px 18px",
    fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
  },
  features:   { display: "flex", flexDirection: "column", gap: 10, textAlign: "left", maxWidth: 320 },
  featureRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#1C2551" },
};
