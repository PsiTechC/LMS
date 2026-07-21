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
const SIZES = ["<500", "500-2K", "2K-10K", "10K+"];
const PLANS = [
  { id: "starter", label: "Starter", color: "#4A5573" },
  { id: "pro", label: "Pro", color: "#C8A860" },
  { id: "enterprise", label: "Enterprise", color: "#182848" },
];
const STATUSES = ["active", "trial", "suspended"];

type Tab = "Basic Info" | "Plan & Seats" | "Branding" | "Integrations";
const TABS: Tab[] = ["Basic Info", "Plan & Seats", "Branding", "Integrations"];

/**
 * Full-page organization configuration panel - replaces the old per-org
 * "Config" modal (which was Zoom-only). Basic Info / Plan & Seats / Branding
 * (editable - backend already grants Superadmin branding:manage alongside
 * the org's own PM, see api/internal/organizations/handler.go) / Integrations
 * (Zoom, moved here from the standalone ZoomCredentialsModal) as tabs, same
 * underline-tab + SettingsBox convention as apps/web/components/shared/SettingsPage.tsx.
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

  // Branding - editable by Superadmin (backend permits branding:manage for
  // both Superadmin and the org's own PM - see api/internal/organizations/handler.go).
  const [brand, setBrand] = useState<BrandKitDTO>(DEFAULT_BRAND_KIT);
  const [loadingBrand, setLoadingBrand] = useState(true);
  const [savingBrand, setSavingBrand] = useState(false);
  const [savedBrand, setSavedBrand] = useState(false);
  const [brandError, setBrandError] = useState("");

  useEffect(() => {
    brandingApi.get(org.id)
      .then((r) => setBrand(r.data ?? DEFAULT_BRAND_KIT))
      .catch(() => setBrand(DEFAULT_BRAND_KIT))
      .finally(() => setLoadingBrand(false));
  }, [org.id]);

  function setBrandField<K extends keyof BrandKitDTO>(key: K, value: BrandKitDTO[K]) {
    setBrand((b) => ({ ...b, [key]: value }));
  }

  async function saveBranding() {
    setSavingBrand(true); setBrandError("");
    try {
      const res = await brandingApi.update(org.id, brand);
      setBrand(res.data ?? brand);
      setSavedBrand(true);
      setTimeout(() => setSavedBrand(false), 2500);
    } catch (e: unknown) {
      setBrandError(e instanceof Error ? e.message : "Failed to save brand kit");
    } finally {
      setSavingBrand(false);
    }
  }

  // Integrations — org-level default Zoom host email. Fallback identity used
  // for any faculty/coach session in this org whose own zoom_host_email
  // (set per-user via Users → Edit User) is unset.
  const [zoomHostEmail, setZoomHostEmail] = useState("");
  const [loadingZoomHost, setLoadingZoomHost] = useState(true);
  const [savingZoomHost, setSavingZoomHost] = useState(false);
  const [savedZoomHost, setSavedZoomHost] = useState(false);
  const [zoomHostError, setZoomHostError] = useState("");

  useEffect(() => {
    api.get<ApiResponse<{ host_email: string }>>(`/organizations/${org.id}/zoom-host-email`)
      .then((r) => setZoomHostEmail(r.data?.host_email ?? ""))
      .catch(() => setZoomHostEmail(""))
      .finally(() => setLoadingZoomHost(false));
  }, [org.id]);

  async function saveZoomHostEmail() {
    setSavingZoomHost(true); setZoomHostError("");
    try {
      await api.put<ApiResponse<{ saved: boolean }>>(`/organizations/${org.id}/zoom-host-email`, {
        host_email: zoomHostEmail.trim(),
      });
      setSavedZoomHost(true);
      setTimeout(() => setSavedZoomHost(false), 2500);
    } catch (e: unknown) {
      setZoomHostError(e instanceof Error ? e.message : "Failed to save Zoom host email");
    } finally {
      setSavingZoomHost(false);
    }
  }

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

  const showFooter = activeTab === "Basic Info" || activeTab === "Plan & Seats" || activeTab === "Branding";

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

      {/* Tab bar - underline style, matches SettingsPage.tsx */}
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
            <SectionLabel>BRAND KIT</SectionLabel>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 14, lineHeight: 1.5 }}>
              This organization's Program Manager can also edit these colors from their own
              Settings - whoever saves last wins.
            </div>
            {loadingBrand ? (
              <div style={{ fontSize: 12, color: MUTED }}>Loading brand kit…</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                {([
                  ["primary", "Primary"], ["sidebar", "Sidebar"], ["accent", "Accent"],
                  ["surface", "Surface"], ["text", "Text"],
                ] as [keyof BrandKitDTO, string][]).map(([key, label]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="color"
                      value={brand[key]}
                      onChange={(e) => setBrandField(key, e.target.value)}
                      style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${BORDER}`, cursor: "pointer", padding: 1, flexShrink: 0 }}
                    />
                    <div>
                      <div style={{ fontSize: 10, color: MUTED, fontWeight: 700 }}>{label}</div>
                      <input
                        value={brand[key]}
                        onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) setBrandField(key, e.target.value); }}
                        style={{ fontSize: 11, color: NAVY, fontFamily: "monospace", border: "none", padding: 0, width: 76, outline: "none" }}
                      />
                    </div>
                  </div>
                ))}
                <Field label="Font">
                  <input value={brand.font} onChange={(e) => setBrandField("font", e.target.value)} style={input} />
                </Field>
                <Field label="Logo Text">
                  <input value={brand.logo_text} onChange={(e) => setBrandField("logo_text", e.target.value)} style={input} />
                </Field>
              </div>
            )}
          </SettingsBox>
        )}

        {activeTab === "Integrations" && (
          <SettingsBox>
            <SectionLabel>ZOOM — CENTRAL SERVER-TO-SERVER INTEGRATION</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Central S2S status badge — no per-org credentials required */}
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 14,
                padding: "14px 16px",
                background: "rgba(34,197,94,0.07)",
                border: "1px solid rgba(34,197,94,0.2)",
                borderRadius: 10,
              }}>
                <span style={{ fontSize: 22, lineHeight: 1, marginTop: 1 }}>✓</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>
                    Central Zoom integration active
                  </div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 4, lineHeight: 1.55 }}>
                    All sessions are created through the platform's shared Zoom Server-to-Server
                    credentials (<code style={{ fontFamily: "monospace", background: "rgba(0,0,0,0.05)", padding: "1px 4px", borderRadius: 3 }}>ZOOM_S2S_*</code>).
                    No per-organisation credentials are needed.
                  </div>
                </div>
              </div>
              <div>
                <SectionLabel>ORGANIZATION DEFAULT ZOOM HOST EMAIL</SectionLabel>
                <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.55, marginBottom: 10 }}>
                  Every meeting for this organization is created under this licensed Zoom user's
                  identity, unless a specific faculty/coach has their own override set individually
                  (Super Admin → Users → Edit User → Zoom Host Email). Leave blank to fall back to
                  each faculty member's own LMS login email.
                </div>
                {loadingZoomHost ? (
                  <div style={{ fontSize: 12, color: MUTED }}>Loading…</div>
                ) : (
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      value={zoomHostEmail}
                      onChange={(e) => { setZoomHostEmail(e.target.value); setSavedZoomHost(false); }}
                      placeholder="e.g. host@yourcompany.com"
                      style={{ ...input, flex: 1 }}
                    />
                    <button onClick={saveZoomHostEmail} disabled={savingZoomHost}
                      style={{
                        ...ff, flexShrink: 0, background: ORANGE, color: "#fff", border: "none",
                        borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700,
                        cursor: savingZoomHost ? "not-allowed" : "pointer", opacity: savingZoomHost ? 0.7 : 1,
                      }}>
                      {savingZoomHost ? "Saving…" : savedZoomHost ? "Saved!" : "Save"}
                    </button>
                  </div>
                )}
                {zoomHostError && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#ef4444" }}>{zoomHostError}</div>
                )}
                <div style={{ fontSize: 10, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
                  Must be a licensed user inside the same Zoom account as <code style={{ fontFamily: "monospace", background: "rgba(0,0,0,0.05)", padding: "1px 4px", borderRadius: 3 }}>ZOOM_S2S_ACCOUNT_ID</code>.
                  Participants only ever receive the join link — this email's private start link is
                  never shown to them.
                </div>
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

      {showFooter && activeTab === "Branding" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, color: brandError ? "#ef4444" : MUTED }}>{brandError || "Changes apply immediately after saving."}</div>
          <button onClick={saveBranding} disabled={savingBrand || loadingBrand}
            style={{ background: ORANGE, color: "#fff", border: "none", borderRadius: 8, padding: "9px 28px", fontSize: 12, fontWeight: 700, cursor: savingBrand ? "not-allowed" : "pointer", ...ff, opacity: savingBrand ? 0.7 : 1 }}>
            {savingBrand ? "Saving…" : savedBrand ? "Saved!" : "Save Changes"}
          </button>
        </div>
      )}
      {showFooter && activeTab !== "Branding" && (
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
