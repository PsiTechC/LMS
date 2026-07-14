"use client";

import { useState } from "react";
import ReactDOM from "react-dom";

const C = { navy: "#1C2551", muted: "#8b90a7", border: "#EAECF4", orange: "#EF4E24" };
const ff = { fontFamily: "Poppins,sans-serif" } as const;

export interface DetailRow { label: string; value: string; bar?: number; color?: string; dot?: string }
export interface DetailSection { title: string; rows: DetailRow[] }
export interface StatDetail { label: string; value: string; sub?: string; color?: string; sections: DetailSection[] }

// A dashboard/analytics stat card that's clickable when it has somewhere to
// go: either `detail` (opens a breakdown modal via `onOpen`) or `onNavigate`
// (jumps to another tab — for cards whose "detail" is really just "go look
// at the full page", e.g. PM Dashboard's KPI cards). Static (no cursor, no
// "TAP FOR DETAILS" affordance) when neither is provided.
export function StatCard({ label, value, sub, subColor, color, icon, detail, onOpen, onNavigate }: {
  label: string; value: string | number; sub?: string; subColor?: string; color?: string; icon?: string;
  detail?: DetailSection[]; onOpen?: () => void; onNavigate?: () => void;
}) {
  const clickable = !!(detail !== undefined ? onOpen : onNavigate);
  const handleClick = detail !== undefined ? onOpen : onNavigate;
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={clickable ? handleClick : undefined}
      onMouseEnter={() => clickable && setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, padding: 20,
        boxShadow: hover ? "0 4px 16px rgba(28,37,81,0.12)" : "0 1px 4px rgba(28,37,81,0.07)",
        cursor: clickable ? "pointer" : "default", transition: "box-shadow 0.15s", ...ff,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>{label}</div>
        {icon && <span style={{ fontSize: 14, color: color ?? C.navy, opacity: 0.6 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color ?? C.navy, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: subColor ?? C.muted, marginTop: 3 }}>{sub}</div>}
      {clickable && <div style={{ fontSize: 9, color: C.muted, fontWeight: 600, marginTop: 6, letterSpacing: 0.3 }}>TAP FOR DETAILS</div>}
    </div>
  );
}

export function StatDetailOverlay({ data, onClose }: { data: StatDetail | null; onClose: () => void }) {
  if (!data) return null;
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, ...ff }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "82vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>{data.label}</div>
            <div style={{ fontSize: 34, fontWeight: 800, color: data.color ?? C.navy, lineHeight: 1 }}>{data.value}</div>
            {data.sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{data.sub}</div>}
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, border: `1px solid ${C.border}`, borderRadius: "50%", background: "#fff", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
          {data.sections.map((sec, si) => (
            <div key={si}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 10 }}>{sec.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sec.rows.length === 0
                  ? <div style={{ fontSize: 12, color: C.muted }}>No data yet.</div>
                  : sec.rows.map((row, ri) => (
                    <div key={ri} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {row.dot && <div style={{ width: 8, height: 8, borderRadius: "50%", background: row.dot, flexShrink: 0 }} />}
                      <span style={{ flex: 1, fontSize: 13, color: C.navy }}>{row.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: row.color ?? data.color ?? C.navy }}>{row.value}</span>
                      {row.bar != null && (
                        <div style={{ width: 80, height: 5, background: "#F0F1F7", borderRadius: 99, flexShrink: 0 }}>
                          <div style={{ height: "100%", width: `${row.bar}%`, background: row.color ?? data.color ?? C.orange, borderRadius: 99 }} />
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

// Reduces each dashboard's integration to:
//   const { open, overlay } = useStatDetail();
//   <StatCard detail={[...]} onOpen={() => open({...})} />
//   {overlay}
export function useStatDetail() {
  const [statDetail, setStatDetail] = useState<StatDetail | null>(null);
  return {
    open: (data: StatDetail) => setStatDetail(data),
    overlay: <StatDetailOverlay data={statDetail} onClose={() => setStatDetail(null)} />,
  };
}
