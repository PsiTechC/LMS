"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/layout/DashboardShell";
import { useAuth } from "@/lib/auth-context";

const PAGE_TITLES: Record<string, string> = {
  "fac-dashboard":   "Dashboard",
  "fac-design":      "Program Design",
  "fac-sessions":    "My Sessions",
  "fac-content":     "Content Library",
  "fac-grading":     "Grading Queue",
  "fac-coaching":    "Coaching",
  "fac-discussions": "Discussions",
};

const FEATURE_LISTS: Record<string, string[]> = {
  "Dashboard":        ["Upcoming sessions & deadlines", "Pending grading items", "Participant engagement overview"],
  "Program Design":   ["Co-design program phases with PM", "Upload & organize content", "Set assessment rubrics"],
  "My Sessions":      ["View scheduled live sessions", "Upload session recordings", "Add session notes"],
  "Content Library":  ["Upload videos, PDFs & articles", "Tag content by topic & competency", "Track content engagement"],
  "Grading Queue":    ["Review assignment submissions", "Add rubric-based scores & feedback", "Publish grades to participants"],
  "Coaching":         ["Manage 1:1 coaching calendar", "Session notes & goal tracking", "Participant progress summaries"],
  "Discussions":      ["Facilitate forum discussions", "Pin key insights", "Moderate peer responses"],
};

export default function FacultyPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activePage, setActivePage] = useState("fac-dashboard");

  useEffect(() => {
    if (!loading && (!user || user.role !== "faculty")) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) return null;

  const title = PAGE_TITLES[activePage] ?? activePage;

  return (
    <DashboardShell activePage={activePage} title={title} onNavigate={setActivePage}>
      <div style={{ padding: 24 }}>
        <div style={s.card}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
          <h2 style={s.heading}>{title}</h2>
          <p style={s.sub}>
            The <strong>Faculty</strong> portal is under development. Your team builds the{" "}
            <strong>{title}</strong> feature here.
          </p>
          <div style={s.badge}>Development in Progress</div>
          <div style={s.features}>
            {(FEATURE_LISTS[title] ?? ["Feature coming soon"]).map((f, i) => (
              <div key={i} style={s.featureRow}>
                <span style={{ color: "#6B73BF", flexShrink: 0 }}>◈</span>
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
    background: "rgba(107,115,191,0.08)", border: "1px solid rgba(107,115,191,0.2)",
    color: "#6B73BF", borderRadius: 20, padding: "6px 18px",
    fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
  },
  features:   { display: "flex", flexDirection: "column", gap: 10, textAlign: "left", maxWidth: 320 },
  featureRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#1C2551" },
};
