"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { NAV_CONFIG, ROLE_COLOR, Role } from "./nav-config";

interface HeaderProps {
  title: string;
  subtitle?: string;
  subtitleNode?: React.ReactNode;
}

const NOTIFICATIONS = [
  "Pre-work deadline tomorrow",
  "New feedback received",
  "Coaching session at 3 PM",
];

export default function Header({ title, subtitle, subtitleNode }: HeaderProps) {
  const { user } = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);

  if (!user) return null;

  const role = user.role as Role;
  const roleColor = ROLE_COLOR[role];
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header style={s.header}>
      <div>
        <div style={s.title}>{title}</div>
        {subtitleNode ? subtitleNode : subtitle && <div style={s.subtitle}>{subtitle}</div>}
      </div>

      <div style={s.right}>
        <div style={s.aiChip}>
          <span style={{ marginRight: 5 }}>✦</span> AI Insights On
        </div>

        <div style={{ position: "relative" }}>
          <button style={s.iconBtn} onClick={() => setNotifOpen(!notifOpen)}>
            🔔
            <span style={s.badge}>3</span>
          </button>
          {notifOpen && (
            <div style={s.dropdown}>
              {NOTIFICATIONS.map((n, i) => (
                <div key={i} style={s.dropdownItem}>{n}</div>
              ))}
            </div>
          )}
        </div>

        <div style={{ ...s.userPill, borderColor: "#EAECF4" }}>
          <div style={{ ...s.pillAvatar, background: roleColor }}>{initials}</div>
          <span style={s.pillName}>{user.name}</span>
        </div>
      </div>
    </header>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: {
    height: 60,
    background: "#fff",
    borderBottom: "1px solid #EAECF4",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 28px",
    flexShrink: 0,
  },
  title:    { fontSize: 17, fontWeight: 700, color: "#1C2551" },
  subtitle: { fontSize: 12, color: "#8b90a7", marginTop: 1 },
  right: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  aiChip: {
    background: "rgba(239,78,36,0.08)",
    border: "1px solid rgba(239,78,36,0.2)",
    color: "#EF4E24",
    borderRadius: 20,
    padding: "4px 12px",
    fontSize: 11,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    border: "1px solid #EAECF4",
    background: "#fff",
    cursor: "pointer",
    fontSize: 15,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 14,
    height: 14,
    background: "#EF4E24",
    borderRadius: "50%",
    color: "#fff",
    fontSize: 9,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
  },
  dropdown: {
    position: "absolute",
    top: 40,
    right: 0,
    background: "#fff",
    borderRadius: 10,
    boxShadow: "0 8px 32px rgba(28,37,81,0.12)",
    border: "1px solid #EAECF4",
    width: 260,
    zIndex: 100,
  },
  dropdownItem: {
    padding: "12px 16px",
    fontSize: 12,
    color: "#1C2551",
    borderBottom: "1px solid #EAECF4",
    cursor: "pointer",
  },
  userPill: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid",
    borderRadius: 22,
    padding: "4px 14px 4px 4px",
    background: "#fff",
  },
  pillAvatar: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    color: "#fff",
    fontWeight: 700,
    fontSize: 11,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pillName: { fontSize: 12, fontWeight: 600, color: "#1C2551", whiteSpace: "nowrap" },
};
