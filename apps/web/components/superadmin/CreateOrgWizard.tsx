"use client";

import { useState, FormEvent } from "react";
import ReactDOM from "react-dom";
import { api, ApiResponse } from "@/lib/api";
import { brandingApi } from "@/lib/brand-theme";
import { competenciesApi } from "@/lib/competencies-api";

interface CompetencyDraft {
  title: string;
  category: string;
}

interface FormState {
  name: string;
  slug: string;
  industry: string;
  size: string;
  plan: string;
  seats: number;
  adminName: string;
  adminEmail: string;
  adminPhone: string;
  adminPassword: string;
  logoFile: File | null;
  brandPrimary: string;
  brandSidebar: string;
  brandAccent: string;
  skipBranding: boolean;
  competencies: CompetencyDraft[];
}

// Onboarding Automation — AI-suggested setup defaults. Read-only: this call
// never creates or modifies anything, it only pre-fills the form below,
// which the Super Admin still reviews and submits via the existing
// POST /organizations request (unchanged, further down this file).
interface BrandKitSuggestion { primary: string; accent: string }
interface OrgSetupSuggestion {
  industry: string; size: string; plan: string; seats: number;
  brand_kit: BrandKitSuggestion | null; rationale: string;
}

const STEPS = [
  "Organization Details",
  "Plan & Seats",
  "Admin Account",
  "Branding",
  "Competencies",
  "Review & Launch",
];

const INDUSTRIES = [
  "Banking & Finance", "Manufacturing", "Technology", "Healthcare",
  "Energy & Resources", "Retail & FMCG", "Government & PSU",
  "Education", "Consulting", "Other",
];

const SIZES = ["<500", "500–2K", "2K–10K", "10K+"];

const PLANS = [
  { id: "starter",    label: "Starter",    price: "₹72K/yr",   desc: "Up to 50 users · 2 programs · Basic analytics",                  color: "#4A5573" },
  { id: "pro",        label: "Pro",        price: "₹2.7L/yr",  desc: "Up to 200 users · 5 programs · Advanced analytics + AI",          color: "#C8A860", popular: true },
  { id: "enterprise", label: "Enterprise", price: "Custom",     desc: "Unlimited users & programs · Full AI suite · Dedicated CSM",     color: "#182848" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s\-()]{7,20}$/;

const COMPETENCY_CATEGORIES = ["leadership", "communication", "execution", "strategic thinking", "collaboration", "innovation", "other"];

const ORG_CREATE_STEP = 2;   // "Admin Account" — Next here fires org creation
const LAST_STEP = STEPS.length - 1; // "Review & Launch" — Next here fires Phase B + close

interface Props {
  onClose: () => void;
  onComplete: (org: { name: string; slug: string; plan: string }, warnings?: string[]) => void;
}

export default function CreateOrgWizard({ onClose, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({
    name: "", slug: "", industry: "", size: "",
    plan: "pro", seats: 50,
    adminName: "", adminEmail: "", adminPhone: "", adminPassword: "",
    logoFile: null,
    brandPrimary: "#C8A860", brandSidebar: "#182848", brandAccent: "#C8A860",
    skipBranding: true,
    competencies: [],
  });
  const [error, setError] = useState("");
  const [busy, setBusy]   = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  // Onboarding Automation — optional, never blocks the manual flow below.
  const [description, setDescription] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState("");
  const [suggestion, setSuggestion] = useState<OrgSetupSuggestion | null>(null);

  const set = (k: keyof FormState, v: string | number | boolean | File | null | CompetencyDraft[]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function suggestSetup() {
    if (!form.name.trim()) { setSuggestError("Enter an organization name first."); return; }
    setSuggesting(true); setSuggestError(""); setSuggestion(null);
    try {
      const res = await api.post<ApiResponse<OrgSetupSuggestion>>("/organizations/onboarding/suggest", {
        org_name: form.name, description,
      });
      if (res.data) {
        setSuggestion(res.data);
        setForm((f) => ({
          ...f,
          industry: res.data!.industry || f.industry,
          size: res.data!.size || f.size,
          plan: res.data!.plan || f.plan,
          seats: res.data!.seats || f.seats,
        }));
      }
    } catch (e: unknown) {
      setSuggestError(e instanceof Error ? e.message : "Couldn't generate a suggestion right now.");
    } finally {
      setSuggesting(false);
    }
  }

  function slugify(v: string) {
    return v.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function setName(v: string) {
    setForm((f) => ({ ...f, name: v, slug: slugTouched ? f.slug : slugify(v) }));
  }

  function setSlug(v: string) {
    setSlugTouched(true);
    setForm((f) => ({ ...f, slug: slugify(v) }));
  }

  function setLogoFile(file: File | null) {
    if (file && file.size > 2 * 1024 * 1024) {
      setError("Logo must be under 2MB.");
      return;
    }
    setError("");
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setLogoPreviewUrl(file ? URL.createObjectURL(file) : null);
    setForm((f) => ({ ...f, logoFile: file, skipBranding: file ? false : f.skipBranding }));
  }

  function setBrandColor(k: "brandPrimary" | "brandSidebar" | "brandAccent", v: string) {
    setForm((f) => ({ ...f, [k]: v, skipBranding: false }));
  }

  function addCompetency() {
    setForm((f) => ({ ...f, competencies: [...f.competencies, { title: "", category: "leadership" }] }));
  }
  function removeCompetency(idx: number) {
    setForm((f) => ({ ...f, competencies: f.competencies.filter((_, i) => i !== idx) }));
  }
  function updateCompetency(idx: number, patch: Partial<CompetencyDraft>) {
    setForm((f) => ({ ...f, competencies: f.competencies.map((c, i) => i === idx ? { ...c, ...patch } : c) }));
  }

  const emailValid = EMAIL_RE.test(form.adminEmail.trim());
  const phoneValid = !form.adminPhone.trim() || PHONE_RE.test(form.adminPhone.trim());
  const passwordValid = form.adminPassword.trim().length >= 8;

  const canNext =
    step === 0 ? !!form.name.trim() && !!form.slug.trim() :
    step === ORG_CREATE_STEP ? !!form.adminName.trim() && emailValid && phoneValid && passwordValid :
    true;

  const isLast = step === LAST_STEP;
  // Once the org exists, steps 0-2 (identity/plan/admin) are already
  // submitted — going back would misleadingly suggest they're editable and
  // re-submittable, so Back is locked from the Branding step onward.
  const backLocked = createdOrgId !== null && step > ORG_CREATE_STEP;

  // Phase A — fires when leaving "Admin Account". Creates the org itself;
  // everything after this point (Branding, Competencies) configures the org
  // that now exists, rather than being part of its creation payload.
  async function handleCreateOrg() {
    setBusy(true);
    setError("");
    try {
      const res = await api.post<ApiResponse<{ organization: { id: string; name: string; slug: string; plan: string } }>>("/organizations", {
        name:           form.name,
        slug:           form.slug,
        industry:       form.industry,
        size:           form.size,
        plan:           form.plan,
        seats:          form.seats,
        admin_name:     form.adminName,
        admin_email:    form.adminEmail,
        admin_phone:    form.adminPhone,
        admin_password: form.adminPassword,
      });
      const orgId = res.data?.organization?.id;
      if (!orgId) throw new Error("Organization created but no ID was returned");
      setCreatedOrgId(orgId);
      setStep(ORG_CREATE_STEP + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create organization");
    } finally {
      setBusy(false);
    }
  }

  // Phase B — fires from "Review & Launch". Applies branding + competencies
  // to the already-created org, then closes the wizard regardless of
  // per-item failures (the org exists either way — this step only enriches
  // it, so a partial failure here shouldn't trap the Super Admin).
  async function handleFinish() {
    if (!createdOrgId) { onComplete({ name: form.name, slug: form.slug, plan: form.plan }); return; }
    setBusy(true);
    setError("");
    const newWarnings: string[] = [];

    if (!form.skipBranding) {
      try {
        if (form.logoFile) await brandingApi.uploadLogo(createdOrgId, form.logoFile);
        await brandingApi.update(createdOrgId, {
          primary: form.brandPrimary,
          sidebar: form.brandSidebar,
          accent: form.brandAccent,
        });
      } catch (e: unknown) {
        newWarnings.push(`Branding: ${e instanceof Error ? e.message : "failed to apply"}`);
      }
    }

    for (const comp of form.competencies) {
      if (!comp.title.trim()) continue;
      try {
        await competenciesApi.create(createdOrgId, { title: comp.title.trim(), category: comp.category || "leadership" });
      } catch (e: unknown) {
        newWarnings.push(`Competency "${comp.title}": ${e instanceof Error ? e.message : "failed to save"}`);
      }
    }

    setBusy(false);
    // Pass warnings up rather than showing them here — onComplete closes this
    // wizard (unmounting it) right after this call, so any state set on this
    // component would never reach the user.
    onComplete({ name: form.name, slug: form.slug, plan: form.plan }, newWarnings.length ? newWarnings : undefined);
  }

  function handleNext() {
    if (step === ORG_CREATE_STEP) { void handleCreateOrg(); }
    else if (isLast) { void handleFinish(); }
    else { setStep((s) => s + 1); }
  }

  // The org (+ admin account) is created the moment Phase A succeeds (leaving
  // "Admin Account") — closing after that point via ✕ or Cancel must NOT look
  // like a no-op cancel: the org is real, so treat it the same as finishing
  // (skip whatever branding/competency steps weren't reached yet) rather than
  // silently discarding the wizard and leaving the Super Admin unaware the
  // name/slug/email are now taken.
  function handleClose() {
    if (createdOrgId) { void handleFinish(); return; }
    onClose();
  }

  function nextLabel(): string {
    if (busy) return step === ORG_CREATE_STEP ? "Creating…" : "Finishing…";
    if (step === ORG_CREATE_STEP) return "Create Organization →";
    if (isLast) return "Finish Setup";
    return `Next: ${STEPS[step + 1]} →`;
  }

  function renderStep() {
    if (step === 0) return (
      <div style={ws.body}>
        <Field label="Organization Name *">
          <input style={ws.input} placeholder="e.g. Reliance Industries"
            value={form.name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Slug *">
          <div style={{ display: "flex", alignItems: "center", border: "1px solid #E6DED0", borderRadius: 8, overflow: "hidden" }}>
            <span style={{ padding: "9px 12px", background: "#F7F5F0", fontSize: 12, color: "#4A5573", borderRight: "1px solid #E6DED0", whiteSpace: "nowrap" }}>https://</span>
            <input style={{ ...ws.input, border: "none", borderRadius: 0, flex: 1 }}
              placeholder="reliance.xalms.io" value={form.slug}
              onChange={(e) => setSlug(e.target.value)} />
          </div>
        </Field>
        <Field label="Describe this client (optional)">
          <textarea style={{ ...ws.input, minHeight: 60, resize: "vertical" as const }}
            placeholder="e.g. Mid-size manufacturing company, ~800 employees, rolling out leadership training for plant managers"
            value={description} onChange={(e) => setDescription(e.target.value)} />
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" onClick={suggestSetup} disabled={suggesting || !form.name.trim()}
              style={{ ...ws.aiSuggestBtn, opacity: (suggesting || !form.name.trim()) ? 0.6 : 1, cursor: (suggesting || !form.name.trim()) ? "not-allowed" : "pointer" }}>
              {suggesting ? "Thinking…" : "✦ AI Suggest Setup"}
            </button>
            {suggestError && <span style={{ fontSize: 11, color: "#C8A860" }}>{suggestError}</span>}
          </div>
          {suggestion && (
            <div style={ws.suggestionBox}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", letterSpacing: 0.5, marginBottom: 4 }}>✦ SUGGESTED — REVIEW BEFORE LAUNCHING</div>
              <div style={{ fontSize: 12, color: "#182848", lineHeight: 1.6 }}>{suggestion.rationale}</div>
            </div>
          )}
        </Field>
        <Field label="Industry">
          <select style={ws.input} value={form.industry} onChange={(e) => set("industry", e.target.value)}>
            <option value="">Select industry…</option>
            {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Organization Size">
          <div style={{ display: "flex", gap: 8 }}>
            {SIZES.map((s) => (
              <button key={s} type="button" onClick={() => set("size", s)}
                style={{ ...ws.sizeBtn, ...(form.size === s ? ws.sizeBtnActive : {}) }}>
                {s}
              </button>
            ))}
          </div>
        </Field>
      </div>
    );

    if (step === 1) return (
      <div style={ws.body}>
        {suggestion && (form.plan !== suggestion.plan || form.seats !== suggestion.seats) && (
          <div style={ws.suggestionBox}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", letterSpacing: 0.5, marginBottom: 4 }}>✦ AI RECOMMENDATION AVAILABLE</div>
            <div style={{ fontSize: 12, color: "#182848", lineHeight: 1.6, marginBottom: 8 }}>
              {PLANS.find((p) => p.id === suggestion.plan)?.label ?? suggestion.plan} · {suggestion.seats} seats
            </div>
            <button type="button" onClick={() => setForm((f) => ({ ...f, plan: suggestion.plan, seats: suggestion.seats }))}
              style={{ ...ws.aiSuggestBtn, padding: "5px 12px" }}>
              Use recommended plan
            </button>
          </div>
        )}
        <Field label="Select Plan">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PLANS.map((plan) => (
              <div key={plan.id} onClick={() => set("plan", plan.id)}
                style={{ ...ws.planCard, ...(form.plan === plan.id ? { borderColor: plan.color, background: `${plan.color}09` } : {}) }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${plan.color}`, background: form.plan === plan.id ? plan.color : "#fff" }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#182848" }}>{plan.label}</span>
                    {plan.popular && <span style={ws.popular}>POPULAR</span>}
                    {suggestion?.plan === plan.id && <span style={ws.aiRecommended}>✦ AI RECOMMENDED</span>}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: plan.color }}>{plan.price}</span>
                </div>
                <p style={{ fontSize: 11, color: "#4A5573", margin: 0, paddingLeft: 24 }}>{plan.desc}</p>
              </div>
            ))}
          </div>
        </Field>
        <Field label={`User Seats: ${form.seats}${suggestion ? ` (AI suggested: ${suggestion.seats})` : ""}`}>
          <input type="range" min={10} max={500} step={10} value={form.seats}
            onChange={(e) => set("seats", +e.target.value)}
            style={{ width: "100%", accentColor: "#C8A860" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#4A5573" }}>
            <span>10</span><span>500</span>
          </div>
        </Field>
      </div>
    );

    if (step === ORG_CREATE_STEP) return (
      <div style={ws.body}>
        <div style={ws.infoBox}>
          Primary admin for <strong>{form.name || "the organization"}</strong> — will receive login credentials.
        </div>
        <Field label="Admin Full Name *">
          <input style={ws.input} placeholder="e.g. Sanjay Mehta"
            value={form.adminName} onChange={(e) => set("adminName", e.target.value)} />
        </Field>
        <Field label="Admin Email *">
          <input style={ws.input} type="email" placeholder="sanjay@company.com"
            value={form.adminEmail} onChange={(e) => set("adminEmail", e.target.value)} />
          {form.adminEmail.trim() !== "" && !emailValid && (
            <div style={ws.fieldHint}>Enter a valid email address.</div>
          )}
        </Field>
        <Field label="Admin Mobile">
          <input style={ws.input} type="tel" placeholder="+91 98765 43210"
            value={form.adminPhone} onChange={(e) => set("adminPhone", e.target.value)} />
          {form.adminPhone.trim() !== "" && !phoneValid && (
            <div style={ws.fieldHint}>Enter a valid mobile number.</div>
          )}
        </Field>
        <Field label="Initial Password *">
          <input style={ws.input} type="password" placeholder="Min 8 characters"
            value={form.adminPassword} onChange={(e) => set("adminPassword", e.target.value)} />
          {form.adminPassword.trim() !== "" && !passwordValid && (
            <div style={ws.fieldHint}>Password must be at least 8 characters.</div>
          )}
        </Field>
        {error && <div style={ws.error}>{error}</div>}
      </div>
    );

    if (step === 3) return (
      <div style={ws.body}>
        <div style={ws.infoBox}>
          <strong>{form.name}</strong> has been created — closing this wizard now will finish setup with the choices made so far, not discard it.
        </div>
        <div style={ws.infoBox}>
          Optional — pick a logo and up to 3 colors for <strong>{form.name}</strong>. Skip to use the platform defaults; a Program Manager can change this later.
        </div>
        <Field label="Logo">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={ws.logoPreview}>
              {logoPreviewUrl
                ? <img src={logoPreviewUrl} alt="Logo preview" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} />
                : <span style={{ fontSize: 10, color: "#4A5573" }}>No logo</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={ws.fileBtn}>
                {form.logoFile ? "Change Logo" : "Upload Logo"}
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{ display: "none" }}
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
              </label>
              {form.logoFile && (
                <button type="button" onClick={() => setLogoFile(null)} style={ws.removeLink}>Remove</button>
              )}
              <span style={{ fontSize: 10, color: "#4A5573" }}>PNG, JPEG, SVG, or WEBP — up to 2MB. Square, at least 512×512px, works best.</span>
            </div>
          </div>
        </Field>
        <Field label="Colors">
          <div style={{ display: "flex", gap: 16 }}>
            <ColorPicker label="Primary" value={form.brandPrimary} onChange={(v) => setBrandColor("brandPrimary", v)} />
            <ColorPicker label="Sidebar" value={form.brandSidebar} onChange={(v) => setBrandColor("brandSidebar", v)} />
            <ColorPicker label="Accent" value={form.brandAccent} onChange={(v) => setBrandColor("brandAccent", v)} />
          </div>
        </Field>
        {error && <div style={ws.error}>{error}</div>}
      </div>
    );

    if (step === 4) return (
      <div style={ws.body}>
        <div style={ws.infoBox}>
          Optional — define the competencies this org's 360° feedback cycles will rate raters against. Skip and add these later.
        </div>
        {form.competencies.map((comp, idx) => (
          <div key={idx} style={ws.competencyCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#4A5573" }}>COMPETENCY {idx + 1}</span>
              <button type="button" onClick={() => removeCompetency(idx)} style={ws.removeLink}>✕ Remove competency</button>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 2 }}>
                <span style={ws.microLabel}>Competency title</span>
                <input style={ws.input} placeholder="e.g. Strategic Thinking"
                  value={comp.title} onChange={(e) => updateCompetency(idx, { title: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <span style={ws.microLabel}>Category</span>
                <select style={ws.input} value={comp.category}
                  onChange={(e) => updateCompetency(idx, { category: e.target.value })}>
                  {COMPETENCY_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={addCompetency} style={ws.addCompetencyBtn}>+ Add Competency</button>
      </div>
    );

    if (step === LAST_STEP) return (
      <div style={ws.body}>
        <div style={ws.reviewHeader}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700, marginBottom: 4 }}>✦ READY TO LAUNCH</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{form.name}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{form.slug}</div>
        </div>
        {[
          ["Plan",         `${PLANS.find((p) => p.id === form.plan)?.label} · ${form.seats} seats`],
          ["Industry",     form.industry || "—"],
          ["Size",         form.size     || "—"],
          ["Admin",        form.adminName || "—"],
          ["Email",        form.adminEmail || "—"],
          ["Logo",         form.logoFile ? form.logoFile.name : "Platform default"],
          ["Competencies", form.competencies.filter(c => c.title.trim()).length ? `${form.competencies.filter(c => c.title.trim()).length} defined` : "None — add later"],
        ].map(([k, v]) => (
          <div key={k} style={ws.reviewRow}>
            <span style={ws.reviewKey}>{k}</span>
            <span style={ws.reviewVal}>{v}</span>
          </div>
        ))}
        {error && <div style={ws.error}>{error}</div>}
      </div>
    );

    return null;
  }

  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div style={ws.overlay}>
      <div style={ws.modal}>
        {/* Header */}
        <div style={ws.header}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#182848" }}>New Organization</div>
            <div style={{ fontSize: 11, color: "#4A5573", marginTop: 1 }}>
              Step {step + 1} of {STEPS.length} — {STEPS[step]}
            </div>
          </div>
          <button onClick={handleClose} style={ws.closeBtn}>✕</button>
        </div>

        {/* Progress bar */}
        <div style={{ display: "flex", gap: 4, padding: "0 28px 14px" }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: i <= step ? "#C8A860" : "#E6DED0" }} />
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>{renderStep()}</div>

        {/* Footer */}
        <div style={ws.footer}>
          <button
            onClick={() => step === 0 ? onClose() : setStep((s) => s - 1)}
            disabled={backLocked}
            style={{ ...ws.backBtn, opacity: backLocked ? 0.4 : 1, cursor: backLocked ? "not-allowed" : "pointer" }}>
            {step === 0 ? "Cancel" : "← Back"}
          </button>
          <button
            disabled={!canNext || busy}
            onClick={handleNext}
            style={{ ...ws.nextBtn, background: canNext && !busy ? "#C8A860" : "#C9BFA8" }}>
            {nextLabel()}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#4A5573", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
      <span style={{ fontSize: 10, color: "#4A5573" }}>{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: 40, height: 32, border: "1px solid #E6DED0", borderRadius: 6, padding: 2, cursor: "pointer" }} />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: 72, border: "1px solid #E6DED0", borderRadius: 6, padding: "3px 6px", fontSize: 10, textAlign: "center", fontFamily: "Poppins, sans-serif", color: "#182848" }} />
    </div>
  );
}

const ws: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 1000,
    background: "rgba(24, 40, 72,0.55)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
  },
  modal: {
    background: "#fff", borderRadius: 16,
    width: "100%", maxWidth: 580, maxHeight: "92vh",
    display: "flex", flexDirection: "column", overflow: "hidden",
    boxShadow: "0 24px 64px rgba(24, 40, 72,0.25)",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "20px 28px 12px",
    borderBottom: "1px solid #E6DED0",
  },
  closeBtn: {
    width: 28, height: 28, border: "1px solid #E6DED0", borderRadius: "50%",
    background: "#fff", cursor: "pointer", fontSize: 14,
    display: "flex", alignItems: "center", justifyContent: "center", color: "#4A5573",
  },
  body: { padding: "22px 28px", display: "flex", flexDirection: "column", gap: 16 },
  input: {
    width: "100%", border: "1px solid #E6DED0", borderRadius: 8,
    padding: "9px 12px", fontSize: 13, color: "#182848",
    outline: "none", fontFamily: "Poppins, sans-serif",
  },
  microLabel: {
    fontSize: 10, fontWeight: 700, color: "#4A5573", letterSpacing: 0.3,
    display: "block", marginBottom: 4, textTransform: "capitalize",
  },
  sizeBtn: {
    flex: 1, padding: "8px 4px",
    border: "1.5px solid #E6DED0", borderRadius: 8,
    background: "#fff", color: "#4A5573", fontSize: 11, cursor: "pointer",
    fontFamily: "Poppins, sans-serif",
  },
  sizeBtnActive: {
    border: "1.5px solid #C8A860",
    background: "rgba(200, 168, 96,0.06)", color: "#C8A860", fontWeight: 700,
  },
  planCard: {
    padding: "14px 16px", border: "2px solid #E6DED0", borderRadius: 10, cursor: "pointer",
  },
  popular: {
    fontSize: 9, background: "rgba(200, 168, 96,0.1)", color: "#C8A860",
    borderRadius: 10, padding: "2px 8px", fontWeight: 700,
  },
  infoBox: {
    padding: "10px 14px", background: "rgba(200, 168, 96,0.04)",
    border: "1px solid rgba(200, 168, 96,0.15)", borderRadius: 8, fontSize: 12, color: "#4A5573",
  },
  reviewHeader: {
    padding: "14px 16px",
    background: "linear-gradient(135deg,#182848,#2d3a7c)", borderRadius: 10,
  },
  reviewRow: {
    display: "flex", gap: 10, padding: "9px 0",
    borderBottom: "1px solid #E6DED0", alignItems: "flex-start",
  },
  reviewKey: { fontSize: 11, fontWeight: 700, color: "#4A5573", width: 90, flexShrink: 0 },
  reviewVal: { fontSize: 12, color: "#182848", flex: 1 },
  aiSuggestBtn: {
    padding: "7px 14px", background: "rgba(74, 85, 115,0.08)", border: "1px solid rgba(74, 85, 115,0.25)",
    borderRadius: 8, fontSize: 11, fontWeight: 700, color: "#4A5573",
    fontFamily: "Poppins, sans-serif", cursor: "pointer",
  },
  suggestionBox: {
    marginTop: 10, padding: "10px 14px", background: "rgba(74, 85, 115,0.05)",
    border: "1px solid rgba(74, 85, 115,0.2)", borderRadius: 8,
  },
  aiRecommended: {
    fontSize: 9, background: "rgba(74, 85, 115,0.12)", color: "#4A5573",
    borderRadius: 10, padding: "2px 8px", fontWeight: 700, letterSpacing: 0.3,
  },
  error: {
    background: "rgba(200, 168, 96,0.08)", border: "1px solid rgba(200, 168, 96,0.25)",
    borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#C8A860",
  },
  fieldHint: {
    fontSize: 11, color: "#ef4444", marginTop: 4,
  },
  footer: {
    padding: "16px 28px", borderTop: "1px solid #E6DED0",
    display: "flex", justifyContent: "space-between", gap: 10, flexShrink: 0,
  },
  backBtn: {
    padding: "9px 18px", background: "#fff", border: "1px solid #E6DED0", borderRadius: 8,
    fontSize: 12, fontWeight: 600, color: "#182848",
    fontFamily: "Poppins, sans-serif",
  },
  nextBtn: {
    padding: "9px 22px", border: "none", borderRadius: 8,
    cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff",
    fontFamily: "Poppins, sans-serif",
  },
  logoPreview: {
    width: 64, height: 64, borderRadius: 10, border: "1.5px dashed #E6DED0",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    background: "#F7F5F0", overflow: "hidden", textAlign: "center",
  },
  fileBtn: {
    padding: "7px 14px", background: "#182848", borderRadius: 8,
    fontSize: 11, fontWeight: 700, color: "#fff",
    fontFamily: "Poppins, sans-serif", cursor: "pointer", textAlign: "center",
  },
  removeLink: {
    background: "none", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700,
    color: "#C8A860", fontFamily: "Poppins, sans-serif", padding: 0, textAlign: "left",
  },
  competencyCard: {
    padding: 16, border: "1px solid #E6DED0", borderRadius: 10, background: "#F7F5F0",
  },
  addCompetencyBtn: {
    padding: "10px 16px", background: "#fff", border: "1.5px dashed #C8A860", borderRadius: 8,
    fontSize: 12, fontWeight: 700, color: "#C8A860", cursor: "pointer",
    fontFamily: "Poppins, sans-serif",
  },
};
