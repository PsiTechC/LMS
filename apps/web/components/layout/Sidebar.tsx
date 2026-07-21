"use client";

import { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth, hasRole } from "@/lib/auth-context";
import { NAV_CONFIG, NavItem, Role, FACULTY_COACHING_GROUP_CHILDREN } from "./nav-config";
import { analyticsApi } from "@/lib/analytics-api";
import { programsApi } from "@/lib/programs-api";
import { cohortsApi } from "@/lib/cohorts-api";
import { api, ApiResponse, UserDTO } from "@/lib/api";
import { profileApi } from "@/lib/profile-api";

// A faculty account additionally granted the "coach" persona sees the flat
// "Coaching" item expand into a group (My Coaching + the coach workspace
// sub-tabs) — computed here rather than in NAV_CONFIG since that config is
// static per role and other screens read it without per-user context.
// Faculty WITHOUT the coach grant get back `allItems` unchanged.
function sidebarItemsFor(role: Role, user: UserDTO | null, allItems: NavItem[]): NavItem[] {
  if (role !== "faculty" || !hasRole(user, "coach")) return allItems;
  return allItems.map((item) =>
    item.id === "fac-coaching"
      ? { id: "fac-coaching-group", icon: item.icon, label: item.label, children: FACULTY_COACHING_GROUP_CHILDREN }
      : item);
}

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
  // permission key - gates requiresPrimaryPM items (e.g. "Role Management"),
  // which must stay invisible to a Secondary PM even though they share the
  // program_manager persona and most of the same permission keys.
  const [perms, setPerms] = useState<{ full: boolean; keys: Set<string>; isPrimaryPM: boolean } | null>(null);

  // Expandable groups (e.g. Superadmin's "Management") - a group auto-expands
  // whenever the active page is one of its children, but the user can also
  // toggle it manually; toggling never navigates (a group header has no page
  // of its own). Adjusted during render (React's documented pattern for state
  // that must follow a prop change) rather than in an effect, since some
  // callers navigate straight to a grouped child (e.g. FacultyManagement's
  // onNavigate) without the group ever being clicked open first.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [autoExpandedFor, setAutoExpandedFor] = useState<string | null>(null);
  if (user && activePage !== autoExpandedFor) {
    const cfg = NAV_CONFIG[user.role as Role];
    const group = sidebarItemsFor(user.role as Role, user, cfg.items).find((item) => item.children?.some((c) => c.id === activePage));
    if (group && !expandedGroups.has(group.id)) {
      setExpandedGroups((prev) => new Set(prev).add(group.id));
    }
    setAutoExpandedFor(activePage);
  }

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api.get<ApiResponse<{ full: boolean; permissions: string[]; is_primary_pm: boolean }>>("/me/permissions")
      .then((r) => { if (alive && r.data) setPerms({ full: r.data.full, keys: new Set(r.data.permissions), isPrimaryPM: !!r.data.is_primary_pm }); })
      .catch(() => { if (alive) setPerms(null); }); // fail-open - never hide on error
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
        // the sidebar) - same phases array the dashboard uses, so the phase
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
  const items = sidebarItemsFor(role, user, config.items);
  // Super Admin (primary + secondary) has ~21 items vs 7-10 for every other
  // role - give it a touch more breathing room without touching any other
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
      {/* ── Logo area - click to go to the landing page / open programs ── */}
      <button
        type="button"
        onClick={() => router.push("/")}
        title="Go to Open Programs"
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
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
          transition: "background 0.16s ease",
        }}>
        {/* Logo mark - always the platform's own Intellique identity, not the
            logged-in org's uploaded logo (that's shown elsewhere, e.g. a
            future org-scoped header) */}
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
          overflow: "hidden",
        }}>
          <img src="/intellique-icon-reversed.png" alt="Intellique" style={{ width: "70%", height: "70%", objectFit: "contain" }} />
        </div>

        {/* Brand text */}
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Intellique</div>
          <div style={{ color: "var(--xa-primary)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase" }}>Executive Learning</div>
        </div>
      </button>

      {/* ── Phase box - PM & participant only ── */}
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
            <div className="xa-progress-fill" style={{ height: "100%", width: `${pct}%`, background: "var(--xa-primary)", borderRadius: 2 }} />
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
        gap: isSuperAdmin ? 4 : 2,
        overflowY: "auto",
        overflowX: "hidden",
      }}>
        {items
          .filter((item) => {
            if (!item.requiresPrimaryPM) return true;
            // Fail CLOSED here, unlike the perm/locked fail-open below - this
            // gates on identity ("is the org's Primary PM"), and the
            // requirement is "must never see this tab", not "sees it
            // greyed out". Hide until we have a positive is_primary_pm=true
            // from /me/permissions; a still-loading or failed fetch keeps
            // it hidden rather than briefly flashing it to a Secondary PM.
            return !!perms?.isPrimaryPM;
          })
          .map((item) => {
            if (item.children && item.children.length > 0) {
              const groupActive = item.children.some((c) => c.id === activePage);
              const expanded = expandedGroups.has(item.id);
              return (
                <div key={item.id}>
                  <button
                    type="button"
                    className="xa-sidebar-nav-btn"
                    onClick={() => setExpandedGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                      return next;
                    })}
                    onMouseEnter={(e) => { if (!groupActive) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                    onMouseLeave={(e) => { if (!groupActive) e.currentTarget.style.background = "transparent"; }}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: isSuperAdmin ? "10px 12px" : "9px 12px",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 12.5,
                      fontWeight: groupActive ? 600 : 400,
                      textAlign: "left",
                      width: "100%",
                      fontFamily: "Poppins, sans-serif",
                      background: groupActive ? "color-mix(in srgb, var(--xa-primary) 10%, transparent)" : "transparent",
                      color: groupActive ? "#fff" : "rgba(255,255,255,0.6)",
                      transition: "background 0.15s ease",
                    }}
                  >
                    <span style={{ fontSize: 14, width: 18, textAlign: "center", flexShrink: 0, lineHeight: 1.4 }}>{item.icon}</span>
                    <span style={{ flex: 1, lineHeight: 1.35, wordBreak: "break-word" }}>{item.label}</span>
                    <span style={{ fontSize: 10, flexShrink: 0, marginTop: 2, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }}>▸</span>
                  </button>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateRows: expanded ? "1fr" : "0fr",
                      transition: "grid-template-rows 0.18s ease",
                    }}
                  >
                    <div style={{ overflow: "hidden" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2, paddingLeft: 14 }}>
                        {item.children.map((child) => (
                          <NavButton key={child.id} item={child} active={activePage === child.id} locked={isLocked(child, perms)} isSuperAdmin={isSuperAdmin} onNavigate={onNavigate} indented />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <NavButton key={item.id} item={item} active={activePage === item.id} locked={isLocked(item, perms)} isSuperAdmin={isSuperAdmin} onNavigate={onNavigate} />
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
        {/* Avatar - uploaded profile picture if set, else orange initials
            circle per reference */}
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
          overflow: "hidden",
        }}>
          {user.avatar_url
            ? <img src={profileApi.avatarSrc(user.avatar_url) ?? undefined} alt={user.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : initials}
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
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(200, 168, 96,0.18)"; e.currentTarget.style.color = "#C8A860"; }}
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

// A tab locks for two independent reasons: it's statically locked for this
// persona (Participant Retail / Super Admin Secondary - item.locked), or THIS
// specific account's live resolved permissions (perms, from GET
// /me/permissions → rbac.Resolve) don't include the tab's mapped `perm` key.
// perms === null means the fetch hasn't resolved yet or failed - fail-open
// (never lock) so a slow/broken permissions call can't lock out a legitimate
// user.
function isLocked(item: NavItem, perms: { full: boolean; keys: Set<string>; isPrimaryPM: boolean } | null): boolean {
  const permDenied = !!item.perm && !!perms && !perms.full && !perms.keys.has(item.perm);
  return !!item.locked || permDenied;
}

// Single nav row - used for both top-level items and group children.
function NavButton({ item, active, locked, isSuperAdmin, onNavigate, indented }: {
  item: NavItem;
  active: boolean;
  locked: boolean;
  isSuperAdmin: boolean;
  onNavigate: (id: string) => void;
  indented?: boolean;
}) {
  return (
    <button
      className="xa-sidebar-nav-btn"
      onClick={() => { if (!locked) onNavigate(item.id); }}
      onMouseEnter={(e) => { if (!locked && !active) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
      onMouseLeave={(e) => { if (!locked && !active) e.currentTarget.style.background = "transparent"; }}
      disabled={locked}
      title={locked ? "Locked for this role" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: isSuperAdmin ? "10px 12px" : "9px 12px",
        border: "none",
        borderRadius: 8,
        cursor: locked ? "not-allowed" : "pointer",
        fontSize: indented ? 12.5 : 13,
        fontWeight: active ? 600 : 400,
        textAlign: "left",
        width: "100%",
        position: "relative",
        fontFamily: "Poppins, sans-serif",
        background: active ? "color-mix(in srgb, var(--xa-primary) 15%, transparent)" : "transparent",
        color: locked ? "rgba(255,255,255,0.3)" : active ? "#fff" : "rgba(255,255,255,0.6)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        transition: "background 0.15s ease",
      }}
    >
      {/* Icon - lock glyph when locked */}
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

      {/* Active right-edge bar - uses the org's accent color, distinct from
          the primary color used for the highlight background above. */}
      {active && !locked && (
        <span style={{
          position: "absolute",
          right: 0,
          top: "10%",
          height: "80%",
          width: 4,
          background: "var(--xa-accent)",
          borderRadius: "3px 0 0 3px",
        }} />
      )}
    </button>
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
      className="xa-modal-overlay"
      style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "Poppins, sans-serif" }}
    >
      <div className="xa-modal-content" style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, boxShadow: "0 24px 64px rgba(24, 40, 72,0.28)", overflow: "hidden" }}>
        <div style={{ padding: "28px 28px 24px", textAlign: "center" }}>
          {/* Warning icon */}
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(200, 168, 96,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C8A860" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#182848", marginBottom: 8 }}>Sign out?</div>
          <div style={{ fontSize: 13, color: "#4A5573", lineHeight: 1.6 }}>
            You&rsquo;re signed in as <strong style={{ color: "#182848" }}>{userName}</strong>. You&rsquo;ll need to log in again to get back in.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, padding: "0 28px 24px" }}>
          <button
            onClick={onCancel}
            disabled={loggingOut}
            onMouseEnter={e => { if (!loggingOut) e.currentTarget.style.background = "#F7F5F0"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
            style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid #E6DED0", background: "#fff", color: "#182848", fontSize: 13, fontWeight: 600, cursor: loggingOut ? "default" : "pointer", fontFamily: "Poppins, sans-serif", opacity: loggingOut ? 0.6 : 1, transition: "background 0.16s ease" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loggingOut}
            onMouseEnter={e => { if (!loggingOut) e.currentTarget.style.background = "#bb9a54"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#C8A860"; }}
            style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: "#C8A860", color: "#fff", fontSize: 13, fontWeight: 700, cursor: loggingOut ? "wait" : "pointer", fontFamily: "Poppins, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, opacity: loggingOut ? 0.8 : 1, transition: "background 0.16s ease" }}
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
