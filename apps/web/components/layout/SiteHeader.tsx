"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const NAV_LINKS: { label: string; href: string }[] = [
  { label: "Programs", href: "/open-programs" },
  { label: "Assessments", href: "/assessments" },
  { label: "Coaching", href: "/coaching" },
  { label: "E-Learning", href: "/e-learning" },
];

const ROLE_DASHBOARD: Record<string, string> = {
  superadmin: "/dashboard/superadmin",
  superadmin_secondary: "/dashboard/superadmin",
  program_manager: "/dashboard/program-manager",
  faculty: "/dashboard/faculty",
  coach: "/dashboard/coach",
  participant: "/dashboard/participant",
  participant_retailer: "/dashboard/participant",
};

export default function SiteHeader({ onAuthOpen, wishlistCount = 0 }: { onAuthOpen: () => void; wishlistCount?: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  function goToDashboard() {
    router.push(ROLE_DASHBOARD[user?.role || "participant"] || "/dashboard/participant");
  }

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 200, background: "#fff", borderBottom: "1px solid #E6DED0", boxShadow: "0 2px 12px rgba(24, 40, 72,0.06)" }}>
      <div className="xa-landing-header-row" style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", padding: "0 16px", height: 64, gap: 28, flexWrap: "wrap" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, textDecoration: "none" }}>
          <div style={{ width: 34, height: 34, background: "rgba(200, 168, 96,0.1)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <img src="/intellique-app-icon.png" alt="Intellique" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#182848", lineHeight: 1.2 }}>Intellique</div>
            <div style={{ fontSize: 9, color: "#4A5573", letterSpacing: 1 }}>OPEN PROGRAMS</div>
          </div>
        </Link>
        <nav className="xa-hide-mobile" style={{ display: "flex", gap: 22, flex: 1 }}>
          {NAV_LINKS.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{ fontSize: 13, color: active ? "#C8A860" : "#4A5573", fontWeight: active ? 700 : 500, textDecoration: "none" }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="xa-show-mobile" style={{ flex: 1 }} />
        <div className="xa-header-actions" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {wishlistCount > 0 && (
            <button className="xa-wishlist-btn" style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1px solid #E6DED0", borderRadius: 22, background: "#fff", cursor: "pointer", fontFamily: "Poppins,sans-serif" }}>
              <span style={{ color: "#C8A860", fontSize: 14 }}>♥</span>
              <span className="xa-hide-mobile" style={{ fontSize: 12, color: "#182848", fontWeight: 600 }}>Wishlist</span>
              <span style={{ position: "absolute", top: -5, right: -5, width: 16, height: 16, background: "#C8A860", borderRadius: "50%", color: "#fff", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{wishlistCount}</span>
            </button>
          )}
          {user ? (
            <>
              <span suppressHydrationWarning style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px 5px 6px", border: "1px solid #E6DED0", borderRadius: 22, background: "#fff" }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#C8A860", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{(user.name || user.email || "U").slice(0, 1).toUpperCase()}</span>
                <span className="xa-hide-mobile" style={{ fontSize: 12, color: "#182848", fontWeight: 600, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</span>
              </span>
              <button suppressHydrationWarning onClick={goToDashboard} className="xa-header-cta" style={{ padding: "9px 20px", background: "#182848", border: "none", borderRadius: 22, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins,sans-serif", whiteSpace: "nowrap" }}>
                Go to Dashboard
              </button>
              <button suppressHydrationWarning onClick={logout} className="xa-header-cta" style={{ padding: "9px 16px", background: "#fff", border: "1px solid #E6DED0", borderRadius: 22, color: "#4A5573", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins,sans-serif", whiteSpace: "nowrap" }}>
                Log out
              </button>
            </>
          ) : (
            <button suppressHydrationWarning onClick={onAuthOpen} style={{ padding: "9px 20px", background: "#182848", border: "none", borderRadius: 22, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins,sans-serif", whiteSpace: "nowrap" }}>
              Login / Sign Up
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
