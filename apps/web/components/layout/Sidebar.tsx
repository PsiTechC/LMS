"use client";

import { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { NAV_CONFIG, Role } from "./nav-config";
import { analyticsApi } from "@/lib/analytics-api";
import { programsApi } from "@/lib/programs-api";
import { cohortsApi } from "@/lib/cohorts-api";
import { api, ApiResponse } from "@/lib/api";

interface SidebarProps {
  activePage: string;
  onNavigate: (id: string) => void;
  open?: boolean;
}

export default function Sidebar({ activePage, onNavigate, open = false }: SidebarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [currentPhase, setCurrentPhase] = useState<{ name: string; completed: number; total: number } | null>(null);
  // Effective permissions for nav gating. null = not loaded yet (fail-open: show
  // all). full = unrestricted. keys = the user's resolved permission set.
  // isPrimaryPM is an IDENTITY flag (role_assignments.is_primary_pm), not a
  // permission key — gates requiresPrimaryPM items (e.g. "Role Management"),
  // which must stay invisible to a Secondary PM even though they share the
  // program_manager persona and most of the same permission keys.
  const [perms, setPerms] = useState<{ full: boolean; keys: Set<string>; isPrimaryPM: boolean } | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api.get<ApiResponse<{ full: boolean; permissions: string[]; is_primary_pm: boolean }>>("/me/permissions")
      .then((r) => { if (alive && r.data) setPerms({ full: r.data.full, keys: new Set(r.data.permissions), isPrimaryPM: !!r.data.is_primary_pm }); })
      .catch(() => { if (alive) setPerms(null); }); // fail-open — never hide on error
    return () => { alive = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (user?.role === "program_manager" && user.org_id) {
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
      return;
    }

    if (user?.role === "participant" || user?.role === "participant_retailer") {
      cohortsApi.myEnrollments().then(async r => {
        const enrollment = (r.data ?? [])[0];
        if (!enrollment) return;
        const program = await programsApi.get(enrollment.program_id).then(p => p.data).catch(() => null);
        const phases = program?.phases ?? [];
        if (!phases.length) return;
        // Approximate "current phase" from the enrollment's overall
        // completion_percent (no per-activity submission data available in
        // the sidebar) — same phases array the dashboard uses, so the phase
        // count/title always match what the participant sees on My Journey.
        const phaseNum = Math.min(phases.length, Math.max(1, Math.ceil((enrollment.completion_percent / 100) * phases.length)));
        setCurrentPhase({
          name: `Phase ${phaseNum}: ${phases[phaseNum - 1].title}`,
          completed: phaseNum,
          total: phases.length,
        });
      }).catch(() => {});
    }
  }, [user]);

  if (!user) return null;

  const role = user.role as Role;
  const config = NAV_CONFIG[role];
  // Super Admin (primary + secondary) has ~21 items vs 7-10 for every other
  // role — give it a touch more breathing room without touching any other
  // role's spacing, which must stay pixel-identical to before.
  const isSuperAdmin = role === "superadmin" || role === "superadmin_secondary";

  function handleLogout() {
    setLoggingOut(true);
    logout();
    // Go straight to the landing page. Pushing to "/login" adds an extra server
    // redirect hop (/login → /) which made logout feel slow.
    router.replace("/");
  }

  const initials = user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const pct = currentPhase ? Math.round((currentPhase.completed / currentPhase.total) * 100) : 0;

  const WIDTH = 240;

  return (
    <aside
      className={`xa-sidebar${open ? " open" : ""}`}
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
      {/* ── Logo area — click to go to the landing page / open programs ── */}
      <button
        type="button"
        onClick={() => router.push("/")}
        title="Go to Open Programs"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "20px 20px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          overflow: "hidden",
          whiteSpace: "nowrap",
          flexShrink: 0,
          background: "transparent",
          border: "none",
          borderBottomWidth: 1,
          cursor: "pointer",
          textAlign: "left",
          width: "100%",
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
      </button>

      {/* ── Phase box — PM & participant only ── */}
      {(role === "program_manager" || role === "participant" || role === "participant_retailer") && currentPhase && (
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
        gap: isSuperAdmin ? 16 : 2,
        overflowY: "auto",
        overflowX: "hidden",
      }}>
        {config.items
          .filter((item) => {
            if (!item.requiresPrimaryPM) return true;
            // Fail CLOSED here, unlike the perm/locked fail-open below — this
            // gates on identity ("is the org's Primary PM"), and the
            // requirement is "must never see this tab", not "sees it
            // greyed out". Hide until we have a positive is_primary_pm=true
            // from /me/permissions; a still-loading or failed fetch keeps
            // it hidden rather than briefly flashing it to a Secondary PM.
            return !!perms?.isPrimaryPM;
          })
          .map((item) => {
          const active = activePage === item.id;
          // A tab locks for two independent reasons: it's statically locked
          // for this persona (Participant Retail / Super Admin Secondary —
          // item.locked), or THIS specific account's live resolved
          // permissions (perms, from GET /me/permissions → rbac.Resolve)
          // don't include the tab's mapped `perm` key — e.g. a Secondary PM
          // account missing "coaching:manage". perms === null means the
          // fetch hasn't resolved yet or failed — fail-open (never lock) so
          // a slow/broken permissions call can't lock out a legitimate user.
          const permDenied = !!item.perm && !!perms && !perms.full && !perms.keys.has(item.perm);
          const locked = !!item.locked || permDenied;
          return (
            <button
              key={item.id}
              onClick={() => { if (!locked) onNavigate(item.id); }}
              disabled={locked}
              title={locked ? "Locked for this role" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: isSuperAdmin ? "12px 12px" : "9px 12px",
                border: "none",
                borderRadius: 8,
                cursor: locked ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                textAlign: "left",
                width: "100%",
                position: "relative",
                fontFamily: "Poppins, sans-serif",
                background: active ? "color-mix(in srgb, var(--xa-primary) 15%, transparent)" : "transparent",
                color: locked ? "rgba(255,255,255,0.3)" : active ? "#fff" : "rgba(255,255,255,0.6)",
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              {/* Icon — lock glyph when locked */}
              <span style={{ fontSize: 14, width: 18, textAlign: "center", flexShrink: 0, lineHeight: 1 }}>
                {locked ? "🔒" : item.icon}
              </span>

              {/* Label */}
              <span style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {item.label}
              </span>

              {/* LOCKED micro-badge */}
              {locked && (
                <span style={{
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  color: "rgba(255,255,255,0.3)",
                  flexShrink: 0,
                }}>
                  LOCKED
                </span>
              )}

              {/* Active right-edge bar */}
              {active && !locked && (
                <span style={{
                  position: "absolute",
                  right: 0,
                  top: "10%",
                  height: "80%",
                  width: 4,
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
          onClick={() => setShowLogoutConfirm(true)}
          title="Sign out"
          aria-label="Sign out"
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,78,36,0.18)"; e.currentTarget.style.color = "#EF4E24"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "rgba(255,255,255,0.06)",
            border: "none",
            color: "rgba(255,255,255,0.55)",
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {/* logout / sign-out icon */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>

      {showLogoutConfirm && (
        <LogoutConfirm
          userName={user.name}
          loggingOut={loggingOut}
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={handleLogout}
        />
      )}
    </aside>
  );
}

// ── Logout confirmation modal ─────────────────────────────────────────────
function LogoutConfirm({ userName, loggingOut, onCancel, onConfirm }: {
  userName: string;
  loggingOut: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget && !loggingOut) onCancel(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "Poppins, sans-serif" }}
    >
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, boxShadow: "0 24px 64px rgba(28,37,81,0.28)", overflow: "hidden" }}>
        <div style={{ padding: "28px 28px 24px", textAlign: "center" }}>
          {/* Warning icon */}
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(239,78,36,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#EF4E24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>Sign out?</div>
          <div style={{ fontSize: 13, color: "#8b90a7", lineHeight: 1.6 }}>
            You&rsquo;re signed in as <strong style={{ color: "#1C2551" }}>{userName}</strong>. You&rsquo;ll need to log in again to get back in.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, padding: "0 28px 24px" }}>
          <button
            onClick={onCancel}
            disabled={loggingOut}
            style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid #EAECF4", background: "#fff", color: "#1C2551", fontSize: 13, fontWeight: 600, cursor: loggingOut ? "default" : "pointer", fontFamily: "Poppins, sans-serif", opacity: loggingOut ? 0.6 : 1 }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loggingOut}
            style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: "#EF4E24", color: "#fff", fontSize: 13, fontWeight: 700, cursor: loggingOut ? "wait" : "pointer", fontFamily: "Poppins, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, opacity: loggingOut ? 0.8 : 1 }}
          >
            {loggingOut ? "Signing out…" : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign Out
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
