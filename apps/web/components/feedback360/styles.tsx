// Shared design tokens + primitives for the admin-initiated 360° flow.
// Mirrors apps/CLAUDE.md exactly (navy #1C2551 / coral #EF4E24).
import React from "react";

export const C = {
  navy: "#1C2551",
  orange: "#EF4E24",
  indigo: "#6B73BF",
  page: "#F5F7FB",
  card: "#FFFFFF",
  alt: "#F0F1F7",
  border: "#EAECF4",
  muted: "#8b90a7",
  green: "#22c55e",
  amber: "#f59e0b",
  danger: "#ef4444",
  inactive: "#D0D3E0",
};

export const ff = { fontFamily: "Poppins, sans-serif" } as const;

export const cardBox: React.CSSProperties = {
  background: C.card,
  borderRadius: 12,
  border: `1px solid ${C.border}`,
  boxShadow: "0 1px 4px rgba(28,37,81,0.07)",
  padding: 20,
};

export const microLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: C.muted,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  marginBottom: 6,
};

export const inputStyle: React.CSSProperties = {
  ...ff,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
  color: C.navy,
  width: "100%",
  background: "#fff",
  outline: "none",
};

export const btnPrimary: React.CSSProperties = {
  ...ff,
  background: C.orange,
  border: "none",
  color: "#fff",
  borderRadius: 8,
  padding: "9px 20px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

export const btnSecondary: React.CSSProperties = {
  ...ff,
  background: "#fff",
  border: `1px solid ${C.border}`,
  color: C.navy,
  borderRadius: 8,
  padding: "8px 16px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

export const btnDisabled: React.CSSProperties = {
  opacity: 0.5,
  cursor: "not-allowed",
};

export function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return C.green;
    case "active":
    case "invited":
      return C.orange;
    case "in_progress":
      return C.amber;
    case "locked":
      return C.indigo;
    default:
      return C.muted; // draft / configuring / assigned
  }
}

export function pill(color: string): React.CSSProperties {
  return {
    display: "inline-block",
    background: `${color}18`,
    color,
    fontSize: 10,
    fontWeight: 700,
    borderRadius: 20,
    padding: "3px 9px",
    whiteSpace: "nowrap",
    textTransform: "capitalize",
  };
}

// Toggle — a small on/off pill switch styled to the theme.
export function Toggle({
  on, onChange, onColor,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  onColor?: string;
}) {
  const active = onColor ?? C.orange;
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      style={{
        ...ff, width: 34, height: 19, borderRadius: 99, border: "none", cursor: "pointer",
        background: on ? active : C.inactive ?? "#D0D3E0", position: "relative", flexShrink: 0,
        transition: "background .15s", padding: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: on ? 17 : 2, width: 15, height: 15, borderRadius: 99,
        background: "#fff", boxShadow: "0 1px 2px rgba(28,37,81,0.3)", transition: "left .15s",
      }} />
    </button>
  );
}

// CircularCounter — the "circular variant" stepper: two filled round buttons
// flanking the value. Buttons never hide; the − greys out once `min` is reached
// (and + once `max` is), matching the reference control.
export function CircularCounter({
  value, onChange, min = 0, max = 99, ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  ariaLabel?: string;
}) {
  const atMin = value <= min;
  const atMax = value >= max;

  // Sized to sit level with the value rather than tower over it.
  const round = (disabled: boolean): React.CSSProperties => ({
    ...ff,
    width: 22, height: 22, borderRadius: 99, border: "none", flexShrink: 0,
    background: disabled ? C.inactive : C.orange,
    color: "#fff", fontSize: 13, fontWeight: 700, lineHeight: 1,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "background .15s",
    padding: 0,
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        aria-label={ariaLabel ? `Decrease ${ariaLabel}` : "Decrease"}
        disabled={atMin}
        onClick={() => onChange(Math.max(min, value - 1))}
        style={round(atMin)}
      >−</button>

      <span style={{
        minWidth: 20, textAlign: "center", fontSize: 15, fontWeight: 800, color: C.navy,
        fontVariantNumeric: "tabular-nums",
      }}>{value}</span>

      <button
        type="button"
        aria-label={ariaLabel ? `Increase ${ariaLabel}` : "Increase"}
        disabled={atMax}
        onClick={() => onChange(Math.min(max, value + 1))}
        style={round(atMax)}
      >+</button>
    </div>
  );
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}
