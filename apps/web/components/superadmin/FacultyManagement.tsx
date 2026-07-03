"use client";

import { useState } from "react";
import FacultyDashboard from "./FacultyDashboard";
import FacultyRoster from "./FacultyRoster";

const C = { navy: "#1C2551", orange: "#EF4E24", card: "#FFFFFF", border: "#EAECF4", muted: "#8b90a7" };
const ff = { fontFamily: "Poppins, sans-serif" } as const;

type Tab = "dashboard" | "roster";

export default function FacultyManagement({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "roster",    label: "Roster" },
  ];

  return (
    <div style={{ ...ff, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 8, padding: "16px 24px 0" }}>
        {tabs.map((t) => {
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              ...ff, padding: "8px 18px", borderRadius: 8, fontSize: 12, cursor: "pointer",
              fontWeight: on ? 700 : 500,
              background: on ? C.navy : C.card,
              color: on ? "#fff" : C.muted,
              border: `1px solid ${on ? C.navy : C.border}`,
            }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "dashboard" ? <FacultyDashboard /> : <FacultyRoster onNavigate={onNavigate} />}
    </div>
  );
}
