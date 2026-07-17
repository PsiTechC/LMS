"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/layout/SiteHeader";
import AuthModal from "@/components/layout/AuthModal";

const STATS: [string, string][] = [
  ["10K+", "Alumni Worldwide"],
  ["500+", "Organizations"],
  ["40+", "Countries"],
  ["15+", "Partner Institutions"],
];

const BENEFITS: { icon: string; title: string; body: string; color: string }[] = [
  { icon: "◈", title: "Lifetime Network Access", body: "Stay connected to your cohort and the wider alumni community long after your program ends.", color: "#C8A860" },
  { icon: "✦", title: "Exclusive Events", body: "Invitations to alumni-only masterclasses, panels, and regional meetups throughout the year.", color: "#182848" },
  { icon: "◎", title: "Peer Mentorship", body: "Give or get mentorship from leaders across industries who share your program background.", color: "#4A5573" },
  { icon: "▤", title: "Continued Learning", body: "Alumni pricing on new open programs and early access to newly launched cohorts.", color: "#22c55e" },
];

const STORIES: { name: string; role: string; program: string; quote: string; color: string }[] = [
  { name: "Aisha Khan", role: "VP Operations, Northwind Retail", program: "Leadership Accelerator – Batch 4", quote: "The alumni network is where the real ROI shows up — I still call two people from my cohort for advice every month.", color: "#C8A860" },
  { name: "Rahul Menon", role: "Director of Engineering, Fintra", program: "Senior Manager Fast Track", quote: "Two years out, and the peer group from this program is still my sharpest sounding board for tough calls.", color: "#182848" },
  { name: "Priya Nataraj", role: "Head of People, Solvix", program: "Women in Leadership", quote: "The alumni events aren't networking for the sake of it — they're genuinely where I've found my next mentors.", color: "#4A5573" },
];

export default function AlumniNetworkPage() {
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
            <span style={{ fontSize: 11, color: "#C8A860", fontWeight: 700, letterSpacing: 0.5 }}>ALUMNI NETWORK</span>
          </div>
          <div style={{ fontSize: "clamp(28px, 6vw, 42px)", fontWeight: 800, color: "#fff", marginBottom: 14, lineHeight: 1.15, maxWidth: 640 }}>
            The network doesn&apos;t end<br /><span style={{ color: "#C8A860" }}>when the program does.</span>
          </div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", maxWidth: 560, lineHeight: 1.7 }}>
            Join 10,000+ leaders across 40+ countries who stay connected, mentor each other, and keep learning
            together long after graduation.
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

      {/* Benefits */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 8px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#C8A860", letterSpacing: 1, marginBottom: 8, textAlign: "center" }}>MEMBER BENEFITS</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#182848", marginBottom: 34, textAlign: "center" }}>What alumni get, for life</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
          {BENEFITS.map(b => (
            <div key={b.title} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E6DED0", padding: "22px 20px", boxShadow: "0 1px 6px rgba(24, 40, 72,0.06)" }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: b.color + "18", color: b.color, fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>{b.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#182848", marginBottom: 8 }}>{b.title}</div>
              <div style={{ fontSize: 12.5, color: "#4A5573", lineHeight: 1.7 }}>{b.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Stories */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#C8A860", letterSpacing: 1, marginBottom: 8, textAlign: "center" }}>ALUMNI STORIES</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#182848", marginBottom: 34, textAlign: "center" }}>Where our alumni are now</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          {STORIES.map(s => (
            <div key={s.name} style={{ background: "#fff", borderRadius: 16, border: "1px solid #E6DED0", padding: "24px 22px", boxShadow: "0 1px 6px rgba(24, 40, 72,0.06)", display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 28, color: s.color, opacity: 0.25, fontWeight: 800, lineHeight: 1, marginBottom: 8 }}>&ldquo;</div>
              <div style={{ fontSize: 13, color: "#4a5074", lineHeight: 1.75, marginBottom: 18, flex: 1 }}>{s.quote}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: s.color, color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {s.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#182848" }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: "#4A5573" }}>{s.role}</div>
                  <div style={{ fontSize: 10, color: s.color, fontWeight: 600, marginTop: 2 }}>{s.program}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ background: "#182848", padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 10 }}>Not an alumnus yet?</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 22 }}>Enroll in an open program and join the network for life.</div>
        <a href="/open-programs" style={{ display: "inline-block", padding: "11px 24px", background: "#C8A860", borderRadius: 22, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Browse Programs →</a>
      </div>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={handleAuthSuccess} />}
    </div>
  );
}
