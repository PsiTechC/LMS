"use client";

import { useState, useEffect } from "react";
import { api, ApiResponse, OrgResponse } from "@/lib/api";

interface ZoomCredentialsStatusDTO {
  connected: boolean;
  account_id_masked?: string;
  connected_at?: string;
}

const NAVY = "#182848";
const ORANGE = "#C8A860";
const BORDER = "#E6DED0";
const MUTED = "#4A5573";

const field: React.CSSProperties = {
  width: "100%", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px",
  fontSize: 13, color: NAVY, fontFamily: "Poppins,sans-serif", boxSizing: "border-box", outline: "none",
};
const lbl: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6, display: "block",
};

/**
 * Superadmin-only modal to enter/update/remove one org's Zoom S2S
 * credentials (account_id, client_id, client_secret). client_secret is
 * write-only here — the backend never returns it once saved, so this form
 * always starts blank even when credentials already exist (status below
 * shows the masked account id instead).
 */
export default function ZoomCredentialsModal({ org, onClose }: { org: OrgResponse; onClose: () => void }) {
  const [status, setStatus] = useState<ZoomCredentialsStatusDTO | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [accountID, setAccountID] = useState("");
  const [clientID, setClientID] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [hostUser, setHostUser] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  function loadStatus() {
    setLoadingStatus(true);
    api.get<ApiResponse<ZoomCredentialsStatusDTO>>(`/organizations/${org.id}/zoom-credentials/status`)
      .then(r => setStatus(r.data))
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoadingStatus(false));
  }
  useEffect(() => { loadStatus(); }, [org.id]);

  async function save() {
    setErr(""); setOk("");
    if (!accountID.trim() || !clientID.trim() || !clientSecret.trim() || !hostUser.trim()) {
      setErr("Account ID, Client ID, Client Secret, and Host User (ID or email) are all required.");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/organizations/${org.id}/zoom-credentials`, {
        account_id: accountID.trim(), client_id: clientID.trim(), client_secret: clientSecret.trim(),
        host_user_id_or_email: hostUser.trim(),
      });
      setOk("Zoom credentials saved.");
      setAccountID(""); setClientID(""); setClientSecret(""); setHostUser("");
      loadStatus();
    } catch (e) {
      setErr((e as Error).message || "Failed to save Zoom credentials");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setErr(""); setOk("");
    setRemoving(true);
    try {
      await api.delete(`/organizations/${org.id}/zoom-credentials`);
      setOk("Zoom credentials removed.");
      loadStatus();
    } catch (e) {
      setErr((e as Error).message || "Failed to remove Zoom credentials");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)", overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>Zoom Credentials — {org.name}</div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Server-to-Server OAuth app for this organization</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: "50%", border: `1px solid ${BORDER}`, background: "#F7F5F0", cursor: "pointer", fontSize: 14, color: MUTED }}>✕</button>
        </div>

        <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {loadingStatus ? (
            <div style={{ fontSize: 12, color: MUTED }}>Checking connection status…</div>
          ) : status?.connected ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>
                ✓ Connected — account {status.account_id_masked}
              </div>
              <button onClick={remove} disabled={removing}
                style={{ background: "#fff", border: `1px solid ${BORDER}`, color: NAVY, borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: removing ? "not-allowed" : "pointer", fontFamily: "Poppins,sans-serif" }}>
                {removing ? "Removing…" : "Remove"}
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: MUTED, padding: "10px 14px", background: "#F7F5F0", borderRadius: 8 }}>
              Not connected — no Zoom account is set up for this org yet.
            </div>
          )}

          {err && <div style={{ fontSize: 12, color: "#ef4444" }}>{err}</div>}
          {ok && <div style={{ fontSize: 12, color: "#22c55e" }}>{ok}</div>}

          <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
            {status?.connected ? "Enter new values below to replace the existing credentials." : "Enter this org's Zoom Server-to-Server OAuth app credentials."}
          </div>

          <div><label style={lbl}>Account ID</label><input value={accountID} onChange={e => setAccountID(e.target.value)} style={field} placeholder="e.g. m_OLllmdRuC0L3GXF..." /></div>
          <div><label style={lbl}>Client ID</label><input value={clientID} onChange={e => setClientID(e.target.value)} style={field} placeholder="Zoom app Client ID" /></div>
          <div><label style={lbl}>Client Secret</label><input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} style={field} placeholder="Zoom app Client Secret" /></div>
          <div>
            <label style={lbl}>Host User (ID or email)</label>
            <input value={hostUser} onChange={e => setHostUser(e.target.value)} style={field} placeholder="e.g. the Zoom account owner's login email" />
            <div style={{ fontSize: 10, color: MUTED, marginTop: 4, lineHeight: 1.4 }}>
              Every session for this org is created under this Zoom user — a Server-to-Server app has no "me" identity, so a specific host must be set.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 24px", borderTop: `1px solid ${BORDER}` }}>
          <button onClick={onClose} style={{ background: "#fff", border: `1px solid ${BORDER}`, color: NAVY, borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins,sans-serif" }}>Close</button>
          <button onClick={save} disabled={saving}
            style={{ background: ORANGE, border: "none", color: "#fff", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "Poppins,sans-serif", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : "Save Credentials"}
          </button>
        </div>
      </div>
    </div>
  );
}
