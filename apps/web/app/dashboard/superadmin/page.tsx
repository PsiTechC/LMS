"use client";

import { useState, useEffect, useCallback } from "react";
import DashboardShell from "@/components/layout/DashboardShell";
import { NAV_CONFIG } from "@/components/layout/nav-config";
import StatCard from "@/components/superadmin/StatCard";
import CreateOrgWizard from "@/components/superadmin/CreateOrgWizard";
import { api, ApiResponse, OrgResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRouter, useSearchParams } from "next/navigation";
import ProfilePage from "@/components/shared/ProfilePage";
import SettingsPage from "@/components/shared/SettingsPage";
import CohortManagement from "@/components/cohorts/CohortManagement";
import PMAnalytics from "@/components/analytics/PMAnalytics";
import ContentLibrary from "@/components/content/ContentLibrary";
import PMCoachingAdmin from "@/components/coaching/PMCoachingAdmin";
import { ProgramDesignList } from "@/components/programs/ProgramDesignList";
import PMDesignStudio from "@/components/programs/PMDesignStudio";
import ProgramParticipants from "@/components/programs/ProgramParticipants";
import { SessionsPage } from "@/components/sessions/SessionsPage";
import RoleManagement from "@/components/superadmin/RoleManagement";
import AuditLog from "@/components/superadmin/AuditLog";
import SystemHealth from "@/components/superadmin/SystemHealth";
import FacultyManagement from "@/components/superadmin/FacultyManagement";
import SurveysAdmin from "@/components/superadmin/SurveysAdmin";
import DiscussionsAdmin from "@/components/superadmin/DiscussionsAdmin";
import GradingAdmin from "@/components/superadmin/GradingAdmin";
import LeaderboardAdmin from "@/components/superadmin/LeaderboardAdmin";
import NudgeComms from "@/components/superadmin/NudgeComms";
import Feedback360Admin from "@/components/superadmin/Feedback360Admin";
import Feedback360Manage from "@/components/feedback360/Feedback360Manage";
import { ProgramDetailDTO } from "@/lib/programs-api";

// Hard-gated behind "please select an organization" — currently empty.
// Cohorts / Analytics / Coaching Admin / Content default to an aggregated
// "All Orgs" view instead (see showOrgFilter below), matching Surveys/Discussions/etc.
const ORG_SCOPED_TABS = new Set<string>([]);

const PAGE_META: Record<string, { title: string; subtitle?: string }> = {
  "sa-orgs":           { title: "Organizations",    subtitle: "Manage all client organizations" },
  "sa-program-design": { title: "Program Design",   subtitle: "Design and manage learning programs" },
  "sa-program-mgmt":   { title: "Program Management", subtitle: "Enroll participants and manage program rosters" },
  "sa-cohorts":        { title: "Cohort Management",subtitle: "Manage cohort enrollments and progress" },
  "sa-analytics":      { title: "Analytics",        subtitle: "Performance insights across all programs" },
  "sa-sessions":       { title: "Live Sessions",    subtitle: "All sessions across the platform" },
  "sa-discussions":    { title: "Discussions",      subtitle: "Discussion threads & moderation across organizations" },
  "sa-coaching":       { title: "Coaching Overview",  subtitle: "On hold — will surface Coach-role data & analytics once the coach role is live" },
  "sa-content":        { title: "Content Library",  subtitle: "Learning content and resource library" },
  "profile":           { title: "My Profile" },
  "settings":          { title: "Settings" },
  // ── Placeholders — pages not yet built ──
  "sa-grading":        { title: "Grading & Capstone",   subtitle: "Submissions & capstones across organizations" },
  "sa-360-manage":     { title: "360° Feedback",        subtitle: "Configure, launch & assign 360° feedback cycles per organization" },
  "sa-psychometrics":  { title: "360° & Psychometrics", subtitle: "Completed 360° feedback cycles across organizations" },
  "sa-surveys":        { title: "Surveys",              subtitle: "Survey response rates & scores across organizations" },
  "sa-leaderboard":    { title: "Leaderboard",          subtitle: "Cross-organization engagement rankings" },
  "sa-nudge":          { title: "Nudge & Comms",        subtitle: "At-risk nudges & broadcast messaging" },
  "sa-config":         { title: "Platform Config",      subtitle: "Coming soon — Development in progress" },
  "sa-roles":          { title: "Role Management",      subtitle: "Custom roles, scoped assignments & org access rules" },
  "sa-billing":        { title: "Billing",              subtitle: "Coming soon — Development in progress" },
  "sa-health":         { title: "System Health",        subtitle: "Live service status, latency & resource metrics" },
  "sa-integrations":   { title: "Integrations",         subtitle: "Coming soon — Development in progress" },
  "sa-audit":          { title: "Audit Log",            subtitle: "Platform-wide event history & compliance trail" },
  "sa-coaching-admin": { title: "Coaching Admin",       subtitle: "Coaching engagements & assignments (per organization)" },
  "sa-faculty":        { title: "Faculty Management",   subtitle: "Cross-org faculty engagement, programs & L1–L4 feedback" },
};

const PLAN_COLOR: Record<string, string> = {
  enterprise: "#1C2551",
  pro:        "#EF4E24",
  starter:    "#6B73BF",
};

const STATUS_COLOR: Record<string, string> = {
  active:      "#22c55e",
  trial:       "#EF4E24",
  onboarding:  "#1C2551",
  suspended:   "#ef4444",
};

export default function SuperAdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activePage, setActivePage]       = useState(() => searchParams.get("tab") || "sa-orgs");
  const [orgs, setOrgs]                   = useState<OrgResponse[]>([]);
  const [orgsLoading, setOrgsLoading]     = useState(true);
  const [showWizard, setShowWizard]       = useState(false);
  const [successMsg, setSuccessMsg]       = useState("");
  // Org-scoped feature state
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [studioProgram, setStudioProgram] = useState<ProgramDetailDTO | null>(null);

  useEffect(() => {
    if (!loading && (!user || (user.role !== "superadmin" && user.role !== "superadmin_secondary"))) {
      router.replace("/");
    }
  }, [user, loading, router]);

  // Super Admin (Secondary): bounce off the locked surfaces (Billing, System
  // Health, Integrations, Audit Log) back to Organizations.
  useEffect(() => {
    if (user?.role !== "superadmin_secondary") return;
    const locked = new Set(NAV_CONFIG.superadmin_secondary.items.filter(i => i.locked).map(i => i.id));
    if (locked.has(activePage)) setActivePage("sa-orgs");
  }, [user?.role, activePage]);

  const fetchOrgs = useCallback(async () => {
    setOrgsLoading(true);
    try {
      const res = await api.get<ApiResponse<OrgResponse[]>>("/organizations");
      setOrgs(res.data);
    } catch {
      // non-fatal — show empty state
    } finally {
      setOrgsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activePage === "sa-orgs") fetchOrgs();
  }, [activePage, fetchOrgs]);

  // Reset studio when navigating away from program design
  useEffect(() => {
    if (activePage !== "sa-program-design") setStudioProgram(null);
  }, [activePage]);

  function handleNavigate(page: string) {
    // When switching between org-scoped tabs, keep selectedOrgId
    // but clear the studio program
    setStudioProgram(null);
    setActivePage(page);
    router.push(`/dashboard/superadmin?tab=${page}`);
  }

  // Keep activePage in sync when the user navigates with the browser's
  // Back/Forward buttons (each tab switch pushes a history entry above).
  useEffect(() => {
    const tab = searchParams.get("tab") || "sa-orgs";
    setActivePage(tab);
  }, [searchParams]);

  function handleOrgCreated(org: { name: string }) {
    setShowWizard(false);
    setSuccessMsg(`Organization "${org.name}" launched successfully!`);
    fetchOrgs();
    setTimeout(() => setSuccessMsg(""), 5000);
  }

  const titleOverride = studioProgram ? studioProgram.title : undefined;
  const meta = PAGE_META[activePage] ?? { title: activePage };

  function renderContent() {
    if (activePage === "profile")   return <div style={{ padding: 24 }}><ProfilePage /></div>;
    if (activePage === "settings")  return <div style={{ padding: 24 }}><SettingsPage /></div>;
    if (activePage === "sa-orgs")   return (
      <OrgsPage
        orgs={orgs}
        loading={orgsLoading}
        successMsg={successMsg}
        onNewOrg={() => setShowWizard(true)}
        onDismiss={() => setSuccessMsg("")}
      />
    );

    // ── Session Management — platform-wide, no org scope needed ──────────
    if (activePage === "sa-sessions") return <SessionsPage />;

    // ── Role Management — self-contained (org pickers built in) ──────────
    if (activePage === "sa-roles") return <RoleManagement />;

    // ── Audit Log — self-contained query surface ─────────────────────────
    if (activePage === "sa-audit") return <AuditLog />;

    // ── System Health — real metrics from the systemhealth module ────────
    if (activePage === "sa-health") return <SystemHealth />;

    // ── Surveys — cross-org aggregate; "" org = All Orgs (valid, not gated) ──
    if (activePage === "sa-surveys") return <SurveysAdmin orgId={selectedOrgId} />;

    // ── Discussions — cross-org threads + moderation; "" org = All Orgs ──────
    if (activePage === "sa-discussions") return <DiscussionsAdmin orgId={selectedOrgId} />;

    // ── Grading & Capstone — submissions + capstones union; "" org = All Orgs ──
    if (activePage === "sa-grading") return <GradingAdmin orgId={selectedOrgId} />;

    // ── Leaderboard — cross-org rankings; "" org = All Orgs ──────────────────
    if (activePage === "sa-leaderboard") return <LeaderboardAdmin orgId={selectedOrgId} />;

    // ── Nudge & Comms — at-risk nudges + broadcast (reuses PM composer) ──────
    if (activePage === "sa-nudge") return <NudgeComms orgId={selectedOrgId} />;

    // ── 360° Feedback — admin-initiated flow: configure/launch/assign per org ──
    // Requires picking an org first (superadmin selects the org at the top).
    if (activePage === "sa-360-manage") return <Feedback360Manage orgId={selectedOrgId} requireOrgPick />;

    // ── 360° & Psychometrics — completed 360 cycles (psychometrics not wired) ──
    if (activePage === "sa-psychometrics") return <Feedback360Admin orgId={selectedOrgId} />;

    // ── Faculty Management — Dashboard + Roster (Manage Access → Role Mgmt) ──
    // "" org = All Orgs (valid, not gated) — same pattern as Surveys/Discussions.
    if (activePage === "sa-faculty") return <FacultyManagement orgId={selectedOrgId} onNavigate={handleNavigate} />;

    // ── Program Design — "" org = All Orgs (valid, not gated) ───────────────
    if (activePage === "sa-program-design") {
      if (studioProgram) {
        return (
          <PMDesignStudio
            program={studioProgram}
            orgId={studioProgram.org_id}
            onProgramUpdated={(updated) => setStudioProgram(updated)}
            onBack={() => setStudioProgram(null)}
          />
        );
      }
      return (
        <ProgramDesignList
          orgId={selectedOrgId}
          canCreate={!!selectedOrgId}
          onOpenStudio={(prog) => setStudioProgram(prog)}
        />
      );
    }

    // ── Cohorts / Analytics / Coaching Admin / Content — cross-org aggregate;
    // "" org = All Orgs (valid, not gated), same pattern as Surveys/Discussions.
    if (activePage === "sa-program-mgmt")   return <ProgramParticipants orgId={selectedOrgId} />;
    if (activePage === "sa-cohorts")        return <CohortManagement orgId={selectedOrgId} />;
    if (activePage === "sa-analytics")      return <PMAnalytics orgId={selectedOrgId} />;
    if (activePage === "sa-coaching-admin") return <PMCoachingAdmin orgId={selectedOrgId} orgs={orgs} />;
    if (activePage === "sa-content")        return <ContentLibrary orgId={selectedOrgId} />;

    // ── Org-scoped features (hard-gated behind picking an org first) ────────
    if (ORG_SCOPED_TABS.has(activePage)) {
      if (!selectedOrgId) {
        return <SelectOrgHint featureLabel={meta.title} loading={orgsLoading} hasOrgs={orgs.length > 0} />;
      }
    }

    return <PlaceholderPage title={meta.title} />;
  }

  // Surveys/Cohorts/Analytics/etc. show the Org filter too, but "All Orgs"
  // (empty) is a valid scope (unlike ORG_SCOPED_TABS, which require picking
  // an org first).
  const showOrgFilter =
    ORG_SCOPED_TABS.has(activePage) ||
    activePage === "sa-program-mgmt" ||
    activePage === "sa-cohorts" ||
    activePage === "sa-analytics" ||
    activePage === "sa-coaching-admin" ||
    activePage === "sa-content" ||
    activePage === "sa-surveys" ||
    activePage === "sa-discussions" ||
    activePage === "sa-grading" ||
    activePage === "sa-leaderboard" ||
    activePage === "sa-nudge" ||
    activePage === "sa-360-manage" ||
    activePage === "sa-psychometrics" ||
    activePage === "sa-faculty" ||
    activePage === "sa-program-design";

  return (
    <DashboardShell
      activePage={activePage}
      title={titleOverride ?? meta.title}
      subtitle={titleOverride ? undefined : meta.subtitle}
      onNavigate={handleNavigate}
      headerExtra={showOrgFilter ? (
        <OrgFilterDropdown orgs={orgs} value={selectedOrgId} onChange={setSelectedOrgId} />
      ) : undefined}
    >
      {renderContent()}

      {showWizard && (
        <CreateOrgWizard onClose={() => setShowWizard(false)} onComplete={handleOrgCreated} />
      )}
    </DashboardShell>
  );
}

// ── Org drill-down — persistent header dropdown for org-scoped superadmin tabs ─
// Matches the reference "Org: [All Orgs ▼]" pattern.
function OrgFilterDropdown({ orgs, value, onChange }: {
  orgs: OrgResponse[]; value: string; onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 2 }}>
      <span style={{ fontSize: 11, color: "#8b90a7", fontWeight: 600, fontFamily: "Poppins, sans-serif" }}>Org:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontFamily: "Poppins, sans-serif", fontSize: 12, fontWeight: 600, color: "#1C2551",
          background: "#fff", border: "1px solid #EAECF4", borderRadius: 8,
          padding: "6px 10px", cursor: "pointer", minWidth: 150, outline: "none",
        }}
      >
        <option value="">All Orgs</option>
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
}

// ── Organizations Page ──────────────────────────────────────────────────────

interface OrgsPageProps {
  orgs: OrgResponse[];
  loading: boolean;
  successMsg: string;
  onNewOrg: () => void;
  onDismiss: () => void;
}

function OrgsPage({ orgs, loading, successMsg, onNewOrg, onDismiss }: OrgsPageProps) {
  const totalUsers  = orgs.reduce((s, o) => s + o.seats, 0);
  const activeCount = orgs.filter((o) => o.status === "active").length;

  return (
    <div style={p.page}>
      {/* Stat cards */}
      <div style={p.statsRow}>
        <StatCard label="Total Organizations" value={orgs.length.toString()}   sub={`${activeCount} active`}   color="#1C2551" />
        <StatCard label="Total Seats"          value={totalUsers.toString()}    sub="across all orgs"           color="#EF4E24" />
        <StatCard label="Active Organizations" value={activeCount.toString()}   sub="running programs"          color="#22c55e" />
        <StatCard label="Platform"             value="Healthy"                  sub="All systems operational"   color="#6B73BF" />
      </div>

      {/* Success banner */}
      {successMsg && (
        <div style={p.successBanner}>
          <span>✓ {successMsg}</span>
          <button onClick={onDismiss} style={p.dismissBtn}>✕</button>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button style={p.secBtn}>Export Report</button>
        <button style={p.primBtn} onClick={onNewOrg}>+ New Organization</button>
      </div>

      {/* Table */}
      <div style={p.tableCard}>
        {loading ? (
          <div style={p.empty}>Loading organizations…</div>
        ) : orgs.length === 0 ? (
          <div style={p.empty}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⬡</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1C2551", marginBottom: 4 }}>No organizations yet</div>
            <div style={{ fontSize: 13, color: "#8b90a7", marginBottom: 20 }}>Create your first organization to get started</div>
            <button style={p.primBtn} onClick={onNewOrg}>+ New Organization</button>
          </div>
        ) : (
          <table style={p.table}>
            <thead>
              <tr style={p.thead}>
                {["Organization", "Slug", "Plan", "Seats", "Status", "Actions"].map((h) => (
                  <th key={h} style={p.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} style={p.tr}>
                  <td style={p.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={p.orgAvatar}>{org.name[0]}</div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1C2551" }}>{org.name}</span>
                    </div>
                  </td>
                  <td style={{ ...p.td, fontSize: 11, color: "#8b90a7", fontFamily: "monospace" }}>{org.slug}</td>
                  <td style={p.td}>
                    <span style={{ ...p.badge, background: `${PLAN_COLOR[org.plan] || "#8b90a7"}18`, color: PLAN_COLOR[org.plan] || "#8b90a7" }}>
                      {org.plan.charAt(0).toUpperCase() + org.plan.slice(1)}
                    </span>
                  </td>
                  <td style={{ ...p.td, fontSize: 13, fontWeight: 600, color: "#1C2551" }}>{org.seats}</td>
                  <td style={p.td}>
                    <span style={{ ...p.badge, background: `${STATUS_COLOR[org.status] || "#8b90a7"}18`, color: STATUS_COLOR[org.status] || "#8b90a7" }}>
                      {org.status.charAt(0).toUpperCase() + org.status.slice(1)}
                    </span>
                  </td>
                  <td style={p.td}>
                    <button style={p.configBtn}>Config</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Select Org Hint — compact empty state shown until an org is picked from
//    the header "Org:" dropdown (which is the primary drill-down control). ──────

function SelectOrgHint({ featureLabel, loading, hasOrgs }: {
  featureLabel: string; loading: boolean; hasOrgs: boolean;
}) {
  const ff = "Poppins, sans-serif";
  return (
    <div style={{ minHeight: "calc(100vh - 60px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, boxSizing: "border-box" }}>
      <div style={{
        position: "relative",
        width: "100%",
        maxWidth: 460,
        background: "#fff",
        borderRadius: 20,
        border: "1px solid #EAECF4",
        boxShadow: "0 8px 40px rgba(28,37,81,0.08)",
        padding: "44px 36px 36px",
        textAlign: "center",
        overflow: "hidden",
        fontFamily: ff,
      }}>
        {/* Soft branded glow behind the icon */}
        <div style={{ position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)", width: 200, height: 200, background: "radial-gradient(circle, rgba(239,78,36,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />

        {/* Icon badge */}
        <div style={{ position: "relative", width: 64, height: 64, margin: "0 auto 20px", borderRadius: 18, background: "linear-gradient(135deg, #1C2551 0%, #2d3a7c 100%)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 20px rgba(28,37,81,0.22)" }}>
          <span style={{ fontSize: 28, color: "#fff", lineHeight: 1 }}>⬡</span>
        </div>

        {loading ? (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>Loading organizations…</div>
            <div style={{ fontSize: 13, color: "#8b90a7", lineHeight: 1.6 }}>Fetching your organizations. This will only take a moment.</div>
          </>
        ) : !hasOrgs ? (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>No organizations yet</div>
            <div style={{ fontSize: 13, color: "#8b90a7", lineHeight: 1.7 }}>
              Head to the <strong style={{ color: "#1C2551" }}>Organizations</strong> tab to create your first organization, then come back here.
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>Choose an organization</div>
            <div style={{ fontSize: 13, color: "#8b90a7", lineHeight: 1.7, marginBottom: 22 }}>
              Pick an organization to view <strong style={{ color: "#1C2551" }}>{featureLabel}</strong>. Use the <strong style={{ color: "#1C2551" }}>Org</strong> selector in the header — it&rsquo;s in the top-right.
            </div>
            {/* Pointer chip toward the header Org dropdown */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 99, background: "rgba(239,78,36,0.08)", border: "1px solid rgba(239,78,36,0.22)", color: "#EF4E24", fontSize: 12, fontWeight: 700 }}>
              <span style={{ fontSize: 14 }}>↑</span> Select from the <span style={{ textDecoration: "underline" }}>Org</span> dropdown above
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Placeholder for pages not yet built ────────────────────────────────────

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div style={p.page}>
      <div style={p.placeholder}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>{title}</h2>
        <p style={{ fontSize: 14, color: "#8b90a7", maxWidth: 320, textAlign: "center", lineHeight: 1.6 }}>
          This section is under active development. Your team can start building here.
        </p>
        <div style={p.devBadge}>Development in Progress</div>
      </div>
    </div>
  );
}

const p: Record<string, React.CSSProperties> = {
  page:     { padding: 24, display: "flex", flexDirection: "column", gap: 16 },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 },
  tableCard: {
    background: "#fff", borderRadius: 12, border: "1px solid #EAECF4",
    boxShadow: "0 1px 4px rgba(28,37,81,0.07)", overflow: "hidden",
  },
  table: { width: "100%", borderCollapse: "collapse" },
  thead: { background: "#F5F7FB" },
  th:    { padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5 },
  tr:    { borderTop: "1px solid #EAECF4" },
  td:    { padding: "13px 16px" },
  orgAvatar: {
    width: 32, height: 32, borderRadius: 8, background: "#1C2551", color: "#fff",
    fontWeight: 700, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center",
  },
  badge: {
    display: "inline-block", fontSize: 10, fontWeight: 700,
    borderRadius: 20, padding: "3px 10px", letterSpacing: 0.3,
  },
  configBtn: {
    padding: "5px 14px", border: "1px solid #EAECF4", borderRadius: 6,
    background: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#1C2551",
    fontFamily: "Poppins, sans-serif",
  },
  primBtn: {
    padding: "9px 20px", background: "#EF4E24", border: "none", borderRadius: 8,
    cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff",
    fontFamily: "Poppins, sans-serif",
  },
  secBtn: {
    padding: "9px 18px", background: "#fff", border: "1px solid #EAECF4", borderRadius: 8,
    cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#1C2551",
    fontFamily: "Poppins, sans-serif",
  },
  successBanner: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)",
    borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#16a34a",
  },
  dismissBtn: {
    background: "none", border: "none", cursor: "pointer", color: "#16a34a", fontSize: 14,
  },
  empty: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: 64, color: "#8b90a7", fontSize: 13,
  },
  placeholder: {
    background: "#fff", borderRadius: 16, border: "1px solid #EAECF4",
    padding: 64, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
  },
  devBadge: {
    marginTop: 20, background: "rgba(239,78,36,0.08)", border: "1px solid rgba(239,78,36,0.2)",
    color: "#EF4E24", borderRadius: 20, padding: "6px 18px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
  },
};
