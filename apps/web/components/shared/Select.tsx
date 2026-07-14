"use client";

const BORDER = "#EAECF4";
const NAVY = "#1C2551";
const ff = { fontFamily: "Poppins,sans-serif" } as const;

// A plain native <select>, styled to match the reference's dominant dropdown
// convention (relies on the browser's own arrow — no custom icon). This is
// the correct default for most selects in this app; only a handful of
// "premium" pickers need the custom-arrow treatment (see the reference's
// secondary pattern), which those call sites should implement locally rather
// than through this component.
export interface SelectOption { value: string; label: string }

export function Select({ value, onChange, options, children, style, disabled, placeholder }: {
  value: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  children?: React.ReactNode;
  style?: React.CSSProperties;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{
        // appearance: none is required — without it, some browsers/OS themes
        // render the native <select> chrome (rounded pill shape, tinted
        // background) on top of these inline styles instead of respecting
        // them, regardless of border/background/borderRadius set here.
        appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
        border: `1.5px solid ${BORDER}`, borderRadius: 8, padding: "9px 30px 9px 12px",
        fontSize: 13, color: NAVY, background: "#fff", cursor: disabled ? "not-allowed" : "pointer",
        outline: "none", backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238b90a7' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
        ...ff, ...style,
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options ? options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>) : children}
    </select>
  );
}
