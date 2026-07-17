"use client";

import { useState } from "react";
import ReactDOM from "react-dom";

const C = { navy: "#182848", muted: "#4A5573", border: "#E6DED0", orange: "#C8A860" };
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
  const accent = color ?? C.navy;
  return (
    <div
      onClick={clickable ? handleClick : undefined}
      onMouseEnter={() => clickable && setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "#fff", borderRadius: 12,
        border: `1px solid ${clickable && hover ? `${accent}33` : C.border}`,
        padding: 20,
        boxShadow: hover ? "0 8px 20px rgba(24, 40, 72,0.10)" : "0 1px 4px rgba(24, 40, 72,0.07)",
        cursor: clickable ? "pointer" : "default",
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        transition: "box-shadow 0.2s cubic-bezier(0.2,0,0,1), transform 0.2s cubic-bezier(0.2,0,0,1), border-color 0.2s ease",
        ...ff,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>{label}</div>
        {icon && (
          <span style={{
            width: 30, height: 30, borderRadius: 8, background: `${accent}14`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, color: accent, flexShrink: 0,
          }}>{icon}</span>
        )}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: subColor ?? C.muted, marginTop: 4 }}>{sub}</div>}
      {clickable && (
        <div style={{
          fontSize: 9, color: hover ? accent : C.muted, fontWeight: 700, marginTop: 8, letterSpacing: 0.3,
          display: "flex", alignItems: "center", gap: 3, transition: "color 0.15s ease",
        }}>
          TAP FOR DETAILS
          <span style={{ transform: hover ? "translateX(2px)" : "translateX(0)", transition: "transform 0.15s ease" }}>→</span>
        </div>
      )}
    </div>
  );
}

export function StatDetailOverlay({ data, onClose }: { data: StatDetail | null; onClose: () => void }) {
  if (!data) return null;
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="xa-modal-overlay"
      style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, ...ff }}>
      <div className="xa-modal-content" style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "82vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)" }}>
        <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>{data.label}</div>
            <div style={{ fontSize: 34, fontWeight: 800, color: data.color ?? C.navy, lineHeight: 1 }}>{data.value}</div>
            {data.sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{data.sub}</div>}
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
          {data.sections.map((sec, si) => (
            <div key={si}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 10 }}>{sec.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sec.rows.length === 0
                  ? <div style={{ fontSize: 12, color: C.muted }}>No data yet.</div>
                  : sec.rows.map((row, ri) => (
                    <div key={ri} style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 0" }}>
                      {row.dot && <div style={{ width: 8, height: 8, borderRadius: "50%", background: row.dot, flexShrink: 0 }} />}
                      <span style={{ flex: 1, fontSize: 13, color: C.navy }}>{row.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: row.color ?? data.color ?? C.navy }}>{row.value}</span>
                      {row.bar != null && (
                        <div style={{ width: 80, height: 5, background: "#EFE9DC", borderRadius: 99, flexShrink: 0, overflow: "hidden" }}>
                          <div className="xa-progress-fill" style={{ height: "100%", width: `${row.bar}%`, background: row.color ?? data.color ?? C.orange, borderRadius: 99 }} />
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

// Round icon-button close control shared by the overlay — subtle tint + lift
// on hover so dismissing the modal reads as an intentional, responsive action
// rather than a static glyph.
function CloseButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="Close"
      style={{
        width: 28, height: 28, border: `1px solid ${hover ? C.navy : C.border}`, borderRadius: "50%",
        background: hover ? "#F7F5F0" : "#fff", cursor: "pointer", fontSize: 13,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: hover ? C.navy : C.muted, flexShrink: 0,
        transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.15s ease",
        transform: hover ? "scale(1.06)" : "scale(1)",
      }}
    >✕</button>
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
