"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { NAV_CONFIG, ROLE_COLOR, Role } from "./nav-config";
import { communicationsApi, InAppNotification } from "@/lib/communications-api";

interface HeaderProps {
  title: string;
  subtitle?: string;
  onNavigate?: (page: string) => void;
}

const TYPE_ICON: Record<string, string> = {
  info:        "ℹ",
  reminder:    "⏰",
  alert:       "⚠",
  achievement: "★",
};

const TYPE_COLOR: Record<string, string> = {
  info:        "#6B73BF",
  reminder:    "#f59e0b",
  alert:       "#EF4E24",
  achievement: "#22c55e",
};

export default function Header({ title, subtitle, onNavigate }: HeaderProps) {
  const { user } = useAuth();
  const [notifOpen, setNotifOpen]     = useState(false);
  const [notifs,    setNotifs]        = useState<InAppNotification[]>([]);
  const [loading,   setLoading]       = useState(false);
  const dropdownRef                   = useRef<HTMLDivElement>(null);
  const pollRef                       = useRef<ReturnType<typeof setInterval> | null>(null);

  const unread = notifs.filter(n => !n.read_at).length;

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await communicationsApi.listNotifications();
      setNotifs(res.data ?? []);
    } catch { /* silently ignore — API may not be running */ }
  }, []);

  // Poll every 60 seconds while mounted
  useEffect(() => {
    fetchNotifs();
    pollRef.current = setInterval(fetchNotifs, 60_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchNotifs]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!notifOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [notifOpen]);

  async function handleOpen() {
    setNotifOpen(o => !o);
    if (!notifOpen) {
      setLoading(true);
      await fetchNotifs();
      setLoading(false);
    }
  }

  async function handleMarkOne(id: string) {
    try {
      await communicationsApi.markRead(id);
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    } catch { /* ignore */ }
  }

  async function handleMarkAll() {
    try {
      await communicationsApi.markAllRead();
      const now = new Date().toISOString();
      setNotifs(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? now })));
    } catch { /* ignore */ }
  }

  if (!user) return null;

  const role      = user.role as Role;
  const roleColor = ROLE_COLOR[role];
  const initials  = user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <header style={s.header}>
      <div>
        <div key={title} className="xa-page" style={s.title}>{title}</div>
        {subtitle && <div style={s.subtitle}>{subtitle}</div>}
      </div>

      <div style={s.right}>
        <div style={s.aiChip}>
          <span style={{ marginRight: 5 }}>✦</span> AI Insights On
        </div>

        {/* Bell */}
        <div style={{ position: "relative" }} ref={dropdownRef}>
          <button style={s.iconBtn} onClick={handleOpen} title="Notifications">
            <BellIcon />
            {unread > 0 && (
              <span style={s.badge}>{unread > 9 ? "9+" : unread}</span>
            )}
          </button>

          {notifOpen && (
            <div className="xa-dropdown" style={s.dropdown}>
              {/* Header row */}
              <div style={s.dropdownHeader}>
                <span style={{ fontWeight: 700, fontSize: 13, color: "#1C2551" }}>Notifications</span>
                {unread > 0 && (
                  <button onClick={handleMarkAll} style={s.markAllBtn}>Mark all read</button>
                )}
              </div>

              {/* Body */}
              <div style={{ maxHeight: 360, overflowY: "auto" }}>
                {loading ? (
                  <div style={s.empty}>Loading…</div>
                ) : notifs.length === 0 ? (
                  <div style={s.empty}>You are all caught up.</div>
                ) : (
                  notifs.map(n => {
                    const icon  = TYPE_ICON[n.type]  ?? "ℹ";
                    const color = TYPE_COLOR[n.type] ?? "#6B73BF";
                    const read  = !!n.read_at;
                    return (
                      <div
                        key={n.id}
                        onClick={() => !read && handleMarkOne(n.id)}
                        style={{
                          ...s.notifRow,
                          background: read ? "#fff" : "rgba(107,115,191,0.04)",
                          cursor: read ? "default" : "pointer",
                        }}
                      >
                        {/* Unread dot */}
                        <div style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: read ? "transparent" : "#EF4E24",
                          flexShrink: 0, marginTop: 6,
                        }} />

                        {/* Type icon */}
                        <div style={{
                          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                          background: `${color}14`, color,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 13, fontWeight: 700,
                        }}>
                          {icon}
                        </div>

                        {/* Text */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: read ? 400 : 600, color: "#1C2551", lineHeight: 1.4 }}>
                            {n.title}
                          </div>
                          <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {n.body}
                          </div>
                          <div style={{ fontSize: 10, color: "#8b90a7", marginTop: 4 }}>
                            {timeAgo(n.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              {notifs.length > 0 && (
                <div style={s.dropdownFooter}>
                  {unread} unread · {notifs.length} total
                </div>
              )}
            </div>
          )}
        </div>

        {/* Settings gear */}
        <button
          onClick={() => onNavigate?.("settings")}
          title="Settings"
          style={s.iconBtn}
        >
          <GearIcon />
        </button>

        {/* User pill — click to open profile */}
        <button
          onClick={() => onNavigate?.("profile")}
          title="My Profile"
          style={{ ...s.userPill, borderColor: "#EAECF4", background: "#fff", cursor: "pointer", border: "1px solid #EAECF4" }}
        >
          <div style={{ ...s.pillAvatar, background: roleColor }}>{initials}</div>
          <span style={s.pillName}>{user.name}</span>
        </button>
      </div>
    </header>
  );
}

// ── Time formatting ───────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Gear SVG ─────────────────────────────────────────────────────

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1C2551" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ── Bell SVG (no emoji — crisp at small sizes) ───────────────────

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1C2551" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  header: {
    height: 56, background: "#fff", borderBottom: "1px solid #EAECF4",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 24px", flexShrink: 0,
  },
  title:    { fontSize: 16, fontWeight: 700, color: "#1C2551" },
  subtitle: { fontSize: 11, color: "#8b90a7", marginTop: 1 },
  right:    { display: "flex", alignItems: "center", gap: 10 },
  aiChip: {
    background: "rgba(239,78,36,0.08)", border: "1px solid rgba(239,78,36,0.2)",
    color: "#EF4E24", borderRadius: 20, padding: "4px 12px",
    fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center",
  },
  iconBtn: {
    width: 34, height: 34, borderRadius: "50%", border: "1px solid #EAECF4",
    background: "#fff", cursor: "pointer", fontSize: 15,
    display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
  },
  badge: {
    position: "absolute", top: -2, right: -2,
    minWidth: 16, height: 16, padding: "0 3px",
    background: "#EF4E24", borderRadius: 99, color: "#fff",
    fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 700, fontFamily: "Poppins,sans-serif",
    border: "1.5px solid #fff",
  },
  dropdown: {
    position: "absolute", top: 42, right: 0,
    background: "#fff", borderRadius: 12,
    boxShadow: "0 8px 32px rgba(28,37,81,0.14)",
    border: "1px solid #EAECF4", width: 320, zIndex: 300,
    overflow: "hidden",
  },
  dropdownHeader: {
    padding: "12px 16px", borderBottom: "1px solid #EAECF4",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  markAllBtn: {
    fontSize: 11, fontWeight: 600, color: "#6B73BF", background: "none",
    border: "none", cursor: "pointer", fontFamily: "Poppins,sans-serif", padding: 0,
  },
  notifRow: {
    display: "flex", gap: 10, padding: "12px 14px",
    borderBottom: "1px solid #EAECF4", alignItems: "flex-start",
    transition: "background 0.14s ease",
  },
  empty: {
    padding: "32px 16px", textAlign: "center",
    fontSize: 12, color: "#8b90a7",
  },
  dropdownFooter: {
    padding: "9px 16px", fontSize: 10, color: "#8b90a7",
    fontWeight: 600, borderTop: "1px solid #EAECF4",
    letterSpacing: 0.3, textAlign: "center",
  },
  userPill: {
    display: "flex", alignItems: "center", gap: 8,
    border: "1px solid", borderRadius: 22, padding: "4px 14px 4px 4px", background: "#fff",
  },
  pillAvatar: {
    width: 28, height: 28, borderRadius: "50%", color: "#fff",
    fontWeight: 700, fontSize: 11,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  pillName: { fontSize: 12, fontWeight: 600, color: "#1C2551", whiteSpace: "nowrap" },
};
