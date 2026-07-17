"use client";

import ReactDOM from "react-dom";

// ── Design tokens (matches ContentLibrary.tsx / apps/CLAUDE.md) ────
export const NAVY   = "#1C2551";
export const ORANGE = "#EF4E24";
export const INDIGO = "#6B73BF";
export const GREEN  = "#22c55e";
export const BG     = "#F5F7FB";
export const BORDER = "#EAECF4";
export const MUTED  = "#8b90a7";

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function uid(): string {
  return "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export const inputStyle: React.CSSProperties = {
  width: "100%", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "7px 10px",
  fontSize: 12, fontFamily: "Poppins, sans-serif", color: NAVY,
  boxSizing: "border-box", outline: "none",
};

export const btnPrimStyle: React.CSSProperties = {
  padding: "8px 16px", border: "none", borderRadius: 8, background: ORANGE,
  cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff",
  fontFamily: "Poppins, sans-serif", display: "flex", alignItems: "center", gap: 6,
};

export const btnSecStyle: React.CSSProperties = {
  padding: "8px 16px", border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff",
  cursor: "pointer", fontSize: 12, fontWeight: 600, color: NAVY,
  fontFamily: "Poppins, sans-serif", display: "flex", alignItems: "center", gap: 6,
};

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, display: "block", marginBottom: 4 }}>{children}</label>;
}

// UnitInput — a number input with a fixed unit suffix ("min", "%", "×")
// rendered inside the field, native spinner arrows suppressed via the global
// .xa-unit-input class (see app/globals.css) — mirrors the one in
// programs/DesignStudioModals.tsx (kept local here rather than imported
// across modules, per the module-isolation convention).
export function UnitInput({ value, onChange, min, max, unit, placeholder }: {
  value: number; onChange: (v: number) => void; min: number; max?: number; unit: string; placeholder?: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type="number" min={min} max={max} value={value} placeholder={placeholder}
        onChange={e => {
          const raw = +e.target.value || 0;
          const clamped = max != null ? Math.min(max, Math.max(min, raw)) : Math.max(min, raw);
          onChange(clamped);
        }}
        style={{ ...inputStyle, paddingRight: 40 }}
        className="xa-unit-input"
      />
      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, fontWeight: 600, color: MUTED, pointerEvents: "none" }}>{unit}</span>
    </div>
  );
}

export function ModalShell({ title, onClose, maxWidth, children }: {
  title: string;
  onClose: () => void;
  maxWidth?: number;
  children: React.ReactNode;
}) {
  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins, sans-serif" }}
    >
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: maxWidth ?? 480, overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{title}</span>
          <button onClick={onClose} style={{ width: 26, height: 26, border: `1px solid ${BORDER}`, borderRadius: "50%", background: "#fff", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED }}>✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
