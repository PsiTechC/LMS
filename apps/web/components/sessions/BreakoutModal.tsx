"use client";

import { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { sessionsApi, AttendanceDTO } from "@/lib/faculty-api";

const ff: React.CSSProperties = { fontFamily: "Poppins, sans-serif" };

const NUM_GROUP_OPTIONS = [2, 3, 4, 5, 6, 8];
const DURATION_OPTIONS  = [5, 10, 15, 20, 30];

const GROUP_COLORS = [
  { bg: "#C8A86015", border: "#C8A86040", text: "#C8A860", label: "#C8A860" },
  { bg: "#4A557315", border: "#4A557340", text: "#4A5573", label: "#4A5573" },
  { bg: "#22c55e15", border: "#22c55e40", text: "#22c55e", label: "#22c55e" },
  { bg: "#f59e0b15", border: "#f59e0b40", text: "#f59e0b", label: "#f59e0b" },
  { bg: "#8b5cf615", border: "#8b5cf640", text: "#8b5cf6", label: "#8b5cf6" },
  { bg: "#06b6d415", border: "#06b6d440", text: "#06b6d4", label: "#06b6d4" },
  { bg: "#C8A86015", border: "#C8A86040", text: "#C8A860", label: "#C8A860" },
  { bg: "#4A557315", border: "#4A557340", text: "#4A5573", label: "#4A5573" },
];

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Split array into N groups, distributing remainder across groups
function splitIntoNGroups<T>(arr: T[], n: number): T[][] {
  const shuffled = shuffle(arr);
  const groups: T[][] = Array.from({ length: Math.min(n, shuffled.length) }, () => []);
  shuffled.forEach((item, i) => groups[i % groups.length].push(item));
  return groups;
}

function Toast({ msg, color, onClose }: { msg: string; color: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28, background: color, color: "#fff",
      borderRadius: 10, padding: "12px 20px", fontSize: 13, fontWeight: 600,
      boxShadow: "0 8px 32px rgba(24, 40, 72,0.22)", zIndex: 10000, ...ff,
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

export default function BreakoutModal({ sessionId, onClose }: Props) {
  const [participants, setParticipants] = useState<AttendanceDTO[]>([]);
  const [groups,       setGroups]       = useState<AttendanceDTO[][]>([]);
  const [numGroups,    setNumGroups]    = useState(4);
  const [duration,     setDuration]    = useState(15);
  const [loading,      setLoading]     = useState(true);
  const [error,        setError]       = useState("");
  const [toast,        setToast]       = useState<{ msg: string; color: string } | null>(null);

  useEffect(() => {
    sessionsApi.getAttendance(sessionId)
      .then(r => {
        const all     = r.data ?? [];
        const present = all.filter(a => a.status === "present");
        // If no one is marked present yet, use all enrolled participants
        setParticipants(present.length > 0 ? present : all);
        setError("");
      })
      .catch((err: unknown) => {
        const e = err as { status?: number };
        setError(e?.status === 403 ? "Not authorised" : e?.status === 404 ? "Session not found" : "Failed to load participants");
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  function startBreakout() {
    if (participants.length === 0) {
      setToast({ msg: "No participants to group", color: "#f59e0b" });
      return;
    }
    setGroups(splitIntoNGroups(participants, numGroups));
  }

  const perGroup = participants.length > 0
    ? Math.ceil(participants.length / numGroups)
    : null;

  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 2000 }} />

      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        background: "#fff", borderRadius: 20, width: "100%", maxWidth: 560,
        maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)",
        zIndex: 2001, ...ff,
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "20px 24px", borderBottom: "1px solid #E6DED0",
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: "#F3F4F6",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, flexShrink: 0,
          }}>⬡</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#182848" }}>Breakout Groups</div>
            <div style={{ fontSize: 11, color: "#4A5573", marginTop: 2 }}>Split participants into randomized groups</div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: "50%", border: "1px solid #E6DED0",
            background: "#F7F5F0", cursor: "pointer", fontSize: 16, color: "#4A5573",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        <div style={{ padding: "24px" }}>

          {/* Error state */}
          {error && (
            <div style={{
              padding: "12px 16px", marginBottom: 16, borderRadius: 8,
              background: "#ef444415", border: "1px solid #ef444430",
              fontSize: 12, color: "#ef4444",
            }}>
              {error}
            </div>
          )}

          {groups.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Number of groups */}
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: "#4A5573",
                  letterSpacing: 0.8, textTransform: "uppercase" as const, marginBottom: 12,
                }}>
                  Number of Groups
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
                  {NUM_GROUP_OPTIONS.map(n => (
                    <button
                      key={n}
                      onClick={() => setNumGroups(n)}
                      style={{
                        ...ff, width: 52, height: 52, borderRadius: 12,
                        fontSize: 16, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                        border: `2px solid ${numGroups === n ? "#C8A860" : "#E6DED0"}`,
                        background: numGroups === n ? "#FFF0ED" : "#fff",
                        color: numGroups === n ? "#C8A860" : "#4A5573",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "#4A5573", marginTop: 10 }}>
                  {loading
                    ? "~? participants per group"
                    : perGroup !== null
                      ? `~${perGroup} participant${perGroup !== 1 ? "s" : ""} per group`
                      : "~? participants per group"}
                </div>
              </div>

              {/* Duration */}
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: "#4A5573",
                  letterSpacing: 0.8, textTransform: "uppercase" as const, marginBottom: 12,
                }}>
                  Duration
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
                  {DURATION_OPTIONS.map(d => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      style={{
                        ...ff, padding: "9px 18px", borderRadius: 10,
                        fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                        border: `2px solid ${duration === d ? "#C8A860" : "#E6DED0"}`,
                        background: duration === d ? "#FFF0ED" : "#fff",
                        color: duration === d ? "#C8A860" : "#4A5573",
                      }}
                    >
                      {d} min
                    </button>
                  ))}
                </div>
              </div>

              {/* Start button */}
              <button
                onClick={startBreakout}
                disabled={loading}
                style={{
                  ...ff, width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                  background: loading ? "#D1D5DB" : "#C8A860",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "background 0.2s",
                }}
              >
                {loading ? "Loading participants…" : "Start Breakout →"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Summary + re-randomize */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, color: "#4A5573" }}>
                  {groups.length} group{groups.length !== 1 ? "s" : ""} · {participants.length} participant{participants.length !== 1 ? "s" : ""} · {duration} min
                </div>
                <button
                  onClick={startBreakout}
                  style={{
                    ...ff, fontSize: 11, fontWeight: 700, padding: "7px 14px", borderRadius: 8,
                    border: "1px solid #E6DED0", background: "#fff", color: "#182848", cursor: "pointer",
                  }}
                >
                  ↻ Re-randomize
                </button>
              </div>

              {/* Groups grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {groups.map((group, gi) => {
                  const c = GROUP_COLORS[gi % GROUP_COLORS.length];
                  return (
                    <div key={gi} style={{
                      background: c.bg, border: `1.5px solid ${c.border}`,
                      borderRadius: 12, padding: "14px 16px",
                    }}>
                      <div style={{
                        fontSize: 11, fontWeight: 800, color: c.label,
                        letterSpacing: 0.6, marginBottom: 10,
                      }}>
                        GROUP {gi + 1}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {group.map(member => (
                          <div key={member.user_id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: "50%",
                              background: `${c.text}25`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 11, fontWeight: 700, color: c.text, flexShrink: 0,
                            }}>
                              {member.user_id.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#182848" }}>Participant</div>
                              <div style={{ fontSize: 10, color: "#4A5573" }}>{member.user_id.slice(0, 12)}…</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && <Toast msg={toast.msg} color={toast.color} onClose={() => setToast(null)} />}
    </>,
    document.body
  );
}
