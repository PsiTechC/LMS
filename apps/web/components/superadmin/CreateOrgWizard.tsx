"use client";

import { useState, FormEvent } from "react";
import ReactDOM from "react-dom";
import { api, ApiResponse } from "@/lib/api";

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
}

const STEPS = [
  "Organization Details",
  "Plan & Seats",
  "Admin Account",
  "Review & Launch",
];

const INDUSTRIES = [
  "Banking & Finance", "Manufacturing", "Technology", "Healthcare",
  "Energy & Resources", "Retail & FMCG", "Government & PSU",
  "Education", "Consulting", "Other",
];

const SIZES = ["<500", "500–2K", "2K–10K", "10K+"];

const PLANS = [
  { id: "starter",    label: "Starter",    price: "₹72K/yr",   desc: "Up to 50 users · 2 programs · Basic analytics",                  color: "#6B73BF" },
  { id: "pro",        label: "Pro",        price: "₹2.7L/yr",  desc: "Up to 200 users · 5 programs · Advanced analytics + AI",          color: "#EF4E24", popular: true },
  { id: "enterprise", label: "Enterprise", price: "Custom",     desc: "Unlimited users & programs · Full AI suite · Dedicated CSM",     color: "#1C2551" },
];

interface Props {
  onClose: () => void;
  onComplete: (org: { name: string; slug: string; plan: string }) => void;
}

export default function CreateOrgWizard({ onClose, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({
    name: "", slug: "", industry: "", size: "",
    plan: "pro", seats: 50,
    adminName: "", adminEmail: "", adminPhone: "", adminPassword: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy]   = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const set = (k: keyof FormState, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

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

  const canNext =
    step === 0 ? !!form.name.trim() && !!form.slug.trim() :
    step === 2 ? !!form.adminName.trim() && !!form.adminEmail.trim() && !!form.adminPassword.trim() :
    true;

  const isLast = step === STEPS.length - 1;

  async function handleSubmit() {
    setBusy(true);
    setError("");
    try {
      await api.post<ApiResponse<unknown>>("/organizations", {
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
      onComplete({ name: form.name, slug: form.slug, plan: form.plan });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create organization");
    } finally {
      setBusy(false);
    }
  }

  function renderStep() {
    if (step === 0) return (
      <div style={ws.body}>
        <Field label="Organization Name *">
          <input style={ws.input} placeholder="e.g. Reliance Industries"
            value={form.name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Slug *">
          <div style={{ display: "flex", alignItems: "center", border: "1px solid #EAECF4", borderRadius: 8, overflow: "hidden" }}>
            <span style={{ padding: "9px 12px", background: "#F5F7FB", fontSize: 12, color: "#8b90a7", borderRight: "1px solid #EAECF4", whiteSpace: "nowrap" }}>https://</span>
            <input style={{ ...ws.input, border: "none", borderRadius: 0, flex: 1 }}
              placeholder="reliance.xalms.io" value={form.slug}
              onChange={(e) => setSlug(e.target.value)} />
          </div>
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
        <Field label="Select Plan">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PLANS.map((plan) => (
              <div key={plan.id} onClick={() => set("plan", plan.id)}
                style={{ ...ws.planCard, ...(form.plan === plan.id ? { borderColor: plan.color, background: `${plan.color}09` } : {}) }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${plan.color}`, background: form.plan === plan.id ? plan.color : "#fff" }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1C2551" }}>{plan.label}</span>
                    {plan.popular && <span style={ws.popular}>POPULAR</span>}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: plan.color }}>{plan.price}</span>
                </div>
                <p style={{ fontSize: 11, color: "#8b90a7", margin: 0, paddingLeft: 24 }}>{plan.desc}</p>
              </div>
            ))}
          </div>
        </Field>
        <Field label={`User Seats: ${form.seats}`}>
          <input type="range" min={10} max={500} step={10} value={form.seats}
            onChange={(e) => set("seats", +e.target.value)}
            style={{ width: "100%", accentColor: "#EF4E24" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8b90a7" }}>
            <span>10</span><span>500</span>
          </div>
        </Field>
      </div>
    );

    if (step === 2) return (
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
        </Field>
        <Field label="Admin Mobile">
          <input style={ws.input} type="tel" placeholder="+91 98765 43210"
            value={form.adminPhone} onChange={(e) => set("adminPhone", e.target.value)} />
        </Field>
        <Field label="Initial Password *">
          <input style={ws.input} type="password" placeholder="Min 8 characters"
            value={form.adminPassword} onChange={(e) => set("adminPassword", e.target.value)} />
        </Field>
      </div>
    );

    if (step === 3) return (
      <div style={ws.body}>
        <div style={ws.reviewHeader}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700, marginBottom: 4 }}>✦ READY TO LAUNCH</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{form.name}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{form.slug}</div>
        </div>
        {[
          ["Plan",     `${PLANS.find((p) => p.id === form.plan)?.label} · ${form.seats} seats`],
          ["Industry", form.industry || "—"],
          ["Size",     form.size     || "—"],
          ["Admin",    form.adminName || "—"],
          ["Email",    form.adminEmail || "—"],
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
    <div style={ws.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={ws.modal}>
        {/* Header */}
        <div style={ws.header}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1C2551" }}>New Organization</div>
            <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 1 }}>
              Step {step + 1} of {STEPS.length} — {STEPS[step]}
            </div>
          </div>
          <button onClick={onClose} style={ws.closeBtn}>✕</button>
        </div>

        {/* Progress bar */}
        <div style={{ display: "flex", gap: 4, padding: "0 28px 14px" }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: i <= step ? "#EF4E24" : "#EAECF4" }} />
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>{renderStep()}</div>

        {/* Footer */}
        <div style={ws.footer}>
          <button onClick={() => step === 0 ? onClose() : setStep((s) => s - 1)}
            style={ws.backBtn}>
            {step === 0 ? "Cancel" : "← Back"}
          </button>
          <button
            disabled={!canNext || busy}
            onClick={() => isLast ? handleSubmit() : setStep((s) => s + 1)}
            style={{ ...ws.nextBtn, background: canNext && !busy ? "#EF4E24" : "#D0D3E0" }}>
            {busy ? "Launching…" : isLast ? "🚀 Launch Organization" : `Next: ${STEPS[step + 1]} →`}
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
      <label style={{ fontSize: 11, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const ws: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 1000,
    background: "rgba(28,37,81,0.55)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
  },
  modal: {
    background: "#fff", borderRadius: 16,
    width: "100%", maxWidth: 580, maxHeight: "92vh",
    display: "flex", flexDirection: "column", overflow: "hidden",
    boxShadow: "0 24px 64px rgba(28,37,81,0.25)",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "20px 28px 12px",
    borderBottom: "1px solid #EAECF4",
  },
  closeBtn: {
    width: 28, height: 28, border: "1px solid #EAECF4", borderRadius: "50%",
    background: "#fff", cursor: "pointer", fontSize: 14,
    display: "flex", alignItems: "center", justifyContent: "center", color: "#8b90a7",
  },
  body: { padding: "22px 28px", display: "flex", flexDirection: "column", gap: 16 },
  input: {
    width: "100%", border: "1px solid #EAECF4", borderRadius: 8,
    padding: "9px 12px", fontSize: 13, color: "#1C2551",
    outline: "none", fontFamily: "Poppins, sans-serif",
  },
  sizeBtn: {
    flex: 1, padding: "8px 4px",
    border: "1.5px solid #EAECF4", borderRadius: 8,
    background: "#fff", color: "#8b90a7", fontSize: 11, cursor: "pointer",
    fontFamily: "Poppins, sans-serif",
  },
  sizeBtnActive: {
    border: "1.5px solid #EF4E24",
    background: "rgba(239,78,36,0.06)", color: "#EF4E24", fontWeight: 700,
  },
  planCard: {
    padding: "14px 16px", border: "2px solid #EAECF4", borderRadius: 10, cursor: "pointer",
  },
  popular: {
    fontSize: 9, background: "rgba(239,78,36,0.1)", color: "#EF4E24",
    borderRadius: 10, padding: "2px 8px", fontWeight: 700,
  },
  infoBox: {
    padding: "10px 14px", background: "rgba(239,78,36,0.04)",
    border: "1px solid rgba(239,78,36,0.15)", borderRadius: 8, fontSize: 12, color: "#8b90a7",
  },
  reviewHeader: {
    padding: "14px 16px",
    background: "linear-gradient(135deg,#1C2551,#2d3a7c)", borderRadius: 10,
  },
  reviewRow: {
    display: "flex", gap: 10, padding: "9px 0",
    borderBottom: "1px solid #EAECF4", alignItems: "flex-start",
  },
  reviewKey: { fontSize: 11, fontWeight: 700, color: "#8b90a7", width: 90, flexShrink: 0 },
  reviewVal: { fontSize: 12, color: "#1C2551", flex: 1 },
  error: {
    background: "rgba(239,78,36,0.08)", border: "1px solid rgba(239,78,36,0.25)",
    borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#EF4E24",
  },
  footer: {
    padding: "16px 28px", borderTop: "1px solid #EAECF4",
    display: "flex", justifyContent: "space-between", gap: 10, flexShrink: 0,
  },
  backBtn: {
    padding: "9px 18px", background: "#fff", border: "1px solid #EAECF4", borderRadius: 8,
    cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#1C2551",
    fontFamily: "Poppins, sans-serif",
  },
  nextBtn: {
    padding: "9px 22px", border: "none", borderRadius: 8,
    cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff",
    fontFamily: "Poppins, sans-serif",
  },
};
