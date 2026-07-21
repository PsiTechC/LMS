"use client";

import { useState } from "react";
import ReactDOM from "react-dom";

const NAVY   = "#182848";
const BORDER = "#E6DED0";
const MUTED  = "#4A5573";
const DANGER = "#ef4444";
const ORANGE = "#C8A860";
const ff = { fontFamily: "Poppins, sans-serif" } as const;

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" (red, for destructive/irreversible actions) or "default" (brand gold). */
  variant?: "danger" | "default";
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

// Shared danger-confirmation modal - replaces browser confirm()/alert() for
// destructive actions (delete org/participant/content/program/thread/role,
// etc.) across the app, matching apps/CLAUDE.md's Modal pattern instead of
// the OS-styled, unstyleable, easily-missed browser dialog.
export default function ConfirmModal({
  title, message, confirmLabel = "Delete", cancelLabel = "Cancel",
  variant = "danger", onConfirm, onCancel,
}: ConfirmModalProps) {
  const [busy, setBusy] = useState(false);
  const accent = variant === "danger" ? DANGER : ORANGE;

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, ...ff }}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-title"
        style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, overflow: "hidden", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)" }}>
        <div style={{ padding: "22px 24px 18px" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${accent}14`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 18, color: accent }}>{variant === "danger" ? "⚠" : "?"}</span>
          </div>
          <div id="confirm-modal-title" style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 8 }}>{title}</div>
          <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>{message}</div>
        </div>
        <div style={{ padding: "0 24px 22px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} disabled={busy}
            style={{ padding: "9px 18px", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, color: NAVY, fontFamily: "Poppins,sans-serif" }}>
            {cancelLabel}
          </button>
          <button type="button" onClick={handleConfirm} disabled={busy}
            style={{ padding: "9px 18px", background: accent, border: "none", borderRadius: 8, cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
