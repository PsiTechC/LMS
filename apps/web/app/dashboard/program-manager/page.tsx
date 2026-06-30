"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/layout/DashboardShell";
import { useAuth } from "@/lib/auth-context";
import PMDesignStudio from "@/components/programs/PMDesignStudio";
import { ProgramDesignList } from "@/components/programs/ProgramDesignList";
import CohortManagement from "@/components/cohorts/CohortManagement";
import FacultyResources from "@/components/faculty/FacultyResources";
import { ProgramDetailDTO } from "@/lib/programs-api";

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
  const [activePage, setActivePage] = useState("pm-design");
  const [studioProgram, setStudioProgram] = useState<ProgramDetailDTO | null>(null);

  useEffect(() => {
    if (!loading && (!user || user.role !== "program_manager")) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) return null;
  if (!user.org_id && activePage === "pm-design" && !studioProgram) {
    return (
      <DashboardShell activePage={activePage} title="Program Design" onNavigate={setActivePage}>
        <div style={{ padding: 48, textAlign: "center", color: "#8b90a7", fontSize: 14 }}>
          Your account is not linked to an organization yet. Contact your SuperAdmin.
        </div>
      </DashboardShell>
    );
  }

  const title = PAGE_TITLES[activePage] ?? activePage;

  return (
    <DashboardShell activePage={activePage} title={studioProgram ? studioProgram.title : title} onNavigate={(page) => {
      setStudioProgram(null);
      setActivePage(page);
    }}>
      {activePage === "pm-design" && !studioProgram && (
        <ProgramDesignList
          orgId={user.org_id ?? ""}
          onOpenStudio={(p) => setStudioProgram(p)}
        />
      )}
      {activePage === "pm-design" && studioProgram && (
        <PMDesignStudio
          program={studioProgram}
          orgId={user.org_id ?? ""}
          onBack={() => setStudioProgram(null)}
          onProgramUpdated={(updated) => setStudioProgram(updated)}
        />
      )}
      {activePage === "pm-cohort" && (
        <CohortManagement orgId={user.org_id ?? ""} />
      )}
      {activePage === "pm-faculty" && (
        <FacultyResources orgId={user.org_id ?? ""} />
      )}
      {activePage !== "pm-design" && activePage !== "pm-cohort" && activePage !== "pm-faculty" && (
        <PlaceholderPage title={title} role="Program Manager" />
      )}
    </DashboardShell>
  );
}

// ── Placeholder for other PM pages ────────────────────────────────
function PlaceholderPage({ title, role }: { title: string; role: string }) {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        background: "#fff", borderRadius: 16, border: "1px solid #EAECF4",
        padding: 64, display: "flex", flexDirection: "column",
        alignItems: "center", textAlign: "center",
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>{title}</h2>
        <p style={{ fontSize: 14, color: "#8b90a7", maxWidth: 360, lineHeight: 1.6, marginBottom: 0 }}>
          This <strong>{role}</strong> section is under active development.
          Your team can start building the <strong>{title}</strong> feature here.
        </p>
        <div style={{
          marginTop: 20, background: "rgba(239,78,36,0.08)", border: "1px solid rgba(239,78,36,0.2)",
          color: "#EF4E24", borderRadius: 20, padding: "6px 18px", fontSize: 11, fontWeight: 700,
          letterSpacing: 0.5, marginBottom: 28,
        }}>Development in Progress</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left", maxWidth: 320 }}>
          {getFeatureList(title).map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#1C2551" }}>
              <span style={{ color: "#EF4E24", fontSize: 12, flexShrink: 0 }}>◈</span>
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
    "Cohort Management":   ["Enroll & manage participants", "Assign faculty to cohorts", "Track cohort progress"],
    "Analytics":           ["Completion rates by cohort", "Engagement trends", "ROI & impact metrics"],
    "Faculty & Resources": ["Faculty directory & availability", "Content assignment", "Session scheduling"],
    "Communications":      ["Automated email sequences", "Announcements & reminders", "Participant messaging"],
    "ROI Dashboard":       ["Program investment vs outcomes", "Certification completions", "Leadership competency scores"],
    "Compliance":          ["Attendance tracking", "Assessment completion", "Certification audit trail"],
  };
  return map[title] ?? ["Feature coming soon"];
}
