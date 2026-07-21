"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

function LoadingScreen() {
  return (
    <div className="xa-loading-screen">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 36, height: 36, background: "rgba(200, 168, 96,0.15)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(200, 168, 96,0.25)", overflow: "hidden" }}>
            <img src="/intellique-app-icon.png" alt="Intellique" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--xa-text)", fontFamily: "Poppins,sans-serif" }}>Intellique</span>
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
