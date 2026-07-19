"use client";

import { useState, useEffect } from "react";
import { api, ApiResponse, OrgResponse } from "@/lib/api";
import { BrandKitDTO, DEFAULT_BRAND_KIT, brandingApi } from "@/lib/brand-theme";

// ── Design tokens (matches apps/CLAUDE.md) ───────────────────────────────────
const NAVY = "#182848";
const ORANGE = "#C8A860";
const BORDER = "#E6DED0";
const BG = "#F7F5F0";
const MUTED = "#4A5573";
const GREEN = "#22c55e";
const ff = { fontFamily: "Poppins, sans-serif" } as const;

const INDUSTRIES = [
  "Banking & Finance", "Manufacturing", "Technology", "Healthcare",
  "Energy & Resources", "Retail & FMCG", "Government & PSU",
  "Education", "Consulting", "Other",
];
const SIZES = ["<500", "500–2K", "2K–10K", "10K+"];
const PLANS = [
  { id: "starter", label: "Starter", color: "#4A5573" },
  { id: "pro", label: "Pro", color: "#C8A860" },
  { id: "enterprise", label: "Enterprise", color: "#182848" },
];
const STATUSES = ["active", "trial", "suspended"];

type Tab = "Basic Info" | "Plan & Seats" | "Branding" | "Integrations";
const TABS: Tab[] = ["Basic Info", "Plan & Seats", "Branding", "Integrations"];

interface ZoomStatusDTO { connected: boolean; account_id_masked?: string; connected_at?: string }

/**
 * Full-page organization configuration panel — replaces the old per-org
 * "Config" modal (which was Zoom-only). Basic Info / Plan & Seats / Branding
 * (read-only for Superadmin — branding:manage stays PM-only, see
 * api/internal/organizations/handler.go) / Integrations (Zoom, moved here
 * from the standalone ZoomCredentialsModal) as tabs, same underline-tab +
 * SettingsBox convention as apps/web/components/shared/SettingsPage.tsx.
 */
export default function OrgConfigPanel({ org, onBack, onSaved }: {
  org: OrgResponse;
  onBack: () => void;
  onSaved: (updated: OrgResponse) => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("Basic Info");

  // Basic Info + Plan & Seats share one form/save action (both PATCH the
  // same /organizations/:id endpoint).
  const [name, setName] = useState(org.name);
  const [industry, setIndustry] = useState(org.industry ?? "");
  const [size, setSize] = useState(org.size ?? "");
  const [status, setStatus] = useState(org.status);
  const [plan, setPlan] = useState(org.plan);
  const [seats, setSeats] = useState(org.seats);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Branding — read-only display for Superadmin.
  const [brand, setBrand] = useState<BrandKitDTO>(DEFAULT_BRAND_KIT);
  const [loadingBrand, setLoadingBrand] = useState(true);

  // Integrations (Zoom) state
  const [zoomStatus, setZoomStatus] = useState<ZoomStatusDTO | null>(null);
  const [loadingZoom, setLoadingZoom] = useState(true);
  const [accountID, setAccountID] = useState("");
  const [clientID, setClientID] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [hostUser, setHostUser] = useState("");
  const [zoomSaving, setZoomSaving] = useState(false);
  const [zoomRemoving, setZoomRemoving] = useState(false);
  const [zoomErr, setZoomErr] = useState("");
  const [zoomOk, setZoomOk] = useState("");

  useEffect(() => {
    brandingApi.get(org.id)
      .then((r) => setBrand(r.data ?? DEFAULT_BRAND_KIT))
      .catch(() => setBrand(DEFAULT_BRAND_KIT))
      .finally(() => setLoadingBrand(false));
  }, [org.id]);

  function loadZoomStatus() {
    setLoadingZoom(true);
    api.get<ApiResponse<ZoomStatusDTO>>(`/organizations/${org.id}/zoom-credentials/status`)
      .then((r) => setZoomStatus(r.data))
      .catch(() => setZoomStatus({ connected: false }))
      .finally(() => setLoadingZoom(false));
  }
  useEffect(() => { loadZoomStatus(); }, [org.id]);

  async function saveOrgDetails() {
    setSaving(true); setError("");
    try {
      const res = await api.patch<ApiResponse<OrgResponse>>(`/organizations/${org.id}`, {
        name, industry, size, status, plan, seats,
      });
      if (res.data) onSaved(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function saveZoom() {
    setZoomErr(""); setZoomOk("");
    if (!accountID.trim() || !clientID.trim() || !clientSecret.trim() || !hostUser.trim()) {
      setZoomErr("Account ID, Client ID, Client Secret, and Host User (ID or email) are all required.");
      return;
    }
    setZoomSaving(true);
    try {
      await api.put(`/organizations/${org.id}/zoom-credentials`, {
        account_id: accountID.trim(), client_id: clientID.trim(), client_secret: clientSecret.trim(),
        host_user_id_or_email: hostUser.trim(),
      });
      setZoomOk("Zoom credentials saved.");
      setAccountID(""); setClientID(""); setClientSecret(""); setHostUser("");
      loadZoomStatus();
    } catch (e) {
      setZoomErr((e as Error).message || "Failed to save Zoom credentials");
    } finally {
      setZoomSaving(false);
    }
  }

  async function removeZoom() {
    setZoomErr(""); setZoomOk("");
    setZoomRemoving(true);
    try {
      await api.delete(`/organizations/${org.id}/zoom-credentials`);
      setZoomOk("Zoom credentials removed.");
      loadZoomStatus();
    } catch (e) {
      setZoomErr((e as Error).message || "Failed to remove Zoom credentials");
    } finally {
      setZoomRemoving(false);
    }
  }

  const showFooter = activeTab === "Basic Info" || activeTab === "Plan & Seats";

  return (
    <div style={{ ...ff, display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={backBtn}>← Back to Organizations</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: NAVY, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
          {org.name[0]}
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: NAVY }}>{org.name}</div>
          <div style={{ fontSize: 11, color: MUTED, fontFamily: "monospace" }}>{org.slug}</div>
        </div>
      </div>

      {/* Tab bar — underline style, matches SettingsPage.tsx */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${BORDER}` }}>
        {TABS.map((tab) => {
          const active = activeTab === tab;
          return (
            <button key={tab} onClick={() => { setActiveTab(tab); setError(""); setSaved(false); }}
              style={{
                padding: "10px 16px", background: "none", border: "none",
                borderBottom: `2px solid ${active ? ORANGE : "transparent"}`, marginBottom: -1,
                fontSize: 13, fontWeight: active ? 700 : 500,
                color: active ? ORANGE : MUTED,
                cursor: "pointer", ...ff,
              }}>
              {tab}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ minHeight: 360 }}>
        {activeTab === "Basic Info" && (
          <SettingsBox>
            <SectionLabel>ORGANIZATION DETAILS</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Organization Name">
                <input value={name} onChange={(e) => setName(e.target.value)} style={input} />
              </Field>
              <Field label="Slug">
                <input value={org.slug} readOnly style={{ ...input, background: BG, color: MUTED }} />
              </Field>
              <Field label="Industry">
                <select value={industry} onChange={(e) => setIndustry(e.target.value)} style={input}>
                  <option value="">Select industry…</option>
                  {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </Field>
              <Field label="Organization Size">
                <div style={{ display: "flex", gap: 8 }}>
                  {SIZES.map((s) => (
                    <button key={s} type="button" onClick={() => setSize(s)}
                      style={{ ...sizeBtn, ...(size === s ? sizeBtnActive : {}) }}>
                      {s}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Status">
                <select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </Field>
            </div>
          </SettingsBox>
        )}

        {activeTab === "Plan & Seats" && (
          <SettingsBox>
            <SectionLabel>PLAN & SEATS</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Plan">
                <div style={{ display: "flex", gap: 10 }}>
                  {PLANS.map((p) => (
                    <button key={p.id} type="button" onClick={() => setPlan(p.id)}
                      style={{
                        flex: 1, padding: "10px 12px", borderRadius: 8, cursor: "pointer", ...ff,
                        fontSize: 12, fontWeight: 700,
                        border: `2px solid ${plan === p.id ? p.color : BORDER}`,
                        background: plan === p.id ? `${p.color}0d` : "#fff",
                        color: plan === p.id ? p.color : MUTED,
                      }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={`User Seats: ${seats}`}>
                <input type="range" min={10} max={500} step={10} value={seats}
                  onChange={(e) => setSeats(+e.target.value)}
                  style={{ width: "100%", accentColor: ORANGE }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: MUTED }}>
                  <span>10</span><span>500</span>
                </div>
              </Field>
            </div>
          </SettingsBox>
        )}

        {activeTab === "Branding" && (
          <SettingsBox>
            <SectionLabel>BRAND KIT (READ-ONLY)</SectionLabel>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 14, lineHeight: 1.5 }}>
              Branding is managed by the organization's own Program Manager in their Settings —
              Super Admin can view but not edit it here.
            </div>
            {loadingBrand ? (
              <div style={{ fontSize: 12, color: MUTED }}>Loading brand kit…</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                {([
                  ["Primary", brand.primary], ["Sidebar", brand.sidebar], ["Accent", brand.accent],
                  ["Surface", brand.surface], ["Text", brand.text],
                ] as [string, string][]).map(([label, color]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: color, border: `1px solid ${BORDER}`, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 10, color: MUTED, fontWeight: 700 }}>{label}</div>
                      <div style={{ fontSize: 11, color: NAVY, fontFamily: "monospace" }}>{color}</div>
                    </div>
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: 10, color: MUTED, fontWeight: 700 }}>Font</div>
                  <div style={{ fontSize: 12, color: NAVY }}>{brand.font}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: MUTED, fontWeight: 700 }}>Logo Text</div>
                  <div style={{ fontSize: 12, color: NAVY }}>{brand.logo_text || "—"}</div>
                </div>
              </div>
            )}
          </SettingsBox>
        )}

        {activeTab === "Integrations" && (
          <SettingsBox>
            <SectionLabel>ZOOM — SERVER-TO-SERVER OAUTH</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {loadingZoom ? (
                <div style={{ fontSize: 12, color: MUTED }}>Checking connection status…</div>
              ) : zoomStatus?.connected ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>
                    ✓ Connected — account {zoomStatus.account_id_masked}
                  </div>
                  <button onClick={removeZoom} disabled={zoomRemoving}
                    style={{ background: "#fff", border: `1px solid ${BORDER}`, color: NAVY, borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: zoomRemoving ? "not-allowed" : "pointer", ...ff }}>
                    {zoomRemoving ? "Removing…" : "Remove"}
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: MUTED, padding: "10px 14px", background: BG, borderRadius: 8 }}>
                  Not connected — no Zoom account is set up for this org yet.
                </div>
              )}

              {zoomErr && <div style={{ fontSize: 12, color: "#ef4444" }}>{zoomErr}</div>}
              {zoomOk && <div style={{ fontSize: 12, color: GREEN }}>{zoomOk}</div>}

              <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                {zoomStatus?.connected ? "Enter new values below to replace the existing credentials." : "Enter this org's Zoom Server-to-Server OAuth app credentials."}
              </div>

              <Field label="Account ID">
                <input value={accountID} onChange={(e) => setAccountID(e.target.value)} style={input} placeholder="e.g. m_OLllmdRuC0L3GXF..." />
              </Field>
              <Field label="Client ID">
                <input value={clientID} onChange={(e) => setClientID(e.target.value)} style={input} placeholder="Zoom app Client ID" />
              </Field>
              <Field label="Client Secret">
                <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} style={input} placeholder="Zoom app Client Secret" />
              </Field>
              <Field label="Host User (ID or email)">
                <input value={hostUser} onChange={(e) => setHostUser(e.target.value)} style={input} placeholder="e.g. the Zoom account owner's login email" />
                <div style={{ fontSize: 10, color: MUTED, marginTop: 4, lineHeight: 1.4 }}>
                  Every session for this org is created under this Zoom user — a Server-to-Server app has no "me" identity, so a specific host must be set.
                </div>
              </Field>

              <div>
                <button onClick={saveZoom} disabled={zoomSaving}
                  style={{ background: ORANGE, border: "none", color: "#fff", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, cursor: zoomSaving ? "not-allowed" : "pointer", ...ff, opacity: zoomSaving ? 0.7 : 1 }}>
                  {zoomSaving ? "Saving…" : "Save Credentials"}
                </button>
              </div>
            </div>
          </SettingsBox>
        )}
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#ef4444" }}>
          {error}
        </div>
      )}

      {showFooter && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, color: MUTED }}>Changes apply immediately after saving.</div>
          <button onClick={saveOrgDetails} disabled={saving}
            style={{ background: ORANGE, color: "#fff", border: "none", borderRadius: 8, padding: "9px 28px", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", ...ff, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Shared primitives (mirrors SettingsPage.tsx conventions) ─────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={fieldLabel}>{label}</div>
      {children}
    </div>
  );
}

function SettingsBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)", padding: "20px 22px" }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 14 }}>{children}</div>;
}

const fieldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 6,
};

const input: React.CSSProperties = {
  width: "100%", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px",
  fontSize: 13, color: NAVY, fontFamily: "Poppins, sans-serif", boxSizing: "border-box" as const, outline: "none",
  background: "#fff",
};

const sizeBtn: React.CSSProperties = {
  flex: 1, padding: "8px 4px", border: `1.5px solid ${BORDER}`, borderRadius: 8,
  background: "#fff", color: MUTED, fontSize: 11, cursor: "pointer", fontFamily: "Poppins, sans-serif",
};
const sizeBtnActive: React.CSSProperties = {
  border: `1.5px solid ${ORANGE}`, background: "rgba(200, 168, 96,0.06)", color: ORANGE, fontWeight: 700,
};

const backBtn: React.CSSProperties = {
  ...ff, background: "none", border: "none", padding: 0, cursor: "pointer",
  fontSize: 12, fontWeight: 600, color: MUTED,
};
