"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { NAV_CONFIG, ROLE_COLOR, Role } from "./nav-config";

interface SidebarProps {
  activePage: string;
  onNavigate: (id: string) => void;
}

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();

  if (!user) return null;

  const role = user.role as Role;
  const config = NAV_CONFIG[role];
  const roleColor = ROLE_COLOR[role];

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <aside style={s.sidebar}>
      {/* Logo */}
      <div style={s.logoArea}>
        <div style={s.logoMark}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#EF4E24" }}>XA</span>
        </div>
        <div>
          <div style={s.logoText}>XA LMS</div>
          <div style={s.logoSub}>by fourward</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={s.nav}>
        {config.items.map((item) => {
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              style={{ ...s.navItem, ...(active ? s.navItemActive : {}) }}
            >
              <span style={s.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
              {active && <span style={s.activeBar} />}
            </button>
          );
        })}
      </nav>

      {/* User area */}
      <div style={s.userArea}>
        <div style={{ ...s.avatar, background: roleColor }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={s.userName} title={user.name}>{user.name}</div>
          <div style={s.userRole}>{config.label}</div>
        </div>
        <button onClick={handleLogout} style={s.logoutBtn} title="Sign out">
          ⇥
        </button>
      </div>
    </aside>
  );
}

const s: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 240,
    minHeight: "100vh",
    background: "#1C2551",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    position: "relative",
    zIndex: 10,
  },
  logoArea: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "20px 20px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  logoMark: {
    width: 36,
    height: 36,
    background: "rgba(239,78,36,0.15)",
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(239,78,36,0.25)",
  },
  logoText: { color: "#fff", fontWeight: 700, fontSize: 15 },
  logoSub:  { color: "rgba(255,255,255,0.35)", fontSize: 10, letterSpacing: 1 },
  nav: {
    flex: 1,
    padding: "8px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    overflowY: "auto",
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    border: "none",
    background: "transparent",
    color: "rgba(255,255,255,0.55)",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    textAlign: "left",
    width: "100%",
    position: "relative",
    fontFamily: "Poppins, sans-serif",
    transition: "all 0.15s",
  },
  navItemActive: {
    background: "rgba(239,78,36,0.15)",
    color: "#fff",
    fontWeight: 600,
  },
  navIcon: { fontSize: 14, width: 18, textAlign: "center", flexShrink: 0 },
  activeBar: {
    position: "absolute",
    right: 0,
    top: "20%",
    height: "60%",
    width: 3,
    background: "#EF4E24",
    borderRadius: "3px 0 0 3px",
  },
  userArea: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 16px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    marginTop: "auto",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    color: "#fff",
    fontWeight: 700,
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  userName: {
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  userRole:  { color: "rgba(255,255,255,0.4)", fontSize: 10 },
  logoutBtn: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.35)",
    cursor: "pointer",
    fontSize: 16,
    padding: 4,
    flexShrink: 0,
  },
};
