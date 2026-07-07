"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";

const ff: React.CSSProperties = { fontFamily: "Poppins, sans-serif" };

const PRESETS = [1, 5, 10, 15, 20, 30, 45, 60];

interface Props {
  sessionId?: string;
  isOpen?: boolean;
  onClose: () => void;
}

export default function TimerPanel({ onClose }: Props) {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(10);
  const [customMins,     setCustomMins]     = useState("");
  const [visibleToAll,   setVisibleToAll]   = useState(true);
  const [running,        setRunning]        = useState(false);
  const [finished,       setFinished]       = useState(false);
  const [remaining,      setRemaining]      = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalRef    = useRef<number>(0);

  // Request notification permission once
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const tick = useCallback(() => {
    setRemaining(prev => {
      if (prev === null || prev <= 0) return 0;
      return prev - 1;
    });
  }, []);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(tick, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, tick]);

  // Detect timer hitting 0
  useEffect(() => {
    if (remaining === 0 && running) {
      setRunning(false);
      setFinished(true);
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        new Notification("Time's up!", { body: "Your session timer has finished.", icon: "/favicon.ico" });
      }
    }
  }, [remaining, running]);

  function startTimer() {
    const mins = selectedPreset ?? parseInt(customMins) ?? 0;
    const secs = mins * 60;
    if (secs <= 0) return;
    totalRef.current = secs;
    setRemaining(secs);
    setFinished(false);
    setRunning(true);
  }

  function handlePause() { setRunning(r => !r); }

  function handleReset() {
    setRunning(false);
    setFinished(false);
    setRemaining(null);
  }

  function fmt(secs: number): string {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  const pct = (remaining !== null && totalRef.current > 0)
    ? Math.round((remaining / totalRef.current) * 100)
    : 100;

  const timerColor = finished           ? "#ef4444"
    : remaining !== null && remaining <= 60 ? "#f59e0b"
    : "#1C2551";

  const isRunningView = remaining !== null;
  const canStart      = (selectedPreset !== null) || (customMins.trim().length > 0 && parseInt(customMins) > 0);

  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2000 }} />

      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480,
        maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(28,37,81,0.22)",
        zIndex: 2001, ...ff,
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "20px 24px", borderBottom: "1px solid #EAECF4",
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: "#F3F4F6",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, flexShrink: 0,
          }}>⏱</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1C2551" }}>Timer</div>
            <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2 }}>Set a visible countdown for your participants</div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: "50%", border: "1px solid #EAECF4",
            background: "#F5F7FB", cursor: "pointer", fontSize: 16, color: "#8b90a7",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        <div style={{ padding: "24px" }}>

          {/* ── SETUP VIEW ── */}
          {!isRunningView && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Preset chips */}
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: "#8b90a7",
                  letterSpacing: 0.8, textTransform: "uppercase" as const, marginBottom: 12,
                }}>
                  Preset Duration
                </div>
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                  {PRESETS.map(p => (
                    <button
                      key={p}
                      onClick={() => { setSelectedPreset(p); setCustomMins(""); }}
                      style={{
                        ...ff, padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                        cursor: "pointer", transition: "all 0.15s",
                        border: `2px solid ${selectedPreset === p ? "#EF4E24" : "#EAECF4"}`,
                        background: selectedPreset === p ? "#FFF0ED" : "#fff",
                        color: selectedPreset === p ? "#EF4E24" : "#8b90a7",
                      }}
                    >
                      {p} min
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom input */}
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: "#8b90a7",
                  letterSpacing: 0.8, textTransform: "uppercase" as const, marginBottom: 8,
                }}>
                  Custom (Minutes)
                </div>
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={customMins}
                  onChange={e => { setCustomMins(e.target.value); setSelectedPreset(null); }}
                  placeholder="e.g. 25"
                  style={{
                    ...ff, width: "100%", border: "1px solid #EAECF4", borderRadius: 8,
                    padding: "10px 14px", fontSize: 13, color: "#1C2551", outline: "none",
                    boxSizing: "border-box" as const,
                  }}
                />
              </div>

              {/* Visible to all toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  onClick={() => setVisibleToAll(v => !v)}
                  style={{
                    width: 44, height: 24, borderRadius: 12, cursor: "pointer",
                    background: visibleToAll ? "#EF4E24" : "#D0D3E0",
                    position: "relative", transition: "background 0.2s", flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: "absolute", top: 3,
                    left: visibleToAll ? 23 : 3,
                    width: 18, height: 18, borderRadius: "50%", background: "#fff",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                    transition: "left 0.2s",
                  }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#1C2551" }}>
                  Visible to all participants
                </span>
              </div>

              {/* Start button */}
              <button
                onClick={startTimer}
                disabled={!canStart}
                style={{
                  ...ff, width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                  background: canStart ? "#EF4E24" : "#D1D5DB",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: canStart ? "pointer" : "not-allowed",
                  transition: "background 0.2s",
                }}
              >
                Start Timer →
              </button>
            </div>
          )}

          {/* ── RUNNING VIEW ── */}
          {isRunningView && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              {/* Circular countdown */}
              <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="160" height="160" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="80" cy="80" r="68" fill="none" stroke="#F0F1F7" strokeWidth="8" />
                  <circle
                    cx="80" cy="80" r="68" fill="none"
                    stroke={timerColor}
                    strokeWidth="8"
                    strokeDasharray={`${2 * Math.PI * 68}`}
                    strokeDashoffset={`${2 * Math.PI * 68 * (1 - pct / 100)}`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.3s ease" }}
                  />
                </svg>
                <div style={{ position: "absolute", textAlign: "center" as const }}>
                  <div style={{ fontSize: 42, fontWeight: 800, color: timerColor, letterSpacing: 2, lineHeight: 1 }}>
                    {fmt(remaining ?? 0)}
                  </div>
                  {finished && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginTop: 4 }}>
                      TIME'S UP
                    </div>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ width: "100%", height: 6, background: "#F0F1F7", borderRadius: 99, overflow: "hidden" }}>
                <div style={{
                  width: `${pct}%`, height: "100%", background: timerColor,
                  borderRadius: 99, transition: "width 0.8s ease",
                }} />
              </div>

              {/* Controls */}
              <div style={{ display: "flex", gap: 10, width: "100%" }}>
                <button
                  onClick={handlePause}
                  disabled={finished}
                  style={{
                    ...ff, flex: 1, padding: "11px 0", borderRadius: 10, fontSize: 12, fontWeight: 700,
                    border: "none",
                    background: finished ? "#D1D5DB" : running ? "#1C2551" : "#EF4E24",
                    color: "#fff", cursor: finished ? "not-allowed" : "pointer",
                  }}
                >
                  {running ? "⏸ Pause" : "▶ Resume"}
                </button>
                <button
                  onClick={handleReset}
                  style={{
                    ...ff, padding: "11px 20px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                    border: "1.5px solid #EAECF4", background: "#fff", color: "#8b90a7", cursor: "pointer",
                  }}
                >
                  ↺ Reset
                </button>
              </div>

              {finished && (
                <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>
                  🔔 Browser notification sent
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
