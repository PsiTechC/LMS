"use client";

import { useState, useEffect, useRef } from "react";
import { sessionsApi, PollDTO, PollResultsDTO } from "@/lib/faculty-api";

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

export default function LivePollModal({ sessionId, onClose }: Props) {
  const [step,        setStep]       = useState<"create" | "live">("create");
  const [activePoll,  setActivePoll] = useState<PollDTO | null>(null);
  const [results,     setResults]    = useState<PollResultsDTO | null>(null);
  const [saving,      setSaving]     = useState(false);
  const [toast,       setToast]      = useState<{ msg: string; color: string } | null>(null);

  // Create form state — always 4 fixed options
  const [question,      setQuestion]      = useState("");
  const [options,       setOptions]       = useState(["", "", "", ""]);
  const [responseType,  setResponseType]  = useState<"single" | "multiple">("single");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check for already-active poll on mount
  useEffect(() => {
    sessionsApi.listPolls(sessionId)
      .then(r => {
        const active = (r.data ?? []).find(p => p.is_active);
        if (active) {
          setActivePoll(active);
          setStep("live");
        }
      })
      .catch(() => {});
  }, [sessionId]);

  // Auto-fetch results every 5s when live
  useEffect(() => {
    if (step === "live" && activePoll) {
      const fetch = () => {
        sessionsApi.getPollResults(sessionId, activePoll.id)
          .then(r => { if (r.data) setResults(r.data); })
          .catch(() => {});
      };
      fetch();
      pollRef.current = setInterval(fetch, 5_000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, activePoll, sessionId]);

  async function launchPoll() {
    if (!question.trim()) return;
    const filled = options.filter(o => o.trim());
    if (filled.length < 2) {
      setToast({ msg: "At least 2 options are required", color: "#ef4444" });
      return;
    }
    setSaving(true);
    try {
      const r = await sessionsApi.createPoll(sessionId, { question: question.trim(), options: filled });
      if (!r.data) throw new Error("Empty response");
      await sessionsApi.activatePoll(sessionId, r.data.id);
      setActivePoll({ ...r.data, is_active: true });
      setStep("live");
    } catch (err: unknown) {
      const e = err as { status?: number };
      const msg = e?.status === 403 ? "Not authorised" : "Failed to launch poll";
      setToast({ msg, color: "#ef4444" });
    } finally {
      setSaving(false);
    }
  }

  async function closePoll() {
    if (!activePoll) return;
    setSaving(true);
    try {
      await sessionsApi.deactivatePoll(sessionId, activePoll.id);
      setActivePoll(null);
      setResults(null);
      setQuestion("");
      setOptions(["", "", "", ""]);
      setStep("create");
    } catch (err: unknown) {
      const e = err as { status?: number };
      const msg = e?.status === 403 ? "Not authorised" : "Failed to close poll";
      setToast({ msg, color: "#ef4444" });
    } finally {
      setSaving(false);
    }
  }

  const totalVotes = results?.total ?? 0;
  const canLaunch  = question.trim().length > 0 && !saving;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2000 }} />

      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        background: "#fff", borderRadius: 20, width: "100%", maxWidth: 560,
        maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(28,37,81,0.22)",
        zIndex: 2001, ...ff,
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "20px 24px", borderBottom: "1px solid #EAECF4",
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: "#FFF0ED",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span style={{ fontSize: 20, color: "#EF4E24" }}>▶</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1C2551" }}>Live Poll</div>
            <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2 }}>Launch a real-time poll to your cohort</div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: "50%", border: "1px solid #EAECF4",
            background: "#F5F7FB", cursor: "pointer", fontSize: 16, color: "#8b90a7",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        <div style={{ padding: "24px" }}>

          {/* ── CREATE VIEW ── */}
          {step === "create" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Question input */}
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: "#8b90a7",
                  letterSpacing: 0.8, textTransform: "uppercase" as const, marginBottom: 8,
                }}>
                  Poll Question
                </div>
                <input
                  type="text"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  placeholder="Type your question here..."
                  style={{
                    ...ff, width: "100%", border: "1px solid #EAECF4", borderRadius: 10,
                    padding: "12px 16px", fontSize: 13, color: "#1C2551", outline: "none",
                    boxSizing: "border-box" as const,
                  }}
                />
              </div>

              {/* 4 fixed options */}
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: "#8b90a7",
                  letterSpacing: 0.8, textTransform: "uppercase" as const, marginBottom: 10,
                }}>
                  Answer Options
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {options.map((opt, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: "50%", background: "#F0F1F7",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 700, color: "#8b90a7", flexShrink: 0,
                      }}>
                        {i + 1}
                      </div>
                      <input
                        type="text"
                        value={opt}
                        onChange={e => setOptions(prev => prev.map((o, j) => j === i ? e.target.value : o))}
                        placeholder={`Option ${i + 1}`}
                        style={{
                          ...ff, flex: 1, border: "1px solid #EAECF4", borderRadius: 8,
                          padding: "10px 14px", fontSize: 13, color: "#1C2551", outline: "none",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Response type toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1C2551" }}>Response type:</span>
                {(["single", "multiple"] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setResponseType(type)}
                    style={{
                      ...ff, padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                      cursor: "pointer", transition: "all 0.15s",
                      border: `2px solid ${responseType === type ? "#EF4E24" : "#EAECF4"}`,
                      background: "#fff",
                      color: responseType === type ? "#EF4E24" : "#8b90a7",
                    }}
                  >
                    {type === "single" ? "Single choice" : "Multiple choice"}
                  </button>
                ))}
              </div>

              {/* Launch button */}
              <button
                onClick={launchPoll}
                disabled={!canLaunch}
                style={{
                  ...ff, width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                  background: canLaunch ? "#EF4E24" : "#D1D5DB",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: canLaunch ? "pointer" : "not-allowed",
                  transition: "background 0.2s",
                }}
              >
                {saving ? "Launching…" : "Launch Poll →"}
              </button>
            </div>
          )}

          {/* ── LIVE / RESULTS VIEW ── */}
          {step === "live" && activePoll && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Live badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: "#22c55e",
                  background: "#22c55e20", borderRadius: 20, padding: "3px 12px",
                }}>
                  ● LIVE
                </span>
                <span style={{ fontSize: 11, color: "#8b90a7" }}>
                  {totalVotes} vote{totalVotes !== 1 ? "s" : ""} · refreshes every 5s
                </span>
              </div>

              {/* Question (read-only) */}
              <div style={{
                background: "#F5F7FB", borderRadius: 10, padding: "14px 16px",
                fontSize: 14, fontWeight: 600, color: "#1C2551",
              }}>
                {activePoll.question}
              </div>

              {/* Results with progress bars */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {activePoll.options.map((opt, i) => {
                  const voteData = results?.votes?.find(v => v.option_index === i);
                  const count    = voteData?.count ?? 0;
                  const pct      = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                  const isTop    = results && results.votes && count > 0
                    && count === Math.max(...results.votes.map(v => v.count));
                  return (
                    <div key={i}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: isTop ? 700 : 500, color: isTop ? "#1C2551" : "#8b90a7" }}>
                          {opt}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#1C2551" }}>
                          {count} <span style={{ color: "#8b90a7", fontWeight: 500 }}>({pct}%)</span>
                        </span>
                      </div>
                      <div style={{ height: 10, background: "#F0F1F7", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{
                          width: `${pct}%`, height: "100%",
                          background: isTop ? "#EF4E24" : "#6B73BF",
                          borderRadius: 99, transition: "width 0.5s ease",
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Close poll */}
              <button
                onClick={closePoll}
                disabled={saving}
                style={{
                  ...ff, width: "100%", padding: "12px 0", borderRadius: 10,
                  border: "2px solid #ef4444", background: "#fff",
                  fontSize: 12, fontWeight: 700, color: saving ? "#8b90a7" : "#ef4444",
                  borderColor: saving ? "#D0D3E0" : "#ef4444",
                  cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Closing…" : "Close Poll"}
              </button>
            </div>
          )}
        </div>
      </div>

      {toast && <Toast msg={toast.msg} color={toast.color} onClose={() => setToast(null)} />}
    </>
  );
}
