"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { sessionsApi, AttendanceDTO } from "@/lib/faculty-api";

const ff: React.CSSProperties = { fontFamily: "Poppins, sans-serif" };

function Toast({ msg, color, onClose }: { msg: string; color: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28, background: color, color: "#fff",
      borderRadius: 10, padding: "12px 20px", fontSize: 13, fontWeight: 600,
      boxShadow: "0 8px 32px rgba(28,37,81,0.22)", zIndex: 10000, ...ff,
    }}>
      {msg}
    </div>
  );
}

interface Props {
  sessionId: string;
  sessionTitle: string;
  isOpen?: boolean;
  onClose: () => void;
}

export default function AttendanceModal({ sessionId, onClose }: Props) {
  const [attendance, setAttendance] = useState<AttendanceDTO[]>([]);
  const [loading,    setLoading]   = useState(true);
  const [saving,     setSaving]    = useState(false);
  const [error,      setError]     = useState("");
  const [copied,     setCopied]    = useState(false);
  const [toast,      setToast]     = useState<{ msg: string; color: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sessionCode = sessionId.slice(0, 6).toUpperCase();
  const joinUrl     = `https://xa-lms.fourward.in/join/${sessionCode}`;

  const fetchAttendance = useCallback(async () => {
    try {
      const res = await sessionsApi.getAttendance(sessionId);
      setAttendance(res.data ?? []);
      setError("");
    } catch (err: unknown) {
      const e = err as { status?: number };
      if (e?.status === 401 || e?.status === 403) setError("Not authorised to view attendance");
      else if (e?.status === 404) setError("Session not found");
      else setError("Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Initial load + auto-refresh every 10s
  useEffect(() => {
    fetchAttendance();
    pollRef.current = setInterval(fetchAttendance, 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchAttendance]);

  const presentCount = attendance.filter(a => a.status === "present").length;
  const totalCount   = attendance.length;
  const pct          = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  async function saveAttendance() {
    setSaving(true);
    const entries = attendance.map(a => ({ user_id: a.user_id, status: a.status }));
    try {
      await sessionsApi.markAttendance(sessionId, entries);
      setToast({ msg: "Attendance saved", color: "#22c55e" });
    } catch (err: unknown) {
      const e = err as { status?: number };
      const msg = e?.status === 403 ? "Forbidden" : e?.status === 404 ? "Session not found" : "Failed to save";
      setToast({ msg, color: "#ef4444" });
    } finally {
      setSaving(false);
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(joinUrl)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => setToast({ msg: "Failed to copy", color: "#ef4444" }));
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2000 }} />

      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        background: "#fff", borderRadius: 20, width: "100%", maxWidth: 700,
        maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(28,37,81,0.22)",
        zIndex: 2001, ...ff,
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "20px 24px", borderBottom: "1px solid #EAECF4",
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: "#e8f5e9",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, flexShrink: 0, color: "#22c55e",
          }}>◉</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1C2551" }}>Attendance</div>
            <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2 }}>QR-based real-time check-in</div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: "50%", border: "1px solid #EAECF4",
            background: "#F5F7FB", cursor: "pointer", fontSize: 16, color: "#8b90a7",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        {/* Two-column body */}
        <div style={{ display: "flex", minHeight: 400 }}>

          {/* Left — QR panel */}
          <div style={{
            flex: "0 0 260px", padding: "24px 20px",
            borderRight: "1px solid #EAECF4",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
          }}>
            <div style={{
              background: "#fff", border: "2px solid #EAECF4", borderRadius: 14,
              padding: 18, display: "inline-block",
            }}>
              <QRCodeSVG value={joinUrl} size={176} level="M" />
            </div>

            <div style={{ textAlign: "center" as const }}>
              <div style={{ fontSize: 11, color: "#8b90a7", marginBottom: 4 }}>Session Code:</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#EF4E24", letterSpacing: 3 }}>
                {sessionCode}
              </div>
            </div>

            {/* Copy URL row */}
            <div style={{ width: "100%", display: "flex" }}>
              <div style={{
                flex: 1, border: "1px solid #EAECF4", borderRight: "none",
                borderRadius: "8px 0 0 8px", padding: "7px 10px",
                fontSize: 10, color: "#8b90a7",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
              }}>
                {joinUrl}
              </div>
              <button
                onClick={copyUrl}
                style={{
                  ...ff, padding: "7px 14px", fontSize: 11, fontWeight: 700,
                  background: copied ? "#22c55e" : "#EF4E24", color: "#fff",
                  border: "none", borderRadius: "0 8px 8px 0", cursor: "pointer",
                  transition: "background 0.2s", flexShrink: 0,
                }}
              >
                {copied ? "✓" : "Copy"}
              </button>
            </div>

            <div style={{ fontSize: 11, color: "#8b90a7", textAlign: "center" as const }}>
              Auto-refreshes every 10 seconds
            </div>
          </div>

          {/* Right — Attendance list */}
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Header row: label + count */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1C2551" }}>Attendance</div>
                {!loading && totalCount > 0 && (
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#EF4E24" }}>
                    {presentCount}/{totalCount}{" "}
                    <span style={{ fontSize: 12 }}>({pct}%)</span>
                  </div>
                )}
              </div>
              {/* Progress bar */}
              <div style={{ height: 8, background: "#F0F1F7", borderRadius: 99, overflow: "hidden" }}>
                <div style={{
                  width: `${pct}%`, height: "100%", background: "#22c55e",
                  borderRadius: 99, transition: "width 0.6s ease",
                }} />
              </div>
            </div>

            {/* Participant list */}
            <div style={{ flex: 1, overflowY: "auto" as const, maxHeight: 260 }}>
              {loading ? (
                <div style={{ padding: 32, textAlign: "center" as const, color: "#8b90a7", fontSize: 13 }}>
                  Loading…
                </div>
              ) : error ? (
                <div style={{ padding: 32, textAlign: "center" as const, fontSize: 13, color: "#ef4444" }}>
                  {error}
                </div>
              ) : attendance.length === 0 ? (
                <div style={{ padding: "32px 0", textAlign: "center" as const, fontSize: 13, color: "#8b90a7" }}>
                  No participants yet.<br />Share the QR code to get started.
                </div>
              ) : (
                attendance.map((a, i) => (
                  <div key={a.user_id} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 0",
                    borderBottom: i < attendance.length - 1 ? "1px solid #F0F1F7" : "none",
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: a.status === "present" ? "#22c55e" : "#D0D3E0",
                      display: "inline-block", flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#1C2551" }}>
                      {a.user_id.slice(0, 16)}…
                    </div>
                    {a.status === "present" ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e" }}>✓ Present</span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#8b90a7" }}>Absent</span>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Save button */}
            <button
              onClick={saveAttendance}
              disabled={saving || attendance.length === 0}
              style={{
                ...ff, width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                background: saving || attendance.length === 0 ? "#D1D5DB" : "#EF4E24",
                color: "#fff", fontSize: 13, fontWeight: 700,
                cursor: saving || attendance.length === 0 ? "not-allowed" : "pointer",
                transition: "background 0.2s",
              }}
            >
              {saving ? "Saving…" : "Save Attendance Record"}
            </button>
          </div>
        </div>
      </div>

      {toast && <Toast msg={toast.msg} color={toast.color} onClose={() => setToast(null)} />}
    </>
  );
}
