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
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Header title={title} subtitle={subtitle} subtitleNode={subtitleNode} />
        <main style={{ flex: 1, overflowY: "auto", background: "#F5F7FB" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
