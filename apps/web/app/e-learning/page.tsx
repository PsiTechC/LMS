"use client";

import { useState } from "react";
import SiteHeader from "@/components/layout/SiteHeader";
import AuthModal from "@/components/layout/AuthModal";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ComingSoonPage() {
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
    <div style={{ minHeight: "100vh", background: "#F7F5F0", fontFamily: "Poppins, sans-serif" }}>
      <SiteHeader onAuthOpen={() => setAuthOpen(true)} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: "20vh", padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 20 }}>🚧</div>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: "#182848", marginBottom: 12 }}>Development in Progress</h1>
        <p style={{ fontSize: 16, color: "#4A5573", maxWidth: 500, lineHeight: 1.6, marginBottom: 32 }}>
          This feature is currently under development and will be available soon. Check back later!
        </p>
        <Link href="/open-programs" style={{ padding: "12px 24px", background: "#C8A860", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
          Back to Open Programs
        </Link>
      </div>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={handleAuthSuccess} />}
    </div>
  );
}
