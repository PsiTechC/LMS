"use client";

import { useState, useEffect, useCallback } from "react";
import DashboardShell from "@/components/layout/DashboardShell";
import StatCard from "@/components/superadmin/StatCard";
import CreateOrgWizard from "@/components/superadmin/CreateOrgWizard";
import { api, ApiResponse, OrgResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import ProfilePage from "@/components/shared/ProfilePage";
import SettingsPage from "@/components/shared/SettingsPage";

const PAGE_META: Record<string, { title: string; subtitle?: string }> = {
  "sa-orgs":         { title: "Organizations",   subtitle: "Manage all client organizations" },
  "profile":         { title: "My Profile" },
  "settings":        { title: "Settings" },
  "sa-programs":     { title: "Programs",         subtitle: "Coming soon — Development in progress" },
  "sa-config":       { title: "Platform Config",  subtitle: "Coming soon — Development in progress" },
  "sa-roles":        { title: "Role Management",  subtitle: "Coming soon — Development in progress" },
  "sa-billing":      { title: "Billing",           subtitle: "Coming soon — Development in progress" },
  "sa-health":       { title: "System Health",    subtitle: "Coming soon — Development in progress" },
  "sa-integrations": { title: "Integrations",     subtitle: "Coming soon — Development in progress" },
  "sa-audit":        { title: "Audit Log",         subtitle: "Coming soon — Development in progress" },
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
  const [activePage, setActivePage] = useState("sa-orgs");
  const [orgs, setOrgs]             = useState<OrgResponse[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (!loading && (!user || user.role !== "superadmin")) {
      router.replace("/login");
    }
  }, [user, loading, router]);

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

  function handleOrgCreated(org: { name: string }) {
    setShowWizard(false);
    setSuccessMsg(`Organization "${org.name}" launched successfully!`);
    fetchOrgs();
    setTimeout(() => setSuccessMsg(""), 5000);
  }

  const meta = PAGE_META[activePage] ?? { title: activePage };

  return (
    <DashboardShell
      activePage={activePage}
      title={meta.title}
      subtitle={meta.subtitle}
      onNavigate={setActivePage}
    >
      {activePage === "profile" ? (
        <div style={{ padding: 24 }}><ProfilePage /></div>
      ) : activePage === "settings" ? (
        <div style={{ padding: 24 }}><SettingsPage /></div>
      ) : activePage === "sa-orgs" ? (
        <OrgsPage
          orgs={orgs}
          loading={orgsLoading}
          successMsg={successMsg}
          onNewOrg={() => setShowWizard(true)}
          onDismiss={() => setSuccessMsg("")}
        />
      ) : (
        <PlaceholderPage title={meta.title} />
      )}

      {showWizard && (
        <CreateOrgWizard onClose={() => setShowWizard(false)} onComplete={handleOrgCreated} />
      )}
    </DashboardShell>
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
