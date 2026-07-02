"use client";

import Sidebar from "./Sidebar";
import Header from "./Header";

interface DashboardShellProps {
  activePage: string;
  title: string;
  subtitle?: string;
  subtitleNode?: React.ReactNode;
  onNavigate: (id: string) => void;
  children: React.ReactNode;
}

export default function DashboardShell({
  activePage,
  title,
  subtitle,
  subtitleNode,
  onNavigate,
  children,
}: DashboardShellProps) {
  return (
    <div style={{
      display: "flex",
      height: "100vh",
      overflow: "hidden",
    }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} />
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: 0,
      }}>
        <Header title={title} subtitle={subtitle} subtitleNode={subtitleNode} onNavigate={onNavigate} />
        {/* key= triggers xa-page fade-in animation on page switch */}
        <main
          key={activePage}
          className="xa-page"
          style={{ flex: 1, overflowY: "auto", background: "var(--xa-bg)" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
