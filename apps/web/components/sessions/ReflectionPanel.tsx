"use client";

import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { api, ApiResponse } from "@/lib/api";

const ff: React.CSSProperties = { fontFamily: "Poppins, sans-serif" };

interface ReflectionDTO {
  id: string;
  session_id: string;
  agenda_item_id: string;
  participant_id: string;
  content: string;
  faculty_comment?: string;
  commented_by?: string;
  commented_at?: string;
  created_at: string;
  updated_at: string;
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
      boxShadow: "0 8px 32px rgba(24, 40, 72,0.22)", zIndex: 9999, ...ff,
    }}>
      {msg}
    </div>
  );
}

// ── Faculty side panel ──────────────────────────────────────────────────────

function FacultyPanel({
  sessionId, agendaItemId, itemTitle,
  onClose,
}: {
  sessionId: string;
  agendaItemId: string;
  itemTitle: string;
  onClose: () => void;
}) {
  const [reflections, setReflections] = useState<ReflectionDTO[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [comments,    setComments]    = useState<Record<string, string>>({});
  const [saving,      setSaving]      = useState<string | null>(null); // reflectionId being saved
  const [toast,       setToast]       = useState<{ msg: string; color: string } | null>(null);

  useEffect(() => {
    api.get<ApiResponse<ReflectionDTO[]>>(
      `/sessions/${sessionId}/reflections?agenda_item_id=${encodeURIComponent(agendaItemId)}`
    )
      .then(r => {
        const list = r.data ?? [];
        setReflections(list);
        // Pre-fill comment inputs with existing comments
        const map: Record<string, string> = {};
        list.forEach(r => { if (r.faculty_comment) map[r.id] = r.faculty_comment; });
        setComments(map);
      })
      .catch(() => setToast({ msg: "Failed to load reflections", color: "#ef4444" }))
      .finally(() => setLoading(false));
  }, [sessionId, agendaItemId]);

  async function saveComment(reflectionId: string) {
    const comment = (comments[reflectionId] ?? "").trim();
    if (!comment) {
      setToast({ msg: "Comment cannot be empty", color: "#f59e0b" });
      return;
    }
    setSaving(reflectionId);
    try {
      await api.post<ApiResponse<null>>(
        `/sessions/${sessionId}/reflections/${reflectionId}/comment`,
        { comment }
      );
      setReflections(prev => prev.map(r =>
        r.id === reflectionId ? { ...r, faculty_comment: comment } : r
      ));
      setToast({ msg: "Comment saved", color: "#22c55e" });
    } catch (err: unknown) {
      const e = err as { status?: number };
      const msg = e?.status === 404 ? "Reflection not found" : "Failed to save comment";
      setToast({ msg, color: "#ef4444" });
    } finally {
      setSaving(null);
    }
  }

  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.35)", zIndex: 2000 }}
      />

      {/* Slide-in panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 420,
        background: "#fff", boxShadow: "-8px 0 40px rgba(24, 40, 72,0.14)",
        zIndex: 2001, display: "flex", flexDirection: "column", ...ff,
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 24px", borderBottom: "1px solid #E6DED0", flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#182848" }}>Reflections</div>
            <div style={{ fontSize: 11, color: "#4A5573", marginTop: 2 }}>{itemTitle}</div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: "50%", border: "1px solid #E6DED0",
            background: "#F7F5F0", cursor: "pointer", fontSize: 16, color: "#4A5573",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {loading ? (
            <div style={{ textAlign: "center" as const, color: "#4A5573", padding: 32, fontSize: 13 }}>
              Loading reflections…
            </div>
          ) : reflections.length === 0 ? (
            <div style={{ textAlign: "center" as const, padding: "48px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>◇</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#182848", marginBottom: 6 }}>No reflections yet</div>
              <div style={{ fontSize: 12, color: "#4A5573" }}>
                Participants haven't submitted their reflections for this item.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {reflections.map((r, i) => (
                <div key={r.id} style={{
                  border: "1px solid #E6DED0", borderRadius: 12, padding: "14px 16px",
                }}>
                  {/* Participant avatar + meta */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%", background: "#4A557320",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, color: "#4A5573", flexShrink: 0,
                    }}>
                      {`P${i + 1}`}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#182848" }}>
                        Participant {i + 1}
                      </div>
                      <div style={{ fontSize: 10, color: "#4A5573" }}>
                        {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>

                  {/* Reflection content */}
                  <div style={{
                    background: "#F7F5F0", borderRadius: 8, padding: "10px 12px",
                    fontSize: 13, color: "#182848", lineHeight: 1.6, marginBottom: 12,
                  }}>
                    {r.content}
                  </div>

                  {/* Faculty comment */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 6 }}>
                      Faculty Comment
                    </div>
                    <textarea
                      value={comments[r.id] ?? ""}
                      onChange={e => setComments(prev => ({ ...prev, [r.id]: e.target.value }))}
                      placeholder="Add your comment…"
                      rows={3}
                      style={{
                        ...ff, width: "100%", border: "1px solid #E6DED0", borderRadius: 8,
                        padding: "8px 10px", fontSize: 12, color: "#182848",
                        resize: "vertical", outline: "none", boxSizing: "border-box",
                        background: "#FAFBFD",
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                      <button
                        onClick={() => saveComment(r.id)}
                        disabled={saving === r.id}
                        style={{
                          ...ff, fontSize: 11, fontWeight: 700, padding: "6px 14px", borderRadius: 7,
                          border: "none", background: saving === r.id ? "#4A5573" : "#182848",
                          color: "#fff", cursor: saving === r.id ? "not-allowed" : "pointer",
                        }}
                      >
                        {saving === r.id ? "Saving…" : r.faculty_comment ? "Update Comment" : "Save Comment"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {toast && <Toast msg={toast.msg} color={toast.color} onClose={() => setToast(null)} />}
    </>,
    document.body
  );
}

// ── Participant view ────────────────────────────────────────────────────────

function ParticipantView({
  sessionId, agendaItemId, participantId,
}: {
  sessionId: string;
  agendaItemId: string;
  participantId: string;
}) {
  const [existing, setExisting] = useState<ReflectionDTO | null>(null);
  const [text,     setText]     = useState("");
  const [saving,   setSaving]   = useState(false);
  const [loaded,   setLoaded]   = useState(false);
  const [toast,    setToast]    = useState<{ msg: string; color: string } | null>(null);

  useEffect(() => {
    api.get<ApiResponse<ReflectionDTO | null>>(
      `/sessions/${sessionId}/reflections/mine?agenda_item_id=${encodeURIComponent(agendaItemId)}`
    )
      .then(r => {
        if (r.data) {
          setExisting(r.data);
          setText(r.data.content);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [sessionId, agendaItemId]);

  async function submit() {
    if (!text.trim()) {
      setToast({ msg: "Please write your reflection first", color: "#f59e0b" });
      return;
    }
    setSaving(true);
    try {
      const r = await api.post<ApiResponse<ReflectionDTO>>(
        `/sessions/${sessionId}/reflections`,
        { agenda_item_id: agendaItemId, content: text.trim() }
      );
      if (r.data) setExisting(r.data);
      setToast({ msg: "Reflection submitted", color: "#22c55e" });
    } catch {
      setToast({ msg: "Failed to submit reflection", color: "#ef4444" });
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <>
      <div style={{ padding: "10px 20px 14px", borderTop: "1px solid #EFE9DC" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 8 }}>
          Your Reflection
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Share your thoughts and key takeaways…"
          rows={4}
          style={{
            ...ff, width: "100%", border: "1px solid #E6DED0", borderRadius: 8,
            padding: "9px 12px", fontSize: 13, color: "#182848",
            resize: "vertical", outline: "none", boxSizing: "border-box",
            background: "#FAFBFD", lineHeight: 1.6,
          }}
        />

        {/* Show faculty comment if present */}
        {existing?.faculty_comment && (
          <div style={{
            marginTop: 10, background: "#4A557310", border: "1px solid #4A557330",
            borderRadius: 8, padding: "10px 12px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", marginBottom: 4 }}>
              FACULTY FEEDBACK
            </div>
            <div style={{ fontSize: 13, color: "#182848", lineHeight: 1.6 }}>
              {existing.faculty_comment}
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button
            onClick={submit}
            disabled={saving}
            style={{
              ...ff, fontSize: 12, fontWeight: 700, padding: "8px 18px", borderRadius: 8,
              border: "none", background: saving ? "#4A5573" : "#4A5573",
              color: "#fff", cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Submitting…" : existing ? "Update Reflection" : "Submit Reflection"}
          </button>
        </div>
      </div>

      {toast && <Toast msg={toast.msg} color={toast.color} onClose={() => setToast(null)} />}
    </>
  );
}

// ── Main exported component ─────────────────────────────────────────────────

interface Props {
  sessionId: string;
  agendaItemId: string;
  agendaItemTitle: string;
  isFaculty: boolean;
  participantId?: string;
}

export default function ReflectionPanel({
  sessionId, agendaItemId, agendaItemTitle, isFaculty, participantId,
}: Props) {
  const [count,      setCount]      = useState<number | null>(null);
  const [panelOpen,  setPanelOpen]  = useState(false);

  // Load reflection count for faculty badge
  useEffect(() => {
    if (!isFaculty) return;
    api.get<ApiResponse<{ length: number }[]>>(
      `/sessions/${sessionId}/reflections?agenda_item_id=${encodeURIComponent(agendaItemId)}`
    )
      .then(r => setCount((r.data as unknown as unknown[])?.length ?? 0))
      .catch(() => {});
  }, [sessionId, agendaItemId, isFaculty]);

  if (isFaculty) {
    return (
      <>
        <div style={{ padding: "8px 20px 10px", borderTop: "1px solid #EFE9DC" }}>
          <button
            onClick={() => setPanelOpen(true)}
            style={{
              ...ff, fontSize: 11, fontWeight: 700, padding: "6px 14px", borderRadius: 8,
              border: "1px solid #4A557340", background: "#4A557310",
              color: "#4A5573", cursor: "pointer",
            }}
          >
            {count !== null && count > 0
              ? `View ${count} Reflection${count !== 1 ? "s" : ""}`
              : "View Reflections"}
          </button>
        </div>

        {panelOpen && (
          <FacultyPanel
            sessionId={sessionId}
            agendaItemId={agendaItemId}
            itemTitle={agendaItemTitle}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </>
    );
  }

  if (!participantId) return null;

  return (
    <ParticipantView
      sessionId={sessionId}
      agendaItemId={agendaItemId}
      participantId={participantId}
    />
  );
}
