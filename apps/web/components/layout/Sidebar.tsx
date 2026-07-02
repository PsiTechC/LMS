"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { NAV_CONFIG, Role } from "./nav-config";
import { analyticsApi } from "@/lib/analytics-api";
import { programsApi } from "@/lib/programs-api";

interface SidebarProps {
  activePage: string;
  onNavigate: (id: string) => void;
}

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [currentPhase, setCurrentPhase] = useState<{ name: string; completed: number; total: number } | null>(null);

  useEffect(() => {
    if (user?.role !== "program_manager" || !user.org_id) return;
    programsApi.list(user.org_id).then(async r => {
      const active = (r.data ?? []).filter(p => p.status === "active");
      if (!active.length) return;
      const summary = await analyticsApi.programSummary(active[0].id).then(s => s.data).catch(() => null);
      const cohorts = summary?.cohorts ?? [];
      if (!cohorts.length) return;
      const top = cohorts.reduce((a, b) => a.avg_completion >= b.avg_completion ? a : b);
      const phaseIdx = cohorts.indexOf(top) + 1;
      setCurrentPhase({
        name: `Phase ${phaseIdx}: ${active[0].title.split(" ").slice(0, 2).join(" ")}`,
        completed: phaseIdx,
        total: Math.max(cohorts.length, phaseIdx),
      });
    }).catch(() => {});
  }, [user]);

  if (!user) return null;

  const role = user.role as Role;
  const config = NAV_CONFIG[role];

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const initials = user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const pct = currentPhase ? Math.round((currentPhase.completed / currentPhase.total) * 100) : 0;

  const WIDTH = 240;

  return (
    <aside
      style={{
        width: WIDTH,
        minHeight: "100vh",
        background: "var(--xa-sidebar)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        position: "relative",
        zIndex: 10,
        overflow: "hidden",
        fontFamily: "Poppins, sans-serif",
      }}
    >
      {/* ── Logo area ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "20px 20px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}>
        {/* Logo mark — orange box with XA */}
        <div style={{
          width: 36,
          height: 36,
          background: "color-mix(in srgb, var(--xa-primary) 15%, transparent)",
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          border: "1px solid color-mix(in srgb, var(--xa-primary) 25%, transparent)",
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--xa-primary)", letterSpacing: -0.5 }}>XA</span>
        </div>

        {/* Brand text */}
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>XA LMS</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, letterSpacing: 1 }}>by fourward</div>
        </div>
      </div>

      {/* ── Phase box — PM & participant only ── */}
      {(role === "program_manager") && currentPhase && (
        <div style={{
          margin: "12px 14px 4px",
          background: "color-mix(in srgb, var(--xa-primary) 12%, transparent)",
          border: "1px solid color-mix(in srgb, var(--xa-primary) 20%, transparent)",
          borderRadius: 10,
          padding: "12px 14px",
          overflow: "hidden",
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 0.5, marginBottom: 3 }}>
            Current Phase
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--xa-primary)", marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {currentPhase.name}
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, marginBottom: 5, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "var(--xa-primary)", borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            {currentPhase.completed} of {currentPhase.total} phases complete
          </div>
        </div>
      )}

      {/* ── Nav items ── */}
      <nav style={{
        flex: 1,
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        overflowY: "auto",
        overflowX: "hidden",
      }}>
        {config.items.map((item) => {
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 12px",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                textAlign: "left",
                width: "100%",
                position: "relative",
                fontFamily: "Poppins, sans-serif",
                background: active ? "color-mix(in srgb, var(--xa-primary) 15%, transparent)" : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,0.6)",
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              {/* Icon */}
              <span style={{ fontSize: 14, width: 18, textAlign: "center", flexShrink: 0, lineHeight: 1 }}>
                {item.icon}
              </span>

              {/* Label */}
              <span style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {item.label}
              </span>

              {/* Active right-edge bar */}
              {active && (
                <span style={{
                  position: "absolute",
                  right: 0,
                  top: "20%",
                  height: "60%",
                  width: 3,
                  background: "var(--xa-primary)",
                  borderRadius: "3px 0 0 3px",
                }} />
              )}
            </button>
          );
        })}
      </nav>

      {/* ── User area ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 18px",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}>
        {/* Avatar — always orange in sidebar per reference */}
        <div style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: "var(--xa-primary)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontFamily: "Poppins, sans-serif",
        }}>
          {initials}
        </div>

        {/* Name + role */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={user.name}>
            {user.name}
          </div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>{config.label}</div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          title="Sign out"
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.35)",
            cursor: "pointer",
            fontSize: 16,
            padding: 4,
            flexShrink: 0,
            fontFamily: "Poppins, sans-serif",
          }}
        >
          ⇥
        </button>
      </div>
    </aside>
  );
}
