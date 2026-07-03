"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

function LoadingScreen() {
  return (
    <div className="xa-loading-screen">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 36, height: 36, background: "rgba(239,78,36,0.15)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(239,78,36,0.25)" }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#EF4E24" }}>XA</span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1C2551", fontFamily: "Poppins,sans-serif" }}>XA LMS</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <div className="xa-loading-dot" />
          <div className="xa-loading-dot" />
          <div className="xa-loading-dot" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading) return <LoadingScreen />;
  if (!user)   return <LoadingScreen />;

  return <>{children}</>;
}
