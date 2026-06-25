"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/layout/DashboardShell";
import { useAuth } from "@/lib/auth-context";
import PMDesignStudio from "@/components/programs/PMDesignStudio";
import { programsApi, ProgramDTO, ProgramDetailDTO } from "@/lib/programs-api";

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
        <PMDesignPage
          orgId={user.org_id ?? ""}
          onOpenStudio={(p) => setStudioProgram(p)}
        />
      )}
      {activePage === "pm-design" && studioProgram && (
        <PMDesignStudio
          program={studioProgram}
          onBack={() => setStudioProgram(null)}
          onProgramUpdated={(updated) => setStudioProgram(updated)}
        />
      )}
      {activePage !== "pm-design" && (
        <PlaceholderPage title={title} role="Program Manager" />
      )}
    </DashboardShell>
  );
}

// ── Program Design List ───────────────────────────────────────────
const STATUS_FILTERS = ["All", "Active", "Draft", "Upcoming", "Delivered", "Archived"];

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  draft:     { bg: "rgba(139,144,167,0.1)",  color: "#8b90a7",  border: "#EAECF4" },
  active:    { bg: "rgba(239,78,36,0.1)",    color: "#EF4E24",  border: "rgba(239,78,36,0.25)" },
  upcoming:  { bg: "rgba(107,115,191,0.1)",  color: "#6B73BF",  border: "rgba(107,115,191,0.25)" },
  delivered: { bg: "rgba(34,197,94,0.1)",    color: "#22c55e",  border: "rgba(34,197,94,0.25)" },
  archived:  { bg: "rgba(28,37,81,0.06)",    color: "#1C2551",  border: "#EAECF4" },
};

function PMDesignPage({
  orgId,
  onOpenStudio,
}: {
  orgId: string;
  onOpenStudio: (p: ProgramDetailDTO) => void;
}) {
  const [programs, setPrograms] = useState<ProgramDTO[]>([]);
  const [filter, setFilter] = useState("All");
  const [loadingList, setLoadingList] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadPrograms = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await programsApi.list(orgId);
      setPrograms(res.data ?? []);
    } catch {
      setPrograms([]);
    } finally {
      setLoadingList(false);
    }
  }, [orgId]);

  useEffect(() => { loadPrograms(); }, [loadPrograms]);

  async function handleCreate(title: string) {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const created = await programsApi.create(orgId, { title });
      const detail = await programsApi.get(created.data.id);
      if (detail.data) {
        setShowNewModal(false);
        onOpenStudio(detail.data);
      }
    } catch (e: unknown) {
      alert((e as Error).message || "Failed to create program");
    } finally {
      setCreating(false);
    }
  }

  async function handleOpenProgram(id: string) {
    try {
      const res = await programsApi.get(id);
      if (res.data) onOpenStudio(res.data);
    } catch (e: unknown) {
      alert((e as Error).message || "Failed to open program");
    }
  }

  const filtered = programs.filter(
    (p) => filter === "All" || p.status.toLowerCase() === filter.toLowerCase()
  );

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1C2551", margin: 0 }}>Program Design</h2>
          <div style={{ fontSize: 13, color: "#8b90a7", marginTop: 4 }}>
            {programs.length} program{programs.length !== 1 ? "s" : ""} total
          </div>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          style={{
            padding: "10px 20px", background: "#1C2551", border: "none",
            borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700,
            color: "#fff", fontFamily: "Poppins, sans-serif", display: "flex",
            alignItems: "center", gap: 8,
          }}
        >+ New Program Design</button>
      </div>

      {/* Status filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {STATUS_FILTERS.map((f) => {
          const active = filter === f;
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "6px 16px", border: `1px solid ${active ? "#1C2551" : "#EAECF4"}`,
              borderRadius: 20, background: active ? "#1C2551" : "#fff",
              color: active ? "#fff" : "#8b90a7", cursor: "pointer",
              fontSize: 12, fontWeight: active ? 700 : 400,
              fontFamily: "Poppins, sans-serif",
            }}>{f}</button>
          );
        })}
      </div>

      {/* Program grid */}
      {loadingList ? (
        <div style={{ padding: 48, textAlign: "center", color: "#8b90a7", fontSize: 13 }}>
          Loading programs…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState onNew={() => setShowNewModal(true)} hasFilter={filter !== "All"} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {filtered.map((p) => (
            <ProgramCard key={p.id} program={p} onClick={() => handleOpenProgram(p.id)} />
          ))}
        </div>
      )}

      {/* New program modal */}
      {showNewModal && (
        <NewProgramModal
          onCreate={handleCreate}
          onClose={() => setShowNewModal(false)}
          creating={creating}
        />
      )}
    </div>
  );
}

// ── Program Card ─────────────────────────────────────────────────
function ProgramCard({ program, onClick }: { program: ProgramDTO; onClick: () => void }) {
  const sc = STATUS_COLORS[program.status] ?? STATUS_COLORS.draft;
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff", borderRadius: 14, border: "1px solid #EAECF4",
        overflow: "hidden", cursor: "pointer",
        boxShadow: "0 1px 4px rgba(28,37,81,0.06)",
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 20px rgba(28,37,81,0.12)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 1px 4px rgba(28,37,81,0.06)")}
    >
      {/* Color bar */}
      <div style={{ height: 4, background: program.color }} />

      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#1C2551", lineHeight: 1.4, flex: 1, marginRight: 8 }}>
            {program.title}
          </div>
          <div style={{
            background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
            borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 700,
            letterSpacing: 0.3, flexShrink: 0,
          }}>{program.status.toUpperCase()}</div>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Stat label="Phases"     value={program.phase_count} />
          <Stat label="Activities" value={program.activity_count} />
          <Stat label="Weeks"      value={program.duration_weeks} />
        </div>

        {program.published_at && (
          <div style={{ fontSize: 11, color: "#8b90a7" }}>
            Published {new Date(program.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        )}

        <button style={{
          padding: "8px 0", border: `1px solid #EAECF4`, borderRadius: 8,
          background: "#F8F9FC", color: "#1C2551", cursor: "pointer", fontSize: 12,
          fontWeight: 600, fontFamily: "Poppins, sans-serif", marginTop: 4,
        }}>
          {program.status === "draft" ? "Open Design Studio →" : "View Program →"}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#8b90a7", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#1C2551" }}>{value}</div>
    </div>
  );
}

// ── New Program Modal ─────────────────────────────────────────────
function NewProgramModal({
  onCreate,
  onClose,
  creating,
}: {
  onCreate: (title: string) => void;
  onClose: () => void;
  creating: boolean;
}) {
  const [title, setTitle] = useState("");

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
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #EAECF4" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1C2551" }}>New Program Design</div>
          <div style={{ fontSize: 12, color: "#8b90a7", marginTop: 4 }}>
            You can rename and configure everything in the design studio.
          </div>
        </div>
        <div style={{ padding: "20px 24px" }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, display: "block", marginBottom: 8 }}>
            PROGRAM NAME *
          </label>
          <input
            autoFocus
            style={{
              width: "100%", border: "1px solid #EAECF4", borderRadius: 8,
              padding: "10px 14px", fontSize: 13, fontFamily: "Poppins, sans-serif",
              color: "#1C2551", boxSizing: "border-box", outline: "none",
            }}
            placeholder="e.g. Leadership Accelerator – Batch 8"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) onCreate(title); }}
          />
        </div>
        <div style={{
          padding: "16px 24px", borderTop: "1px solid #EAECF4",
          display: "flex", gap: 10, justifyContent: "flex-end",
        }}>
          <button onClick={onClose} style={{
            padding: "9px 20px", background: "#fff", border: "1px solid #EAECF4",
            borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
            color: "#1C2551", fontFamily: "Poppins, sans-serif",
          }}>Cancel</button>
          <button
            onClick={() => onCreate(title)}
            disabled={!title.trim() || creating}
            style={{
              padding: "9px 24px",
              background: title.trim() && !creating ? "#1C2551" : "#D0D3E0",
              border: "none", borderRadius: 8,
              cursor: title.trim() && !creating ? "pointer" : "default",
              fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif",
            }}
          >{creating ? "Creating…" : "Create & Open Studio"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────
function EmptyState({ onNew, hasFilter }: { onNew: () => void; hasFilter: boolean }) {
  return (
    <div style={{
      padding: 64, textAlign: "center", color: "#8b90a7",
      border: "2px dashed #EAECF4", borderRadius: 16, background: "#fff",
    }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>▤</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>
        {hasFilter ? "No programs match this filter" : "No programs yet"}
      </div>
      <div style={{ fontSize: 13, marginBottom: 24 }}>
        {hasFilter ? "Try selecting a different status." : "Design your first leadership program to get started."}
      </div>
      {!hasFilter && (
        <button
          onClick={onNew}
          style={{
            padding: "10px 24px", background: "#1C2551", border: "none",
            borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700,
            color: "#fff", fontFamily: "Poppins, sans-serif",
          }}
        >+ New Program Design</button>
      )}
    </div>
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
