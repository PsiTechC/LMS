"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

interface DashboardShellProps {
  activePage: string;
  title: string;
  subtitle?: string;
  subtitleNode?: React.ReactNode;
  headerExtra?: React.ReactNode;
  onNavigate: (id: string) => void;
  children: React.ReactNode;
}

export default function DashboardShell({
  activePage,
  title,
  subtitle,
  subtitleNode,
  headerExtra,
  onNavigate,
  children,
}: DashboardShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer whenever the user navigates.
  function handleNavigate(id: string) {
    setDrawerOpen(false);
    onNavigate(id);
  }

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      overflow: "hidden",
    }}>
      {/* Off-canvas overlay (mobile only, via CSS) */}
      <div
        className={`xa-sidebar-overlay${drawerOpen ? " open" : ""}`}
        onClick={() => setDrawerOpen(false)}
      />

      <Sidebar activePage={activePage} onNavigate={handleNavigate} open={drawerOpen} />

      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: 0,
      }}>
        <Header
          title={title}
          subtitle={subtitle}
          subtitleNode={subtitleNode}
          headerExtra={headerExtra}
          onNavigate={handleNavigate}
          onMenuClick={() => setDrawerOpen(o => !o)}
        />
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
