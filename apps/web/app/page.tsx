"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/layout/SiteHeader";
import AuthModal from "@/components/layout/AuthModal";

const STATS: [string, string][] = [
  ["50+", "Open Programs"],
  ["200+", "Expert Faculty"],
  ["10K+", "Alumni Network"],
  ["15+", "Partner Institutions"],
];

const PILLARS: { icon: string; title: string; body: string; color: string; href: string }[] = [
  { icon: "▤", title: "Open Programs", body: "Browse cohort-based leadership programs from IIM, ISB & XLRI faculty and enroll in minutes.", color: "#EF4E24", href: "/open-programs" },
  { icon: "◎", title: "For Organizations", body: "Run a dedicated cohort for your managers and leaders, with a single dashboard for outcomes.", color: "#1C2551", href: "/for-organizations" },
  { icon: "◈", title: "Alumni Network", body: "Join 10,000+ leaders across industries who stay connected long after the program ends.", color: "#6B73BF", href: "/alumni-network" },
];

export default function HomePage() {
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
    <div style={{ minHeight: "100vh", background: "#F5F7FB", fontFamily: "Poppins,sans-serif" }}>
      <SiteHeader onAuthOpen={() => setAuthOpen(true)} />

      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg,#0f1635 0%,#1C2551 55%,#0f1635 100%)", padding: "72px 24px 64px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 72% 50%,rgba(239,78,36,0.15) 0%,transparent 62%)" }} />
        <div style={{ maxWidth: 900, margin: "0 auto", position: "relative", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(239,78,36,0.15)", border: "1px solid rgba(239,78,36,0.35)", borderRadius: 20, padding: "4px 14px", marginBottom: 22 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#EF4E24", display: "inline-block" }} />
            <span style={{ fontSize: 11, color: "#EF4E24", fontWeight: 700, letterSpacing: 0.5 }}>OPEN ENROLLMENT · BATCH 2026</span>
          </div>
          <div style={{ fontSize: "clamp(32px, 7vw, 50px)", fontWeight: 800, color: "#fff", marginBottom: 16, lineHeight: 1.15 }}>
            Transform Your<br /><span style={{ color: "#EF4E24" }}>Leadership Journey</span>
          </div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", marginBottom: 32, maxWidth: 560, lineHeight: 1.7, margin: "0 auto 32px" }}>
            World-class open programs from IIMs, ISB &amp; XLRI. Join 10,000+ leaders who have elevated their careers with Executive Acceleration.
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 44 }}>
            <a href="/open-programs" style={{ padding: "12px 26px", background: "#EF4E24", borderRadius: 22, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Browse Programs →</a>
            <a href="/for-organizations" style={{ padding: "12px 26px", background: "transparent", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 22, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>For Organizations</a>
          </div>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, auto))", gap: "18px 40px", justifyContent: "center" }}>
            {STATS.map(([val, label]) => (
              <div key={label}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#EF4E24" }}>{val}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pillars */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 64px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#EF4E24", letterSpacing: 1, marginBottom: 8, textAlign: "center" }}>WHERE TO START</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1C2551", marginBottom: 34, textAlign: "center" }}>Everything Executive Acceleration offers</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          {PILLARS.map(p => (
            <a key={p.title} href={p.href} style={{ background: "#fff", borderRadius: 16, border: "1px solid #EAECF4", padding: "26px 24px", boxShadow: "0 1px 6px rgba(28,37,81,0.06)", textDecoration: "none", display: "block" }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: p.color + "18", color: p.color, fontWeight: 800, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>{p.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>{p.title}</div>
              <div style={{ fontSize: 12.5, color: "#8b90a7", lineHeight: 1.7, marginBottom: 14 }}>{p.body}</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: p.color }}>Learn more →</span>
            </a>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ background: "#1C2551", padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 10 }}>Ready to get started?</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 22 }}>Explore open programs or learn more about what we do.</div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/open-programs" style={{ padding: "11px 24px", background: "#EF4E24", borderRadius: 22, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Browse Programs</a>
          <a href="/about" style={{ padding: "11px 24px", background: "transparent", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 22, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>About Us</a>
        </div>
      </div>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={handleAuthSuccess} />}
    </div>
  );
}
