"use client";

import { useState } from "react";
import SiteHeader from "@/components/layout/SiteHeader";
import AuthModal from "@/components/layout/AuthModal";
import { useRouter } from "next/navigation";

const STATS: [string, string][] = [
  ["50+", "Open Programs"],
  ["200+", "Expert Faculty"],
  ["10K+", "Alumni Network"],
  ["15+", "Partner Institutions"],
];

const VALUES: { title: string; body: string; color: string }[] = [
  { title: "Rigor", body: "Every program is built on faculty-led research and real case methodology, not generic content.", color: "#C8A860" },
  { title: "Relevance", body: "Curricula are co-designed with practicing leaders so the skills transfer directly to the job.", color: "#182848" },
  { title: "Reach", body: "A single platform that carries a leader from assessment through coaching to measurable impact.", color: "#4A5573" },
];

const TIMELINE: { year: string; text: string }[] = [
  { year: "2018", text: "Executive Acceleration founded to close the gap between leadership theory and on-the-job impact." },
  { year: "2020", text: "Launched cohort-based programs in partnership with IIM Ahmedabad and XLRI Jamshedpur." },
  { year: "2023", text: "Crossed 10,000 alumni across 15+ partner institutions." },
  { year: "2026", text: "Intellique: a unified platform for assessments, coaching, 360° feedback, and certification." },
];

export default function AboutPage() {
  const [authOpen, setAuthOpen] = useState(false);
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

  return (
    <div style={{ minHeight: "100vh", background: "#F7F5F0", fontFamily: "Poppins,sans-serif" }}>
      <SiteHeader onAuthOpen={() => setAuthOpen(true)} />

      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg,#0f1635 0%,#182848 55%,#0f1635 100%)", padding: "60px 24px 52px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 72% 50%,rgba(200, 168, 96,0.15) 0%,transparent 62%)" }} />
        <div style={{ maxWidth: 900, margin: "0 auto", position: "relative" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(200, 168, 96,0.15)", border: "1px solid rgba(200, 168, 96,0.35)", borderRadius: 20, padding: "4px 14px", marginBottom: 20 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#C8A860", display: "inline-block" }} />
            <span style={{ fontSize: 11, color: "#C8A860", fontWeight: 700, letterSpacing: 0.5 }}>ABOUT Intellique</span>
          </div>
          <div style={{ fontSize: "clamp(28px, 6vw, 42px)", fontWeight: 800, color: "#fff", marginBottom: 14, lineHeight: 1.15, maxWidth: 640 }}>
            Leadership development,<br /><span style={{ color: "#C8A860" }}>built for measurable impact.</span>
          </div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", maxWidth: 560, lineHeight: 1.7 }}>
            Executive Acceleration builds AI-powered leadership programs with India&apos;s top business schools -
            combining assessments, coaching, and 360° feedback into one journey that leaders actually finish.
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 24px", marginTop: -30, position: "relative", zIndex: 2 }}>
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E6DED0", boxShadow: "0 8px 32px rgba(24, 40, 72,0.10)", padding: "26px 28px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 20 }}>
          {STATS.map(([val, label]) => (
            <div key={label}>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#C8A860" }}>{val}</div>
              <div style={{ fontSize: 11, color: "#4A5573", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Mission */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "56px 24px 8px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#C8A860", letterSpacing: 1, marginBottom: 8 }}>OUR MISSION</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#182848", marginBottom: 14, lineHeight: 1.4 }}>
          Give every leader a clear, evidence-based path from where they are to where their organization needs them to be.
        </div>
        <div style={{ fontSize: 14, color: "#4a5074", lineHeight: 1.8 }}>
          Most leadership training ends at the workshop. We built Intellique so it doesn&apos;t - pairing faculty-led
          content with structured coaching, peer and manager feedback, and progress tracking that program
          managers and HR leaders can actually report on.
        </div>
      </div>

      {/* Values */}
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
          {VALUES.map(v => (
            <div key={v.title} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E6DED0", padding: "22px 22px", boxShadow: "0 1px 6px rgba(24, 40, 72,0.06)" }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: v.color + "18", color: v.color, fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>{v.title[0]}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#182848", marginBottom: 8 }}>{v.title}</div>
              <div style={{ fontSize: 12.5, color: "#4A5573", lineHeight: 1.7 }}>{v.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "8px 24px 64px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#C8A860", letterSpacing: 1, marginBottom: 20, textAlign: "center" }}>OUR JOURNEY</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {TIMELINE.map((t, i) => (
            <div key={t.year} style={{ display: "flex", gap: 18 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#C8A860", flexShrink: 0 }} />
                {i < TIMELINE.length - 1 && <div style={{ width: 2, flex: 1, background: "#E6DED0", minHeight: 40 }} />}
              </div>
              <div style={{ paddingBottom: 32 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#182848", marginBottom: 4 }}>{t.year}</div>
                <div style={{ fontSize: 13, color: "#4A5573", lineHeight: 1.7 }}>{t.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ background: "#182848", padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 10 }}>Ready to accelerate your leaders?</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 22 }}>Explore our open programs or talk to us about a cohort for your organization.</div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/open-programs" style={{ padding: "11px 24px", background: "#C8A860", borderRadius: 22, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Browse Programs</a>
          <a href="/for-organizations" style={{ padding: "11px 24px", background: "transparent", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 22, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>For Organizations</a>
        </div>
      </div>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={handleAuthSuccess} />}
    </div>
  );
}
