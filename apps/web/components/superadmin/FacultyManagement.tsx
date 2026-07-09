"use client";

import { useState } from "react";
import FacultyDashboard from "./FacultyDashboard";
import FacultyRoster from "./FacultyRoster";
import OnboardFacultyWizard from "./OnboardFacultyWizard";
import FacultyFeedback from "./FacultyFeedback";

const C = { navy: "#1C2551", orange: "#EF4E24", card: "#FFFFFF", border: "#EAECF4", muted: "#8b90a7", slateL: "#64748b", page: "#F5F7FB" };
const ff = { fontFamily: "Poppins, sans-serif" } as const;

type Tab = "dashboard" | "roster" | "onboard" | "feedback";

export default function FacultyManagement({ orgId, onNavigate }: { orgId?: string; onNavigate?: (page: string) => void }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [rosterKey, setRosterKey] = useState(0); // bump to refresh roster after onboarding

  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "roster",    label: "Faculty Roster" },
    { id: "onboard",   label: "Onboard Faculty" },
    { id: "feedback",  label: "L1–L4 Feedback" },
  ];

  return (
    <div style={{ ...ff, display: "flex", flexDirection: "column" }}>
      {/* Underline tab bar */}
      <div style={{ display: "flex", gap: 4, padding: "0 24px", borderBottom: `1px solid ${C.border}` }}>
        {tabs.map((t) => {
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              ...ff, padding: "14px 16px", background: "none", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: on ? 700 : 500, color: on ? C.navy : C.muted,
              borderBottom: `2px solid ${on ? C.orange : "transparent"}`, marginBottom: -1,
            }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "dashboard" && <FacultyDashboard orgId={orgId} onNavigate={onNavigate} onOnboard={() => setTab("onboard")} />}
      {tab === "roster"    && <FacultyRoster key={rosterKey} orgId={orgId} onNavigate={onNavigate} />}
      {tab === "onboard"   && (
        <OnboardFacultyWizard
          onCancel={() => setTab("dashboard")}
          onComplete={() => { setRosterKey((k) => k + 1); setTab("roster"); }}
        />
      )}
      {tab === "feedback"  && <FacultyFeedback />}
    </div>
  );
}
