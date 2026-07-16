"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { attendanceApi, RosterEntryDTO, AttendanceSummaryDTO } from "@/lib/attendance-api";

const ff: React.CSSProperties = { fontFamily: "Poppins, sans-serif" };
const POLL_INTERVAL_MS = 3_000;

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
  sessionId: string; // class_session_id
  sessionTitle: string;
  isOpen?: boolean;
  onClose: () => void;
  // Called instead of onClose once the record is successfully finalized, so
  // the parent can show its own toast after the modal unmounts.
  onFinalized: () => void;
}

export default function AttendanceModal({ sessionId, onClose, onFinalized }: Props) {
  const [attendanceSessionId, setAttendanceSessionId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [roster, setRoster] = useState<RosterEntryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);
  const [summary, setSummary] = useState<AttendanceSummaryDTO | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Open (or reuse) the check-in window once on mount.
  useEffect(() => {
    let alive = true;
    async function openWindow() {
      try {
        const res = await attendanceApi.active(sessionId);
        if (!alive || !res.data) return;
        setAttendanceSessionId(res.data.attendance_session_id);
        setCode(res.data.code);
        setJoinUrl(res.data.join_url);
      } catch {
        // No active window yet — start one. in_person avoids requiring the
        // faculty to have a connected Zoom account for a plain QR check-in.
        try {
          const res = await attendanceApi.start(sessionId, "in_person");
          if (!alive || !res.data) return;
          setAttendanceSessionId(res.data.attendance_session_id);
          setCode(res.data.code);
          setJoinUrl(res.data.join_url);
        } catch (err: unknown) {
          if (!alive) return;
          setError((err as Error).message || "Failed to start attendance session");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    openWindow();
    return () => { alive = false; };
  }, [sessionId]);

  const fetchRecords = useCallback(async (id: string) => {
    try {
      const res = await attendanceApi.records(id);
      setRoster(res.data ?? []);
      setError("");
    } catch (err: unknown) {
      const e = err as { status?: number };
      if (e?.status === 401 || e?.status === 403) setError("Not authorised to view attendance");
      else if (e?.status === 404) setError("Attendance session not found");
      else setError("Failed to load attendance");
    }
  }, []);

  // Poll every 3s once the check-in window is known; stop on unmount/close.
  useEffect(() => {
    if (!attendanceSessionId) return;
    const id = attendanceSessionId;
    let alive = true;
    async function poll() {
      if (!alive) return;
      await fetchRecords(id);
    }
    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => { alive = false; if (pollRef.current) clearInterval(pollRef.current); };
  }, [attendanceSessionId, fetchRecords]);

  const presentCount = roster.filter(r => r.checked_in).length;
  const totalCount = roster.length;
  const pct = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  async function finalizeAttendance() {
    if (!attendanceSessionId) return;
    setEnding(true);
    try {
      await attendanceApi.end(attendanceSessionId);
    } catch (err: unknown) {
      const e = err as { status?: number };
      const msg = e?.status === 403 ? "Forbidden" : e?.status === 404 ? "Session not found" : "Failed to finalize attendance";
      setToast({ msg, color: "#ef4444" });
      setEnding(false);
      return;
    }
    // The session is genuinely ended at this point regardless of what
    // follows — stop polling and fetch the final summary, but don't block
    // finishing if the summary call itself fails.
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      const res = await attendanceApi.summary(attendanceSessionId);
      setSummary(res.data ?? null);
    } catch {
      onFinalized();
    } finally {
      setEnding(false);
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(joinUrl)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => setToast({ msg: "Failed to copy", color: "#ef4444" }));
  }

  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
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

        {summary ? (
          <div style={{ padding: "40px 32px", textAlign: "center" as const }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%", background: "rgba(34,197,94,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26, color: "#22c55e", margin: "0 auto 18px",
            }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1C2551", marginBottom: 6 }}>Attendance finalized</div>
            <div style={{ fontSize: 13, color: "#8b90a7", marginBottom: 24 }}>
              {summary.present_count} present · {summary.absent_count} absent · {summary.total_enrolled} enrolled
            </div>
            <button
              onClick={onFinalized}
              style={{ ...ff, width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "#EF4E24", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              Done
            </button>
          </div>
        ) : (
        <div style={{ display: "flex", minHeight: 400 }}>

          {/* Left — QR panel.
              minWidth: 0 is load-bearing: a flex item's min-width defaults to
              "auto", which lets its content (the long joinUrl string below,
              rendered white-space: nowrap) force this column past its
              260px flex-basis — pushing the roster column entirely outside
              the modal's visible bounds instead of just truncating the URL
              text as intended. */}
          <div style={{
            flex: "0 0 260px", minWidth: 0, padding: "24px 20px",
            borderRight: "1px solid #EAECF4",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
          }}>
            {loading ? (
              <div style={{ padding: 32, textAlign: "center" as const, color: "#8b90a7", fontSize: 13 }}>
                Starting check-in…
              </div>
            ) : !joinUrl ? (
              <div style={{ padding: 32, textAlign: "center" as const, fontSize: 13, color: "#ef4444" }}>
                {error || "Failed to start attendance session"}
              </div>
            ) : (
              <>
                <div style={{
                  background: "#fff", border: "2px solid #EAECF4", borderRadius: 14,
                  padding: 18, display: "inline-block",
                }}>
                  <QRCodeSVG value={joinUrl} size={176} level="M" />
                </div>

                <div style={{ textAlign: "center" as const }}>
                  <div style={{ fontSize: 11, color: "#8b90a7", marginBottom: 4 }}>Session Code:</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#EF4E24", letterSpacing: 3 }}>
                    {code}
                  </div>
                </div>

                {/* Copy URL row */}
                <div style={{ width: "100%", display: "flex" }}>
                  <div style={{
                    flex: 1, minWidth: 0, border: "1px solid #EAECF4", borderRight: "none",
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
                  Auto-refreshes every 3 seconds
                </div>
              </>
            )}
          </div>

          {/* Right — Attendance list */}
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Header row: label + count */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1C2551" }}>Attendance</div>
                {totalCount > 0 && (
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
              ) : roster.length === 0 ? (
                <div style={{ padding: "32px 0", textAlign: "center" as const, fontSize: 13, color: "#8b90a7" }}>
                  No participants yet.<br />Share the QR code to get started.
                </div>
              ) : (
                roster.map((r, i) => (
                  <div key={r.participant_id} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 0",
                    borderBottom: i < roster.length - 1 ? "1px solid #F0F1F7" : "none",
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: r.checked_in ? "#22c55e" : "#D0D3E0",
                      display: "inline-block", flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#1C2551" }}>
                      {r.name}
                    </div>
                    {r.checked_in ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e" }}>✓ Present</span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#8b90a7" }}>Waiting</span>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Save button */}
            <button
              onClick={finalizeAttendance}
              disabled={ending || !attendanceSessionId}
              style={{
                ...ff, width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                background: ending || !attendanceSessionId ? "#D1D5DB" : "#EF4E24",
                color: "#fff", fontSize: 13, fontWeight: 700,
                cursor: ending || !attendanceSessionId ? "not-allowed" : "pointer",
                transition: "background 0.2s",
              }}
            >
              {ending ? "Saving…" : "Save Attendance Record"}
            </button>
          </div>
        </div>
        )}
      </div>

      {toast && <Toast msg={toast.msg} color={toast.color} onClose={() => setToast(null)} />}
    </>,
    document.body
  );
}
