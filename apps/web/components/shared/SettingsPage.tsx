"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { profileApi, NotificationPrefs, AppearancePrefs } from "@/lib/profile-api";
import { BrandKitDTO, DEFAULT_BRAND_KIT, brandingApi, useBrandTheme } from "@/lib/brand-theme";
import { superadminsApi } from "@/lib/superadmins-api";
import { api } from "@/lib/api";
import ZoomConnectionStatus from "@/components/zoom/ZoomConnectionStatus";

// ── Design tokens ─────────────────────────────────────────────────
const NAVY   = "#1C2551";
const ORANGE = "#EF4E24";
const BORDER = "#EAECF4";
const BG     = "#F5F7FB";
const MUTED  = "#8b90a7";

// ── Role-aware tab visibility ─────────────────────────────────────
// Every role sees My Profile + Notifications + Appearance.
// Future role-specific tabs can be added here without a new file.
type Tab = "My Profile" | "Notifications" | "Brand Kit" | "Appearance" | "Super Admins" | "Integrations";

// ── Default prefs (shown while loading / API down) ────────────────
const DEFAULT_NOTIF: NotificationPrefs = {
  email_notifications: true,
  push_notifications:  true,
  sms_alerts:          false,
  upcoming_deadlines:  true,
  feedback_received:   true,
  session_reminders:   true,
  weekly_digest:       false,
};
const DEFAULT_APPEAR: AppearancePrefs = {
  theme: "light", density: "comfortable",
  language: "en", date_format: "DD/MM/YYYY", timezone: "IST (UTC+5:30)",
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { refreshBrand } = useBrandTheme();

  const [activeTab, setActiveTab]   = useState<Tab>("My Profile");
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState("");

  // My Account state
  const [name, setName]             = useState(user?.name ?? "");
  const [email]                     = useState(user?.email ?? "");
  const [curPwd, setCurPwd]         = useState("");
  const [newPwd, setNewPwd]         = useState("");
  const [confPwd, setConfPwd]       = useState("");

  // Notification prefs state
  const [notif, setNotif]           = useState<NotificationPrefs>(DEFAULT_NOTIF);

  // Appearance prefs state
  const [appear, setAppear]         = useState<AppearancePrefs>(DEFAULT_APPEAR);
  const [brand, setBrand]           = useState<BrandKitDTO>(DEFAULT_BRAND_KIT);

  // Load prefs on mount
  useEffect(() => {
    profileApi.getPrefs()
      .then(r => {
        if (r.data.notifications) setNotif(r.data.notifications);
        if (r.data.appearance)    setAppear(r.data.appearance);
      })
      .catch(() => { /* use defaults */ });
  }, []);

  useEffect(() => {
    if (user?.role !== "program_manager" || !user.org_id) return;
    void Promise.resolve().then(() => brandingApi.get(user.org_id!).then(r => setBrand(r.data ?? DEFAULT_BRAND_KIT)).catch(() => {}));
  }, [user?.role, user?.org_id]);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      if (activeTab === "My Profile") {
        if (name.trim()) await profileApi.updateMe({ name: name.trim() });
        if (newPwd) {
          if (newPwd.length < 8) throw new Error("New password must be at least 8 characters");
          if (newPwd !== confPwd) throw new Error("New passwords do not match");
          await profileApi.changePassword({ current_password: curPwd, new_password: newPwd });
          setCurPwd(""); setNewPwd(""); setConfPwd("");
        }
      } else if (activeTab === "Notifications") {
        await profileApi.updateNotifPrefs(notif);
      } else if (activeTab === "Brand Kit") {
        if (!user?.org_id) throw new Error("Organization not found");
        const res = await brandingApi.update(user.org_id, brand);
        setBrand(res.data ?? brand);
        await refreshBrand();
      } else if (activeTab === "Appearance") {
        await profileApi.updateAppearancePrefs(appear);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  const initials = user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const tabs: Tab[] = user.role === "program_manager"
    ? ["My Profile", "Notifications", "Brand Kit", "Appearance"]
    // Only the PRIMARY Super Admin can mint Secondary Super Admins.
    : user.role === "superadmin"
      ? ["My Profile", "Notifications", "Appearance", "Super Admins"]
      // Integrations tab (per-user Zoom connect) deprecated 2026-07-10 — moving
      // to org-level Zoom credentials (Superadmin-entered). Not deleted: the
      // Tab type, TAB_ICON entry, and render block below are untouched, so
      // restoring this tab is just re-adding "Integrations" to this array.
      : ["My Profile", "Notifications", "Appearance"];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 0" }}>
      {/* Tab bar — underline style */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: `1px solid ${BORDER}` }}>
        {tabs.map(tab => {
          const active = activeTab === tab;
          return (
            <button key={tab} onClick={() => { setActiveTab(tab); setError(""); setSaved(false); }}
              style={{
                padding: "10px 16px", background: "none", border: "none",
                borderBottom: `2px solid ${active ? ORANGE : "transparent"}`, marginBottom: -1,
                fontSize: 13, fontWeight: active ? 700 : 500,
                color: active ? ORANGE : MUTED,
                cursor: "pointer", fontFamily: "Poppins,sans-serif",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <span>{TAB_ICON[tab]}</span> {tab}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ minHeight: 400 }}>
        {activeTab === "My Profile" && (
          <AccountTab
            initials={initials}
            name={name} setName={setName}
            email={email}
            role={user.role}
            curPwd={curPwd} setCurPwd={setCurPwd}
            newPwd={newPwd} setNewPwd={setNewPwd}
            confPwd={confPwd} setConfPwd={setConfPwd}
          />
        )}
        {activeTab === "Notifications" && (
          <NotificationsTab prefs={notif} onChange={setNotif} />
        )}
        {activeTab === "Brand Kit" && user.role === "program_manager" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {user.org_id && <ZoomOrgStatusBadge orgId={user.org_id} />}
            <BrandKitTab brand={brand} onChange={setBrand} />
          </div>
        )}
        {activeTab === "Appearance" && (
          <AppearanceTab prefs={appear} onChange={setAppear} />
        )}
        {activeTab === "Super Admins" && user.role === "superadmin" && (
          <SuperAdminsTab />
        )}
        {activeTab === "Integrations" && (user.role === "faculty" || user.role === "coach") && (
          <SettingsBox>
            <SectionLabel>ZOOM</SectionLabel>
            <ZoomConnectionStatus returnTo="/dashboard/faculty?tab=settings" />
          </SettingsBox>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#ef4444" }}>
          {error}
        </div>
      )}

      {/* Footer — the Super Admins/Integrations tabs manage their own actions */}
      {activeTab !== "Super Admins" && activeTab !== "Integrations" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
          <div style={{ fontSize: 11, color: MUTED }}>Changes apply immediately after saving.</div>
          <button onClick={handleSave} disabled={saving}
            style={{ background: ORANGE, color: "#fff", border: "none", borderRadius: 8, padding: "9px 28px", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "Poppins,sans-serif", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Super Admins tab (Primary Super Admin only) ───────────────────
interface SecondarySADTO { id: string; name: string; email: string; role: string; is_active: boolean; created_at: string; }

function SuperAdminsTab() {
  const [list, setList] = useState<SecondarySADTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await superadminsApi.list();
      setList(res.data ?? []);
    } catch { /* non-fatal */ } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function create() {
    setErr(""); setOk("");
    if (!name.trim() || !email.trim() || pwd.length < 6) { setErr("Name, email, and a 6+ character password are required."); return; }
    setSaving(true);
    try {
      await superadminsApi.create({ name: name.trim(), email: email.trim(), password: pwd });
      setOk(`Secondary Super Admin “${name.trim()}” created.`);
      setName(""); setEmail(""); setPwd("");
      await load();
    } catch (e) { setErr((e as Error).message || "Failed to create secondary super admin"); }
    finally { setSaving(false); }
  }

  const field: React.CSSProperties = { width: "100%", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: NAVY, fontFamily: "Poppins,sans-serif", boxSizing: "border-box", outline: "none" };
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, marginBottom: 6, display: "block" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section>
        <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Create Secondary Super Admin</div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 16, lineHeight: 1.6 }}>
          A Secondary Super Admin has the full Super Admin workspace except Billing, System Health, Integrations, and the Audit Log. They cannot create other super admins.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><label style={lbl}>FULL NAME</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Anita Rao" style={field} /></div>
          <div><label style={lbl}>EMAIL</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@company.com" style={field} /></div>
        </div>
        <div style={{ marginBottom: 14 }}><label style={lbl}>TEMPORARY PASSWORD</label><input type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="Min. 6 characters" style={{ ...field, maxWidth: 320 }} /></div>
        {err && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 10 }}>{err}</div>}
        {ok && <div style={{ fontSize: 12, color: "#22c55e", marginBottom: 10 }}>{ok}</div>}
        <button onClick={create} disabled={saving} style={{ background: ORANGE, color: "#fff", border: "none", borderRadius: 8, padding: "9px 22px", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "Poppins,sans-serif", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Creating…" : "Create Secondary Super Admin"}
        </button>
      </section>

      <section>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Existing Secondary Super Admins ({list.length})</div>
        {loading ? (
          <div style={{ fontSize: 12, color: MUTED }}>Loading…</div>
        ) : list.length === 0 ? (
          <div style={{ fontSize: 12, color: MUTED, padding: "16px 0" }}>None created yet.</div>
        ) : (
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
            {list.map((u, i) => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderTop: i > 0 ? `1px solid ${BORDER}` : "none", background: "#fff" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#22c55e", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{u.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>{u.email}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: u.is_active ? "#22c55e" : MUTED, background: u.is_active ? "rgba(34,197,94,0.1)" : BG, borderRadius: 99, padding: "3px 10px" }}>{u.is_active ? "ACTIVE" : "INACTIVE"}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── My Account tab ────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  superadmin:      "Super Administrator",
  program_manager: "Program Manager (Business Admin)",
  faculty:         "Faculty",
  coach:           "Coach",
  participant:     "Participant",
};

function AccountTab({ initials, name, setName, email, role, curPwd, setCurPwd, newPwd, setNewPwd, confPwd, setConfPwd }: {
  initials: string; name: string; setName: (v: string) => void;
  email: string; role: string;
  curPwd: string; setCurPwd: (v: string) => void;
  newPwd: string; setNewPwd: (v: string) => void;
  confPwd: string; setConfPwd: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Profile section */}
      <SettingsBox>
        <SectionLabel>PROFILE</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: NAVY, color: "#fff", fontWeight: 700, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{name || "—"}</div>
            <button style={{ background: `${ORANGE}14`, border: "none", color: ORANGE, borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins,sans-serif", alignSelf: "flex-start" }}>
              Change Photo
            </button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SettingsField label="FULL NAME" value={name} onChange={setName} placeholder="Your name" />
          <SettingsField label="EMAIL ADDRESS" value={email} readonly />
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Role</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Assigned by platform administrator</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: NAVY, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "5px 14px" }}>
                {ROLE_LABEL[role] ?? role}
              </span>
            </div>
          </div>
        </div>
      </SettingsBox>

      {/* Change password section */}
      <SettingsBox>
        <SectionLabel>CHANGE PASSWORD</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SettingsField label="CURRENT PASSWORD" value={curPwd} onChange={setCurPwd} type="password" placeholder="••••••••" />
          <SettingsField label="NEW PASSWORD" value={newPwd} onChange={setNewPwd} type="password" placeholder="Min 8 characters" />
          <SettingsField label="CONFIRM NEW PASSWORD" value={confPwd} onChange={setConfPwd} type="password" placeholder="Repeat new password" />
        </div>
      </SettingsBox>
    </div>
  );
}

// ── Notifications tab ─────────────────────────────────────────────

function NotificationsTab({ prefs, onChange }: { prefs: NotificationPrefs; onChange: (p: NotificationPrefs) => void }) {
  function toggle(key: keyof NotificationPrefs) {
    onChange({ ...prefs, [key]: !prefs[key] });
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SettingsBox>
        <SectionLabel>CHANNELS</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <ToggleRow label="Email Notifications" desc="Receive all updates via email"
            checked={prefs.email_notifications} onChange={() => toggle("email_notifications")} />
          <ToggleRow label="Push Notifications" desc="Browser and mobile push alerts"
            checked={prefs.push_notifications} onChange={() => toggle("push_notifications")} />
          <ToggleRow label="SMS Alerts" desc="Critical alerts via SMS only"
            checked={prefs.sms_alerts} onChange={() => toggle("sms_alerts")} last />
        </div>
      </SettingsBox>

      <SettingsBox>
        <SectionLabel>ALERT TYPES</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <ToggleRow label="Upcoming Deadlines" desc="Pre-work and activity due dates"
            checked={prefs.upcoming_deadlines} onChange={() => toggle("upcoming_deadlines")} />
          <ToggleRow label="Feedback Received" desc="360° and peer feedback alerts"
            checked={prefs.feedback_received} onChange={() => toggle("feedback_received")} />
          <ToggleRow label="Session Reminders" desc="Live session start reminders"
            checked={prefs.session_reminders} onChange={() => toggle("session_reminders")} />
          <ToggleRow label="Weekly Digest" desc="Program progress summary every Monday"
            checked={prefs.weekly_digest} onChange={() => toggle("weekly_digest")} last />
        </div>
      </SettingsBox>
    </div>
  );
}


// -- Brand Kit tab --------------------------------------------------

const BRAND_PRESETS = [
  { name: "XA Default", primary: "#EF4E24", sidebar: "#1C2551", accent: "#EF4E24", surface: "#F5F7FB", text: "#1C2551" },
  { name: "Ocean", primary: "#0066CC", sidebar: "#003D7A", accent: "#00B4D8", surface: "#EFF6FF", text: "#0F172A" },
  { name: "Forest", primary: "#1A7A4A", sidebar: "#0D4A2D", accent: "#4CAF50", surface: "#F0FDF4", text: "#14532D" },
  { name: "Ruby", primary: "#C0392B", sidebar: "#2C2C2C", accent: "#E74C3C", surface: "#FFF5F5", text: "#1A1A1A" },
];
const BRAND_COLOR_FIELDS: { key: keyof Pick<BrandKitDTO, "primary" | "sidebar" | "accent" | "surface" | "text">; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "sidebar", label: "Sidebar" },
  { key: "accent", label: "Accent" },
  { key: "surface", label: "Surface" },
  { key: "text", label: "Text" },
];
const BRAND_FONTS = ["Poppins", "Inter", "Roboto", "Open Sans", "Montserrat", "Lato"];

// Read-only Zoom connection indicator for the org's own PM — status only,
// never the secret (the backend route this calls, /organizations/:id/
// zoom-credentials/status, has no field capable of returning it). Credentials
// are entered by Superadmin only, via ZoomCredentialsModal.
function ZoomOrgStatusBadge({ orgId }: { orgId: string }) {
  const [status, setStatus] = useState<{ connected: boolean; account_id_masked?: string } | null>(null);
  useEffect(() => {
    api.get<{ data: { connected: boolean; account_id_masked?: string } }>(`/organizations/${orgId}/zoom-credentials/status`)
      .then(r => setStatus(r.data))
      .catch(() => setStatus({ connected: false }));
  }, [orgId]);

  if (!status) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8,
      background: status.connected ? "rgba(34,197,94,0.08)" : BG,
      border: `1px solid ${status.connected ? "rgba(34,197,94,0.2)" : BORDER}`,
      fontSize: 12, fontWeight: 600, color: status.connected ? "#16a34a" : MUTED,
    }}>
      {status.connected ? `✓ Zoom connected — account ${status.account_id_masked}` : "Zoom: not connected (set up by Superadmin)"}
    </div>
  );
}

function BrandKitTab({ brand, onChange }: { brand: BrandKitDTO; onChange: (b: BrandKitDTO) => void }) {
  const setBrand = <K extends keyof BrandKitDTO>(key: K, value: BrandKitDTO[K]) => onChange({ ...brand, [key]: value });
  return (
    <div style={{ display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 300, display: "flex", flexDirection: "column", gap: 18 }}>
        <BrandSection title="COLOR PRESETS">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {BRAND_PRESETS.map(p => (
              <button key={p.name} onClick={() => onChange({ ...brand, ...p })}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", border: `1.5px solid ${brand.primary === p.primary && brand.sidebar === p.sidebar ? p.primary : BORDER}`, borderRadius: 20, background: "#fff", cursor: "pointer", fontSize: 11, color: NAVY, fontWeight: 500 }}>
                <span style={{ display: "flex", gap: 2 }}>{[p.sidebar, p.primary, p.accent].map((c, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c, display: "inline-block" }} />)}</span>
                {p.name}
              </button>
            ))}
          </div>
        </BrandSection>

        <BrandSection title="BRAND COLORS">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {BRAND_COLOR_FIELDS.map(f => (
              <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <label style={{ fontSize: 12, color: NAVY, flex: 1 }}>{f.label}</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="color" value={brand[f.key]} onChange={e => setBrand(f.key, e.target.value)} style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${BORDER}`, cursor: "pointer", padding: 2 }} />
                  <input value={brand[f.key]} onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) setBrand(f.key, e.target.value); }} style={{ width: 88, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontFamily: "monospace", color: NAVY }} />
                </div>
              </div>
            ))}
          </div>
        </BrandSection>

        <BrandSection title="BRAND FONT">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {BRAND_FONTS.map(f => (
              <button key={f} onClick={() => setBrand("font", f)} style={{ padding: "6px 12px", border: `1.5px solid ${brand.font === f ? brand.primary : BORDER}`, borderRadius: 8, background: brand.font === f ? `${brand.primary}10` : "#fff", color: brand.font === f ? brand.primary : MUTED, fontSize: 12, fontWeight: brand.font === f ? 700 : 400, cursor: "pointer", fontFamily: `${f}, sans-serif` }}>{f}</button>
            ))}
          </div>
        </BrandSection>

        <BrandSection title="ORG NAME DISPLAY">
          <input value={brand.logo_text} onChange={e => setBrand("logo_text", e.target.value)} style={{ width: "100%", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: `${brand.font}, sans-serif`, color: brand.text, background: "#fff" }} />
        </BrandSection>

        <BrandSection title="LOGO URL">
          <input value={brand.logo_url} onChange={e => setBrand("logo_url", e.target.value)} placeholder="https://..." style={{ width: "100%", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: NAVY, background: "#fff" }} />
        </BrandSection>
      </div>

      <div style={{ width: 440, minWidth: 300, flex: "0 1 440px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, marginBottom: 10 }}>LIVE PREVIEW</div>
        <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${BORDER}`, boxShadow: "0 4px 24px rgba(0,0,0,0.1)", fontFamily: `${brand.font}, sans-serif` }}>
          <div style={{ display: "flex", height: 380 }}>
            <div style={{ width: 120, background: brand.sidebar, display: "flex", flexDirection: "column", padding: "10px 0", gap: 2, flexShrink: 0 }}>
              <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 4 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: `${brand.primary}35`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: brand.primary }} />
                </div>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 8, lineHeight: 1.3 }}>{brand.logo_text.split(" ").slice(0, 2).join(" ")}</span>
              </div>
              {["Dashboard", "Learning", "Sessions", "Assessment", "Coaching"].map((item, i) => (
                <div key={item} style={{ padding: "5px 12px", display: "flex", alignItems: "center", gap: 6, background: i === 0 ? `${brand.primary}25` : "transparent", borderRight: i === 0 ? `2.5px solid ${brand.primary}` : "2.5px solid transparent" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: i === 0 ? brand.primary : "rgba(255,255,255,0.35)", flexShrink: 0 }} />
                  <span style={{ fontSize: 8, color: i === 0 ? "#fff" : "rgba(255,255,255,0.5)", fontWeight: i === 0 ? 700 : 400 }}>{item}</span>
                </div>
              ))}
              <div style={{ marginTop: "auto", padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: brand.primary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ fontSize: 7, color: "#fff", fontWeight: 700 }}>RS</span></div>
                <span style={{ fontSize: 7, color: "rgba(255,255,255,0.55)" }}>Riya Sharma</span>
              </div>
            </div>
            <div style={{ flex: 1, background: brand.surface, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ height: 30, background: "#fff", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", flexShrink: 0 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: brand.text }}>My Journey</span>
                <div style={{ padding: "1px 6px", background: `${brand.primary}15`, border: `1px solid ${brand.primary}30`, borderRadius: 8, fontSize: 7, color: brand.primary, fontWeight: 700 }}>AI On</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 8 }}>
                {[["45%", "Progress", brand.primary], ["#7", "Rank", brand.text], ["18", "Done", brand.accent], ["5d", "Streak", brand.primary]].map(([v, l, c]) => (
                  <div key={l} style={{ background: "#fff", borderRadius: 7, padding: "7px 9px", border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: c }}>{v}</div>
                    <div style={{ fontSize: 8, color: MUTED, marginTop: 1 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ margin: "0 8px", background: "#fff", borderRadius: 8, padding: "8px 10px", border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: brand.text, marginBottom: 5 }}>Today&apos;s Activities</div>
                <div style={{ padding: "6px 8px", background: `${brand.primary}07`, border: `1px solid ${brand.primary}20`, borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 8, color: brand.text, flex: 1, lineHeight: 1.3 }}>Strategic Leadership Case Study</span>
                  <div style={{ padding: "3px 8px", background: brand.primary, borderRadius: 6, fontSize: 7, color: "#fff", fontWeight: 700, flexShrink: 0 }}>Start</div>
                </div>
                <div style={{ marginTop: 5, height: 4, background: `${brand.primary}15`, borderRadius: 99 }}><div style={{ height: "100%", width: "60%", background: brand.primary, borderRadius: 99 }} /></div>
              </div>
              <div style={{ padding: 8, marginTop: "auto" }}><div style={{ padding: 8, background: brand.primary, borderRadius: 8, textAlign: "center", fontSize: 9, fontWeight: 700, color: "#fff" }}>Continue Learning</div></div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 4 }}>{BRAND_COLOR_FIELDS.map(f => <div key={f.key} title={`${f.label}: ${brand[f.key]}`} style={{ flex: 1, height: 18, borderRadius: 5, background: brand[f.key], border: "1px solid rgba(0,0,0,0.07)" }} />)}</div>
      </div>
    </div>
  );
}

function BrandSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ background: BG, borderRadius: 12, padding: "16px 18px" }}><div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, marginBottom: 14 }}>{title}</div>{children}</div>;
}
// ── Appearance tab ────────────────────────────────────────────────

function AppearanceTab({ prefs, onChange }: { prefs: AppearancePrefs; onChange: (p: AppearancePrefs) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SettingsBox>
        <SectionLabel>DISPLAY</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <AppRow label="Theme">
            <SegmentedControl
              options={["Light", "Dark", "Auto"]}
              value={prefs.theme.charAt(0).toUpperCase() + prefs.theme.slice(1)}
              onChange={v => onChange({ ...prefs, theme: v.toLowerCase() as AppearancePrefs["theme"] })}
              icons={["✦", "◉", "◎"]}
            />
          </AppRow>
          <AppRow label="Density" desc="Controls spacing between UI elements">
            <SegmentedControl
              options={["Compact", "Comfortable", "Spacious"]}
              value={prefs.density.charAt(0).toUpperCase() + prefs.density.slice(1)}
              onChange={v => onChange({ ...prefs, density: v.toLowerCase() as AppearancePrefs["density"] })}
            />
          </AppRow>
        </div>
      </SettingsBox>

      <SettingsBox>
        <SectionLabel>LANGUAGE & REGION</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <AppRow label="Interface Language">
            <select value={prefs.language} onChange={e => onChange({ ...prefs, language: e.target.value })} style={selectStyle}>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="ta">Tamil</option>
              <option value="te">Telugu</option>
            </select>
          </AppRow>
          <AppRow label="Date Format">
            <select value={prefs.date_format} onChange={e => onChange({ ...prefs, date_format: e.target.value })} style={selectStyle}>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </AppRow>
          <AppRow label="Time Zone">
            <select value={prefs.timezone} onChange={e => onChange({ ...prefs, timezone: e.target.value })} style={selectStyle}>
              <option value="IST (UTC+5:30)">IST (UTC+5:30)</option>
              <option value="UTC">UTC</option>
              <option value="PST (UTC-8)">PST (UTC-8)</option>
              <option value="EST (UTC-5)">EST (UTC-5)</option>
              <option value="CET (UTC+1)">CET (UTC+1)</option>
              <option value="SGT (UTC+8)">SGT (UTC+8)</option>
            </select>
          </AppRow>
        </div>
      </SettingsBox>
    </div>
  );
}

// ── Reusable primitives ───────────────────────────────────────────

// SettingsBox groups a section into a white card, matching the settings design.
function SettingsBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", padding: "20px 22px" }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 14 }}>{children}</div>;
}

function SettingsField({ label, value, onChange, placeholder, type = "text", readonly }: {
  label: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; type?: string; readonly?: boolean;
}) {
  return (
    <div>
      <div style={fieldLabel}>{label}</div>
      <input
        type={type} value={value}
        onChange={e => !readonly && onChange?.(e.target.value)}
        placeholder={placeholder} readOnly={readonly}
        style={{
          border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px",
          fontSize: 13, color: readonly ? MUTED : NAVY, width: "100%",
          fontFamily: "Poppins,sans-serif", outline: "none",
          background: readonly ? BG : "#fff", boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange, last }: {
  label: string; desc: string; checked: boolean; onChange: () => void; last?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: last ? "none" : `1px solid ${BORDER}` }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 11, color: MUTED }}>{desc}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: checked ? ORANGE : "#D0D3E0",
        border: "none", cursor: "pointer", position: "relative",
        transition: "background 0.2s", flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: checked ? 21 : 3,
        width: 16, height: 16, borderRadius: "50%", background: "#fff",
        transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

function AppRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function SegmentedControl({ options, value, onChange, icons }: {
  options: string[]; value: string; onChange: (v: string) => void; icons?: string[];
}) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {options.map((opt, i) => {
        const active = value === opt;
        return (
          <button key={opt} onClick={() => onChange(opt)}
            style={{
              padding: "5px 14px", borderRadius: 6, fontSize: 11, fontWeight: active ? 700 : 500,
              border: `1px solid ${active ? ORANGE : BORDER}`,
              background: active ? `${ORANGE}14` : "#fff",
              color: active ? ORANGE : MUTED,
              cursor: "pointer", fontFamily: "Poppins,sans-serif",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            {icons?.[i] && <span style={{ fontSize: 10 }}>{icons[i]}</span>}
            {opt}
          </button>
        );
      })}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 32px 7px 12px",
  fontSize: 12, color: NAVY, background: "#fff", fontFamily: "Poppins,sans-serif",
  outline: "none", cursor: "pointer", appearance: "auto",
};

const fieldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: MUTED,
  letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6,
};

const TAB_ICON: Record<Tab, string> = {
  "My Profile":    "◎",
  "Notifications": "◆",
  "Brand Kit":     "BK",
  "Appearance":    "◇",
  "Super Admins":  "★",
  "Integrations":  "⚡",
};
