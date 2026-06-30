"use client";

import Sidebar from "./Sidebar";
import Header from "./Header";

interface DashboardShellProps {
  activePage: string;
  title: string;
  subtitle?: string;
  onNavigate: (id: string) => void;
  children: React.ReactNode;
}

export default function DashboardShell({
  activePage,
  title,
  subtitle,
  onNavigate,
  children,
}: DashboardShellProps) {
  return (
    <div style={{
      display: "flex",
      height: "100vh",
      overflow: "hidden",
      // Let the sidebar width transition propagate to the flex layout smoothly
      willChange: "auto",
    }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} />

      {/* Right panel transitions width automatically as flex sibling of Sidebar */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        // Smooth layout reflow when sidebar width changes
        transition: "width 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
        minWidth: 0,
      }}>
        <Header title={title} subtitle={subtitle} />
        {/* key= triggers xa-page fade-in animation on page switch */}
        <main
          key={activePage}
          className="xa-page"
          style={{ flex: 1, overflowY: "auto", background: "#F5F7FB" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
