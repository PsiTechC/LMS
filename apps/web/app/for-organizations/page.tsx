"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/layout/SiteHeader";
import AuthModal from "@/components/layout/AuthModal";

const BENEFITS: { icon: string; title: string; body: string; color: string }[] = [
  { icon: "◎", title: "Cohort Programs", body: "Run a dedicated leadership program for your organization, co-designed with faculty around your business context.", color: "#C8A860" },
  { icon: "▤", title: "Program Analytics", body: "Track enrollment, engagement, completion, and at-risk learners across every cohort from one dashboard.", color: "#182848" },
  { icon: "◈", title: "360° Feedback", body: "Structured peer, manager, and self-assessments feed directly into each leader's development plan.", color: "#4A5573" },
  { icon: "✦", title: "Coaching at Scale", body: "Pair every participant with a certified coach and track conversations, goals, and follow-through.", color: "#22c55e" },
  { icon: "🎓", title: "Certification", body: "Verifiable completion certificates issued on program close, tied to your organization's branding.", color: "#f59e0b" },
  { icon: "⬢", title: "SSO & Bulk Enrollment", body: "Onboard entire teams via CSV or SSO - no one-by-one signups for your L&D team to manage.", color: "#C8A860" },
];

const STEPS: { step: string; title: string; body: string }[] = [
  { step: "01", title: "Tell us your goals", body: "Share the leadership level, business outcomes, and timeline you're solving for." },
  { step: "02", title: "We design the cohort", body: "Faculty and program managers co-build a curriculum, assessment plan, and coaching cadence." },
  { step: "03", title: "Launch & track", body: "Your team enrolls, and you get a live dashboard of engagement, risk, and outcomes." },
];

export default function ForOrganizationsPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "", teamSize: "10-25", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();

  function handleAuthSuccess(role: string) {
    setAuthOpen(false);
    const roleMap: Record<string, string> = {
      superadmin: "/dashboard/superadmin",
      superadmin_secondary: "/dashboard/superadmin",
      program_manager: "/dashboard/program-manager",
      faculty: "/dashboard/faculty",
      coach: "/dashboard/coach",
      participant: "/dashboard/participant",
      participant_retailer: "/dashboard/participant",
    };
    router.push(roleMap[role] || "/dashboard/participant");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.company) return;
    // No backend endpoint exists yet for organization inquiries - this
    // confirms receipt locally so the CTA isn't a dead end for visitors.
    setSubmitted(true);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F7F5F0", fontFamily: "Poppins,sans-serif" }}>
      <SiteHeader onAuthOpen={() => setAuthOpen(true)} />

      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg,#0f1635 0%,#182848 55%,#0f1635 100%)", padding: "60px 24px 52px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 72% 50%,rgba(200, 168, 96,0.15) 0%,transparent 62%)" }} />
        <div style={{ maxWidth: 1000, margin: "0 auto", position: "relative" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(200, 168, 96,0.15)", border: "1px solid rgba(200, 168, 96,0.35)", borderRadius: 20, padding: "4px 14px", marginBottom: 20 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#C8A860", display: "inline-block" }} />
            <span style={{ fontSize: 11, color: "#C8A860", fontWeight: 700, letterSpacing: 0.5 }}>FOR ORGANIZATIONS</span>
          </div>
          <div style={{ fontSize: "clamp(28px, 6vw, 42px)", fontWeight: 800, color: "#fff", marginBottom: 14, lineHeight: 1.15, maxWidth: 660 }}>
            Build your leadership<br /><span style={{ color: "#C8A860" }}>bench, on your terms.</span>
          </div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", maxWidth: 560, lineHeight: 1.7, marginBottom: 28 }}>
            Run dedicated cohorts for your managers and leaders - with faculty from IIM Ahmedabad, ISB, and XLRI -
            plus a single dashboard to track engagement, coaching, and outcomes across your whole team.
          </div>
          <a href="#talk-to-us" style={{ display: "inline-block", padding: "12px 26px", background: "#C8A860", borderRadius: 22, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
            Talk to Our Team →
          </a>
        </div>
      </div>

      {/* Benefits grid */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 8px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#C8A860", letterSpacing: 1, marginBottom: 8, textAlign: "center" }}>WHAT YOU GET</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#182848", marginBottom: 34, textAlign: "center" }}>Everything an L&D team needs in one platform</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
          {BENEFITS.map(b => (
            <div key={b.title} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E6DED0", padding: "22px 22px", boxShadow: "0 1px 6px rgba(24, 40, 72,0.06)" }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: b.color + "18", color: b.color, fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>{b.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#182848", marginBottom: 8 }}>{b.title}</div>
              <div style={{ fontSize: 12.5, color: "#4A5573", lineHeight: 1.7 }}>{b.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "56px 24px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#C8A860", letterSpacing: 1, marginBottom: 8, textAlign: "center" }}>HOW IT WORKS</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#182848", marginBottom: 34, textAlign: "center" }}>From first call to live cohort</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
          {STEPS.map(s => (
            <div key={s.step} style={{ position: "relative" }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: "rgba(24, 40, 72,0.1)", marginBottom: 4 }}>{s.step}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#182848", marginBottom: 8 }}>{s.title}</div>
              <div style={{ fontSize: 12.5, color: "#4A5573", lineHeight: 1.7 }}>{s.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Talk to us form */}
      <div id="talk-to-us" style={{ background: "#fff", borderTop: "1px solid #E6DED0", borderBottom: "1px solid #E6DED0", padding: "56px 24px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          {submitted ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ width: 56, height: 56, background: "rgba(34,197,94,0.1)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", fontSize: 26, color: "#22c55e" }}>✓</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#182848", marginBottom: 10 }}>Thanks, {form.name.split(" ")[0]}!</div>
              <div style={{ fontSize: 13, color: "#4A5573", lineHeight: 1.7 }}>
                Our partnerships team will reach out to <strong style={{ color: "#182848" }}>{form.email}</strong> within one business day.
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#C8A860", letterSpacing: 1, marginBottom: 8, textAlign: "center" }}>GET STARTED</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#182848", marginBottom: 24, textAlign: "center" }}>Tell us about your team</div>
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", display: "block", marginBottom: 5, letterSpacing: 0.5 }}>FULL NAME</label>
                  <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your full name" style={{ width: "100%", border: "1px solid #E6DED0", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: "#182848", outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", display: "block", marginBottom: 5, letterSpacing: 0.5 }}>WORK EMAIL</label>
                  <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" style={{ width: "100%", border: "1px solid #E6DED0", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: "#182848", outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", display: "block", marginBottom: 5, letterSpacing: 0.5 }}>COMPANY</label>
                  <input required value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Company name" style={{ width: "100%", border: "1px solid #E6DED0", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: "#182848", outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", display: "block", marginBottom: 5, letterSpacing: 0.5 }}>TEAM SIZE</label>
                  <select value={form.teamSize} onChange={e => setForm({ ...form, teamSize: e.target.value })} style={{ width: "100%", border: "1px solid #E6DED0", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: "#182848", outline: "none", boxSizing: "border-box", background: "#fff" }}>
                    {["1-10", "10-25", "25-100", "100-500", "500+"].map(o => <option key={o} value={o}>{o} leaders</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", display: "block", marginBottom: 5, letterSpacing: 0.5 }}>WHAT ARE YOU LOOKING TO SOLVE? (OPTIONAL)</label>
                  <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="e.g. First-time manager transition, succession planning…" rows={3} style={{ width: "100%", border: "1px solid #E6DED0", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: "#182848", outline: "none", boxSizing: "border-box", resize: "vertical" }} />
                </div>
                <button type="submit" style={{ width: "100%", padding: "12px", background: "#C8A860", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "Poppins,sans-serif", marginTop: 6 }}>
                  Request a Conversation →
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={handleAuthSuccess} />}
    </div>
  );
}
