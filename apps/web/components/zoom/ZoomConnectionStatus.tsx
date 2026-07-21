// Deprecated as of 2026-07-10 - see org-level Zoom credentials (Phase 2).
// Not deleted in case of rollback. No longer rendered anywhere (see
// SettingsPage.tsx's Integrations tab and NewSessionPage's meeting_type
// selector in apps/web/app/dashboard/faculty/page.tsx).
"use client";

import { useState, useEffect, useCallback } from "react";
import { zoomOAuthApi, ZoomOAuthStatusDTO } from "@/lib/zoom-api";

// ── Design tokens (matches apps/CLAUDE.md) ─────────────────────────
const NAVY = "var(--xa-text)";
const ORANGE = "var(--xa-primary)";
const BORDER = "#E6DED0";
const MUTED = "#4A5573";

// Local Toast - copied per this repo's existing convention (no shared toast
// component exists yet; every screen defines its own, see SessionsPage.tsx).
function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2800);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28, background: NAVY, color: "#fff",
      padding: "12px 18px", borderRadius: 10, fontSize: 12, fontWeight: 600,
      boxShadow: "0 8px 32px rgba(24, 40, 72,0.24)", zIndex: 4000, fontFamily: "Poppins,sans-serif",
    }}>
      {msg}
    </div>
  );
}

/**
 * Single reusable Zoom "Connect Account" status indicator + action button.
 * Used on both the faculty Settings page and the session-creation screen's
 * Zoom-embedded section, so the connect/disconnect/status logic lives here
 * once instead of being duplicated across the two call sites.
 */
export default function ZoomConnectionStatus({ returnTo, onStatusChange }: {
  returnTo?: string;
  onStatusChange?: (status: ZoomOAuthStatusDTO) => void;
}) {
  const [status, setStatus] = useState<ZoomOAuthStatusDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const closeToast = useCallback(() => setToast(""), []);

  const load = useCallback(() => {
    setLoading(true);
    zoomOAuthApi.status()
      .then(r => { setStatus(r.data); onStatusChange?.(r.data); })
      .catch(() => setStatus({ connected: false, status: "not_connected" }))
      .finally(() => setLoading(false));
  }, [onStatusChange]);

  useEffect(() => { load(); }, [load]);

  async function connect() {
    setBusy(true);
    try {
      const r = await zoomOAuthApi.getAuthorizeUrl(returnTo);
      if (r.data?.url) window.location.href = r.data.url;
    } catch {
      setToast("Could not start Zoom connection. Try again.");
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await zoomOAuthApi.disconnect();
      setToast("Zoom account disconnected");
      load();
    } catch {
      setToast("Could not disconnect Zoom. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div style={{ fontSize: 12, color: MUTED }}>Checking Zoom connection…</div>;
  }

  const isActive = status?.status === "active";
  const isExpired = status?.status === "expired";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {isActive && (
        <>
          <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>
            ✓ Connected as {status?.zoom_email ?? "your Zoom account"}
          </span>
          <button onClick={disconnect} disabled={busy}
            style={{ background: "#fff", border: `1px solid ${BORDER}`, color: NAVY, borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", fontFamily: "Poppins,sans-serif" }}>
            {busy ? "…" : "Disconnect"}
          </button>
        </>
      )}
      {isExpired && (
        <>
          <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>⚠ Zoom connection expired</span>
          <button onClick={connect} disabled={busy}
            style={{ background: ORANGE, border: "none", color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: "Poppins,sans-serif" }}>
            {busy ? "…" : "Reconnect Zoom"}
          </button>
        </>
      )}
      {!isActive && !isExpired && (
        <>
          <span style={{ fontSize: 12, color: MUTED }}>Connect Zoom to create embedded meetings</span>
          <button onClick={connect} disabled={busy}
            style={{ background: ORANGE, border: "none", color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: "Poppins,sans-serif" }}>
            {busy ? "…" : "Connect Zoom"}
          </button>
        </>
      )}
      {toast && <Toast msg={toast} onClose={closeToast} />}
    </div>
  );
}
