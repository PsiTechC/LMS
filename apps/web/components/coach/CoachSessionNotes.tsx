"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createPortal } from "react-dom";
import { coachApi, type CoachNoteDTO, type CoachNoteActionDTO, type CoachSessionDTO } from "@/lib/coach-api";

// ── Design tokens ─────────────────────────────────────────────────
const ff = { fontFamily: "Poppins, sans-serif" } as const;
const NAVY = "#182848";
const ORANGE = "#C8A860";
const COACH = "#0891B2";
const GREEN = "#22c55e";
const CARD = "#fff";
const BORDER = "#E6DED0";
const PAGE = "#F7F5F0";
const MUTED = "#4A5573";

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}
function dueLabel(iso?: string): string {
  if (!iso) return "";
  return "Due " + new Date(iso + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" });
}

const microLabel: React.CSSProperties = { ...ff, fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6, display: "block" };
const inputStyle: React.CSSProperties = { ...ff, width: "100%", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: NAVY, outline: "none", boxSizing: "border-box", background: CARD };

export default function CoachSessionNotes() {
  const [notes, setNotes] = useState<CoachNoteDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit-note + add-action UI state
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newDue, setNewDue] = useState("");

  function selectNote(id: string) {
    setSelectedId(id);
    setEditing(false);
    setAdding(false);
  }

  async function saveEdit(note: CoachNoteDTO) {
    setSaving(true);
    try {
      await coachApi.updateNote(note.id, draft);
      setNotes((ns) => ns.map((n) => (n.id === note.id ? { ...n, notes: draft } : n)));
      setEditing(false);
    } catch {
      /* keep editing so the user can retry */
    } finally {
      setSaving(false);
    }
  }

  async function submitAction(note: CoachNoteDTO, e: FormEvent) {
    e.preventDefault();
    const desc = newDesc.trim();
    if (!desc) return;
    try {
      const res = await coachApi.addAction({ session_id: note.session_id, description: desc, due_date: newDue || undefined });
      const created = res.data;
      if (created) {
        setNotes((ns) =>
          ns.map((n) => (n.id === note.id ? { ...n, actions: [...n.actions, created], open_actions: n.open_actions + 1 } : n)),
        );
      }
      setNewDesc("");
      setNewDue("");
      setAdding(false);
    } catch {
      /* leave the form open on failure */
    }
  }

  // Create-note modal state
  const [creating, setCreating] = useState(false);
  const [sessions, setSessions] = useState<CoachSessionDTO[]>([]);
  const [newSessionId, setNewSessionId] = useState("");
  const [newNoteText, setNewNoteText] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);

  async function reload(selectId?: string) {
    const r = await coachApi.notes();
    const data = r.data ?? [];
    setNotes(data);
    setSelectedId((prev) => selectId ?? prev ?? data[0]?.id ?? null);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await coachApi.notes();
        if (!alive) return;
        const data = r.data ?? [];
        setNotes(data);
        setSelectedId((prev) => prev ?? data[0]?.id ?? null);
      } catch {
        if (alive) setNotes([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Open the create modal and load the coach's sessions to attach the note to.
  async function openCreate() {
    setCreating(true);
    setNewSessionId("");
    setNewNoteText("");
    const today = new Date();
    const from = new Date(today); from.setDate(from.getDate() - 120);
    const to = new Date(today); to.setDate(to.getDate() + 120);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    try {
      const r = await coachApi.calendar(fmt(from), fmt(to));
      // Only sessions tied to an engagement have a coachee to attach a note to.
      setSessions((r.data ?? []).filter((s) => s.engagement_id));
    } catch {
      setSessions([]);
    }
  }

  async function submitNewNote(e: FormEvent) {
    e.preventDefault();
    if (!newSessionId || !newNoteText.trim()) return;
    setCreatingBusy(true);
    try {
      const res = await coachApi.createNote({ session_id: newSessionId, notes: newNoteText.trim() });
      await reload(res.data?.id);
      setCreating(false);
    } catch {
      /* keep modal open on failure */
    } finally {
      setCreatingBusy(false);
    }
  }

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  async function toggleAction(note: CoachNoteDTO, a: CoachNoteActionDTO) {
    const next: "open" | "completed" = a.status === "completed" ? "open" : "completed";
    // Optimistic update.
    setNotes((ns) =>
      ns.map((n) => {
        if (n.id !== note.id) return n;
        const actions = n.actions.map((x) => (x.id === a.id ? { ...x, status: next } : x));
        return { ...n, actions, open_actions: actions.filter((x) => x.status === "open").length };
      }),
    );
    try {
      await coachApi.updateAction(a.id, next);
    } catch {
      // Revert on failure.
      setNotes((ns) =>
        ns.map((n) => {
          if (n.id !== note.id) return n;
          const actions = n.actions.map((x) => (x.id === a.id ? { ...x, status: a.status } : x));
          return { ...n, actions, open_actions: actions.filter((x) => x.status === "open").length };
        }),
      );
    }
  }

  return (
    <div style={{ padding: 24, display: "flex", gap: 20, height: "100%", overflow: "hidden", background: PAGE }}>
      {/* ── Left: note list ── */}
      <div style={{ width: 440, minWidth: 360, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        <button
          onClick={openCreate}
          style={{ ...ff, background: COACH, color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
        >
          + New Session Note
        </button>

        {loading ? (
          <div style={{ ...ff, fontSize: 13, color: MUTED, padding: 16 }}>Loading…</div>
        ) : notes.length === 0 ? (
          <div style={{ ...ff, fontSize: 13, color: MUTED, padding: 16, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12 }}>
            No session notes yet.
          </div>
        ) : (
          notes.map((n) => {
            const active = n.id === selectedId;
            return (
              <div
                key={n.id}
                onClick={() => selectNote(n.id)}
                style={{
                  background: CARD,
                  border: `${active ? 2 : 1}px solid ${active ? COACH : BORDER}`,
                  borderRadius: 12,
                  padding: "14px 16px",
                  cursor: "pointer",
                  boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ ...ff, fontSize: 13, fontWeight: 700, color: NAVY }}>{n.coachee_name || "—"}</span>
                  <span style={{ ...ff, fontSize: 11, color: MUTED }}>{shortDate(n.created_at)}</span>
                </div>
                <div style={{ ...ff, fontSize: 14, fontWeight: 700, color: NAVY, marginTop: 4 }}>{n.session_title}</div>
                <div
                  style={{
                    ...ff, fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.4,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}
                >
                  {n.notes}
                </div>
                {n.open_actions > 0 && (
                  <span style={{ ...ff, display: "inline-block", marginTop: 10, fontSize: 10, fontWeight: 700, color: ORANGE, background: `${ORANGE}14`, borderRadius: 20, padding: "3px 10px" }}>
                    {n.open_actions} OPEN ACTION{n.open_actions === 1 ? "" : "S"}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Right: detail + actions ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        {!selected ? (
          <div style={{ ...ff, fontSize: 13, color: MUTED, padding: 40, textAlign: "center", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12 }}>
            Select a session note to view it.
          </div>
        ) : (
          <>
            {/* Note detail */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)", padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ ...ff, fontSize: 20, fontWeight: 700, color: NAVY }}>{selected.session_title}</div>
                  <div style={{ ...ff, fontSize: 13, color: MUTED, marginTop: 2 }}>{selected.coachee_name} · {shortDate(selected.created_at)}</div>
                </div>
                {editing ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => saveEdit(selected)} disabled={saving}
                      style={{ ...ff, background: COACH, color: "#fff", border: "none", borderRadius: 8, padding: "7px 18px", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => setEditing(false)}
                      style={{ ...ff, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 18px", fontSize: 12, fontWeight: 600, color: NAVY, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => { setDraft(selected.notes); setEditing(true); }}
                    style={{ ...ff, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 18px", fontSize: 12, fontWeight: 600, color: NAVY, cursor: "pointer" }}>
                    Edit
                  </button>
                )}
              </div>
              {editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  style={{ ...ff, marginTop: 18, width: "100%", minHeight: 260, background: PAGE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "18px 20px", fontSize: 14, color: NAVY, lineHeight: 1.7, resize: "vertical", outline: "none", boxSizing: "border-box" }}
                />
              ) : (
                <div style={{ ...ff, marginTop: 18, background: PAGE, borderRadius: 10, padding: "18px 20px", fontSize: 14, color: NAVY, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                  {selected.notes}
                </div>
              )}
            </div>

            {/* Actions from this session */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)", padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ ...ff, fontSize: 15, fontWeight: 700, color: NAVY }}>Actions from this Session</div>
                {selected.open_actions > 0 && (
                  <span style={{ ...ff, fontSize: 10, fontWeight: 700, color: ORANGE, background: `${ORANGE}14`, borderRadius: 20, padding: "3px 10px" }}>
                    {selected.open_actions} OPEN
                  </span>
                )}
              </div>

              {selected.actions.length === 0 ? (
                <div style={{ ...ff, fontSize: 13, color: MUTED, padding: "8px 0" }}>No actions for this session.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selected.actions.map((a) => {
                    const done = a.status === "completed";
                    return (
                      <div key={a.id}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderRadius: 8, background: done ? `${GREEN}0d` : PAGE }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                          <button onClick={() => toggleAction(selected, a)}
                            style={{ width: 22, height: 22, minWidth: 22, borderRadius: "50%", cursor: "pointer",
                              border: done ? "none" : `2px solid #C8CDD8`, background: done ? GREEN : "transparent",
                              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                            {done ? "✓" : ""}
                          </button>
                          <span style={{ ...ff, fontSize: 13, color: done ? MUTED : NAVY, fontWeight: 500, textDecoration: done ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {a.description}
                          </span>
                        </div>
                        <span style={{ ...ff, fontSize: 11, fontWeight: 600, color: MUTED, whiteSpace: "nowrap", flexShrink: 0 }}>{dueLabel(a.due_date)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {adding ? (
                <form onSubmit={(e) => submitAction(selected, e)} style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    autoFocus value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Action description"
                    style={{ ...ff, flex: 1, minWidth: 220, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: NAVY, outline: "none" }}
                  />
                  <input
                    type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)}
                    style={{ ...ff, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, color: NAVY, outline: "none" }}
                  />
                  <button type="submit"
                    style={{ ...ff, background: COACH, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Add
                  </button>
                  <button type="button" onClick={() => { setAdding(false); setNewDesc(""); setNewDue(""); }}
                    style={{ ...ff, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 600, color: NAVY, cursor: "pointer" }}>
                    Cancel
                  </button>
                </form>
              ) : (
                <button onClick={() => setAdding(true)}
                  style={{ ...ff, marginTop: 14, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, color: NAVY, cursor: "pointer" }}>
                  + Add Action
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* New Session Note modal */}
      {creating && typeof document !== "undefined" &&
        createPortal(
          <div onClick={() => setCreating(false)} style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <form onClick={(e) => e.stopPropagation()} onSubmit={submitNewNote}
              style={{ ...ff, background: CARD, borderRadius: 16, width: 560, maxWidth: "100%", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)", overflow: "hidden" }}>
              <div style={{ padding: "18px 24px", borderBottom: `1px solid ${BORDER}`, fontSize: 16, fontWeight: 700, color: NAVY }}>New Session Note</div>
              <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={microLabel}>Session</label>
                  <select value={newSessionId} onChange={(e) => setNewSessionId(e.target.value)} required style={inputStyle}>
                    <option value="">Select a session…</option>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {(s.coachee_name || s.engagement_name || s.title)} — {s.title} ({shortDate(s.scheduled_at)})
                      </option>
                    ))}
                  </select>
                  {sessions.length === 0 && <div style={{ ...ff, fontSize: 11, color: MUTED, marginTop: 6 }}>No coaching sessions available to attach a note to.</div>}
                </div>
                <div>
                  <label style={microLabel}>Notes</label>
                  <textarea value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} required placeholder="Write the session notes…"
                    style={{ ...inputStyle, minHeight: 170, resize: "vertical", lineHeight: 1.6 }} />
                </div>
              </div>
              <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" onClick={() => setCreating(false)}
                  style={{ ...ff, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 18px", fontSize: 12, fontWeight: 600, color: NAVY, cursor: "pointer" }}>Cancel</button>
                <button type="submit" disabled={creatingBusy || !newSessionId || !newNoteText.trim()}
                  style={{ ...ff, background: COACH, color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, cursor: creatingBusy ? "not-allowed" : "pointer", opacity: creatingBusy || !newSessionId || !newNoteText.trim() ? 0.6 : 1 }}>
                  {creatingBusy ? "Creating…" : "Create Note"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
