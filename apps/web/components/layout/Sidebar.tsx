"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { NAV_CONFIG, ROLE_COLOR, Role } from "./nav-config";
import { analyticsApi, ProgramSummaryResponse } from "@/lib/analytics-api";
import { programsApi } from "@/lib/programs-api";

interface SidebarProps {
  activePage: string;
  onNavigate: (id: string) => void;
}

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
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
  const roleColor = ROLE_COLOR[role];

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const initials = user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const pct = currentPhase ? Math.round((currentPhase.completed / currentPhase.total) * 100) : 0;

  const W_COLLAPSED = 60;
  const W_EXPANDED  = 240;
  const width = expanded ? W_EXPANDED : W_COLLAPSED;

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        width,
        minHeight: "100vh",
        background: "#1C2551",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        position: "relative",
        zIndex: 10,
        overflow: "hidden",
        transition: "width 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
        willChange: "width",
        fontFamily: "Poppins, sans-serif",
      }}
    >
      {/* ── Logo area ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: expanded ? "20px 20px 16px" : "20px 12px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        transition: "padding 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
        overflow: "hidden",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}>
        {/* Logo mark — orange box with XA */}
        <div style={{
          width: 36,
          height: 36,
          background: "rgba(239,78,36,0.15)",
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          border: "1px solid rgba(239,78,36,0.25)",
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#EF4E24", letterSpacing: -0.5 }}>XA</span>
        </div>

        {/* Brand text */}
        <div style={{
          opacity: expanded ? 1 : 0,
          transform: expanded ? "translateX(0)" : "translateX(-8px)",
          transition: "opacity 0.16s ease, transform 0.16s ease",
          pointerEvents: expanded ? "auto" : "none",
          minWidth: 0,
        }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>XA LMS</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, letterSpacing: 1 }}>by fourward</div>
        </div>
      </div>

      {/* ── Phase box — PM & participant only ── */}
      {(role === "program_manager") && currentPhase && (
        <div style={{
          margin: "12px 14px 4px",
          background: "rgba(239,78,36,0.12)",
          border: "1px solid rgba(239,78,36,0.2)",
          borderRadius: 10,
          padding: "12px 14px",
          overflow: "hidden",
          opacity: expanded ? 1 : 0,
          maxHeight: expanded ? 120 : 0,
          transition: "opacity 0.16s ease, max-height 0.22s ease",
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 0.5, marginBottom: 3 }}>
            Current Phase
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#EF4E24", marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {currentPhase.name}
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, marginBottom: 5, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "#EF4E24", borderRadius: 2, transition: "width 0.4s ease" }} />
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
              title={!expanded ? item.label : undefined}
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
                background: active ? "rgba(239,78,36,0.15)" : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,0.6)",
                transition: "background 0.14s ease, color 0.14s ease",
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
                opacity: expanded ? 1 : 0,
                transform: expanded ? "translateX(0)" : "translateX(-6px)",
                transition: "opacity 0.14s ease, transform 0.14s ease",
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
                  background: "#EF4E24",
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
        padding: expanded ? "14px 18px" : "14px 12px",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
        whiteSpace: "nowrap",
        transition: "padding 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
        flexShrink: 0,
      }}>
        {/* Avatar — always orange in sidebar per reference */}
        <div style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: "#EF4E24",
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
        <div style={{
          flex: 1,
          minWidth: 0,
          opacity: expanded ? 1 : 0,
          transform: expanded ? "translateX(0)" : "translateX(-8px)",
          transition: "opacity 0.14s ease, transform 0.14s ease",
          pointerEvents: expanded ? "auto" : "none",
        }}>
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
            opacity: expanded ? 1 : 0,
            transition: "opacity 0.14s ease",
            pointerEvents: expanded ? "auto" : "none",
            fontFamily: "Poppins, sans-serif",
          }}
        >
          ⇥
        </button>
      </div>
    </aside>
  );
}
