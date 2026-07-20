"use client";

// Styling deliberately mirrors components/sessions/AttendanceModal.tsx (portal
// pattern, header strip, primary button, error text) for visual consistency
// across the app's modals - see that file for the reference conventions.
import { useState } from "react";
import ReactDOM from "react-dom";
import { programsApi, ProgramDetailDTO } from "@/lib/programs-api";

const ff: React.CSSProperties = { fontFamily: "Poppins, sans-serif" };

// Not user-editable in this modal by design (per product spec) - a different
// GST rate is a separate, more hidden admin control if ever needed.
const GST_RATE_BPS = 1800; // 18%

const inputStyle: React.CSSProperties = {
  ...ff, width: "100%", border: "1px solid #E6DED0", borderRadius: 8,
  padding: "9px 12px", fontSize: 13, color: "var(--xa-navy)", outline: "none",
  boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  ...ff, fontSize: 10, fontWeight: 700, color: "var(--xa-muted)", letterSpacing: 0.5,
  textTransform: "uppercase", marginBottom: 6,
};

function fmt(amount: number): string {
  return "₹" + amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  program: ProgramDetailDTO;
  onClose: () => void;
  // Called with the merged, updated program after a successful save - the
  // caller is responsible for pushing it into its own state (same pattern as
  // PMDesignStudio's other onProgramUpdated calls).
  onSaved: (updated: ProgramDetailDTO) => void;
}

export default function ProgramPricingModal({ program, onClose, onSaved }: Props) {
  const [priceInput, setPriceInput] = useState(
    program.payment_required && program.price_amount > 0 ? String(program.price_amount / 100) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const base = Math.max(0, Number(priceInput) || 0);
  const gstAmount = (base * GST_RATE_BPS) / 10000;
  const total = base + gstAmount;

  async function save() {
    if (base <= 0) {
      setError("Enter a price greater than 0");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const priceAmountMinor = Math.round(base * 100);
      await programsApi.update(program.id, {
        payment_required: true,
        price_amount: priceAmountMinor,
        currency: "INR",
        gst_inclusive: false,
        gst_rate_bps: GST_RATE_BPS,
      });
      onSaved({
        ...program,
        payment_required: true,
        price_amount: priceAmountMinor,
        currency: "INR",
        gst_inclusive: false,
        gst_rate_bps: GST_RATE_BPS,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save pricing");
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 2000 }} />

      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        background: "#fff", borderRadius: 20, width: "100%", maxWidth: 460,
        maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)",
        zIndex: 2001, ...ff,
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "20px 24px", borderBottom: "1px solid #E6DED0",
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: "rgba(200, 168, 96,0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, flexShrink: 0, color: "var(--xa-primary)",
          }}>₹</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--xa-navy)" }}>Program Pricing</div>
            <div style={{ fontSize: 11, color: "var(--xa-muted)", marginTop: 2 }}>Set the enrollment price for this program</div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: "50%", border: "1px solid #E6DED0",
            background: "var(--xa-bg)", cursor: "pointer", fontSize: 16, color: "var(--xa-muted)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={labelStyle}>Price (INR)</div>
            <input
              type="number" min={0} step="0.01" inputMode="decimal"
              value={priceInput}
              onChange={e => setPriceInput(e.target.value)}
              placeholder="0.00"
              style={inputStyle}
            />
          </div>

          {/* GST line - read-only, not user-editable in this modal by design */}
          <div>
            <div style={labelStyle}>GST (18%)</div>
            <div style={{ ...inputStyle, background: "var(--xa-bg)", color: "var(--xa-muted)", cursor: "not-allowed" }}>
              {fmt(gstAmount)}
            </div>
          </div>

          {/* Live breakdown - mirrors AttendanceModal's "stats joined by ·"
              summary-line convention, adapted to a stacked breakdown since
              there are 3 computed values here instead of 3 inline counts. */}
          <div style={{ background: "var(--xa-bg)", borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--xa-muted)" }}>
              <span>Base price</span>
              <span style={{ color: "var(--xa-navy)", fontWeight: 600 }}>{fmt(base)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--xa-muted)" }}>
              <span>GST amount</span>
              <span style={{ color: "var(--xa-navy)", fontWeight: 600 }}>{fmt(gstAmount)}</span>
            </div>
            <div style={{ height: 1, background: "#E6DED0", margin: "2px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span style={{ fontWeight: 700, color: "var(--xa-navy)" }}>Total payable</span>
              <span style={{ fontWeight: 800, color: "var(--xa-primary)" }}>{fmt(total)}</span>
            </div>
          </div>

          {error && <div style={{ fontSize: 12, color: "#ef4444" }}>{error}</div>}

          <button
            onClick={save}
            disabled={saving || base <= 0}
            style={{
              ...ff, width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
              background: saving || base <= 0 ? "#D1D5DB" : "var(--xa-primary)",
              color: "#fff", fontSize: 13, fontWeight: 700,
              cursor: saving || base <= 0 ? "not-allowed" : "pointer",
              transition: "background 0.2s",
            }}
          >
            {saving ? "Saving…" : "Save Pricing"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
