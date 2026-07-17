"use client";

import { useState, useRef, useCallback } from "react";
import { sessionsApi } from "@/lib/faculty-api";

const ff: React.CSSProperties = { fontFamily: "Poppins, sans-serif" };

interface Props {
  sessionId: string;
  initialNotes: string;
  isFaculty: boolean;
}

export default function SessionNotes({ sessionId, initialNotes, isFaculty }: Props) {
  const [open,    setOpen]   = useState(false);
  const [notes,   setNotes]  = useState(initialNotes);
  const [status,  setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<string>("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (value: string) => {
    setStatus("saving");
    try {
      await sessionsApi.updateNotes(sessionId, value);
      const now = new Date();
      setSavedAt(now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }));
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, [sessionId]);

  // Debounce: auto-save 1.5s after the user stops typing (in addition to onBlur)
  function handleChange(value: string) {
    setNotes(value);
    setStatus("idle");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(value), 1500);
  }

  function handleBlur() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    save(notes);
  }

  if (!isFaculty) return null;

  return (
    <div style={{
      borderTop: "1px solid #E6DED0",
      marginTop: 16,
      paddingTop: 14,
    }}>
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          ...ff,
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          marginBottom: open ? 10 : 0,
        }}
      >
        <span style={{ fontSize: 12, color: "#4A5573" }}>{open ? "▾" : "▸"}</span>
        <span style={{ ...ff, fontSize: 12, fontWeight: 700, color: "#182848" }}>
          Session Notes
        </span>
        {notes.trim() && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: "#4A5573",
            background: "#4A557320", borderRadius: 20, padding: "2px 8px", marginLeft: 4,
          }}>
            Saved
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#4A5573" }}>
          {open ? "collapse" : "expand"}
        </span>
      </button>

      {open && (
        <div>
          <textarea
            value={notes}
            onChange={e => handleChange(e.target.value)}
            onBlur={handleBlur}
            placeholder="Add private notes for this session — visible only to you…"
            rows={5}
            style={{
              ...ff,
              width: "100%",
              border: "1px solid #E6DED0",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 13,
              color: "#182848",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
              lineHeight: 1.6,
              background: "#FAFBFD",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
            {status === "saving" && (
              <span style={{ ...ff, fontSize: 11, color: "#4A5573" }}>Saving…</span>
            )}
            {status === "saved" && savedAt && (
              <span style={{ ...ff, fontSize: 11, color: "#22c55e", fontWeight: 600 }}>
                ✓ Saved at {savedAt}
              </span>
            )}
            {status === "error" && (
              <span style={{ ...ff, fontSize: 11, color: "#ef4444", fontWeight: 600 }}>
                Failed to save — check connection
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
