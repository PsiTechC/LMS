"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/layout/DashboardShell";
import { useAuth } from "@/lib/auth-context";
import { NAV_CONFIG } from "@/components/layout/nav-config";

const PAGE_TITLES: Record<string, string> = {
  "pm-dashboard":  "Dashboard",
  "pm-design":     "Program Design",
  "pm-cohort":     "Cohort Management",
  "pm-analytics":  "Analytics",
  "pm-faculty":    "Faculty & Resources",
  "pm-comms":      "Communications",
  "pm-roi":        "ROI Dashboard",
  "pm-compliance": "Compliance",
};

export default function ProgramManagerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activePage, setActivePage] = useState("pm-dashboard");

  useEffect(() => {
    if (!loading && (!user || user.role !== "program_manager")) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) return null;

  const title = PAGE_TITLES[activePage] ?? activePage;

  return (
    <DashboardShell activePage={activePage} title={title} onNavigate={setActivePage}>
      <PlaceholderPage title={title} role="Program Manager" />
    </DashboardShell>
  );
}

function PlaceholderPage({ title, role }: { title: string; role: string }) {
  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
        <h2 style={s.heading}>{title}</h2>
        <p style={s.sub}>
          This <strong>{role}</strong> section is under active development.
          Your team can start building the <strong>{title}</strong> feature here.
        </p>
        <div style={s.badge}>Development in Progress</div>
        <div style={s.features}>
          {getFeatureList(title).map((f, i) => (
            <div key={i} style={s.featureRow}>
              <span style={s.featureDot}>◈</span>
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getFeatureList(title: string): string[] {
  const map: Record<string, string[]> = {
    "Dashboard":           ["Overview of all active cohorts", "Completion rates & engagement metrics", "Upcoming milestones & alerts"],
    "Program Design":      ["Create & configure programs", "Define phases & activities", "Set completion criteria & scoring"],
    "Cohort Management":   ["Enroll & manage participants", "Assign faculty to cohorts", "Track cohort progress"],
    "Analytics":           ["Completion rates by cohort", "Engagement trends", "ROI & impact metrics"],
    "Faculty & Resources": ["Faculty directory & availability", "Content assignment", "Session scheduling"],
    "Communications":      ["Automated email sequences", "Announcements & reminders", "Participant messaging"],
    "ROI Dashboard":       ["Program investment vs outcomes", "Certification completions", "Leadership competency scores"],
    "Compliance":          ["Attendance tracking", "Assessment completion", "Certification audit trail"],
  };
  return map[title] ?? ["Feature coming soon"];
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 24, display: "flex", flexDirection: "column", gap: 16 },
  card: {
    background: "#fff", borderRadius: 16, border: "1px solid #EAECF4",
    padding: 64, display: "flex", flexDirection: "column",
    alignItems: "center", textAlign: "center",
  },
  heading: { fontSize: 22, fontWeight: 700, color: "#1C2551", marginBottom: 8 },
  sub:     { fontSize: 14, color: "#8b90a7", maxWidth: 360, lineHeight: 1.6, marginBottom: 0 },
  badge:   {
    marginTop: 20, background: "rgba(239,78,36,0.08)", border: "1px solid rgba(239,78,36,0.2)",
    color: "#EF4E24", borderRadius: 20, padding: "6px 18px", fontSize: 11, fontWeight: 700,
    letterSpacing: 0.5, marginBottom: 28,
  },
  features: { display: "flex", flexDirection: "column", gap: 10, textAlign: "left", maxWidth: 320 },
  featureRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#1C2551" },
  featureDot: { color: "#EF4E24", fontSize: 12, flexShrink: 0 },
};
